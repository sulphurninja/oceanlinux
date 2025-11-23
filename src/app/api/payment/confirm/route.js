import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';
import NotificationService from '@/services/notificationService';
const AutoProvisioningService = require('@/services/autoProvisioningService');

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT || 'PRODUCTION';

export async function POST(request) {
  await connectDB();

  console.log("========== PAYMENT CONFIRMATION API ==========");

  try {
    const { clientTxnId, orderId } = await request.json();

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

    // Verify payment status with Cashfree
    console.log(`Verifying payment with Cashfree for order: ${orderIdentifier}`);
    
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

      // Update order status
      order.status = 'confirmed';
      order.transactionId = payment.cf_payment_id;
      await order.save();

      console.log(`Order ${order._id} confirmed with payment ${payment.cf_payment_id}`);

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

    } catch (cashfreeError) {
      console.error('Cashfree verification error:', cashfreeError);
      return NextResponse.json(
        { success: false, message: 'Payment verification failed', error: cashfreeError.message },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Payment confirmation error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}
