import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  const webhookStartTime = Date.now();
  console.log("\n" + "=".repeat(80));
  console.log(`[WEBHOOK] 🚀 PAYMENT WEBHOOK RECEIVED AT ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  await connectDB();
  console.log("[WEBHOOK] ✅ Database connected");

  try {
    // UPIGateway sends data as application/x-www-form-urlencoded
    const formData = await request.formData();

    // Convert FormData to a regular object
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    console.log("[WEBHOOK] 📦 RECEIVED PAYLOAD:");
    console.log(JSON.stringify(data, null, 2));

    // Extract relevant information
    const {
      client_txn_id,
      status,
      upi_txn_id,
      amount,
      customer_name,
      customer_email
    } = data;

    if (!client_txn_id) {
      console.error("[WEBHOOK] ❌ CRITICAL ERROR: Missing client_txn_id in webhook data");
      return NextResponse.json(
        { success: false, message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    console.log(`[WEBHOOK] 🔍 SEARCHING for order with clientTxnId: "${client_txn_id}"`);

    // Find the order in our database
    const order = await Order.findOne({ clientTxnId: client_txn_id });

    if (!order) {
      console.error(`[WEBHOOK] ❌ CRITICAL ERROR: Order not found for clientTxnId: ${client_txn_id}`);
      console.log("[WEBHOOK] 🔍 Let me check what orders exist in database...");

      const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5).select('clientTxnId status createdAt');
      console.log("[WEBHOOK] 📋 Recent orders in database:", recentOrders);

      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`[WEBHOOK] ✅ FOUND ORDER: ${order._id}`);
    console.log(`[WEBHOOK] 📊 ORDER CURRENT STATE:`);
    console.log(`   - Status: ${order.status}`);
    console.log(`   - Provisioning Status: ${order.provisioningStatus || 'undefined'}`);
    console.log(`   - Auto Provisioned: ${order.autoProvisioned || false}`);
    console.log(`   - Product Name: ${order.productName}`);
    console.log(`   - Memory: ${order.memory}`);
    console.log(`   - IP Stock ID: ${order.ipStockId || 'not set'}`);

    console.log(`[WEBHOOK] 💳 PAYMENT STATUS FROM GATEWAY: "${status}"`);

    // Update order status based on webhook data
    if (status === 'success') {
      console.log(`[WEBHOOK] 🎉 PAYMENT SUCCESS! Processing order ${order._id}...`);

      const orderUpdateStart = Date.now();
      console.log(`[WEBHOOK] 📝 UPDATING ORDER STATUS...`);

      // Update order first
      order.status = 'confirmed';
      order.transactionId = upi_txn_id || '';

      // Update any additional information if needed
      if (amount) {
        order.webhookAmount = amount;
        console.log(`[WEBHOOK] 💰 Amount from webhook: ${amount}`);
      }
      if (customer_name) {
        order.webhookCustomerName = customer_name;
        console.log(`[WEBHOOK] 👤 Customer name from webhook: ${customer_name}`);
      }
      if (customer_email) {
        order.webhookCustomerEmail = customer_email;
        console.log(`[WEBHOOK] 📧 Customer email from webhook: ${customer_email}`);
      }

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
        console.log(`[WEBHOOK] ⏰ Current time: ${new Date().toISOString()}`);

        // Start auto-provisioning in background (don't await to avoid webhook timeout)
        const provisioningPromise = provisioningService.provisionServer(order._id.toString());

        console.log(`[WEBHOOK] ✅ Auto-provisioning promise created, running in background...`);

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
              console.log(`   - Username: ${result.credentials?.username || 'N/A'}`);
              console.log(`   - Hostname: ${result.hostname || 'N/A'}`);
            } else {
              console.error(`[AUTO-PROVISION] ❌ FAILED! Error: ${result?.error || 'Unknown error'}`);
            }
          })
          .catch(error => {
            console.error("\n" + "💥".repeat(60));
            console.error(`[AUTO-PROVISION] 💥 CRITICAL ERROR for order ${order._id}:`);
            console.error(`   - Error Message: ${error.message}`);
            console.error(`   - Error Stack:`, error.stack);
            console.error("💥".repeat(60));
          });

        console.log(`[WEBHOOK] ✅ Auto-provisioning initiated successfully`);

      } catch (provisioningError) {
        console.error(`[WEBHOOK] ❌ ERROR initiating auto-provisioning for order ${order._id}:`);
        console.error(`   - Error: ${provisioningError.message}`);
        console.error(`   - Stack:`, provisioningError.stack);
        // Don't fail the webhook response because of provisioning errors
      }

    } else if (status === 'failure') {
      console.log(`[WEBHOOK] ❌ PAYMENT FAILED for order ${order._id}`);
      order.status = 'failed';
      await order.save();
      console.log(`[WEBHOOK] ✅ Order ${order._id} marked as failed`);

    } else {
      console.log(`[WEBHOOK] ⚠️ UNKNOWN PAYMENT STATUS: "${status}" for order ${order._id}`);
    }

    const totalWebhookTime = Date.now() - webhookStartTime;
    console.log(`[WEBHOOK] ⏱️ Total webhook processing time: ${totalWebhookTime}ms`);
    console.log(`[WEBHOOK] ✅ Responding to payment gateway...`);

    // Always respond with success to acknowledge receipt of the webhook
    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      orderId: order._id,
      newStatus: order.status,
      processingTime: totalWebhookTime
    });

  } catch (error) {
    const totalWebhookTime = Date.now() - webhookStartTime;
    console.error("\n" + "💥".repeat(80));
    console.error('[WEBHOOK] 💥 CRITICAL WEBHOOK ERROR:');
    console.error(`   - Error Message: ${error.message}`);
    console.error(`   - Error Stack:`, error.stack);
    console.error(`   - Processing Time: ${totalWebhookTime}ms`);
    console.error("💥".repeat(80));

    // Still return a 200 response to prevent the payment gateway from retrying
    return NextResponse.json({
      success: false,
      message: 'Error processing webhook',
      error: error.message,
      processingTime: totalWebhookTime
    });
  }
}
