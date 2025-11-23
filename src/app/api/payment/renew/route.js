import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import IPStock from '@/models/ipStockModel';
import { Cashfree } from 'cashfree-pg';

// Initialize Cashfree with your credentials
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

// Enhanced helper function to determine provider from order with IPStock data
async function getProviderFromOrder(order) {
  console.log('[RENEWAL-INIT-PROVIDER] === PROVIDER DETECTION START ===');
  console.log('[RENEWAL-INIT-PROVIDER] Determining provider for order:', {
    orderId: order._id,
    explicitProvider: order.provider,
    hostycareServiceId: order.hostycareServiceId,
    smartvpsServiceId: order.smartvpsServiceId,
    ipStockId: order.ipStockId,
    ipAddress: order.ipAddress,
    productName: order.productName
  });

  // Primary logic: Check if order has hostycare service ID
  if (order.hostycareServiceId) {
    console.log('[RENEWAL-INIT-PROVIDER] ✅ Detected Hostycare via serviceId:', order.hostycareServiceId);
    return 'hostycare';
  }

  // Secondary logic: Check if ipStock has smartvps tag
  if (order.ipStockId) {
    try {
      console.log('[RENEWAL-INIT-PROVIDER] Fetching IPStock data for ID:', order.ipStockId);
      const ipStock = await IPStock.findById(order.ipStockId);

      if (ipStock) {
        console.log('[RENEWAL-INIT-PROVIDER] IPStock found:', {
          _id: ipStock._id,
          name: ipStock.name,
          tags: ipStock.tags,
          serverType: ipStock.serverType
        });

        if (ipStock.tags && ipStock.tags.includes('smartvps')) {
          console.log('[RENEWAL-INIT-PROVIDER] ✅ Detected SmartVPS via ipStock tags:', ipStock.tags);
          return 'smartvps';
        } else {
          console.log('[RENEWAL-INIT-PROVIDER] IPStock tags do not include smartvps:', ipStock.tags);
        }
      } else {
        console.log('[RENEWAL-INIT-PROVIDER] IPStock not found for ID:', order.ipStockId);
      }
    } catch (ipStockError) {
      console.error('[RENEWAL-INIT-PROVIDER] Error fetching IPStock:', ipStockError);
    }
  } else {
    console.log('[RENEWAL-INIT-PROVIDER] No ipStockId in order');
  }

  // Additional fallback: Check smartvps service ID
  if (order.smartvpsServiceId) {
    console.log('[RENEWAL-INIT-PROVIDER] ✅ Detected SmartVPS via serviceId:', order.smartvpsServiceId);
    return 'smartvps';
  }

  // Final fallback: Check product name patterns for SmartVPS
  if (order.productName.includes('103.195') ||
      order.ipAddress?.startsWith('103.195') ||
      order.productName.includes('🏅')) {
    console.log('[RENEWAL-INIT-PROVIDER] ✅ Detected SmartVPS via patterns');
    console.log('[RENEWAL-INIT-PROVIDER] Product name:', order.productName);
    console.log('[RENEWAL-INIT-PROVIDER] IP address:', order.ipAddress);
    return 'smartvps';
  }

  // Default to oceanlinux
  console.log('[RENEWAL-INIT-PROVIDER] ⚪ Defaulting to OceanLinux');
  console.log('[RENEWAL-INIT-PROVIDER] === PROVIDER DETECTION END ===');
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

    // 6. Determine the provider for this order using enhanced detection
    const provider = await getProviderFromOrder(order);
    console.log('[RENEWAL-INIT] Final determined provider for order:', provider);

    // 7. For SmartVPS orders, validate that we have the necessary identifiers
    if (provider === 'smartvps') {
      const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
      if (!serviceIdentifier) {
        console.log('[RENEWAL-INIT] SmartVPS order missing service identifier');
        return NextResponse.json({
          message: 'SmartVPS order missing required service identifier'
        }, { status: 400 });
      }
      console.log('[RENEWAL-INIT] SmartVPS renewal for service:', serviceIdentifier);
    }

    // 8. Generate a unique renewal transaction ID
    const renewalTxnId = `RENEWAL_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 9. Use the original order price for renewal
    const renewalPrice = order.price;

    // 10. Create Cashfree order for renewal
    const cashfreeRequest = {
      order_id: renewalTxnId,
      order_amount: Math.round(renewalPrice * 100) / 100,
      order_currency: 'INR',
      customer_details: {
        customer_id: userId,
        customer_name: user.name,
        customer_email: user.email,
        customer_phone: user.phone || '9999999999'
      },
      order_meta: {
        return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/callback?client_txn_id=${renewalTxnId}&order_id=${order._id}`,
        notify_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/webhook`
      },
      order_note: `Renewal: ${order.productName} - ${order.memory}`,
      order_tags: {
        order_id: order._id.toString(),
        renewal_for: order.productName,
        memory: order.memory,
        renewal_type: 'service_renewal',
        provider: provider,
        service_identifier: provider === 'smartvps' ? (order.smartvpsServiceId || order.ipAddress) : ''
      }
    };

    console.log("Creating Cashfree renewal order:", {
      ...cashfreeRequest,
      order_tags: {
        ...cashfreeRequest.order_tags,
        service_identifier: cashfreeRequest.order_tags.service_identifier ? '[SERVICE_ID_PRESENT]' : null
      }
    });

    const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', cashfreeRequest);
    console.log("Cashfree renewal order created:", cashfreeOrder.data);

    // 11. Return Cashfree order details for frontend
    return NextResponse.json({
      message: 'Renewal payment initiated',
      orderId: order._id,
      renewalTxnId: renewalTxnId,
      provider: provider,
      cashfree: {
        order_id: renewalTxnId,
        payment_session_id: cashfreeOrder.data.payment_session_id,
        order_token: cashfreeOrder.data.payment_session_id,
        amount: Math.round(renewalPrice * 100) / 100,
        currency: 'INR'
      },
      customer: {
        name: user.name,
        email: user.email,
        phone: user.phone || '9999999999'
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
