import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import crypto from 'crypto';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  const webhookStartTime = Date.now();
  console.log("\n" + "=".repeat(80));
  console.log(`[WEBHOOK] 🚀 RAZORPAY WEBHOOK RECEIVED AT ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  await connectDB();
  console.log("[WEBHOOK] ✅ Database connected");

  try {
    // Get the raw body and signature
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      console.error("[WEBHOOK] ❌ Missing Razorpay signature");
      return NextResponse.json(
        { success: false, message: 'Missing signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

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

    // Handle payment.captured event
    if (data.event === 'payment.captured') {
      const payment = data.payload.payment.entity;
      const orderId = payment.order_id;

      console.log(`[WEBHOOK] 💳 Payment captured for order: ${orderId}`);

      // Find the order in our database
      const order = await Order.findOne({ gatewayOrderId: orderId });

      if (!order) {
        console.error(`[WEBHOOK] ❌ Order not found for Razorpay order ID: ${orderId}`);
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

      order.status = 'confirmed';
      order.transactionId = payment.id;
      
      // Store additional payment info
      order.webhookAmount = (payment.amount / 100).toString(); // Convert paise to rupees
      order.webhookCustomerEmail = payment.email;

      await order.save();
      const orderUpdateTime = Date.now() - orderUpdateStart;
      console.log(`[WEBHOOK] ✅ ORDER UPDATED to 'confirmed' in ${orderUpdateTime}ms`);

      // 🚀 TRIGGER AUTO-PROVISIONING
      console.log("\n" + "-".repeat(60));
      console.log(`[WEBHOOK] 🚀 STARTING AUTO-PROVISIONING for order ${order._id}`);
      console.log("-".repeat(60));

      try {
        const provisioningService = new AutoProvisioningService();
        console.log(`[WEBHOOK] 🔄 Creating AutoProvisioningService instance...`);

        // Start auto-provisioning in background
        const provisioningPromise = provisioningService.provisionServer(order._id.toString());

        // Handle the promise in background
        provisioningPromise
          .then(result => {
            const provisioningEndTime = Date.now();
            console.log("\n" + "★".repeat(60));
            console.log(`[AUTO-PROVISION] 🏁 PROVISIONING COMPLETED for order ${order._id}`);
            console.log(`[AUTO-PROVISION] ⏱️ Total time: ${provisioningEndTime - webhookStartTime}ms`);
            console.log("★".repeat(60));

            if (result && result.success) {
              console.log(`[AUTO-PROVISION] ✅ SUCCESS! Details:`);
              console.log(`   - Service ID: ${result.serviceId || 'N/A'}`);
              console.log(`   - IP Address: ${result.ipAddress || 'N/A'}`);
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

      } catch (provisioningError) {
        console.error(`[WEBHOOK] ❌ ERROR initiating auto-provisioning:`, provisioningError);
      }

    } else if (data.event === 'payment.failed') {
      const payment = data.payload.payment.entity;
      const orderId = payment.order_id;

      console.log(`[WEBHOOK] ❌ Payment failed for order: ${orderId}`);

      const order = await Order.findOne({ gatewayOrderId: orderId });
      if (order) {
        order.status = 'failed';
        await order.save();
        console.log(`[WEBHOOK] ✅ Order ${order._id} marked as failed`);
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