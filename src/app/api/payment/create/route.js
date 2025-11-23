import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { Cashfree } from 'cashfree-pg';

// Initialize Cashfree with your credentials
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
// Use Cashfree.Environment enum instead of string
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

console.log('[Cashfree Init] Environment:', process.env.CASHFREE_ENVIRONMENT);
console.log('[Cashfree Init] Using:', Cashfree.XEnvironment === Cashfree.Environment.PRODUCTION ? 'PRODUCTION' : 'SANDBOX');

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

    // 7. Create Cashfree order
    const cashfreeRequest = {
      order_id: clientTxnId,
      order_amount: Math.round(price * 100) / 100, // Cashfree expects amount in rupees (decimal)
      order_currency: 'INR',
      customer_details: {
        customer_id: userId,
        customer_name: user.name,
        customer_email: user.email,
        customer_phone: user.phone || '9999999999' // Cashfree requires phone
      },
      order_meta: {
        return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/callback?client_txn_id=${clientTxnId}`,
        notify_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/webhook`
      },
      order_note: `${productName} - ${memory}`,
      order_tags: {
        product_name: productName,
        memory: memory,
        promo_code: promoCode || '',
        original_price: originalPrice || price,
        discount: promoDiscount || 0
      }
    };

    console.log("Creating Cashfree order:", cashfreeRequest);

    const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', cashfreeRequest);
    console.log("Cashfree order created:", cashfreeOrder.data);

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
      gatewayOrderId: clientTxnId, // Cashfree uses our order_id
      status: 'pending',
      customerName: user.name,
      customerEmail: user.email,
      expiryDate: expiryDate,
    });

    console.log("Order created in database:", newOrder._id);

    // 9. Return Cashfree order details for frontend
    return NextResponse.json({
      message: 'Payment initiated',
      orderId: newOrder._id,
      clientTxnId: clientTxnId,
      cashfree: {
        order_id: clientTxnId,
        payment_session_id: cashfreeOrder.data.payment_session_id,
        order_token: cashfreeOrder.data.payment_session_id, // For SDK compatibility
        amount: Math.round(price * 100) / 100,
        currency: 'INR'
      },
      customer: {
        name: user.name,
        email: user.email,
        phone: user.phone || '9999999999'
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