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

// Helper function to determine provider from order
function getProviderFromOrder(order, ipStock = null) {
  // Primary logic: Check if order has hostycare service ID
  if (order.hostycareServiceId) {
    return 'hostycare';
  }

  // Secondary logic: Check if ipStock has smartvps tag
  if (ipStock && ipStock.tags && ipStock.tags.includes('smartvps')) {
    return 'smartvps';
  }

  // Additional fallback: Check smartvps service ID
  if (order.smartvpsServiceId) {
    return 'smartvps';
  }

  // Final fallback: Check product name patterns for SmartVPS
  if (order.productName.includes('103.195') ||
      order.ipAddress?.startsWith('103.195') ||
      order.productName.includes('🏅')) {
    return 'smartvps';
  }

  // Default to oceanlinux
  return 'oceanlinux';
}

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

    // 6. Determine the provider for this order
    const provider = getProviderFromOrder(order);
    console.log('[RENEWAL] Determined provider for order:', provider);

    // 7. For SmartVPS orders, validate that we have the necessary identifiers
    if (provider === 'smartvps') {
      const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
      if (!serviceIdentifier) {
        console.log('[RENEWAL] SmartVPS order missing service identifier');
        return NextResponse.json({
          message: 'SmartVPS order missing required service identifier'
        }, { status: 400 });
      }
      console.log('[RENEWAL] SmartVPS renewal for service:', serviceIdentifier);
    }

    // 8. Generate a unique renewal transaction ID
    const renewalTxnId = `RENEWAL_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 9. Use the original order price for renewal
    const renewalPrice = order.price;

    // 10. Create Razorpay order for renewal
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
        renewal_type: 'service_renewal',
        provider: provider, // Store provider info
        service_identifier: provider === 'smartvps' ? (order.smartvpsServiceId || order.ipAddress) : null
      }
    };

    console.log("Creating Razorpay renewal order:", {
      ...razorpayOrderOptions,
      notes: {
        ...razorpayOrderOptions.notes,
        service_identifier: razorpayOrderOptions.notes.service_identifier ? '[SERVICE_ID_PRESENT]' : null
      }
    });

    const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);
    console.log("Razorpay renewal order created:", razorpayOrder.id);

    // 11. Return Razorpay order details for frontend
    return NextResponse.json({
      message: 'Renewal payment initiated',
      orderId: order._id,
      renewalTxnId: renewalTxnId,
      provider: provider,
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
        renewalPrice: renewalPrice,
        provider: provider
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
