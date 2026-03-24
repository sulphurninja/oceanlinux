import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import NotificationService from '@/services/notificationService';
import { calculateExpiryDate } from '@/lib/expiryHelper';
const AutoProvisioningService = require('@/services/autoProvisioningService');
const SlotIPPackage = require('@/models/slotIpPackageModel');

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

      // Calculate expiry based on the number of days in the current month
      const expiryDate = calculateExpiryDate();

      // Update order status and store payment details
      order.status = 'confirmed';
      order.transactionId = razorpay_payment_id;
      order.gatewayOrderId = razorpay_order_id; // Store Razorpay order ID
      order.paymentMethod = 'razorpay';
      order.expiryDate = expiryDate;
      order.paymentDetails = {
        razorpay_payment_id: razorpay_payment_id,
        razorpay_order_id: razorpay_order_id,
        razorpay_signature: razorpay_signature,
        confirmedAt: new Date()
      };
      await order.save();

      console.log(`Order ${order._id} confirmed with Razorpay payment ${razorpay_payment_id} (order: ${razorpay_order_id})`);
      console.log(`Order expiry set to: ${expiryDate.toISOString()}`);

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

        // Calculate expiry based on the number of days in the current month
        const expiryDate = calculateExpiryDate();

        // Update order status and store payment details
        order.status = 'confirmed';
        order.transactionId = payment.cf_payment_id;
        order.gatewayOrderId = order.clientTxnId; // Cashfree uses clientTxnId as order_id
        order.paymentMethod = 'cashfree';
        order.expiryDate = expiryDate;
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
        console.log(`Order expiry set to: ${expiryDate.toISOString()}`);

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

    // Allocate a slot IP if this is a slot IP purchase
    if (order.slotIpPackageId && !order.slotIpId) {
      try {
        console.log(`[PAYMENT-CONFIRM] Allocating slot IP for order ${order._id}`);

        const allocated = await SlotIPPackage.findOneAndUpdate(
          {
            _id: order.slotIpPackageId,
            'ips.allocated': false,
          },
          {
            $set: {
              'ips.$.allocated': true,
              'ips.$.orderId': order._id,
              'ips.$.allocatedAt': new Date(),
            },
          },
          { new: true }
        );

        if (allocated) {
          const slotIp = allocated.ips.find(
            ip => ip.orderId && ip.orderId.toString() === order._id.toString()
          );

          if (slotIp) {
            order.slotIpId = slotIp._id.toString();
            order.ipAddress = `${slotIp.ip}:${slotIp.port}`;
            order.username = slotIp.username;
            order.password = slotIp.password;
            order.provisioningStatus = 'active';
            order.autoProvisioned = true;
            order.provider = 'slotip';
            await order.save();
            console.log(`[PAYMENT-CONFIRM] Slot IP allocated: ${slotIp.proxy} -> order ${order._id}`);
          }
        } else {
          console.error(`[PAYMENT-CONFIRM] No available slot IPs in package ${order.slotIpPackageId}`);
          order.provisioningStatus = 'failed';
          order.provisioningError = 'No available slot IPs in this package';
          await order.save();
        }
      } catch (slotError) {
        console.error(`[PAYMENT-CONFIRM] Slot IP allocation failed:`, slotError);
        order.provisioningStatus = 'failed';
        order.provisioningError = `Slot IP allocation failed: ${slotError.message}`;
        await order.save();
      }
    }

    // Trigger auto-provisioning with duplicate prevention (skip for slot IPs)
    try {
      // Skip auto-provisioning for slot IP orders (already allocated above)
      if (order.slotIpPackageId) {
        console.log(`[PAYMENT-CONFIRM] Slot IP order - skipping auto-provisioning`);
      } else {
      const freshOrder = await Order.findById(order._id);
      const alreadyProvisioning = freshOrder?.provisioningStatus === 'provisioning' ||
                                   freshOrder?.provisioningStatus === 'active' ||
                                   freshOrder?.ipAddress;
      
      if (alreadyProvisioning) {
        console.log(`[PAYMENT-CONFIRM] ⚠️ Order ${order._id} already provisioning/provisioned, skipping`);
        console.log(`[PAYMENT-CONFIRM]   → Status: ${freshOrder?.provisioningStatus}`);
        console.log(`[PAYMENT-CONFIRM]   → IP: ${freshOrder?.ipAddress || 'none'}`);
      } else {
        console.log(`[PAYMENT-CONFIRM] 🚀 Starting auto-provisioning for order ${order._id}`);
        
        const provisioningService = new AutoProvisioningService();

        // Create notification for provisioning start
        await NotificationService.notifyOrderProvisioning(order.user, order);

        // Start provisioning in background
        provisioningService.provisionServer(order._id.toString())
          .then(async result => {
            console.log(`[PAYMENT-CONFIRM] Auto-provisioning completed for order ${order._id}:`, result);

            // Create notification for successful provisioning
            if (result.success && !result.alreadyProvisioned && !result.alreadyProvisioning) {
              await NotificationService.notifyOrderCompleted(order.user, order, {
                ipAddress: result.ipAddress || 'Available in dashboard',
                username: result.username || 'root',
                password: result.password || 'Check dashboard'
              });
            } else if (!result.success && !result.alreadyProvisioning) {
              await NotificationService.notifyOrderFailed(order.user, order, result.error);
            }
          })
          .catch(async error => {
            console.error(`[PAYMENT-CONFIRM] Auto-provisioning failed for order ${order._id}:`, error);
            await NotificationService.notifyOrderFailed(order.user, order, error.message);
          });

        console.log("[PAYMENT-CONFIRM] Auto-provisioning initiated");
      }
      } // end of slot IP skip block
    } catch (error) {
      console.error("[PAYMENT-CONFIRM] Error starting auto-provisioning:", error);
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
