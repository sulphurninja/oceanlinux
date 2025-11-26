import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';
import crypto from 'crypto';
const HostycareAPI = require('@/services/hostycareApi');
const SmartVPSAPI = require('@/services/smartvpsApi');

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

        if (ipStock.tags && ipStock.tags.includes('smartvps')) {
          console.log('[RENEWAL-PROVIDER] ✅ Detected SmartVPS via ipStock tags:', ipStock.tags);
          return 'smartvps';
        } else {
          console.log('[RENEWAL-PROVIDER] IPStock tags do not include smartvps:', ipStock.tags);
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

  // Final fallback: Check product name patterns for SmartVPS
  if (order.productName.includes('103.195') ||
    order.ipAddress?.startsWith('103.195') ||
    order.productName.includes('🏅')) {
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

  try {
    const {
      renewalTxnId,
      orderId,
      paymentMethod,
      razorpayPaymentId,
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

      // Verify Razorpay signature
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${renewalTxnId}|${razorpayPaymentId}`)
        .digest('hex');

      if (generatedSignature === razorpaySignature) {
        console.log('[RENEWAL-CONFIRM] ✅ Razorpay signature verified');
        payment_id = razorpayPaymentId;
        paymentVerified = true;
      } else {
        console.error('[RENEWAL-CONFIRM] ❌ Razorpay signature verification failed');
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
      console.log('[RENEWAL-CONFIRM] Verifying Cashfree renewal payment');
      
      try {
        const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', renewalTxnId);
        console.log('[RENEWAL-CONFIRM] Cashfree payment verification response:', cashfreeResponse.data);

        if (!cashfreeResponse.data || cashfreeResponse.data.length === 0) {
          return NextResponse.json(
            { success: false, message: 'No payment found for this renewal order' },
            { status: 400 }
          );
        }

        const payment = cashfreeResponse.data[0];
        
        if (payment.payment_status !== 'SUCCESS') {
          return NextResponse.json(
            { success: false, message: 'Payment not successful' },
            { status: 400 }
          );
        }

        console.log('[RENEWAL-CONFIRM] ✅ Cashfree payment verified successfully');
        payment_id = payment.cf_payment_id;
        paymentVerified = true;
      } catch (cashfreeError) {
        console.error('[RENEWAL-CONFIRM] Cashfree verification error:', cashfreeError);
        return NextResponse.json(
          { success: false, message: 'Payment verification failed', error: cashfreeError.message },
          { status: 500 }
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
      try {
        const api = new HostycareAPI();
        providerRenewalResult = await api.renewService(order.hostycareServiceId);
        console.log(`Hostycare renewal result for service ${order.hostycareServiceId}:`, providerRenewalResult);
        providerRenewalSuccess = true;
      } catch (hostycareError) {
        console.error(`Hostycare renewal failed for order ${order._id}:`, hostycareError);
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
    // IMPORTANT: Update main payment fields to reflect the latest renewal transaction
    const updatedOrder = await Order.findByIdAndUpdate(orderId, {
      expiryDate: newExpiryDate,
      lastAction: 'renew',
      lastActionTime: new Date(),
      // Update main payment fields with latest renewal payment
      transactionId: cf_payment_id,
      gatewayOrderId: renewalPayment.gatewayOrderId,
      paymentMethod: actualPaymentMethod,
      paymentDetails: renewalPayment.paymentDetails,
      // Store renewal payment info for record keeping
      $push: {
        renewalPayments: renewalPayment
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
    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}
