import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

// Configure with your actual API key
const UPI_GATEWAY_API_KEY = process.env.UPI_GATEWAY_API_KEY || "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
const UPI_GATEWAY_STATUS_URL = "https://api.ekqr.in/api/check_order_status"; // Note: correct URL without v2

export async function POST(request) {
  await connectDB();

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

    // 3. Find the order in our database
    const order = await Order.findOne({ clientTxnId, user: userId });
    
    if (!order) {
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    // 4. Format date as required by the API (DD-MM-YYYY)
    const createdAt = new Date(order.createdAt);
    const txnDate = `${String(createdAt.getDate()).padStart(2, '0')}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${createdAt.getFullYear()}`;

    // 5. Check payment status with the gateway
    const statusData = {
      key: UPI_GATEWAY_API_KEY,
      client_txn_id: clientTxnId,
      txn_date: txnDate
    };

    const response = await fetch(UPI_GATEWAY_STATUS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusData),
    });

    const statusResponse = await response.json();

    // 6. Update order status if payment was successful
    if (statusResponse.status && statusResponse.data?.status === 'success') {
      order.status = 'confirmed';
      order.transactionId = statusResponse.data.upi_txn_id || '';
      await order.save();
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