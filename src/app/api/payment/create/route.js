import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';

// Configure with your actual API key
const UPI_GATEWAY_API_KEY = process.env.UPI_GATEWAY_API_KEY || "9502f310-cc59-4217-ad6c-e24924c01478";
const UPI_GATEWAY_URL = "https://api.ekqr.in/api/create_order";

export async function POST(request) {
  await connectDB();
  console.log("MongoDB connected");

  try {
    // 1. Check which user is making this purchase
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user details
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // 3. Read request data
    const reqBody = await request.json();
    const { productName, memory, price } = reqBody;

    // 4. Basic validation
    if (!productName || !memory || !price) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 5. Generate a unique transaction ID in the exact format from their example
    const clientTxnId = `${Date.now()}`.substring(0, 10);

    // 6. Simplify product name to avoid special characters
    const simplifiedProductName = "Server Plan " + memory;

    // 7. Create payment request using real values but in the working format
    const paymentData = {
      key: UPI_GATEWAY_API_KEY,
      client_txn_id: clientTxnId,
      amount: String(parseInt(price, 10)),
      p_info: simplifiedProductName,
      customer_name: user.name,
      customer_email: user.email,
      customer_mobile: "9876543210", // Using dummy mobile since we don't have it
      redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/payment/callback`,
      udf1: "order-reference",
      udf2: memory,
      udf3: "server-plan"
    };



    // Log the payment data for debugging
    console.log("Real-values payment request:", paymentData);

    // Make the API request
    const response = await fetch(UPI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData),
    });

    console.log(`Payment gateway response status: ${response.status}`);
    const paymentResponse = await response.json();
    console.log("Payment gateway response:", paymentResponse);

    if (!paymentResponse.status) {
      return NextResponse.json(
        {
          message: paymentResponse.msg || 'Payment initiation failed',
          gatewayResponse: paymentResponse,
          sentData: paymentData
        },
        { status: 400 }
      );
    }

    // 8. Create a pending order in our database
    // Calculate expiry date (30 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const newOrder = await Order.create({
      user: userId,
      productName,
      memory,
      price: parseInt(price, 10),
      clientTxnId,
      gatewayOrderId: paymentResponse.data.order_id.toString(),
      status: 'pending',
      customerName: user.name,
      customerEmail: user.email,
      expiryDate: expiryDate, // Add the expiry date
    });

    // 9. Return success with payment URL for the frontend
    return NextResponse.json({
      message: 'Payment initiated',
      orderId: newOrder._id,
      paymentUrl: paymentResponse.data.payment_url,
      upiIntents: paymentResponse.data.upi_intent || null
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}