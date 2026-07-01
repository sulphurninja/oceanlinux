import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import RenewalRequest from '@/models/renewalRequestModel';
import User from '@/models/userModel';
import { Cashfree } from 'cashfree-pg';
import crypto from 'crypto';
import { calculateRenewalExpiryDate, calculateCompanyRenewalExpiryDate } from '@/lib/expiryHelper';
import { assignPanelCredentials } from '@/lib/panelCredentials';
import { detectCompanyManagedRenewal, resolveRenewalProvider } from '@/lib/companyRenewal';
import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { resolveOrderRenewalPrice } from '@/lib/orderRenewalPricingServer';
import { debitPendingRenewalWallet } from '@/lib/renewalWallet';
import { enforceOrderAccess } from '@/lib/apiSecurity';
const SmartVPSAPI = require('@/services/smartvpsApi');
const AdvpsAPI = require('@/services/advpsApi');
const RenewalLogger = require('@/services/renewalLogger');
const { getAdvpsRebuildResetFields, isAdvpsOrder } = require('@/lib/advpsRebuildLimit');
const { executeAdvpsUpstreamRenewal } = require('@/lib/advpsRenewal');
const { executeNetbayUpstreamRenewal } = require('@/lib/netbayRenewal');
const { pickAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
const { extractAdvpsStatusCredentials } = require('@/lib/advpsStatusNormalize');
const HostycareAPI = require('@/services/hostycareApi');
const { notifyRenewalCompleted } = require('@/lib/renewalNotifications');

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX'
  ? Cashfree.Environment.SANDBOX
  : Cashfree.Environment.PRODUCTION;

export async function POST(request) {
  await connectDB();

  console.log("========== RENEWAL PAYMENT CONFIRMATION API ==========");

  let logger = null; // Will be initialized after we find the order

  try {
    const {
      renewalTxnId,
      orderId,
      paymentMethod,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature
    } = await request.json();

    console.log('[RENEWAL-CONFIRM] Processing renewal confirmation:', {
      renewalTxnId,
      orderId,
      paymentMethod
    });

    if (!renewalTxnId || !orderId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Find the order to renew
    const order = await Order.findById(orderId);
    if (!order) {
      console.error(`Order not found: ${orderId}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    if (isSlotIpOrder(order)) {
      return NextResponse.json(
        { success: false, message: SLOT_IP_NO_RENEWAL_MESSAGE },
        { status: 400 }
      );
    }

    const accessDenied = await enforceOrderAccess(request, order);
    if (accessDenied) return accessDenied;

    const renewalPrice = await resolveOrderRenewalPrice(order);
    console.log(`[RENEWAL-CONFIRM] Locked renewal price: ₹${renewalPrice} (paid=${order.price}, originalPrice=${order.originalPrice ?? 'n/a'}, promoDiscount=${order.promoDiscount ?? 0})`);

    // Initialize logger now that we have the order
    logger = new RenewalLogger(order, renewalTxnId, 'confirm-api');
    logger.logInfo('Renewal confirmation request received', {
      paymentMethod,
      orderId,
      renewalTxnId
    });

    // Idempotency check: See if this renewal was already processed
    const alreadyProcessed = order.renewalPayments?.some(
      rp => rp.renewalTxnId === renewalTxnId
    );

    if (alreadyProcessed) {
      console.log(`[RENEWAL-CONFIRM] ⚠️ Renewal already processed: ${renewalTxnId}`);
      logger.logWarning('Renewal already processed - idempotency check');
      await logger.finalize(true, order.expiryDate);
      const existingRenewal = order.renewalPayments.find(rp => rp.renewalTxnId === renewalTxnId);
      notifyRenewalCompleted(
        order,
        existingRenewal?.newExpiry || order.expiryDate,
        renewalTxnId,
      ).catch((err) => console.error('[RENEWAL-CONFIRM] renewal notification failed:', err.message));
      return NextResponse.json({
        success: true,
        message: 'Renewal was already processed',
        alreadyProcessed: true,
        orderId: order._id,
        newExpiryDate: existingRenewal?.newExpiry || order.expiryDate
      });
    }

    // Determine payment method from transaction ID or explicit parameter
    let actualPaymentMethod = paymentMethod;
    if (!actualPaymentMethod) {
      // Check pending renewal for payment method (most accurate for current renewal)
      if (order.pendingRenewal?.paymentMethod) {
        actualPaymentMethod = order.pendingRenewal.paymentMethod;
        logger.logInfo('Payment method detected from pendingRenewal', { method: actualPaymentMethod });
      }
      // Fallback: Auto-detect from transaction ID or order data
      else if (renewalTxnId.startsWith('RENEWAL_')) {
        // Default to cashfree for renewal transactions
        actualPaymentMethod = 'cashfree';
        logger.logInfo('Payment method defaulted to cashfree for renewal transaction');
      }
    }

    const gatewayPaymentMethod =
      actualPaymentMethod === 'wallet'
        ? 'wallet'
        : String(actualPaymentMethod || '').startsWith('wallet+')
          ? String(actualPaymentMethod).slice('wallet+'.length)
          : actualPaymentMethod;

    console.log(`[RENEWAL-CONFIRM] Payment method: ${actualPaymentMethod} (gateway=${gatewayPaymentMethod})`);

    let payment_id = null;
    let paymentVerified = false;

    // Wallet-only renewals debit at /api/payment/renew; wallet+gateway debits on confirm.
    if (gatewayPaymentMethod === 'wallet') {
      if (!order.pendingRenewal?.walletDeducted || !order.pendingRenewal?.walletTxnId) {
        return NextResponse.json(
          { success: false, message: 'Wallet payment not found for this renewal' },
          { status: 400 }
        );
      }
      console.log('[RENEWAL-CONFIRM] ✅ Wallet renewal payment accepted');
      actualPaymentMethod = 'wallet';
      payment_id = order.pendingRenewal.walletTxnId;
      paymentVerified = true;
      logger.setPaymentInfo('wallet', payment_id, renewalPrice);
    } else if (
      order.pendingRenewal?.walletDeducted &&
      order.pendingRenewal?.walletTxnId &&
      String(order.pendingRenewal?.paymentMethod || '').startsWith('wallet+')
    ) {
      console.log('[RENEWAL-CONFIRM] Partial wallet renewal — wallet already debited, verifying gateway payment');
    }

    // Verify payment based on method
    if (!paymentVerified && gatewayPaymentMethod === 'razorpay') {
      console.log('[RENEWAL-CONFIRM] Verifying Razorpay renewal payment');

      if (!razorpayPaymentId || !razorpaySignature) {
        return NextResponse.json(
          { success: false, message: 'Missing Razorpay payment details' },
          { status: 400 }
        );
      }

      // Use razorpay order ID from request, or fall back to pendingRenewal.gatewayOrderId
      const orderIdForSignature = razorpayOrderId || order.pendingRenewal?.gatewayOrderId;

      if (!orderIdForSignature) {
        console.error('[RENEWAL-CONFIRM] ❌ Missing Razorpay order ID for signature verification');
        return NextResponse.json(
          { success: false, message: 'Missing Razorpay order ID' },
          { status: 400 }
        );
      }

      console.log('[RENEWAL-CONFIRM] Using Razorpay order ID for signature:', orderIdForSignature);

      // Verify Razorpay signature using the correct order_id|payment_id format
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderIdForSignature}|${razorpayPaymentId}`)
        .digest('hex');

      if (generatedSignature === razorpaySignature) {
        console.log('[RENEWAL-CONFIRM] ✅ Razorpay signature verified');
        logger.logSuccess('Razorpay payment verified');
        payment_id = razorpayPaymentId;
        paymentVerified = true;
        logger.setPaymentInfo('razorpay', razorpayPaymentId, renewalPrice);
      } else {
        console.error('[RENEWAL-CONFIRM] ❌ Razorpay signature verification failed');
        console.error('[RENEWAL-CONFIRM] Expected signature format: order_id|payment_id');
        console.error('[RENEWAL-CONFIRM] order_id used:', orderIdForSignature);
        logger.logError('Razorpay signature verification failed');
        await logger.finalize(false, null, 'Razorpay signature verification failed');
        return NextResponse.json(
          { success: false, message: 'Payment verification failed' },
          { status: 400 }
        );
      }
    } else if (!paymentVerified && gatewayPaymentMethod === 'upi') {
      const { verifyUPIPayment } = await import('@/lib/confirmPendingOrderPayment');
      const upiCheck = await verifyUPIPayment(renewalTxnId);
      if (!upiCheck.verified) {
        console.error('[RENEWAL-CONFIRM] UPI payment not verified:', upiCheck);
        await logger.finalize(false, null, 'UPI payment not verified');
        return NextResponse.json(
          { success: false, message: 'UPI payment not verified. Please wait for confirmation or contact support.' },
          { status: 400 }
        );
      }
      payment_id = upiCheck.upi_txn_id || renewalTxnId;
      paymentVerified = true;
      logger.setPaymentInfo('upi', payment_id, renewalPrice);
    } else if (!paymentVerified) {
      console.log('[RENEWAL-CONFIRM] Processing Cashfree renewal payment');

      // For Cashfree renewals, we rely on the webhook to process the renewal
      // The webhook handler has atomic processing and idempotency checks
      // This endpoint is called from the payment callback page, which may arrive
      // before or after the webhook. To avoid race conditions, we:
      // 1. Check if webhook already processed this renewal
      // 2. If not, check if payment is pending and let webhook handle it
      // 3. Only verify payment if webhook hasn't processed it yet

      // First, check if webhook already processed this renewal
      const alreadyProcessedByWebhook = order.renewalPayments?.some(
        rp => rp.renewalTxnId === renewalTxnId && rp.processedViaWebhook === true
      );

      if (alreadyProcessedByWebhook) {
        console.log('[RENEWAL-CONFIRM] ✅ Renewal already processed by webhook');
        const existingRenewal = order.renewalPayments.find(rp => rp.renewalTxnId === renewalTxnId);
        return NextResponse.json({
          success: true,
          message: 'Renewal already processed successfully',
          alreadyProcessed: true,
          orderId: order._id,
          newExpiryDate: existingRenewal?.newExpiry || order.expiryDate,
          processedBy: 'webhook'
        });
      }

      // Check if there's a pending renewal for this transaction
      const hasPendingRenewal = order.pendingRenewal?.renewalTxnId === renewalTxnId;

      if (hasPendingRenewal) {
        console.log('[RENEWAL-CONFIRM] Pending renewal found, checking payment status...');

        try {
          // Try to verify payment with Cashfree
          const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', renewalTxnId);
          console.log('[RENEWAL-CONFIRM] Cashfree payment verification response:', cashfreeResponse.data);

          if (cashfreeResponse.data && cashfreeResponse.data.length > 0) {
            const payment = cashfreeResponse.data[0];

            if (payment.payment_status === 'SUCCESS') {
              console.log('[RENEWAL-CONFIRM] ✅ Cashfree payment verified successfully');
              logger.logSuccess('Cashfree payment verified');
              payment_id = payment.cf_payment_id;
              paymentVerified = true;
              logger.setPaymentInfo('cashfree', payment.cf_payment_id, renewalPrice);
            } else {
              console.log('[RENEWAL-CONFIRM] ⏳ Payment status:', payment.payment_status);
              return NextResponse.json({
                success: false,
                message: `Payment status: ${payment.payment_status}. Please wait for payment confirmation.`,
                paymentStatus: payment.payment_status
              }, { status: 400 });
            }
          } else {
            // No payment data yet - webhook will process it when it arrives
            console.log('[RENEWAL-CONFIRM] ⏳ Payment data not available yet, webhook will process renewal');
            return NextResponse.json({
              success: true,
              message: 'Payment is being processed. Your renewal will be confirmed shortly via webhook.',
              processing: true,
              orderId: order._id,
              renewalTxnId: renewalTxnId
            });
          }
        } catch (cashfreeError) {
          console.error('[RENEWAL-CONFIRM] Cashfree verification error:', cashfreeError);
          // Don't fail immediately - webhook might still process it
          console.log('[RENEWAL-CONFIRM] ⏳ Verification failed, but webhook will process renewal');
          return NextResponse.json({
            success: true,
            message: 'Payment verification in progress. Your renewal will be confirmed shortly via webhook.',
            processing: true,
            orderId: order._id,
            renewalTxnId: renewalTxnId
          });
        }
      } else {
        // No pending renewal found - this shouldn't happen in normal flow
        console.error('[RENEWAL-CONFIRM] ❌ No pending renewal found for transaction:', renewalTxnId);
        return NextResponse.json(
          { success: false, message: 'No pending renewal found for this transaction' },
          { status: 404 }
        );
      }
    }

    if (!paymentVerified) {
      return NextResponse.json(
        { success: false, message: 'Payment verification failed' },
        { status: 400 }
      );
    }

    try {
      await debitPendingRenewalWallet(order, renewalTxnId);
    } catch (walletErr) {
      console.error('[RENEWAL-CONFIRM] Wallet debit failed:', walletErr);
      return NextResponse.json(
        { success: false, message: walletErr.message || 'Insufficient wallet balance for renewal' },
        { status: 400 }
      );
    }

    const cf_payment_id = payment_id;

    // Determine the provider for this order using the enhanced function with IPStock lookup
    const provider = await resolveRenewalProvider(order);
    console.log(`[RENEWAL-CONFIRM] Final determined provider: ${provider} for order ${orderId}`);
    logger.logInfo('Provider determined', { provider });

    const currentExpiry = order.expiryDate;
    const companyCheck = await detectCompanyManagedRenewal(order);

    // Company stocks: 30d (28/29 in Feb). Other orders: calendar month length.
    let newExpiryDate = companyCheck.isCompany
      ? calculateCompanyRenewalExpiryDate(currentExpiry)
      : calculateRenewalExpiryDate(currentExpiry);

    // ─── Company-managed renewal branch ───────────────────────────────────
    // For orders whose IPStock is linked to a Company AND that have no
    // upstream automation, payment alone must NOT extend the expiry. The
    // company has to approve the renewal from /company/[slug] → Renewals.
    // We capture the verified payment in a RenewalRequest and return early.
    if (companyCheck.isCompany) {
      console.log(`[RENEWAL-CONFIRM] 🏢 Company-managed renewal — queuing for approval (companyId=${companyCheck.companyId})`);
      logger.logInfo('Company-managed renewal — awaiting company approval', {
        companyId: String(companyCheck.companyId),
      });

      // Idempotency: if a request was already created (e.g. by the webhook),
      // just return success.
      const existingReq = await RenewalRequest.findOne({ renewalTxnId }).lean();
      if (existingReq) {
        console.log(`[RENEWAL-CONFIRM] ✅ RenewalRequest already exists for ${renewalTxnId} (status=${existingReq.status})`);
        await logger.finalize(true, currentExpiry);
        return NextResponse.json({
          success: true,
          message: existingReq.status === 'pending'
            ? 'Payment received. Your renewal is waiting for approval from the provider.'
            : `Renewal already ${existingReq.status}.`,
          companyApproval: {
            status: existingReq.status,
            requestId: existingReq._id,
          },
          orderId: order._id,
          newExpiryDate: currentExpiry, // unchanged until approval
        });
      }

      const customer = await User.findById(order.user).select('name email').lean();
      const stockName = companyCheck.stockName || '';

      const renewalReq = await RenewalRequest.create({
        orderId: order._id,
        userId: order.user,
        companyId: companyCheck.companyId,
        renewalTxnId,
        amount: renewalPrice,
        paymentMethod: actualPaymentMethod,
        paymentId: cf_payment_id,
        gatewayOrderId: actualPaymentMethod === 'razorpay' ? razorpayPaymentId : renewalTxnId,
        paymentDetails: {
          method: actualPaymentMethod,
          payment_id: cf_payment_id,
          order_id: actualPaymentMethod === 'razorpay' ? razorpayPaymentId : renewalTxnId,
          confirmedAt: new Date(),
        },
        status: 'pending',
        orderSnapshot: {
          productName: order.productName,
          ipAddress: order.ipAddress || '',
          customerEmail: customer?.email || '',
          customerName: customer?.name || '',
          memory: order.memory || '',
          stockName,
        },
        renewalSnapshot: {
          previousExpiry: currentExpiry,
          proposedNewExpiry: newExpiryDate,
        },
      });

      // Tag the order itself so the customer's order-detail UI can show
      // "awaiting approval" without making a second roundtrip. We also
      // intentionally KEEP `pendingRenewal` set so the legacy webhook /
      // confirm idempotency keeps working.
      await Order.findByIdAndUpdate(order._id, {
        'pendingRenewal.awaitingCompanyApproval': true,
        'pendingRenewal.renewalRequestId': renewalReq._id,
        'pendingRenewal.paymentConfirmedAt': new Date(),
      });

      await logger.finalize(true, currentExpiry); // expiry unchanged for now
      return NextResponse.json({
        success: true,
        message: 'Payment received. Your renewal is waiting for approval from the provider.',
        companyApproval: { status: 'pending', requestId: renewalReq._id },
        orderId: order._id,
        newExpiryDate: currentExpiry, // unchanged until approval
      });
    }

    console.log(`Renewing order ${order._id}:`);
    console.log(`  Provider: ${provider}`);
    console.log(`  Current expiry: ${currentExpiry}`);
    console.log(`  New expiry: ${newExpiryDate}`);
    console.log(`  Payment ID: ${cf_payment_id}`);

    const walletAmount = Number(order.pendingRenewal?.walletAmount) || 0;
    const gatewayAmount = Number(order.pendingRenewal?.gatewayAmount) || renewalPrice;
    const paymentMethodLabel =
      walletAmount > 0 && gatewayAmount > 0
        ? `wallet+${gatewayPaymentMethod}`
        : walletAmount > 0
          ? 'wallet'
          : gatewayPaymentMethod;

    // Create renewal payment record with full payment details
    const renewalPayment = {
      paymentId: cf_payment_id,
      amount: renewalPrice,
      paidAt: new Date(),
      previousExpiry: currentExpiry,
      newExpiry: newExpiryDate,
      renewalTxnId: renewalTxnId,
      provider: provider,
      paymentMethod: paymentMethodLabel,
      gatewayOrderId: actualPaymentMethod === 'razorpay' ? razorpayPaymentId : renewalTxnId,
      paymentDetails: {
        method: paymentMethodLabel,
        payment_id: cf_payment_id,
        order_id: actualPaymentMethod === 'razorpay' ? razorpayPaymentId : renewalTxnId,
        walletAmount,
        gatewayAmount,
        walletTxnId: order.pendingRenewal?.walletTxnId || '',
        confirmedAt: new Date()
      }
    };

    // Handle provider-specific renewal logic
    let providerRenewalResult = null;
    let providerRenewalSuccess = false;

    if (provider === 'hostycare' && order.hostycareServiceId) {
      console.log('[RENEWAL-CONFIRM] Processing Hostycare renewal');
      logger.logInfo('Calling Hostycare renewal API', { serviceId: order.hostycareServiceId });
      try {
        const apiStart = Date.now();
        const api = new HostycareAPI();
        providerRenewalResult = await api.renewService(order.hostycareServiceId);
        const apiDuration = Date.now() - apiStart;
        console.log(`Hostycare renewal result for service ${order.hostycareServiceId}:`, providerRenewalResult);
        providerRenewalSuccess = true;
        logger.setProviderApiResult('hostycare', true, providerRenewalResult, null, apiDuration);
      } catch (hostycareError) {
        console.error(`Hostycare renewal failed for order ${order._id}:`, hostycareError);
        logger.setProviderApiResult('hostycare', false, null, hostycareError);
        providerRenewalResult = { error: hostycareError.message };
        // We still consider the renewal successful since payment was processed
        // The service renewal might succeed later or can be retried manually
      }
    } else if (provider === 'smartvps') {
      console.log('[RENEWAL-CONFIRM] === SMARTVPS RENEWAL PROCESS START ===');
      console.log('[RENEWAL-CONFIRM] Processing SmartVPS renewal for order:', orderId);

      const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
      console.log('[RENEWAL-CONFIRM] SmartVPS service identifier:', serviceIdentifier);
      console.log('[RENEWAL-CONFIRM] Service identifier source:', order.smartvpsServiceId ? 'smartvpsServiceId' : 'ipAddress');

      if (serviceIdentifier) {
        let renewalStartTime; // 🔧 PROPERLY DECLARE THE VARIABLE

        try {
          console.log('[RENEWAL-CONFIRM] Initializing SmartVPS API client...');
          const smartvpsApi = new SmartVPSAPI();
          console.log('[RENEWAL-CONFIRM] SmartVPS API client initialized successfully');

          console.log('[RENEWAL-CONFIRM] === CALLING SMARTVPS RENEWAL API ===');
          console.log('[RENEWAL-CONFIRM] Target service identifier:', serviceIdentifier);
          console.log('[RENEWAL-CONFIRM] About to call smartvpsApi.renewVps()...');

          renewalStartTime = Date.now(); // 🔧 SET THE START TIME
          console.log('[RENEWAL-CONFIRM] SmartVPS API call started at:', new Date().toISOString());

          providerRenewalResult = await smartvpsApi.renewVps(serviceIdentifier);

          const renewalEndTime = Date.now();
          const renewalDuration = renewalEndTime - renewalStartTime;

          console.log('[RENEWAL-CONFIRM] === SMARTVPS RENEWAL API RESPONSE ===');
          console.log('[RENEWAL-CONFIRM] SmartVPS API call completed at:', new Date().toISOString());
          console.log('[RENEWAL-CONFIRM] SmartVPS API call duration:', renewalDuration + 'ms');
          console.log('[RENEWAL-CONFIRM] SmartVPS renewal response type:', typeof providerRenewalResult);
          console.log('[RENEWAL-CONFIRM] SmartVPS renewal response:', JSON.stringify(providerRenewalResult, null, 2));

          providerRenewalSuccess = true;
          logger.setProviderApiResult('smartvps', true, providerRenewalResult, null, renewalDuration);

          console.log('[RENEWAL-CONFIRM] ✅ SmartVPS renewal API call completed successfully');
          console.log('[RENEWAL-CONFIRM] Service identifier', serviceIdentifier, 'has been renewed via SmartVPS API');

        } catch (smartvpsError) {
          const renewalEndTime = Date.now();
          const renewalDuration = renewalStartTime ? (renewalEndTime - renewalStartTime) : 0; // 🔧 SAFE CALCULATION

          console.log('[RENEWAL-CONFIRM] === SMARTVPS RENEWAL API ERROR ===');
          console.error('[RENEWAL-CONFIRM] SmartVPS API call failed at:', new Date().toISOString());
          console.error('[RENEWAL-CONFIRM] SmartVPS API call duration:', renewalDuration + 'ms');
          console.error('[RENEWAL-CONFIRM] SmartVPS renewal failed for order:', order._id);
          console.error('[RENEWAL-CONFIRM] Service identifier:', serviceIdentifier);
          console.error('[RENEWAL-CONFIRM] SmartVPS error type:', smartvpsError.constructor.name);
          console.error('[RENEWAL-CONFIRM] SmartVPS error message:', smartvpsError.message);
          console.error('[RENEWAL-CONFIRM] SmartVPS error stack:', smartvpsError.stack);
          console.log('[RENEWAL-CONFIRM] ❌ SmartVPS renewal API call failed');

          logger.setProviderApiResult('smartvps', false, null, smartvpsError, renewalDuration);

          providerRenewalResult = {
            error: smartvpsError.message,
            errorType: smartvpsError.constructor.name,
            serviceIdentifier: serviceIdentifier,
            timestamp: new Date().toISOString()
          };

          // Don't fail the entire renewal process if SmartVPS API fails
          // The payment was successful, so we should still update our records
          console.log('[RENEWAL-CONFIRM] Continuing with database update despite SmartVPS API error');
          console.log('[RENEWAL-CONFIRM] Customer payment was successful, renewal will be marked as completed');
        }
      } else {
        console.warn('[RENEWAL-CONFIRM] === SMARTVPS RENEWAL IDENTIFIER MISSING ===');
        console.warn('[RENEWAL-CONFIRM] SmartVPS order missing service identifier');
        console.warn('[RENEWAL-CONFIRM] Order ID:', order._id);
        console.warn('[RENEWAL-CONFIRM] smartvpsServiceId:', order.smartvpsServiceId);
        console.warn('[RENEWAL-CONFIRM] ipAddress:', order.ipAddress);
        console.warn('[RENEWAL-CONFIRM] Cannot proceed with SmartVPS API renewal');

        providerRenewalResult = {
          error: 'Missing service identifier for SmartVPS renewal',
          smartvpsServiceId: order.smartvpsServiceId,
          ipAddress: order.ipAddress
        };
      }

      console.log('[RENEWAL-CONFIRM] === SMARTVPS RENEWAL PROCESS END ===');
    } else if (provider === 'advps') {
      console.log('[RENEWAL-CONFIRM] === ADVPS RENEWAL PROCESS START ===');
      console.log('[RENEWAL-CONFIRM] ADVPS identifiers:', {
        advpsOrderId: order.advpsOrderId,
        advpsServiceId: order.advpsServiceId,
      });

      try {
        const apiStart = Date.now();
        const advpsApi = new AdvpsAPI();
        const advpsRenew = await executeAdvpsUpstreamRenewal(advpsApi, order, { Order });
        const apiDuration = Date.now() - apiStart;

        if (advpsRenew.correctedServiceId) {
          await Order.findByIdAndUpdate(orderId, {
            advpsServiceId: advpsRenew.correctedServiceId,
            ...(order.advpsOrderId ? {} : { advpsOrderId: advpsRenew.advpsOrderId }),
          });
          order.advpsServiceId = advpsRenew.correctedServiceId;
          console.log(
            `[RENEWAL-CONFIRM] Corrected ADVPS service id for renew: ${advpsRenew.previousServiceId} → ${advpsRenew.correctedServiceId}`
          );
        }

        providerRenewalResult = advpsRenew.result || {
          error: advpsRenew.error,
          testMode: advpsRenew.testMode,
          serviceId: advpsRenew.serviceId,
          advpsOrderId: advpsRenew.advpsOrderId,
        };
        providerRenewalSuccess = advpsRenew.success;

        if (advpsRenew.success) {
          console.log('[RENEWAL-CONFIRM] ✅ ADVPS renewal API success:', JSON.stringify(advpsRenew.result, null, 2));
          logger.setProviderApiResult('advps', true, advpsRenew.result, null, apiDuration);

          try {
            const statusRes = await advpsApi.status(order.advpsServiceId);
            const statusCreds = extractAdvpsStatusCredentials(statusRes, order);
            const advpsExpiry = pickAdvpsExpiryDate(statusCreds.expiryDate);
            if (advpsExpiry) {
              newExpiryDate = advpsExpiry;
              console.log(`[RENEWAL-CONFIRM] ADVPS expiry after renew: ${newExpiryDate.toISOString()}`);
            }
          } catch (statusErr) {
            console.warn('[RENEWAL-CONFIRM] Could not fetch ADVPS expiry after renew:', statusErr.message);
          }
        } else {
          console.error('[RENEWAL-CONFIRM] ❌ ADVPS renewal API failed:', advpsRenew.error);
          logger.setProviderApiResult('advps', false, advpsRenew.result, { message: advpsRenew.error }, apiDuration);
        }
      } catch (advpsErr) {
        console.error('[RENEWAL-CONFIRM] ❌ ADVPS renewal threw:', advpsErr.message);
        logger.setProviderApiResult('advps', false, null, advpsErr);
        providerRenewalResult = { error: advpsErr.message };
        providerRenewalSuccess = false;
        console.log('[RENEWAL-CONFIRM] Continuing — customer payment succeeded; expiry will still be extended');
      }

      console.log('[RENEWAL-CONFIRM] === ADVPS RENEWAL PROCESS END ===');
    } else if (provider === 'netbay') {
      console.log('[RENEWAL-CONFIRM] === NETBAY RENEWAL PROCESS START ===');
      console.log('[RENEWAL-CONFIRM] Netbay serviceId:', order.netbayServiceId);

      try {
        const apiStart = Date.now();
        const netbayRenew = await executeNetbayUpstreamRenewal(order, { months: 1 });
        const apiDuration = Date.now() - apiStart;

        providerRenewalResult = netbayRenew.result || {
          error: netbayRenew.error,
          serviceId: netbayRenew.serviceId,
        };
        providerRenewalSuccess = netbayRenew.success;

        if (netbayRenew.success) {
          console.log('[RENEWAL-CONFIRM] ✅ Netbay renewal API success:', JSON.stringify(netbayRenew.result, null, 2));
          logger.setProviderApiResult('netbay', true, netbayRenew.result, null, apiDuration);
          if (netbayRenew.newExpiryDate) {
            newExpiryDate = netbayRenew.newExpiryDate;
            console.log(`[RENEWAL-CONFIRM] Netbay expiry after renew: ${newExpiryDate.toISOString()}`);
          }
        } else {
          console.error('[RENEWAL-CONFIRM] ❌ Netbay renewal API failed:', netbayRenew.error);
          logger.setProviderApiResult('netbay', false, netbayRenew.result, { message: netbayRenew.error }, apiDuration);
        }
      } catch (netbayErr) {
        console.error('[RENEWAL-CONFIRM] ❌ Netbay renewal threw:', netbayErr.message);
        logger.setProviderApiResult('netbay', false, null, netbayErr);
        providerRenewalResult = { error: netbayErr.message };
        providerRenewalSuccess = false;
        console.log('[RENEWAL-CONFIRM] Continuing — customer payment succeeded; expiry will still be extended');
      }

      console.log('[RENEWAL-CONFIRM] === NETBAY RENEWAL PROCESS END ===');
    } else {
      console.log(`[RENEWAL-CONFIRM] ${provider} renewal - no additional API call needed`);
      providerRenewalSuccess = true; // OceanLinux renewals are handled internally
    }

    // Add provider renewal result to the payment record
    renewalPayment.providerRenewalResult = providerRenewalResult;
    renewalPayment.providerRenewalSuccess = providerRenewalSuccess;

    console.log('[RENEWAL-CONFIRM] === DATABASE UPDATE START ===');
    console.log('[RENEWAL-CONFIRM] Updating order in database with renewal payment record...');
    console.log('[RENEWAL-CONFIRM] Renewal payment record:', {
      ...renewalPayment,
      providerRenewalResult: providerRenewalResult ? '[RESULT_PRESENT]' : null
    });

    // Backfill panel credentials for older orders that don't have them
    if (!order.panelUsername) {
      await assignPanelCredentials(order);
      await order.save();
    }

    // Update the order with new expiry date and payment info
    // IMPORTANT: Update main payment fields  to reflect the latest renewal transaction
    const updatedOrder = await Order.findByIdAndUpdate(orderId, {
      expiryDate: newExpiryDate,
      lastAction: 'renew',
      lastActionTime: new Date(),
      provider: provider, // Store provider for accurate future renewals
      // Update main payment fields with latest renewal payment
      transactionId: cf_payment_id,
      gatewayOrderId: renewalPayment.gatewayOrderId,
      paymentMethod: paymentMethodLabel,
      paymentDetails: renewalPayment.paymentDetails,
      ...(isAdvpsOrder(order) ? getAdvpsRebuildResetFields() : {}),
      // Store renewal payment info for record keeping
      $push: {
        renewalPayments: renewalPayment
      },
      // Clear the pending renewal since it's now processed
      $unset: {
        pendingRenewal: 1
      }
    }, { new: true });

    if (!updatedOrder) {
      console.error('[RENEWAL-CONFIRM] Failed to update order in database');
      return NextResponse.json({
        success: false,
        message: 'Failed to update order'
      }, { status: 500 });
    }

    console.log('[RENEWAL-CONFIRM] === DATABASE UPDATE SUCCESS ===');
    console.log(`[RENEWAL-CONFIRM] ✅ Order ${order._id} renewed successfully in database:`, {
      provider: provider,
      newExpiry: newExpiryDate.toISOString(),
      providerRenewalSuccess: providerRenewalSuccess,
      renewalPayments: updatedOrder.renewalPayments?.length || 0
    });
    logger.logSuccess('Database updated with new expiry date', { newExpiryDate });

    // Finalize logger with success
    await logger.finalize(true, newExpiryDate);

    notifyRenewalCompleted(updatedOrder, newExpiryDate, renewalTxnId).catch((err) =>
      console.error('[RENEWAL-CONFIRM] renewal notification failed:', err.message),
    );

    // Prepare success response with provider-specific information
    const response = {
      success: true,
      message: 'Service renewed successfully',
      orderId: order._id,
      newExpiryDate: newExpiryDate,
      renewalTxnId: renewalTxnId,
      provider: provider,
      renewalDetails: {
        previousExpiry: currentExpiry,
        newExpiry: newExpiryDate,
        amount: renewalPrice,
        provider: provider,
        providerRenewalSuccess: providerRenewalSuccess
      }
    };

    // Add provider-specific success details
    if (provider === 'smartvps') {
      response.message = providerRenewalSuccess
        ? 'Service renewed successfully! SmartVPS service has been extended.'
        : 'Service renewed successfully! Note: SmartVPS API renewal encountered an issue, but your service period has been extended.';
      console.log('[RENEWAL-CONFIRM] SmartVPS renewal completion message:', response.message);
    } else if (provider === 'hostycare') {
      response.message = providerRenewalSuccess
        ? 'Service renewed successfully! Hostycare service has been extended.'
        : 'Service renewed successfully! Note: Hostycare API renewal encountered an issue, but your service period has been extended.';
    } else if (provider === 'advps') {
      response.message = providerRenewalSuccess
        ? 'Service renewed successfully! Your VM has been extended upstream.'
        : providerRenewalResult?.testMode
          ? 'Payment received but ADVPS ran in TEST mode — the VM was NOT renewed upstream. Replace ADVPS_API_KEY with your production key on the server, then contact support to retry the upstream renewal.'
          : 'Payment received and your service period has been extended. Note: the upstream renewal API hit a snag — our team will retry it shortly.';
    } else if (provider === 'netbay') {
      response.message = providerRenewalSuccess
        ? 'Service renewed successfully! Your service period has been extended.'
        : 'Payment received and your service period has been extended. Our team will complete the extension shortly if needed.';
    }

    console.log('[RENEWAL-CONFIRM] === RENEWAL PROCESS COMPLETE ===');
    console.log('[RENEWAL-CONFIRM] Final response being sent to client:', {
      ...response,
      renewalDetails: {
        ...response.renewalDetails,
        providerApiCallMade: provider === 'smartvps' || provider === 'hostycare' || provider === 'netbay',
        providerApiSuccess: providerRenewalSuccess
      }
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('[RENEWAL-CONFIRM] === RENEWAL PROCESS ERROR ===');
    console.error('[RENEWAL-CONFIRM] Renewal payment confirmation error:', error);
    console.error('[RENEWAL-CONFIRM] Error type:', error.constructor.name);
    console.error('[RENEWAL-CONFIRM] Error message:', error.message);
    console.error('[RENEWAL-CONFIRM] Error stack:', error.stack);

    // Finalize logger with failure
    if (logger) {
      await logger.finalize(false, null, error.message, error.stack);
    }

    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}
