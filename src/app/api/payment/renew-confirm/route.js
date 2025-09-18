import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import crypto from 'crypto';
import Razorpay from 'razorpay';
const HostycareAPI = require('@/services/hostycareApi');
const SmartVPSAPI = require('@/services/smartvpsApi');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper function to determine provider from order
function getProviderFromOrder(order, ipStock = null) {
  // Primary logic: Check if order has hostycare service ID
  if (order.hostycareServiceId) {
    return 'hostycare';
  }

  // Secondary logic: Check if ipStock has smartvps tag
  if (ipStock && ipStock.tags && ipStock.tags.includes('smartvps')) {
    return 'smartvps';
  }

  // Additional fallback: Check smartvps service ID
  if (order.smartvpsServiceId) {
    return 'smartvps';
  }

  // Final fallback: Check product name patterns for SmartVPS
  if (order.productName.includes('103.195') ||
      order.ipAddress?.startsWith('103.195') ||
      order.productName.includes('🏅')) {
    return 'smartvps';
  }

  // Default to oceanlinux
  return 'oceanlinux';
}

export async function POST(request) {
  await connectDB();

  console.log("========== RENEWAL PAYMENT CONFIRMATION API ==========");

  try {
    const {
      renewalTxnId,
      orderId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    } = await request.json();

    console.log('[RENEWAL-CONFIRM] Processing renewal confirmation:', {
      renewalTxnId,
      orderId,
      razorpay_payment_id,
      razorpay_order_id: razorpay_order_id ? '[ORDER_ID_PRESENT]' : 'missing'
    });

    // Verify payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error("Invalid renewal payment signature");
      return NextResponse.json(
        { success: false, message: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    console.log('[RENEWAL-CONFIRM] Razorpay signature verified successfully');

    // Find the order to renew
    const order = await Order.findById(orderId);
    if (!order) {
      console.error(`Order not found: ${orderId}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    // Determine the provider for this order
    const provider = getProviderFromOrder(order);
    console.log(`[RENEWAL-CONFIRM] Determined provider: ${provider} for order ${orderId}`);

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
    console.log(`  Payment ID: ${razorpay_payment_id}`);

    // Create renewal payment record
    const renewalPayment = {
      paymentId: razorpay_payment_id,
      amount: order.price,
      paidAt: new Date(),
      previousExpiry: currentExpiry,
      newExpiry: newExpiryDate,
      renewalTxnId: renewalTxnId,
      provider: provider
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
      console.log('[RENEWAL-CONFIRM] Processing SmartVPS renewal');
      const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;

      if (serviceIdentifier) {
        try {
          const smartvpsApi = new SmartVPSAPI();
          console.log(`[RENEWAL-CONFIRM] Calling SmartVPS renewVps API for: ${serviceIdentifier}`);

          providerRenewalResult = await smartvpsApi.renewVps(serviceIdentifier);
          console.log(`SmartVPS renewal result for service ${serviceIdentifier}:`, providerRenewalResult);
          providerRenewalSuccess = true;

          console.log('[RENEWAL-CONFIRM] ✅ SmartVPS renewal completed successfully');
        } catch (smartvpsError) {
          console.error(`SmartVPS renewal failed for order ${order._id}:`, smartvpsError);
          providerRenewalResult = { error: smartvpsError.message };
          // Don't fail the entire renewal process if SmartVPS API fails
          // The payment was successful, so we should still update our records
          console.log('[RENEWAL-CONFIRM] Continuing with database update despite SmartVPS API error');
        }
      } else {
        console.warn(`[RENEWAL-CONFIRM] SmartVPS order ${order._id} missing service identifier`);
        providerRenewalResult = { error: 'Missing service identifier for SmartVPS renewal' };
      }
    } else {
      console.log(`[RENEWAL-CONFIRM] ${provider} renewal - no additional API call needed`);
      providerRenewalSuccess = true; // OceanLinux renewals are handled internally
    }

    // Add provider renewal result to the payment record
    renewalPayment.providerRenewalResult = providerRenewalResult;
    renewalPayment.providerRenewalSuccess = providerRenewalSuccess;

    // Update the order with new expiry date and payment info
    const updatedOrder = await Order.findByIdAndUpdate(orderId, {
      expiryDate: newExpiryDate,
      lastAction: 'renew',
      lastActionTime: new Date(),
      // Store renewal payment info for record keeping
      $push: {
        renewalPayments: renewalPayment
      }
    }, { new: true });

    if (!updatedOrder) {
      console.error('[RENEWAL-CONFIRM] Failed to update order');
      return NextResponse.json({
        success: false,
        message: 'Failed to update order'
      }, { status: 500 });
    }

    console.log(`[RENEWAL-CONFIRM] ✅ Order ${order._id} renewed successfully:`, {
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
    } else if (provider === 'hostycare') {
      response.message = providerRenewalSuccess
        ? 'Service renewed successfully! Hostycare service has been extended.'
        : 'Service renewed successfully! Note: Hostycare API renewal encountered an issue, but your service period has been extended.';
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[RENEWAL-CONFIRM] Renewal payment confirmation error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}
