import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import RenewalRequest from '@/models/renewalRequestModel';
import User from '@/models/userModel';
import crypto from 'crypto';
import { calculateRenewalExpiryDate } from '@/lib/expiryHelper';
import { assignPanelCredentials } from '@/lib/panelCredentials';
const { resolveOrderExpiryOnPayment, pickAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
const { extractAdvpsStatusCredentials } = require('@/lib/advpsStatusNormalize');
import { detectCompanyManagedRenewal, resolveRenewalProvider } from '@/lib/companyRenewal';
import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { resolveOrderRenewalPrice } from '@/lib/orderRenewalPricingServer';
import { debitPendingRenewalWallet } from '@/lib/renewalWallet';
import {
  findDispatchTarget,
  confirmRechargeFromWebhook,
  confirmCheckoutFromWebhook,
} from '@/lib/paymentDispatch';
const AutoProvisioningService = require('@/services/autoProvisioningService');
import NotificationService from '@/services/notificationService';
const { notifyRenewalCompleted } = require('@/lib/renewalNotifications');
const WhatsAppService = require('@/services/whatsappService');
const SlotIPPackage = require('@/models/slotIpPackageModel');
const HostycareAPI = require('@/services/hostycareApi');
const SmartVPSAPI = require('@/services/smartvpsApi');
const AdvpsAPI = require('@/services/advpsApi');
const RenewalLogger = require('@/services/renewalLogger');
const { getAdvpsRebuildResetFields, isAdvpsOrder } = require('@/lib/advpsRebuildLimit');
const { executeAdvpsUpstreamRenewal } = require('@/lib/advpsRenewal');

export async function POST(request) {
  const webhookStartTime = Date.now();
  console.log("\n" + "=".repeat(80));
  console.log(`[WEBHOOK] 🚀 CASHFREE WEBHOOK RECEIVED AT ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  await connectDB();
  console.log("[WEBHOOK] ✅ Database connected");

  try {
    // Get the raw body and signature
    const body = await request.text();
    const signature = request.headers.get('x-cashfree-signature');
    const timestamp = request.headers.get('x-cashfree-timestamp');

    if (!signature) {
      console.error("[WEBHOOK] ❌ Missing Cashfree signature");
      return NextResponse.json(
        { success: false, message: 'Missing signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const signatureData = timestamp + body;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(signatureData)
      .digest('base64');

    if (signature !== expectedSignature) {
      console.error("[WEBHOOK] ❌ Invalid signature");
      return NextResponse.json(
        { success: false, message: 'Invalid signature' },
        { status: 400 }
      );
    }

    const data = JSON.parse(body);
    console.log("[WEBHOOK] 📦 RECEIVED PAYLOAD:");
    console.log(JSON.stringify(data, null, 2));

    // Handle payment success event
    if (data.type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const payment = data.data;
      const orderId = payment.order.order_id;

      console.log(`[WEBHOOK] 💳 Payment successful for order: ${orderId}`);

      // Check if this is a RENEWAL transaction
      if (orderId.startsWith('RENEWAL_')) {
        console.log(`[WEBHOOK] 🔄 Detected RENEWAL transaction: ${orderId}`);
        return await handleRenewalWebhook(orderId, payment, webhookStartTime);
      }

      // Dispatch by parent collection: cart checkout > wallet recharge > order.
      // Single-order ('Buy Now') flow is preserved verbatim below.
      const dispatch = await findDispatchTarget(orderId);
      if (dispatch?.kind === 'checkout') {
        console.log(`[WEBHOOK] 🛒 Cart checkout session matched: ${dispatch.doc._id}`);
        const result = await confirmCheckoutFromWebhook(dispatch.doc, {
          paymentMethod: 'cashfree',
          transactionId: payment.payment.cf_payment_id,
          paymentDetails: {
            cf_payment_id: payment.payment.cf_payment_id,
            cf_order_id: payment.order.order_id,
            payment_amount: payment.payment.payment_amount,
            payment_currency: payment.payment.payment_currency,
            payment_method: payment.payment.payment_method,
            webhookReceivedAt: new Date(),
          },
        });
        const totalWebhookTime = Date.now() - webhookStartTime;
        return NextResponse.json({
          success: !!result.success,
          message: 'Cart checkout webhook processed',
          ...result,
          processingTime: totalWebhookTime,
        });
      }
      if (dispatch?.kind === 'recharge') {
        console.log(`[WEBHOOK] 💰 Wallet recharge matched: ${dispatch.doc._id}`);
        const result = await confirmRechargeFromWebhook(dispatch.doc, {
          paymentMethod: 'cashfree',
          transactionId: payment.payment.cf_payment_id,
          paymentDetails: {
            cf_payment_id: payment.payment.cf_payment_id,
            cf_order_id: payment.order.order_id,
            payment_amount: payment.payment.payment_amount,
            webhookReceivedAt: new Date(),
          },
        });
        const totalWebhookTime = Date.now() - webhookStartTime;
        return NextResponse.json({
          success: !!result.success,
          message: 'Wallet recharge webhook processed',
          ...result,
          processingTime: totalWebhookTime,
        });
      }

      // Find the order in our database (for new orders)
      const order = await Order.findOne({ clientTxnId: orderId });

      if (!order) {
        console.error(`[WEBHOOK] ❌ Order not found for Cashfree order ID: ${orderId}`);
        const PaymentOrderLogger = require('@/services/paymentOrderLogger');
        const logger = PaymentOrderLogger.forTxn(orderId, 'webhook');
        logger.error('Webhook PAYMENT_SUCCESS but no matching order in database', {
          cfOrderId: orderId,
          cfPaymentId: payment.payment?.cf_payment_id,
          amount: payment.payment?.payment_amount,
        });
        logger.setPaymentInfo({
          method: 'cashfree',
          gatewayStatus: 'SUCCESS',
          transactionId: payment.payment?.cf_payment_id,
          gatewayOrderId: orderId,
          amount: payment.payment?.payment_amount,
        });
        await logger.save({
          success: false,
          anomaly: true,
          errorMessage: 'webhook_order_not_found',
        });
        return NextResponse.json(
          { success: false, message: 'Order not found' },
          { status: 404 }
        );
      }

      console.log(`[WEBHOOK] ✅ FOUND ORDER: ${order._id}`);
      console.log(`[WEBHOOK] 📊 ORDER CURRENT STATE:`);
      console.log(`   - Status: ${order.status}`);
      console.log(`   - Product Name: ${order.productName}`);
      console.log(`   - Memory: ${order.memory}`);

      // Update order status
      const orderUpdateStart = Date.now();
      console.log(`[WEBHOOK] 📝 UPDATING ORDER STATUS...`);

      const expiryDate = await resolveOrderExpiryOnPayment(order);

      order.status = 'confirmed';
      order.transactionId = payment.payment.cf_payment_id;
      order.gatewayOrderId = payment.order.order_id; // Store Cashfree order ID
      order.paymentMethod = 'cashfree';
      if (expiryDate) order.expiryDate = expiryDate;

      // Store additional payment info
      order.webhookAmount = payment.payment.payment_amount.toString();
      order.webhookCustomerEmail = payment.customer_details.customer_email;

      // Store comprehensive payment details
      order.paymentDetails = {
        cf_payment_id: payment.payment.cf_payment_id,
        cf_order_id: payment.order.order_id,
        payment_status: payment.payment.payment_status,
        payment_amount: payment.payment.payment_amount,
        payment_currency: payment.payment.payment_currency,
        payment_time: payment.payment.payment_time,
        payment_method: payment.payment.payment_method,
        bank_reference: payment.payment.bank_reference,
        customer_email: payment.customer_details.customer_email,
        customer_phone: payment.customer_details.customer_phone,
        webhookReceivedAt: new Date()
      };

      await assignPanelCredentials(order);
      await order.save();
      const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');
      await fulfillOrderInventory(order);

      try {
        await NotificationService.notifyOrderConfirmed(order.user, order);
      } catch (notifErr) {
        console.error('[WEBHOOK] Failed to send order confirmation notification:', notifErr.message);
      }

      const PaymentOrderLogger = require('@/services/paymentOrderLogger');
      const webhookLogger = PaymentOrderLogger.forOrder(order, 'webhook');
      webhookLogger.success('Cashfree webhook confirmed order', {
        cfPaymentId: payment.payment.cf_payment_id,
        amount: payment.payment.payment_amount,
      });
      webhookLogger.setPaymentInfo({
        method: 'cashfree',
        gatewayStatus: 'SUCCESS',
        transactionId: payment.payment.cf_payment_id,
        gatewayOrderId: payment.order.order_id,
        amount: payment.payment.payment_amount,
      });
      await webhookLogger.save({ success: true });

      const orderUpdateTime = Date.now() - orderUpdateStart;
      console.log(`[WEBHOOK] ✅ ORDER UPDATED to 'confirmed' in ${orderUpdateTime}ms`);
      console.log(`[WEBHOOK] 📅 Order expiry set to: ${expiryDate ? expiryDate.toISOString() : 'deferred (ADVPS upstream)'}`);

      console.log("\n" + "-".repeat(60));
      console.log(`[WEBHOOK] CHECKING AUTO-PROVISIONING for order ${order._id}`);
      console.log("-".repeat(60));

      try {
        const freshOrder = await Order.findById(order._id);
        if (freshOrder?.slotIpPackageId || freshOrder?.inventoryItemId || freshOrder?.ipAddress) {
          console.log(`[WEBHOOK] Pre-assigned inventory — skipping auto-provisioning`);
          try {
            const ready = await Order.findById(order._id);
            if (ready && NotificationService.isOrderDeliverable(ready)) {
              await NotificationService.notifyOrderCompleted(order.user, ready, {
                ipAddress: ready.ipAddress,
                username: ready.username,
                password: ready.password,
              });
            }
          } catch (completeErr) {
            console.error('[WEBHOOK] Failed to notify inventory order completion:', completeErr.message);
          }
        } else if (
          freshOrder?.provisioningStatus === 'provisioning' ||
          freshOrder?.provisioningStatus === 'active'
        ) {
          console.log(`[WEBHOOK] Order ${order._id} already provisioning/provisioned, skipping`);
        } else {
          console.log(`[WEBHOOK] 🚀 Starting auto-provisioning for order ${order._id}`);

          const provisioningService = new AutoProvisioningService();

          // Start auto-provisioning in background
          // The provisionServer method now has atomic DB locking to prevent duplicates
          const provisioningPromise = provisioningService.provisionServer(order._id.toString());

          // Handle the promise in background
          provisioningPromise
            .then(result => {
              const provisioningEndTime = Date.now();
              console.log("\n" + "★".repeat(60));
              console.log(`[AUTO-PROVISION] 🏁 PROVISIONING COMPLETED for order ${order._id}`);
              console.log(`[AUTO-PROVISION] ⏱️ Total time: ${provisioningEndTime - webhookStartTime}ms`);
              console.log("★".repeat(60));

              // Only log success if actually provisioned (not skipped due to duplicate)
              if (result && result.success && !result.alreadyProvisioned && !result.alreadyProvisioning) {
                console.log(`[AUTO-PROVISION] ✅ SUCCESS! Details:`);
                console.log(`   - Service ID: ${result.serviceId || 'N/A'}`);
                console.log(`   - IP Address: ${result.ipAddress || 'N/A'}`);
                NotificationService.notifyOrderCompleted(order.user, order, {
                  ipAddress: result.ipAddress || 'Available in dashboard',
                  username: result.username || 'root',
                  password: result.password || 'Check dashboard',
                }).catch((err) => console.error('[WEBHOOK] notifyOrderCompleted failed:', err.message));
                WhatsAppService.notifyOrderViaWhatsApp(order.user, order).catch(() => {});
              } else if (result?.alreadyProvisioned || result?.alreadyProvisioning) {
                console.log(`[AUTO-PROVISION] ⚠️ SKIPPED - Already handled by another process`);
                console.log(`   - Already Provisioned: ${result?.alreadyProvisioned}`);
                console.log(`   - Already Provisioning: ${result?.alreadyProvisioning}`);
              } else {
                console.error(`[AUTO-PROVISION] ❌ FAILED! Error: ${result?.error || 'Unknown error'}`);
              }
            })
            .catch(error => {
              console.error("\n" + "💥".repeat(60));
              console.error(`[AUTO-PROVISION] 💥 CRITICAL ERROR for order ${order._id}:`);
              console.error(`   - Error Message: ${error.message}`);
              console.error("💥".repeat(60));
            });

          console.log(`[WEBHOOK] ✅ Auto-provisioning initiated successfully`);
        }
      } catch (provisioningError) {
        console.error(`[WEBHOOK] ❌ ERROR initiating auto-provisioning:`, provisioningError);
      }

    } else if (data.type === 'PAYMENT_FAILED_WEBHOOK' || data.event === 'payment.failed') {
      const orderId =
        data.data?.order?.order_id ||
        data.payload?.payment?.entity?.order_id;

      if (!orderId) {
        console.log('[WEBHOOK] Payment failed event without order id — ignored');
      } else {
        console.log(`[WEBHOOK] ❌ Payment failed event for order: ${orderId}`);

        const order = await Order.findOne({
          $or: [{ clientTxnId: orderId }, { gatewayOrderId: orderId }],
        });

        if (!order) {
          console.log(`[WEBHOOK] No order found for failed payment: ${orderId}`);
        } else if (order.status === 'confirmed' || order.status === 'active') {
          console.log(`[WEBHOOK] Order ${order._id} already confirmed — ignoring failed webhook`);
        } else {
          const { probeGatewayPayment } = await import('@/lib/confirmPendingOrderPayment');
          const probe = await probeGatewayPayment(order);
          if (probe.success) {
            const { confirmPendingOrderPayment } = await import('@/lib/confirmPendingOrderPayment');
            await confirmPendingOrderPayment(order, probe);
            console.log(`[WEBHOOK] Order ${order._id} was actually paid — confirmed instead of failing`);
          } else {
            const { cancelPendingBuyNowOrder } = await import('@/lib/cancelPendingOrder');
            await cancelPendingBuyNowOrder(order, 'failed');
            console.log(`[WEBHOOK] Order ${order._id} payment release recorded`);
          }
        }
      }
    }

    const totalWebhookTime = Date.now() - webhookStartTime;
    console.log(`[WEBHOOK] ⏱️ Total webhook processing time: ${totalWebhookTime}ms`);

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      processingTime: totalWebhookTime
    });

  } catch (error) {
    const totalWebhookTime = Date.now() - webhookStartTime;
    console.error("\n" + "💥".repeat(80));
    console.error('[WEBHOOK] 💥 CRITICAL WEBHOOK ERROR:', error);
    console.error("💥".repeat(80));

    return NextResponse.json({
      success: false,
      message: 'Error processing webhook',
      error: error.message,
      processingTime: totalWebhookTime
    });
  }
}

// Handle renewal payment webhooks
async function handleRenewalWebhook(renewalTxnId, payment, webhookStartTime) {
  console.log(`[WEBHOOK-RENEWAL] 🔄 Processing renewal webhook for: ${renewalTxnId}`);

  let logger = null; // Will be initialized after finding order

  try {
    // Find order by pending renewal transaction ID
    const order = await Order.findOne({ 'pendingRenewal.renewalTxnId': renewalTxnId });

    if (!order) {
      console.error(`[WEBHOOK-RENEWAL] ❌ No order found with pending renewal: ${renewalTxnId}`);
      return NextResponse.json(
        { success: false, message: 'Order with pending renewal not found' },
        { status: 404 }
      );
    }

    console.log(`[WEBHOOK-RENEWAL] ✅ Found order: ${order._id}`);
    console.log(`[WEBHOOK-RENEWAL] Product: ${order.productName}`);
    console.log(`[WEBHOOK-RENEWAL] Current expiry: ${order.expiryDate}`);

    if (isSlotIpOrder(order)) {
      console.error(`[WEBHOOK-RENEWAL] ❌ Slot IP order cannot be renewed: ${order._id}`);
      return NextResponse.json(
        { success: false, message: SLOT_IP_NO_RENEWAL_MESSAGE },
        { status: 400 }
      );
    }

    const renewalPrice = await resolveOrderRenewalPrice(order);

    // Initialize logger
    logger = new RenewalLogger(order, renewalTxnId, 'webhook');
    logger.logInfo('Webhook renewal processing started', {
      productName: order.productName,
      currentExpiry: order.expiryDate
    });

    // Check if this renewal was already processed (idempotency)
    const alreadyProcessed = order.renewalPayments?.some(
      rp => rp.renewalTxnId === renewalTxnId
    );

    if (alreadyProcessed) {
      console.log(`[WEBHOOK-RENEWAL] ⚠️ Renewal already processed: ${renewalTxnId}`);
      logger.logWarning('Renewal already processed - idempotency check');
      await logger.finalize(true, order.expiryDate);
      const existingRenewal = order.renewalPayments.find((rp) => rp.renewalTxnId === renewalTxnId);
      notifyRenewalCompleted(
        order,
        existingRenewal?.newExpiry || order.expiryDate,
        renewalTxnId,
      ).catch((err) => console.error('[WEBHOOK-RENEWAL] renewal notification failed:', err.message));
      return NextResponse.json({
        success: true,
        message: 'Renewal already processed',
        alreadyProcessed: true
      });
    }

    // Determine provider
    const provider = await resolveRenewalProvider(order);
    console.log(`[WEBHOOK-RENEWAL] Provider: ${provider}`);
    logger.logInfo('Provider determined', { provider });
    logger.setPaymentInfo('cashfree', payment.payment.cf_payment_id, renewalPrice);

    try {
      await debitPendingRenewalWallet(order, renewalTxnId);
    } catch (walletErr) {
      console.error('[WEBHOOK-RENEWAL] Wallet debit failed:', walletErr);
      await logger.finalize(false, null, walletErr.message);
      return NextResponse.json(
        { success: false, message: walletErr.message || 'Insufficient wallet balance for renewal' },
        { status: 400 }
      );
    }

    // Calculate new expiry based on the number of days in the base month
    let newExpiryDate = calculateRenewalExpiryDate(order.expiryDate);

    console.log(`[WEBHOOK-RENEWAL] New expiry date: ${newExpiryDate}`);

    // ─── Company-managed renewal — queue for company approval ────────────
    const companyCheck = await detectCompanyManagedRenewal(order);
    if (companyCheck.isCompany) {
      console.log(`[WEBHOOK-RENEWAL] 🏢 Company-managed renewal — queuing for approval (companyId=${companyCheck.companyId})`);
      logger.logInfo('Company-managed renewal — awaiting company approval', {
        companyId: String(companyCheck.companyId),
      });

      const existingReq = await RenewalRequest.findOne({ renewalTxnId }).lean();
      if (!existingReq) {
        const customer = await User.findById(order.user).select('name email').lean();
        await RenewalRequest.create({
          orderId: order._id,
          userId: order.user,
          companyId: companyCheck.companyId,
          renewalTxnId,
          amount: renewalPrice,
          paymentMethod: 'cashfree',
          paymentId: payment.payment.cf_payment_id,
          gatewayOrderId: renewalTxnId,
          paymentDetails: {
            cf_payment_id: payment.payment.cf_payment_id,
            cf_order_id: renewalTxnId,
            payment_status: payment.payment.payment_status,
            payment_amount: payment.payment.payment_amount,
            confirmedAt: new Date(),
            via: 'webhook',
          },
          status: 'pending',
          orderSnapshot: {
            productName: order.productName,
            ipAddress: order.ipAddress || '',
            customerEmail: customer?.email || '',
            customerName: customer?.name || '',
            memory: order.memory || '',
            stockName: companyCheck.stockName || '',
          },
          renewalSnapshot: {
            previousExpiry: order.expiryDate,
            proposedNewExpiry: newExpiryDate,
          },
        });
        console.log(`[WEBHOOK-RENEWAL] ✅ RenewalRequest created for company approval`);
      } else {
        console.log(`[WEBHOOK-RENEWAL] ⚠️ RenewalRequest already exists (${existingReq.status})`);
      }

      // Mark order as awaiting approval but keep `pendingRenewal` block
      // intact so subsequent confirm-callbacks still hit the idempotent
      // success path. The expiry is NOT extended yet.
      await Order.findByIdAndUpdate(order._id, {
        'pendingRenewal.awaitingCompanyApproval': true,
        'pendingRenewal.paymentConfirmedAt': new Date(),
      });

      const totalTime = Date.now() - webhookStartTime;
      await logger.finalize(true, order.expiryDate);
      return NextResponse.json({
        success: true,
        message: 'Payment captured. Renewal awaiting company approval.',
        awaitingCompanyApproval: true,
        orderId: order._id,
        processingTime: totalTime,
      });
    }

    // Process provider-specific renewal
    let providerRenewalResult = null;
    let providerRenewalSuccess = false;

    if (provider === 'hostycare' && order.hostycareServiceId) {
      console.log('[WEBHOOK-RENEWAL] Processing Hostycare renewal via API...');
      logger.logInfo('Calling Hostycare renewal API', { serviceId: order.hostycareServiceId });
      try {
        const apiStart = Date.now();
        const api = new HostycareAPI();
        providerRenewalResult = await api.renewService(order.hostycareServiceId);
        const apiDuration = Date.now() - apiStart;
        console.log(`[WEBHOOK-RENEWAL] Hostycare renewal result:`, providerRenewalResult);
        providerRenewalSuccess = true;
        logger.setProviderApiResult('hostycare', true, providerRenewalResult, null, apiDuration);
      } catch (hostycareError) {
        console.error(`[WEBHOOK-RENEWAL] Hostycare renewal API failed:`, hostycareError);
        logger.setProviderApiResult('hostycare', false, null, hostycareError);
        providerRenewalResult = { error: hostycareError.message };
      }
    } else if (provider === 'smartvps') {
      const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
      console.log(`[WEBHOOK-RENEWAL] Processing SmartVPS renewal for: ${serviceIdentifier}`);

      if (serviceIdentifier) {
        try {
          const apiStart = Date.now();
          const smartvpsApi = new SmartVPSAPI();
          providerRenewalResult = await smartvpsApi.renewVps(serviceIdentifier);
          const apiDuration = Date.now() - apiStart;
          console.log(`[WEBHOOK-RENEWAL] SmartVPS renewal result:`, providerRenewalResult);
          providerRenewalSuccess = true;
          logger.setProviderApiResult('smartvps', true, providerRenewalResult, null, apiDuration);
        } catch (smartvpsError) {
          console.error(`[WEBHOOK-RENEWAL] SmartVPS renewal API failed:`, smartvpsError);
          logger.setProviderApiResult('smartvps', false, null, smartvpsError);
          providerRenewalResult = { error: smartvpsError.message };
        }
      } else {
        console.warn('[WEBHOOK-RENEWAL] SmartVPS missing service identifier');
        providerRenewalResult = { error: 'Missing service identifier' };
      }
    } else if (provider === 'advps') {
      console.log(`[WEBHOOK-RENEWAL] Processing ADVPS renewal:`, {
        advpsOrderId: order.advpsOrderId,
        advpsServiceId: order.advpsServiceId,
      });

      try {
        const apiStart = Date.now();
        const advpsApi = new AdvpsAPI();
        const advpsRenew = await executeAdvpsUpstreamRenewal(advpsApi, order, { Order });
        const apiDuration = Date.now() - apiStart;

        if (advpsRenew.correctedServiceId) {
          await Order.findByIdAndUpdate(order._id, {
            advpsServiceId: advpsRenew.correctedServiceId,
            ...(order.advpsOrderId ? {} : { advpsOrderId: advpsRenew.advpsOrderId }),
          });
        }

        providerRenewalResult = advpsRenew.result || {
          error: advpsRenew.error,
          testMode: advpsRenew.testMode,
        };
        providerRenewalSuccess = advpsRenew.success;

        if (advpsRenew.success) {
          console.log(`[WEBHOOK-RENEWAL] ✅ ADVPS renewal API success`);
          logger.setProviderApiResult('advps', true, advpsRenew.result, null, apiDuration);

          try {
            const statusRes = await advpsApi.status(order.advpsServiceId);
            const statusCreds = extractAdvpsStatusCredentials(statusRes, order);
            const advpsExpiry = pickAdvpsExpiryDate(statusCreds.expiryDate);
            if (advpsExpiry) {
              newExpiryDate = advpsExpiry;
              console.log(`[WEBHOOK-RENEWAL] ADVPS expiry after renew: ${newExpiryDate.toISOString()}`);
            }
          } catch (statusErr) {
            console.warn('[WEBHOOK-RENEWAL] Could not fetch ADVPS expiry after renew:', statusErr.message);
          }
        } else {
          console.error(`[WEBHOOK-RENEWAL] ADVPS renewal API failed:`, advpsRenew.error);
          logger.setProviderApiResult('advps', false, advpsRenew.result, { message: advpsRenew.error }, apiDuration);
        }
      } catch (advpsErr) {
        console.error(`[WEBHOOK-RENEWAL] ADVPS renewal threw:`, advpsErr.message);
        logger.setProviderApiResult('advps', false, null, advpsErr);
        providerRenewalResult = { error: advpsErr.message };
        providerRenewalSuccess = false;
      }
    } else {
      console.log(`[WEBHOOK-RENEWAL] ${provider} renewal - no API call needed`);
      providerRenewalSuccess = true;
    }

    // Create renewal payment record
    const renewalPayment = {
      paymentId: payment.payment.cf_payment_id,
      amount: renewalPrice,
      paidAt: new Date(),
      previousExpiry: currentExpiry,
      newExpiry: newExpiryDate,
      renewalTxnId: renewalTxnId,
      provider: provider,
      paymentMethod: 'cashfree',
      providerRenewalResult: providerRenewalResult,
      providerRenewalSuccess: providerRenewalSuccess,
      processedViaWebhook: true
    };

    // Update order
    const updatedOrder = await Order.findByIdAndUpdate(order._id, {
      expiryDate: newExpiryDate,
      lastAction: 'renew',
      lastActionTime: new Date(),
      provider: provider, // Store provider for future renewals
      transactionId: payment.payment.cf_payment_id,
      gatewayOrderId: renewalTxnId,
      paymentMethod: 'cashfree',
      paymentDetails: {
        cf_payment_id: payment.payment.cf_payment_id,
        cf_order_id: renewalTxnId,
        payment_status: payment.payment.payment_status,
        payment_amount: payment.payment.payment_amount,
        webhookProcessedAt: new Date()
      },
      ...(isAdvpsOrder(order) ? getAdvpsRebuildResetFields() : {}),
      $push: { renewalPayments: renewalPayment },
      $unset: { pendingRenewal: 1 } // Clear pending renewal
    }, { new: true });

    const totalTime = Date.now() - webhookStartTime;
    console.log(`[WEBHOOK-RENEWAL] ✅ Renewal completed successfully in ${totalTime}ms`);
    console.log(`[WEBHOOK-RENEWAL] Order ${order._id} renewed until ${newExpiryDate}`);
    logger.logSuccess('Renewal completed successfully', { totalTime: `${totalTime}ms` });

    // Finalize logger
    await logger.finalize(true, newExpiryDate);

    notifyRenewalCompleted(updatedOrder, newExpiryDate, renewalTxnId).catch((err) =>
      console.error('[WEBHOOK-RENEWAL] renewal notification failed:', err.message),
    );

    return NextResponse.json({
      success: true,
      message: 'Renewal processed successfully via webhook',
      orderId: order._id,
      newExpiryDate: newExpiryDate,
      provider: provider,
      providerRenewalSuccess: providerRenewalSuccess,
      processingTime: totalTime
    });

  } catch (error) {
    console.error(`[WEBHOOK-RENEWAL] ❌ Error processing renewal:`, error);
    if (logger) {
      await logger.finalize(false, null, error.message, error.stack);
    }
    return NextResponse.json({
      success: false,
      message: 'Error processing renewal webhook',
      error: error.message
    }, { status: 500 });
  }
}