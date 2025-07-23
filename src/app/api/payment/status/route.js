import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

// Configure with your actual API key
const UPI_GATEWAY_API_KEY = process.env.UPI_GATEWAY_API_KEY || "9502f310-cc59-4217-ad6c-e24924c01478";
const UPI_GATEWAY_STATUS_URL = "https://api.ekqr.in/api/check_order_status";

export async function POST(request) {
  await connectDB();
  console.log("Checking payment status...");

  try {
    // 1. Check authentication
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Read request data
    const reqBody = await request.json();
    const { clientTxnId } = reqBody;

    if (!clientTxnId) {
      return NextResponse.json(
        { message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    console.log(`Looking for order with clientTxnId: ${clientTxnId}`);

    // 3. Find the order in our database
    const order = await Order.findOne({ clientTxnId });
    
    if (!order) {
      console.log(`Order not found for clientTxnId: ${clientTxnId}`);
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`Found order: ${order._id}, status: ${order.status}`);

    // 4. Format date as required by the API (DD-MM-YYYY)
    const createdAt = new Date(order.createdAt);
    const txnDate = `${String(createdAt.getDate()).padStart(2, '0')}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${createdAt.getFullYear()}`;

    console.log(`Checking payment with UPI Gateway for date: ${txnDate}`);

    // 5. Check payment status with the gateway
    const statusData = {
      key: UPI_GATEWAY_API_KEY,
      client_txn_id: clientTxnId,
      txn_date: txnDate
    };

    console.log("Sending status check request:", statusData);

    const response = await fetch(UPI_GATEWAY_STATUS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusData),
    });

    console.log(`Gateway response status: ${response.status}`);
    const statusResponse = await response.json();
    console.log("Gateway response:", statusResponse);

    // 6. Update order status if payment was successful
    if (statusResponse.status && statusResponse.data?.status === 'success') {
      console.log("Payment confirmed, updating order status");
      order.status = 'confirmed';
      order.transactionId = statusResponse.data.upi_txn_id || '';
      await order.save();
      console.log("Order status updated to confirmed");
    } else {
      console.log("Payment not confirmed by gateway");
    }

    return NextResponse.json({
      order: {
        id: order._id,
        status: order.status,
        productName: order.productName,
        memory: order.memory,
        price: order.price,
        clientTxnId: order.clientTxnId,
        createdAt: order.createdAt
      },
      gatewayResponse: statusResponse
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}