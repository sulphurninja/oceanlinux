import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import NotificationService from '@/services/notificationService';
const AutoProvisioningService = require('@/services/autoProvisioningService');

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export async function POST(request) {
  await connectDB();

  console.log("========== PAYMENT CONFIRMATION API ==========");

  try {
    const body = await request.json();
    const { clientTxnId, orderId, paymentMethod, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

    console.log('[Payment Confirm] Request body:', { clientTxnId, orderId, paymentMethod, razorpay_payment_id });

    // Use clientTxnId or orderId to find the order
    const orderIdentifier = clientTxnId || orderId;
    
    if (!orderIdentifier) {
      return NextResponse.json(
        { success: false, message: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Find the order in our database
    const order = await Order.findOne({ clientTxnId: orderIdentifier });
    if (!order) {
      console.error(`Order not found: ${orderIdentifier}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`[Payment Confirm] Found order: ${order._id}, Payment method: ${order.paymentMethod || paymentMethod || 'cashfree'}`);

    // Determine payment method (use from body, order, or default to razorpay)
    const method = paymentMethod || order.paymentMethod || 'razorpay';

    // Verify payment based on method
    if (method === 'upi') {
      console.log(`Verifying UPI payment for order: ${orderIdentifier}`);
      
      // For UPI Gateway, payment confirmation happens via webhook
      // This endpoint is called from frontend after redirect
      // Check if order is already confirmed by webhook
      if (order.status === 'confirmed') {
        console.log(`[UPI] Order ${order._id} already confirmed by webhook`);
        
        // Check if provisioning is needed (might have been missed by webhook)
        if (!order.ipAddress && order.provisioningStatus !== 'completed' && order.provisioningStatus !== 'in_progress') {
          console.log(`[UPI] Order ${order._id} needs provisioning, triggering now...`);
          // Don't return early - let it fall through to provisioning section
        } else {
          console.log(`[UPI] Order ${order._id} already provisioned or in progress`);
          return NextResponse.json({
            success: true,
            message: 'Payment already confirmed',
            orderId: order._id
          });
        }
      } else {
        // Order not yet confirmed, webhook might be pending
        console.log(`[UPI] Order ${order._id} awaiting webhook confirmation`);
        return NextResponse.json(
          { success: true, message: 'Payment pending confirmation', status: 'pending' },
          { status: 200 }
        );
      }

    } else if (method === 'razorpay') {
      console.log(`Verifying Razorpay payment for order: ${orderIdentifier}`);
      
      // Verify signature
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return NextResponse.json(
          { success: false, message: 'Missing Razorpay payment details' },
          { status: 400 }
        );
      }

      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        console.error('Razorpay signature verification failed');
        return NextResponse.json(
          { success: false, message: 'Payment verification failed' },
          { status: 400 }
        );
      }

      // Calculate expiry date as exactly 30 days from NOW (payment confirmation time)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      
      // Update order status and store payment details
      order.status = 'confirmed';
      order.transactionId = razorpay_payment_id;
      order.gatewayOrderId = razorpay_order_id; // Store Razorpay order ID
      order.paymentMethod = 'razorpay';
      order.expiryDate = expiryDate; // Set expiry to 30 days from payment confirmation
      order.paymentDetails = {
        razorpay_payment_id: razorpay_payment_id,
        razorpay_order_id: razorpay_order_id,
        razorpay_signature: razorpay_signature,
        confirmedAt: new Date()
      };
      await order.save();

      console.log(`Order ${order._id} confirmed with Razorpay payment ${razorpay_payment_id} (order: ${razorpay_order_id})`);
      console.log(`Order expiry set to: ${expiryDate.toISOString()} (30 days from now)`);

    } else {
      // Cashfree verification
      console.log(`Verifying Cashfree payment for order: ${orderIdentifier}`);
      
      try {
        const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', orderIdentifier);
        console.log('Cashfree payment verification response:', cashfreeResponse.data);

        // Check if payment is successful
        if (!cashfreeResponse.data || cashfreeResponse.data.length === 0) {
          return NextResponse.json(
            { success: false, message: 'No payment found for this order' },
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

        // Calculate expiry date as exactly 30 days from NOW (payment confirmation time)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        
        // Update order status and store payment details
        order.status = 'confirmed';
        order.transactionId = payment.cf_payment_id;
        order.gatewayOrderId = order.clientTxnId; // Cashfree uses clientTxnId as order_id
        order.paymentMethod = 'cashfree';
        order.expiryDate = expiryDate; // Set expiry to 30 days from payment confirmation
        order.paymentDetails = {
          cf_payment_id: payment.cf_payment_id,
          cf_order_id: order.clientTxnId,
          payment_status: payment.payment_status,
          payment_amount: payment.payment_amount,
          payment_currency: payment.payment_currency,
          payment_time: payment.payment_time,
          payment_method: payment.payment_method,
          bank_reference: payment.bank_reference,
          confirmedAt: new Date()
        };
        await order.save();

        console.log(`Order ${order._id} confirmed with Cashfree payment ${payment.cf_payment_id} (order: ${order.clientTxnId})`);
        console.log(`Order expiry set to: ${expiryDate.toISOString()} (30 days from now)`);

      } catch (cashfreeError) {
        console.error('Cashfree verification error:', cashfreeError);
        return NextResponse.json(
          { success: false, message: 'Payment verification failed', error: cashfreeError.message },
          { status: 500 }
        );
      }
    }

    // Send notifications
    try {
      await NotificationService.notifyOrderConfirmed(order.user, order);
    } catch (notifError) {
      console.error('Failed to create payment confirmation notification:', notifError);
    }

    // Trigger auto-provisioning
    try {
      const provisioningService = new AutoProvisioningService();

      // Create notification for provisioning start
      await NotificationService.notifyOrderProvisioning(order.user, order);

      // Start provisioning in background
      provisioningService.provisionServer(order._id.toString())
        .then(async result => {
          console.log(`Auto-provisioning completed for order ${order._id}:`, result);

          // Create notification for successful provisioning
          if (result.success) {
            await NotificationService.notifyOrderCompleted(order.user, order, {
              ipAddress: result.ipAddress || 'Available in dashboard',
              username: result.username || 'root',
              password: result.password || 'Check dashboard'
            });
          } else {
            await NotificationService.notifyOrderFailed(order.user, order, result.error);
          }
        })
        .catch(async error => {
          console.error(`Auto-provisioning failed for order ${order._id}:`, error);
          await NotificationService.notifyOrderFailed(order.user, order, error.message);
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
