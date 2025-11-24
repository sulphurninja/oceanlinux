import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// Initialize Cashfree with your credentials
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
// Use Cashfree.Environment enum instead of string
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

console.log('[Cashfree Init] Environment:', process.env.CASHFREE_ENVIRONMENT);
console.log('[Cashfree Init] Using:', Cashfree.XEnvironment === Cashfree.Environment.PRODUCTION ? 'PRODUCTION' : 'SANDBOX');

// Initialize Razorpay with your credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// UPI Gateway configuration (URL only - key will be read inside handler)
const UPI_GATEWAY_URL = 'https://merchant.upigateway.com/api/create_order';

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

    // 3. Read request data with promo code info and payment method
    const reqBody = await request.json();
    const { 
      productName, 
      memory, 
      price, 
      originalPrice, 
      promoCode, 
      promoDiscount, 
      ipStockId,
      paymentMethod = 'razorpay' // Default to Razorpay if not specified
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

    console.log(`[Payment] Creating ${paymentMethod} order for user ${userId}`);

    let gatewayOrderId;
    let responseData = {
      message: 'Payment initiated',
      orderId: null, // Will be set after DB creation
      clientTxnId: clientTxnId,
      customer: {
        name: user.name,
        email: user.email,
        phone: user.phone || '9999999999'
      }
    };

    // 7. Create order with selected payment gateway (with automatic fallback)
    let actualPaymentMethod = paymentMethod;
    let orderCreationError = null;

    if (paymentMethod === 'upi') {
      try {
        // Get UPI Gateway API key from environment
        const UPI_GATEWAY_KEY = process.env.UPI_GATEWAY_API_KEY;
        
        if (!UPI_GATEWAY_KEY) {
          console.error("[Payment] UPI_GATEWAY_API_KEY not found in environment variables");
          throw new Error('UPI Gateway API key not configured');
        }

        console.log("[Payment] UPI Gateway API key found, length:", UPI_GATEWAY_KEY.length);

        // Create UPI Gateway order
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
        const returnUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

        const upiPayload = {
          key: UPI_GATEWAY_KEY,
          client_txn_id: clientTxnId,
          amount: price.toString(),
          p_info: `${productName} - ${memory}`,
          customer_name: user.name,
          customer_email: user.email,
          customer_mobile: user.phone || '9999999999',
          redirect_url: `${returnUrl}/payment/callback?client_txn_id=${clientTxnId}`,
          udf1: productName,
          udf2: memory,
          udf3: promoCode || ''
        };

        console.log("[Payment] Creating UPI Gateway order");
        
        const upiResponse = await fetch(UPI_GATEWAY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(upiPayload)
        });

        const upiData = await upiResponse.json();
        
        if (!upiResponse.ok || upiData.status === false) {
          throw new Error(upiData.msg || 'UPI Gateway order creation failed');
        }

        console.log("[Payment] UPI Gateway order created:", upiData.data.order_id);

        gatewayOrderId = upiData.data.order_id;
        responseData.upi = {
          order_id: upiData.data.order_id,
          payment_url: upiData.data.payment_url,
          amount: price,
          currency: 'INR'
        };
      } catch (upiError) {
        console.error("[Payment] UPI Gateway order creation failed:", upiError.message);
        orderCreationError = upiError;
        
        // Fallback to Cashfree
        console.log("[Payment] Falling back to Cashfree...");
        actualPaymentMethod = 'cashfree';
      }
    }

    if (actualPaymentMethod === 'cashfree') {
      try {
        // Helper function to sanitize strings for Cashfree (remove emojis and special chars)
        const sanitizeForCashfree = (str) => {
          if (!str) return '';
          return String(str).replace(/[^\w\s\-\.,:]/g, '').trim();
        };

        // Ensure full URLs for Cashfree
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
        const returnUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

        const cashfreeRequest = {
          order_id: clientTxnId,
          order_amount: Math.round(price * 100) / 100,
          order_currency: 'INR',
          customer_details: {
            customer_id: userId,
            customer_name: user.name,
            customer_email: user.email,
            customer_phone: user.phone || '9999999999'
          },
          order_meta: {
            return_url: `${returnUrl}/payment/callback?client_txn_id=${clientTxnId}`,
            notify_url: `${returnUrl}/api/payment/webhook`
          },
          order_note: sanitizeForCashfree(`${productName} - ${memory}`),
          order_tags: {
            product_name: sanitizeForCashfree(productName),
            memory: sanitizeForCashfree(memory),
            promo_code: sanitizeForCashfree(promoCode || ''),
            original_price: String(originalPrice || price),
            discount: String(promoDiscount || 0)
          }
        };

        console.log("[Payment] Creating Cashfree order");
        console.log("[Payment] Return URL:", cashfreeRequest.order_meta.return_url);
        const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', cashfreeRequest);
        console.log("[Payment] Cashfree order created:", cashfreeOrder.data.order_id);

        gatewayOrderId = clientTxnId;
        responseData.cashfree = {
          order_id: clientTxnId,
          payment_session_id: cashfreeOrder.data.payment_session_id,
          order_token: cashfreeOrder.data.payment_session_id,
          amount: Math.round(price * 100) / 100,
          currency: 'INR'
        };
      } catch (cashfreeError) {
        console.error("[Payment] Cashfree order creation failed:", cashfreeError.message);
        console.error("[Payment] Cashfree error details:", cashfreeError.response?.data);
        orderCreationError = cashfreeError;
        
        // Fallback to Razorpay
        console.log("[Payment] Falling back to Razorpay...");
        actualPaymentMethod = 'razorpay';
      }
    }

    if (actualPaymentMethod === 'razorpay') {
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

      console.log("Creating Razorpay order");
      const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);
      console.log("Razorpay order created:", razorpayOrder.id);

      gatewayOrderId = razorpayOrder.id;
      responseData.razorpay = {
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      };
    }

    // 8. Create a pending order in our database
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
      gatewayOrderId: gatewayOrderId,
      paymentMethod: actualPaymentMethod, // Use the actual method (after fallback)
      status: 'pending',
      customerName: user.name,
      customerEmail: user.email,
      expiryDate: expiryDate,
    });

    console.log("[Payment] Order created in database:", newOrder._id);
    console.log("[Payment] Using payment method:", actualPaymentMethod);

    responseData.orderId = newOrder._id;
    responseData.actualPaymentMethod = actualPaymentMethod; // Tell frontend which method was used
    
    // If there was a fallback, include a flag
    if (orderCreationError && actualPaymentMethod !== paymentMethod) {
      responseData.fallbackUsed = true;
      responseData.originalMethod = paymentMethod;
    }

    // 9. Return order details for frontend
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error initiating payment:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}