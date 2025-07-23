import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

export async function POST(request) {
  await connectDB();
  console.log("Webhook notification received from UPIGateway");

  try {
    // UPIGateway sends data as application/x-www-form-urlencoded
    const formData = await request.formData();
    
    // Convert FormData to a regular object
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    console.log("Webhook payload:", data);

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
      console.error("Missing client_txn_id in webhook data");
      return NextResponse.json(
        { success: false, message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    console.log(`Looking for order with clientTxnId: ${client_txn_id}`);

    // Find the order in our database
    const order = await Order.findOne({ clientTxnId: client_txn_id });
    
    if (!order) {
      console.error(`Order not found for clientTxnId: ${client_txn_id}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`Found order: ${order._id}, current status: ${order.status}`);
    console.log(`Webhook payment status: ${status}`);

    // Update order status based on webhook data
    if (status === 'success') {
      console.log("Payment successful, updating order status to confirmed");
      order.status = 'confirmed';
      order.transactionId = upi_txn_id || '';
      
      // Update any additional information if needed
      if (amount) order.webhookAmount = amount;
      if (customer_name) order.webhookCustomerName = customer_name;
      if (customer_email) order.webhookCustomerEmail = customer_email;
      
      await order.save();
      console.log(`Order ${order._id} updated to status: confirmed`);
    } else if (status === 'failure') {
      console.log("Payment failed, updating order status to failed");
      order.status = 'failed';
      await order.save();
      console.log(`Order ${order._id} updated to status: failed`);
    }

    // Always respond with success to acknowledge receipt of the webhook
    return NextResponse.json({ 
      success: true, 
      message: 'Webhook processed successfully' 
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Still return a 200 response to prevent the payment gateway from retrying
    // but include error details for your logs
    return NextResponse.json({
      success: false,
      message: 'Error processing webhook',
      error: error.message
    });
  }
}