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

    // 3. Read request data with promo code info
    const reqBody = await request.json();
    const { 
      productName, 
      memory, 
      price, 
      originalPrice, 
      promoCode, 
      promoDiscount, 
      ipStockId 
    } = reqBody;

    // 4. Basic validation
    if (!productName || !memory || !price) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 5. Generate a unique order ID
    const clientTxnId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 6. Calculate expiry date (30 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    // 7. Create Razorpay order
    const razorpayOrderOptions = {
      amount: Math.round(price * 100), // Razorpay expects amount in paise
      currency: 'INR',
      receipt: clientTxnId,
      notes: {
        product_name: productName,
        memory: memory,
        customer_email: user.email,
        customer_name: user.name,
        promo_code: promoCode || '',
        original_price: originalPrice || price,
        discount: promoDiscount || 0
      }
    };

    console.log("Creating Razorpay order:", razorpayOrderOptions);

    const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);
    console.log("Razorpay order created:", razorpayOrder);

    // 8. Create a pending order in our database with promo code info
    const newOrder = await Order.create({
      user: userId,
      productName,
      memory,
      price: Math.round(price),
      originalPrice: originalPrice || price,
      promoCode: promoCode || null,
      promoDiscount: promoDiscount || 0,
      ipStockId: ipStockId || null,
      clientTxnId,
      gatewayOrderId: razorpayOrder.id,
      status: 'pending',
      customerName: user.name,
      customerEmail: user.email,
      expiryDate: expiryDate,
    });

    console.log("Order created in database:", newOrder._id);

    // 9. Return Razorpay order details for frontend
    return NextResponse.json({
      message: 'Payment initiated',
      orderId: newOrder._id,
      clientTxnId: clientTxnId,
      razorpay: {
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      },
      customer: {
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}