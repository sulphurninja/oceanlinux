import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import crypto from 'crypto';
import Razorpay from 'razorpay';
const HostycareAPI = require('@/services/hostycareApi');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

    // Find the order to renew
    const order = await Order.findById(orderId);
    if (!order) {
      console.error(`Order not found: ${orderId}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    // Calculate new expiry date (30 days from current expiry or now, whichever is later)
    const currentExpiry = new Date(order.expiryDate);
    const now = new Date();
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiryDate = new Date(baseDate);
    newExpiryDate.setDate(newExpiryDate.getDate() + 30);

    console.log(`Renewing order ${order._id}:`);
    console.log(`  Current expiry: ${currentExpiry}`);
    console.log(`  New expiry: ${newExpiryDate}`);
    console.log(`  Payment ID: ${razorpay_payment_id}`);

    // Update the order with new expiry date and payment info
    await Order.findByIdAndUpdate(orderId, {
      expiryDate: newExpiryDate,
      lastAction: 'renew',
      lastActionTime: new Date(),
      // Store renewal payment info for record keeping
      $push: {
        renewalPayments: {
          paymentId: razorpay_payment_id,
          amount: order.price,
          paidAt: new Date(),
          previousExpiry: currentExpiry,
          newExpiry: newExpiryDate,
          renewalTxnId: renewalTxnId
        }
      }
    });

    // Now trigger the actual service renewal with Hostycare
    if (order.hostycareServiceId) {
      try {
        const api = new HostycareAPI();
        const renewResult = await api.renewService(order.hostycareServiceId);
        console.log(`Hostycare renewal result for service ${order.hostycareServiceId}:`, renewResult);
      } catch (hostycareError) {
        console.error(`Hostycare renewal failed for order ${order._id}:`, hostycareError);
        // We still consider the renewal successful since payment was processed
        // The service renewal might succeed later or can be retried manually
      }
    }

    console.log(`Order ${order._id} renewed successfully. New expiry: ${newExpiryDate}`);

    return NextResponse.json({
      success: true,
      message: 'Service renewed successfully',
      orderId: order._id,
      newExpiryDate: newExpiryDate,
      renewalTxnId: renewalTxnId
    });

  } catch (error) {
    console.error('Renewal payment confirmation error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}