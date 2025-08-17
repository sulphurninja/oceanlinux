import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  await connectDB();
  console.log("[WEBHOOK] Notification received from UPIGateway");

  try {
    // UPIGateway sends data as application/x-www-form-urlencoded
    const formData = await request.formData();

    // Convert FormData to a regular object
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    console.log("[WEBHOOK] Payload:", JSON.stringify(data, null, 2));

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
      console.error("[WEBHOOK] Missing client_txn_id in webhook data");
      return NextResponse.json(
        { success: false, message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    console.log(`[WEBHOOK] Looking for order with clientTxnId: ${client_txn_id}`);

    // Find the order in our database
    const order = await Order.findOne({ clientTxnId: client_txn_id });

    if (!order) {
      console.error(`[WEBHOOK] Order not found for clientTxnId: ${client_txn_id}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`[WEBHOOK] Found order: ${order._id}, current status: ${order.status}`);
    console.log(`[WEBHOOK] Payment status: ${status}`);

    // Update order status based on webhook data
    if (status === 'success') {
      console.log(`[WEBHOOK] Payment successful for order ${order._id}, updating status to confirmed`);
      order.status = 'confirmed';
      order.transactionId = upi_txn_id || '';

      // Update any additional information if needed
      if (amount) order.webhookAmount = amount;
      if (customer_name) order.webhookCustomerName = customer_name;
      if (customer_email) order.webhookCustomerEmail = customer_email;

      await order.save();
      console.log(`[WEBHOOK] Order ${order._id} updated to status: confirmed`);

      // NEW: Trigger auto-provisioning for successful payments
      console.log(`[WEBHOOK] Starting auto-provisioning for order ${order._id}...`);

      try {
        const provisioningService = new AutoProvisioningService();

        // Start auto-provisioning in background (don't await to avoid webhook timeout)
        provisioningService.provisionServer(order._id.toString())
          .then(result => {
            console.log(`[AUTO-PROVISION] Completed for order ${order._id}:`, result);
          })
          .catch(error => {
            console.error(`[AUTO-PROVISION] Failed for order ${order._id}:`, error);
          });

        console.log(`[WEBHOOK] Auto-provisioning initiated for order ${order._id}`);

      } catch (provisioningError) {
        console.error(`[WEBHOOK] Error initiating auto-provisioning for order ${order._id}:`, provisioningError);
        // Don't fail the webhook response because of provisioning errors
      }

    } else if (status === 'failure') {
      console.log(`[WEBHOOK] Payment failed for order ${order._id}, updating status to failed`);
      order.status = 'failed';
      await order.save();
      console.log(`[WEBHOOK] Order ${order._id} updated to status: failed`);
    }

    // Always respond with success to acknowledge receipt of the webhook
    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);

    // Still return a 200 response to prevent the payment gateway from retrying
    // but include error details for your logs
    return NextResponse.json({
      success: false,
      message: 'Error processing webhook',
      error: error.message
    });
  }
}
