import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import RenewalRequest from '@/models/renewalRequestModel';
import User from '@/models/userModel';
import { verifyRazorpaySignature } from '@/lib/paymentGateways';
import { resolveOrderRenewalExpiryDate } from '@/lib/expiryHelper';
import { assignPanelCredentials } from '@/lib/panelCredentials';
import { detectCompanyManagedRenewal, resolveRenewalProvider, shouldUseCompanyValidityForRenewal } from '@/lib/companyRenewal';
import { renewalBlockMessage } from '@/lib/trialVpsOrder';
import { resolveOrderRenewalPrice } from '@/lib/orderRenewalPricingServer';
const { customerApiCatchPayload } = require('@/lib/customerFacingErrors');
import { debitPendingRenewalWallet } from '@/lib/renewalWallet';
import { enforceOrderAccess } from '@/lib/apiSecurity';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';
const SmartVPSAPI = require('@/services/smartvpsApi');
const AdvpsAPI = require('@/services/advpsApi');
const RenewalLogger = require('@/services/renewalLogger');
const { getAdvpsRebuildResetFields, isAdvpsOrder } = require('@/lib/advpsRebuildLimit');
const { executeAdvpsUpstreamRenewal } = require('@/lib/advpsRenewal');
const { executeNetbayUpstreamRenewal } = require('@/lib/netbayRenewal');
const { executeResellerPanelUpstreamRenewal } = require('@/lib/resellerPanelRenewal');
const { executeHostdzireUpstreamRenewal } = require('@/lib/hostdzireRenewal');
const { executeRackatoUpstreamRenewal } = require('@/lib/rackatoRenewal');
const { resolveRenewalExpiryFromPanel } = require('@/lib/companyResellerInventorySync');
const { pickAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
const { acquireRenewalUpstream } = require('@/lib/renewalUpstreamClaim');
const { extractAdvpsStatusCredentials } = require('@/lib/advpsStatusNormalize');
const HostycareAPI = require('@/services/hostycareApi');
const { notifyRenewalCompleted } = require('@/lib/renewalNotifications');

/** Resolve Razorpay order id when pendingRenewal.gatewayOrderId was not persisted (race/stale tab). */
async function resolveRenewalRazorpayOrderId({ order, renewalTxnId, razorpayOrderIdFromClient }) {
  const stored = String(order.pendingRenewal?.gatewayOrderId || '').trim();
  const fromClient = String(razorpayOrderIdFromClient || '').trim();
  if (stored) return stored;
  if (fromClient) return fromClient;
  if (!renewalTxnId) return '';

  try {
    const { getRazorpayClient } = await import('@/lib/razorpayClient');
    const razorpay = getRazorpayClient();
    if (!razorpay) return '';

    const from = Math.floor((Date.now() - 6 * 60 * 60 * 1000) / 1000);
    const listed = await razorpay.orders.all({ from, count: 100 });
    const match = (listed.items || []).find((o) => o.receipt === renewalTxnId);
    return match?.id || '';
  } catch (err) {
    console.warn('[RENEWAL-CONFIRM] Razorpay receipt lookup failed:', err.message);
    return '';
  }
}

export async function POST(request) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

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
    let order = await Order.findById(orderId);
    if (!order) {
      console.error(`Order not found: ${orderId}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    const renewBlock = await renewalBlockMessage(order);
    if (renewBlock) {
      return NextResponse.json(
        { success: false, message: renewBlock },
        { status: 400 }
      );
    }

    try {
      const { alignPendingRenewalForConfirm } = await import('@/lib/renewalOrderLookup');
      order = await alignPendingRenewalForConfirm(order, renewalTxnId);
    } catch (alignErr) {
      console.error('[RENEWAL-CONFIRM] pendingRenewal align failed:', alignErr.message);
      return NextResponse.json(
        { success: false, message: alignErr.message || 'Renewal session mismatch' },
        { status: alignErr.status || 400 }
      );
    }
    if (!order) {
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    const { assertOrderNotAdminSuspended } = require('@/lib/orderAdminSuspend');
    const suspended = assertOrderNotAdminSuspended(order);
    if (suspended) {
      return NextResponse.json(suspended, { status: 403 });
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
        actualPaymentMethod = 'razorpay';
        logger.logInfo('Payment method defaulted to razorpay for renewal transaction');
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
      logger.setPaymentInfo('wallet', payment_id, renewalPrice, renewalTxnId);
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

      const orderIdForSignature = await resolveRenewalRazorpayOrderId({
        order,
        renewalTxnId,
        razorpayOrderIdFromClient: razorpayOrderId,
      });

      if (orderIdForSignature && !order.pendingRenewal?.gatewayOrderId) {
        await Order.findByIdAndUpdate(order._id, {
          $set: { 'pendingRenewal.gatewayOrderId': orderIdForSignature },
        });
        if (order.pendingRenewal) {
          order.pendingRenewal.gatewayOrderId = orderIdForSignature;
        }
        console.log('[RENEWAL-CONFIRM] Backfilled pendingRenewal.gatewayOrderId:', orderIdForSignature);
      }

      if (razorpayPaymentId && razorpaySignature && orderIdForSignature) {
        console.log('[RENEWAL-CONFIRM] Using Razorpay order ID for signature:', orderIdForSignature);

        const renewalSignatureOk = verifyRazorpaySignature({
          razorpay_order_id: razorpayOrderId || orderIdForSignature,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: razorpaySignature,
          expectedOrderId: orderIdForSignature,
        });

        if (renewalSignatureOk) {
          console.log('[RENEWAL-CONFIRM] ✅ Razorpay signature verified');
          logger.logSuccess('Razorpay payment verified');
          payment_id = razorpayPaymentId;
          paymentVerified = true;
          logger.setPaymentInfo('razorpay', razorpayPaymentId, renewalPrice, orderIdForSignature);
        } else {
          console.error('[RENEWAL-CONFIRM] ❌ Razorpay signature verification failed');
          logger.logError('Razorpay signature verification failed');
          await logger.finalize(false, null, 'Razorpay signature verification failed');
          return NextResponse.json(
            { success: false, message: 'Payment verification failed' },
            { status: 400 }
          );
        }
      } else if (orderIdForSignature) {
        // Callback / status-poll path — no signature in browser; verify server-side.
        try {
          const { getRazorpayClient } = await import('@/lib/razorpayClient');
          const razorpay = getRazorpayClient();
          if (!razorpay) throw new Error('Razorpay credentials not configured');

          const razorpayOrder = await razorpay.orders.fetch(orderIdForSignature);
          if (razorpayOrder.status === 'paid') {
            const payments = await razorpay.orders.fetchPayments(orderIdForSignature);
            const successPayment = payments.items?.find((p) => p.status === 'captured');
            if (successPayment) {
              console.log('[RENEWAL-CONFIRM] ✅ Razorpay payment verified via server fetch');
              payment_id = successPayment.id;
              paymentVerified = true;
              logger.setPaymentInfo('razorpay', successPayment.id, renewalPrice, orderIdForSignature);
            }
          }
        } catch (fetchErr) {
          console.error('[RENEWAL-CONFIRM] Razorpay server verification failed:', fetchErr.message);
        }
      }

      if (!paymentVerified) {
        if (!orderIdForSignature) {
          console.error('[RENEWAL-CONFIRM] ❌ Missing stored Razorpay order ID');
          await logger.finalize(false, null, 'Missing stored Razorpay order ID');
          return NextResponse.json(
            { success: false, message: 'Missing Razorpay order ID' },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { success: false, message: 'Missing Razorpay payment details' },
          { status: 400 }
        );
      }
    } else if (!paymentVerified && gatewayPaymentMethod === 'upi') {
      const { verifyUPIPayment } = await import('@/lib/confirmPendingOrderPayment');
      const { paymentAmountsMatch, expectedRenewalGatewayAmount } = await import('@/lib/paymentAmountValidation');
      let upiCheck = { verified: false, pending: true };
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        upiCheck = await verifyUPIPayment(renewalTxnId, order.pendingRenewal?.gatewayOrderId);
        if (upiCheck.verified || upiCheck.failed) break;
      }
      if (!upiCheck.verified) {
        if (upiCheck.pending) {
          return NextResponse.json(
            { success: false, message: 'UPI payment is still confirming. Please wait a moment and refresh.', processing: true },
            { status: 202 }
          );
        }
        console.error('[RENEWAL-CONFIRM] UPI payment not verified:', upiCheck);
        await logger.finalize(false, null, 'UPI payment not verified');
        return NextResponse.json(
          { success: false, message: 'UPI payment not verified. Please wait for confirmation or contact support.' },
          { status: 400 }
        );
      }
      const expectedGateway = expectedRenewalGatewayAmount(order);
      const paidGateway = Number(upiCheck.amount);
      if (!(expectedGateway > 0) || !Number.isFinite(paidGateway) || paidGateway <= 0 || !paymentAmountsMatch(paidGateway, expectedGateway)) {
        await logger.finalize(false, null, 'UPI amount mismatch');
        return NextResponse.json(
          { success: false, message: 'Payment amount does not match renewal price.' },
          { status: 400 }
        );
      }
      payment_id = upiCheck.upi_txn_id || renewalTxnId;
      paymentVerified = true;
      logger.setPaymentInfo('upi', payment_id, renewalPrice, renewalTxnId);
    } else if (!paymentVerified) {
      return NextResponse.json(
        { success: false, message: 'Unsupported or unverified payment method. Please try again or contact support.' },
        { status: 400 }
      );
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

    // Company / Hostheaven: 30d (28/29 in Feb). Other orders: calendar month length.
    const useCompanyValidity = shouldUseCompanyValidityForRenewal(companyCheck, provider);
    let newExpiryDate = resolveOrderRenewalExpiryDate(currentExpiry, { useCompanyValidity });

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

      const storedRenewalPaymentMethod =
        order.pendingRenewal?.paymentMethod &&
        String(order.pendingRenewal.paymentMethod).startsWith('wallet+')
          ? String(order.pendingRenewal.paymentMethod)
          : actualPaymentMethod;

      const renewalGatewayOrderId =
        storedRenewalPaymentMethod === 'razorpay' ||
        storedRenewalPaymentMethod === 'wallet+razorpay'
          ? order.pendingRenewal?.gatewayOrderId || razorpayOrderId || renewalTxnId
          : renewalTxnId;

      let renewalReq;
      try {
        renewalReq = await RenewalRequest.create({
          orderId: order._id,
          userId: order.user,
          companyId: companyCheck.companyId,
          renewalTxnId,
          amount: renewalPrice,
          paymentMethod: storedRenewalPaymentMethod,
          paymentId: cf_payment_id,
          gatewayOrderId: renewalGatewayOrderId,
          paymentDetails: {
            method: storedRenewalPaymentMethod,
            payment_id: cf_payment_id,
            order_id: renewalGatewayOrderId,
            walletTxnId: order.pendingRenewal?.walletTxnId || null,
            walletAmount: order.pendingRenewal?.walletAmount || 0,
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
      } catch (createErr) {
        if (createErr?.code === 11000) {
          renewalReq = await RenewalRequest.findOne({ renewalTxnId }).lean();
          if (renewalReq) {
            console.log(`[RENEWAL-CONFIRM] ✅ RenewalRequest already exists (race with webhook)`);
            await logger.finalize(true, currentExpiry);
            return NextResponse.json({
              success: true,
              message: renewalReq.status === 'pending'
                ? 'Payment received. Your renewal is waiting for approval from the provider.'
                : `Renewal already ${renewalReq.status}.`,
              companyApproval: { status: renewalReq.status, requestId: renewalReq._id },
              orderId: order._id,
              newExpiryDate: currentExpiry,
            });
          }
        }
        throw createErr;
      }

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

    const upstream = await acquireRenewalUpstream(order._id, renewalTxnId);
    if (!upstream.proceed) {
      if (upstream.alreadyProcessed) {
        console.log(`[RENEWAL-CONFIRM] ⚠️ Skipping provider renew — ${renewalTxnId} already applied`);
        logger.logWarning('Skipped provider renew — another request already applied this payment');
        await logger.finalize(true, upstream.expiryDate || order.expiryDate);
        return NextResponse.json({
          success: true,
          message: 'Renewal was already processed',
          alreadyProcessed: true,
          orderId: order._id,
          newExpiryDate: upstream.expiryDate || order.expiryDate,
        });
      }
      console.log(`[RENEWAL-CONFIRM] ⚠️ Skipping provider renew — ${renewalTxnId} still in progress`);
      logger.logWarning('Skipped provider renew — another request is still applying this payment');
      await logger.finalize(false, order.expiryDate, 'Renewal already in progress');
      return NextResponse.json({
        success: false,
        message: 'Renewal is already being applied',
        inProgress: true,
        orderId: order._id,
      }, { status: 409 });
    }
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

          try {
            const { extractIpFromAddress, parseSmartVpsExpiryDate } = require('@/lib/smartvpsOrderSync');
            const statusIp = extractIpFromAddress(serviceIdentifier) || extractIpFromAddress(order.ipAddress);
            if (statusIp) {
              const statusRaw = await smartvpsApi.status(statusIp);
              const panelExpiry = parseSmartVpsExpiryDate(statusRaw);
              if (panelExpiry) {
                newExpiryDate = panelExpiry;
                console.log('[RENEWAL-CONFIRM] SmartVPS panel expiry after renew:', panelExpiry.toISOString());
              }
            }
          } catch (statusErr) {
            console.warn('[RENEWAL-CONFIRM] Could not fetch SmartVPS expiry after renew:', statusErr.message);
          }

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
    } else if (provider === 'reseller-api') {
      console.log('[RENEWAL-CONFIRM] === RESELLER PANEL RENEWAL START ===');
      try {
        const apiStart = Date.now();
        const panelRenew = await executeResellerPanelUpstreamRenewal(order, { months: 1, Order });
        const apiDuration = Date.now() - apiStart;

        providerRenewalResult = panelRenew.result
          ? {
              ...panelRenew.result,
              couponUsed: panelRenew.couponUsed ?? null,
              panelPayableAmount: panelRenew.panelPayableAmount ?? null,
            }
          : { error: panelRenew.error, vmId: panelRenew.vmId, couponUsed: panelRenew.couponUsed ?? null };
        providerRenewalSuccess = panelRenew.success;

        newExpiryDate = await resolveRenewalExpiryFromPanel(order, newExpiryDate, { panelRenew });

        if (panelRenew.success) {
          logger.setProviderApiResult('reseller-api', true, panelRenew.result, null, apiDuration);
        } else {
          logger.setProviderApiResult('reseller-api', false, panelRenew.result, { message: panelRenew.error }, apiDuration);
        }
      } catch (panelErr) {
        providerRenewalResult = { error: panelErr.message };
        providerRenewalSuccess = false;
        logger.setProviderApiResult('reseller-api', false, null, panelErr);
      }
      console.log('[RENEWAL-CONFIRM] === RESELLER PANEL RENEWAL END ===');
    } else if (provider === 'rackato') {
      try {
        const apiStart = Date.now();
        const rackatoRenew = await executeRackatoUpstreamRenewal(order);
        const apiDuration = Date.now() - apiStart;
        providerRenewalResult = rackatoRenew.result || { error: rackatoRenew.error, uid: rackatoRenew.uid };
        providerRenewalSuccess = rackatoRenew.success;
        if (rackatoRenew.success) {
          logger.setProviderApiResult('rackato', true, rackatoRenew.result, null, apiDuration);
          if (rackatoRenew.newExpiryDate) newExpiryDate = rackatoRenew.newExpiryDate;
        } else {
          logger.setProviderApiResult('rackato', false, rackatoRenew.result, { message: rackatoRenew.error }, apiDuration);
        }
      } catch (rackatoErr) {
        logger.setProviderApiResult('rackato', false, null, rackatoErr);
        providerRenewalResult = { error: rackatoErr.message };
        providerRenewalSuccess = false;
      }
    } else if (provider === 'hostdzire') {
      console.log('[RENEWAL-CONFIRM] === HOSTDZIRE RENEWAL PROCESS START ===');
      console.log('[RENEWAL-CONFIRM] HostDzire identifiers:', {
        hostdzireOrderId: order.hostdzireOrderId,
        ipAddress: order.ipAddress,
      });

      try {
        const apiStart = Date.now();
        const hostdzireRenew = await executeHostdzireUpstreamRenewal(order);
        const apiDuration = Date.now() - apiStart;

        providerRenewalResult = hostdzireRenew.result || {
          error: hostdzireRenew.error,
          ipAddress: hostdzireRenew.ipAddress,
        };
        providerRenewalSuccess = hostdzireRenew.success;

        if (hostdzireRenew.success) {
          console.log('[RENEWAL-CONFIRM] ✅ HostDzire renewal API success:', JSON.stringify(hostdzireRenew.result, null, 2));
          logger.setProviderApiResult('hostdzire', true, hostdzireRenew.result, null, apiDuration);
          if (hostdzireRenew.newExpiryDate) {
            newExpiryDate = hostdzireRenew.newExpiryDate;
            console.log(`[RENEWAL-CONFIRM] HostDzire expiry after renew: ${newExpiryDate.toISOString()}`);
          }
        } else {
          console.error('[RENEWAL-CONFIRM] ❌ HostDzire renewal API failed:', hostdzireRenew.error);
          logger.setProviderApiResult('hostdzire', false, hostdzireRenew.result, { message: hostdzireRenew.error }, apiDuration);
        }
      } catch (hostdzireErr) {
        console.error('[RENEWAL-CONFIRM] ❌ HostDzire renewal threw:', hostdzireErr.message);
        logger.setProviderApiResult('hostdzire', false, null, hostdzireErr);
        providerRenewalResult = { error: hostdzireErr.message };
        providerRenewalSuccess = false;
        console.log('[RENEWAL-CONFIRM] Continuing — customer payment succeeded; expiry will still be extended');
      }

      console.log('[RENEWAL-CONFIRM] === HOSTDZIRE RENEWAL PROCESS END ===');
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
    // Claim this renewal atomically. The idempotency check above is a
    // read-then-write, so a confirm racing the webhook could otherwise push two
    // renewal records and extend the expiry twice for a single payment.
    const renewalClaim = { _id: orderId };
    if (renewalTxnId) {
      renewalClaim.renewalPayments = { $not: { $elemMatch: { renewalTxnId } } };
    }

    const updatedOrder = await Order.findOneAndUpdate(renewalClaim, {
      expiryDate: newExpiryDate,
      status: 'active',
      provisioningStatus: 'active',
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
      // Lost the race: another confirm/webhook already applied this renewal.
      const current = await Order.findById(orderId).lean();
      const existingRenewal = renewalTxnId
        ? current?.renewalPayments?.find((rp) => rp.renewalTxnId === renewalTxnId)
        : null;

      if (existingRenewal) {
        console.log(`[RENEWAL-CONFIRM] ⚠️ Renewal already applied concurrently: ${renewalTxnId}`);
        await logger.finalize(true, existingRenewal.newExpiry || current.expiryDate);
        return NextResponse.json({
          success: true,
          message: 'Renewal was already processed',
          alreadyProcessed: true,
          orderId: order._id,
          newExpiryDate: existingRenewal.newExpiry || current.expiryDate,
        });
      }

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
      { success: false, message: 'Server error', ...customerApiCatchPayload(error.message) },
      { status: 500 }
    );
  }
}
