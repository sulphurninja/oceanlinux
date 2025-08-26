import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import crypto from 'crypto';
import Razorpay from 'razorpay';
const AutoProvisioningService = require('@/services/autoProvisioningService');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export async function POST(request) {
  await connectDB();
  
  console.log("========== PAYMENT CONFIRMATION API ==========");

  try {
    const { clientTxnId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = await request.json();

    // Verify payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error("Invalid payment signature");
      return NextResponse.json(
        { success: false, message: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    // Find and update order
    const order = await Order.findOne({ clientTxnId });
    if (!order) {
      console.error(`Order not found: ${clientTxnId}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    // Update order status
    order.status = 'confirmed';
    order.transactionId = razorpay_payment_id;
    await order.save();
    
    console.log(`Order ${order._id} confirmed with payment ${razorpay_payment_id}`);

    // Trigger auto-provisioning
    try {
      const provisioningService = new AutoProvisioningService();
      
      // Start provisioning in background
      provisioningService.provisionServer(order._id.toString())
        .then(result => {
          console.log(`Auto-provisioning completed for order ${order._id}:`, result);
        })
        .catch(error => {
          console.error(`Auto-provisioning failed for order ${order._id}:`, error);
        });
        
      console.log("Auto-provisioning initiated");
    } catch (error) {
      console.error("Error starting auto-provisioning:", error);
      // Don't fail the response - provisioning can be retried
    }

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed and order processed',
      orderId: order._id
    });

  } catch (error) {
    console.error('Payment confirmation error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}