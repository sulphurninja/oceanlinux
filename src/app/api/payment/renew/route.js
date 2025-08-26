import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import Razorpay from 'razorpay';

// Initialize Razorpay with your credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export async function POST(request) {
  await connectDB();
  console.log("MongoDB connected");

  try {
    // 1. Check which user is making this renewal request
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
    const { orderId } = reqBody;

    // 4. Find the order to renew
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    // 5. Check if order is eligible for renewal
    if (!order.expiryDate) {
      return NextResponse.json({ message: 'Order has no expiry date' }, { status: 400 });
    }

    const now = new Date();
    const expiry = new Date(order.expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Allow renewal if expiring within 30 days or expired but not more than 7 days ago
    if (diffDays > 30 || diffDays < -7) {
      return NextResponse.json({ 
        message: 'Order is not eligible for renewal at this time' 
      }, { status: 400 });
    }

    // 6. Generate a unique renewal transaction ID
    const renewalTxnId = `RENEWAL_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 7. Use the original order price for renewal
    const renewalPrice = order.price;

    // 8. Create Razorpay order for renewal
    const razorpayOrderOptions = {
      amount: Math.round(renewalPrice * 100), // Razorpay expects amount in paise
      currency: 'INR',
      receipt: renewalTxnId,
      notes: {
        order_id: order._id.toString(),
        renewal_for: order.productName,
        memory: order.memory,
        customer_email: user.email,
        customer_name: user.name,
        renewal_type: 'service_renewal'
      }
    };

    console.log("Creating Razorpay renewal order:", razorpayOrderOptions);

    const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);
    console.log("Razorpay renewal order created:", razorpayOrder);

    // 9. Store renewal transaction details temporarily (you might want to create a separate renewals table)
    // For now, we'll use the notes in Razorpay and handle it in the confirmation

    // 10. Return Razorpay order details for frontend
    return NextResponse.json({
      message: 'Renewal payment initiated',
      orderId: order._id,
      renewalTxnId: renewalTxnId,
      razorpay: {
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      },
      customer: {
        name: user.name,
        email: user.email
      },
      renewalDetails: {
        serviceName: order.productName,
        memory: order.memory,
        currentExpiry: order.expiryDate,
        renewalPrice: renewalPrice
      }
    });

  } catch (error) {
    console.error('Error initiating renewal payment:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}