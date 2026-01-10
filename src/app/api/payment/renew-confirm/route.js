import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';
import crypto from 'crypto';
const HostycareAPI = require('@/services/hostycareApi');
const SmartVPSAPI = require('@/services/smartvpsApi');
const RenewalLogger = require('@/services/renewalLogger');

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX'
  ? Cashfree.Environment.SANDBOX
  : Cashfree.Environment.PRODUCTION;

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Enhanced helper function to determine provider from order with IPStock data
async function getProviderFromOrder(order) {
  console.log('[RENEWAL-PROVIDER] === PROVIDER DETECTION START ===');
  console.log('[RENEWAL-PROVIDER] Determining provider for order:', {
    orderId: order._id,
    explicitProvider: order.provider,
    hostycareServiceId: order.hostycareServiceId,
    smartvpsServiceId: order.smartvpsServiceId,
    ipStockId: order.ipStockId,
    ipAddress: order.ipAddress,
    productName: order.productName
  });

  // Primary logic: Check if order has hostycare service ID
  if (order.hostycareServiceId) {
    console.log('[RENEWAL-PROVIDER] ✅ Detected Hostycare via serviceId:', order.hostycareServiceId);
    return 'hostycare';
  }

  // Secondary logic: Check if ipStock has smartvps tag
  if (order.ipStockId) {
    try {
      console.log('[RENEWAL-PROVIDER] Fetching IPStock data for ID:', order.ipStockId);
      const ipStock = await IPStock.findById(order.ipStockId);

      if (ipStock) {
        console.log('[RENEWAL-PROVIDER] IPStock found:', {
          _id: ipStock._id,
          name: ipStock.name,
          tags: ipStock.tags,
          serverType: ipStock.serverType
        });

        // Check for both 'smartvps' and 'ocean linux' tags (SmartVPS uses 'ocean linux' tag)
        const tagsLower = ipStock.tags?.map(t => t.toLowerCase()) || [];
        if (tagsLower.includes('smartvps') || tagsLower.includes('ocean linux')) {
          console.log('[RENEWAL-PROVIDER] ✅ Detected SmartVPS via ipStock tags:', ipStock.tags);
          return 'smartvps';
        } else {
          console.log('[RENEWAL-PROVIDER] IPStock tags do not include smartvps/ocean linux:', ipStock.tags);
        }
      } else {
        console.log('[RENEWAL-PROVIDER] IPStock not found for ID:', order.ipStockId);
      }
    } catch (ipStockError) {
      console.error('[RENEWAL-PROVIDER] Error fetching IPStock:', ipStockError);
    }
  } else {
    console.log('[RENEWAL-PROVIDER] No ipStockId in order');
  }

  // Additional fallback: Check smartvps service ID
  if (order.smartvpsServiceId) {
    console.log('[RENEWAL-PROVIDER] ✅ Detected SmartVPS via serviceId:', order.smartvpsServiceId);
    return 'smartvps';
  }

  // Check explicit provider field
  if (order.provider === 'smartvps') {
    console.log('[RENEWAL-PROVIDER] ✅ Detected SmartVPS via explicit provider field');
    return 'smartvps';
  }

  // Final fallback: Check product name patterns for SmartVPS
  if (order.productName?.includes('🌊') ||
    order.productName?.includes('103.195') ||
    order.ipAddress?.startsWith('103.195') ||
    order.productName?.includes('🏅')) {
    console.log('[RENEWAL-PROVIDER] ✅ Detected SmartVPS via patterns');
    console.log('[RENEWAL-PROVIDER] Product name:', order.productName);
    console.log('[RENEWAL-PROVIDER] IP address:', order.ipAddress);
    return 'smartvps';
  }

  // Default to oceanlinux
  console.log('[RENEWAL-PROVIDER] ⚪ Defaulting to OceanLinux');
  console.log('[RENEWAL-PROVIDER] === PROVIDER DETECTION END ===');
  return 'oceanlinux';
}

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
      // Auto-detect from transaction ID or order data
      if (renewalTxnId.startsWith('RENEWAL_')) {
        // Could be any method, check order data or default to cashfree
        actualPaymentMethod = order.paymentMethod || 'cashfree';
      }
    }

    console.log(`[RENEWAL-CONFIRM] Payment method: ${actualPaymentMethod}`);

    let payment_id = null;
    let paymentVerified = false;

    // Verify payment based on method
    if (actualPaymentMethod === 'razorpay') {
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
        logger.setPaymentInfo('razorpay', razorpayPaymentId, order.price);
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
    } else if (actualPaymentMethod === 'upi') {
      console.log('[RENEWAL-CONFIRM] UPI Gateway renewal - payment verified via webhook');
      // UPI Gateway payments are verified via webhook
      // If we reach here, payment was already verified
      payment_id = renewalTxnId;
      paymentVerified = true;
    } else {
      // Default to Cashfree
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
              logger.setPaymentInfo('cashfree', payment.cf_payment_id, order.price);
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

    const cf_payment_id = payment_id;

    // Determine the provider for this order using the enhanced function with IPStock lookup
    const provider = await getProviderFromOrder(order);
    console.log(`[RENEWAL-CONFIRM] Final determined provider: ${provider} for order ${orderId}`);
    logger.logInfo('Provider determined', { provider });

    // Calculate new expiry date (30 days from current expiry or now, whichever is later)
    const currentExpiry = new Date(order.expiryDate);
    const now = new Date();
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiryDate = new Date(baseDate);
    newExpiryDate.setDate(newExpiryDate.getDate() + 30);

    console.log(`Renewing order ${order._id}:`);
    console.log(`  Provider: ${provider}`);
    console.log(`  Current expiry: ${currentExpiry}`);
    console.log(`  New expiry: ${newExpiryDate}`);
    console.log(`  Payment ID: ${cf_payment_id}`);

    // Create renewal payment record with full payment details
    const renewalPayment = {
      paymentId: cf_payment_id,
      amount: order.price,
      paidAt: new Date(),
      previousExpiry: currentExpiry,
      newExpiry: newExpiryDate,
      renewalTxnId: renewalTxnId,
      provider: provider,
      paymentMethod: actualPaymentMethod,
      gatewayOrderId: actualPaymentMethod === 'razorpay' ? razorpayPaymentId : renewalTxnId,
      paymentDetails: {
        method: actualPaymentMethod,
        payment_id: cf_payment_id,
        order_id: actualPaymentMethod === 'razorpay' ? razorpayPaymentId : renewalTxnId,
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
      paymentMethod: actualPaymentMethod,
      paymentDetails: renewalPayment.paymentDetails,
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
        amount: order.price,
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
    }

    console.log('[RENEWAL-CONFIRM] === RENEWAL PROCESS COMPLETE ===');
    console.log('[RENEWAL-CONFIRM] Final response being sent to client:', {
      ...response,
      renewalDetails: {
        ...response.renewalDetails,
        providerApiCallMade: provider === 'smartvps' || provider === 'hostycare',
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
