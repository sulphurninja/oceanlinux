import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { createGatewayOrder } from '@/lib/paymentGateways';
import { detectCompanyManagedRenewal, resolveRenewalProvider } from '@/lib/companyRenewal';
import {
  getDaysUntilExpiry,
  isWithinRenewalWindow,
  RENEWAL_DAYS_BEFORE_EXPIRY,
} from '@/lib/expiryHelper';
import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { resolveOrderRenewalPrice } from '@/lib/orderRenewalPricingServer';

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
    const { orderId, paymentMethod = 'cashfree' } = reqBody;
    
    console.log(`[RENEWAL-INIT] Payment method requested: ${paymentMethod}`);

    // 4. Find the order to renew
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    if (isSlotIpOrder(order)) {
      return NextResponse.json({ message: SLOT_IP_NO_RENEWAL_MESSAGE }, { status: 400 });
    }

    // 5. Check if order is eligible for renewal
    if (!order.expiryDate) {
      return NextResponse.json({ message: 'Order has no expiry date' }, { status: 400 });
    }

    const diffDays = getDaysUntilExpiry(order.expiryDate);

    // ADVPS + company manual: renew opens within 2 days of expiry (7-day grace after).
    if (!isWithinRenewalWindow(order.expiryDate)) {
      return NextResponse.json({
        message: diffDays > RENEWAL_DAYS_BEFORE_EXPIRY
          ? `Renewal opens within ${RENEWAL_DAYS_BEFORE_EXPIRY} days of expiry. Please come back in ${diffDays - RENEWAL_DAYS_BEFORE_EXPIRY} day(s).`
          : `This service has been expired for too long and can no longer be renewed. Please contact support.`,
      }, { status: 400 });
    }

    const companyCheck = await detectCompanyManagedRenewal(order);
    const provider = await resolveRenewalProvider(order);
    console.log('[RENEWAL-INIT] Provider:', provider, 'companyManaged:', companyCheck.isCompany);

    // 7. For SmartVPS orders, validate that we have the necessary identifiers
    if (provider === 'smartvps' && !companyCheck.isCompany) {
      const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
      if (!serviceIdentifier) {
        console.log('[RENEWAL-INIT] SmartVPS order missing service identifier');
        return NextResponse.json({
          message: 'SmartVPS order missing required service identifier'
        }, { status: 400 });
      }
      console.log('[RENEWAL-INIT] SmartVPS renewal for service:', serviceIdentifier);
    }

    // 7a. ADVPS — require upstream identifiers (window is shared above).
    if (provider === 'advps') {
      if (!order.advpsServiceId || !order.advpsOrderId) {
        console.log('[RENEWAL-INIT] ADVPS order missing identifiers', {
          advpsServiceId: order.advpsServiceId,
          advpsOrderId: order.advpsOrderId,
        });
        return NextResponse.json({
          message: 'This server is not yet provisioned upstream. Please wait a few minutes and try again.',
        }, { status: 400 });
      }
      console.log('[RENEWAL-INIT] ADVPS renewal eligible:', {
        advpsServiceId: order.advpsServiceId,
        advpsOrderId: order.advpsOrderId,
        diffDays,
      });
    }

    // 8. Generate a unique renewal transaction ID
    const renewalTxnId = `RENEWAL_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 9. Use the original order price for renewal
    const renewalPrice = await resolveOrderRenewalPrice(order);
    console.log(`[RENEWAL-INIT] Renewal price: ₹${renewalPrice} (paid=${order.price}, originalPrice=${order.originalPrice ?? 'n/a'}, promoDiscount=${order.promoDiscount ?? 0})`);

    if (!Number.isFinite(renewalPrice) || renewalPrice <= 0) {
      return NextResponse.json(
        { message: 'Invalid renewal price. Please contact support.' },
        { status: 400 }
      );
    }

    const preferredMethod = ['razorpay', 'cashfree', 'upi'].includes(paymentMethod)
      ? paymentMethod
      : 'cashfree';

    let gatewayResult;
    try {
      gatewayResult = await createGatewayOrder({
        preferredMethod,
        clientTxnId: renewalTxnId,
        amount: Math.round(renewalPrice * 100) / 100,
        customer: {
          id: String(userId),
          name: user.name,
          email: user.email,
          phone: user.phone || '9999999999',
        },
        callbackPath: `/payment/callback?order_id=${order._id}`,
        notifyPath: '/api/payment/webhook',
        notes: {
          order_id: String(order._id),
          renewal_for: String(order.productName),
          memory: String(order.memory),
          renewal_type: 'service_renewal',
          provider: String(provider),
          service_identifier: String(
            provider === 'smartvps' ? (order.smartvpsServiceId || order.ipAddress || '') : ''
          ),
        },
        description: `Renewal: ${order.productName} - ${order.memory}`,
      });
    } catch (err) {
      console.error('[RENEWAL-INIT] All payment gateways failed:', err.message);
      return NextResponse.json(
        { message: 'All payment gateways failed. Please try again later.', error: err.message },
        { status: 500 }
      );
    }

    const actualPaymentMethod = gatewayResult.method;
    console.log(`[RENEWAL-INIT] ✅ Final payment method: ${actualPaymentMethod}`);

    const pendingRenewalData = {
      renewalTxnId,
      initiatedAt: new Date(),
      paymentMethod: actualPaymentMethod,
      amount: renewalPrice,
      gatewayOrderId: gatewayResult.gatewayOrderId,
    };

    await Order.findByIdAndUpdate(orderId, {
      pendingRenewal: pendingRenewalData,
    });
    console.log('[RENEWAL-INIT] ✅ Stored pending renewal info on order:', pendingRenewalData);

    return NextResponse.json({
      message: 'Renewal payment initiated',
      orderId: order._id,
      renewalTxnId,
      provider,
      paymentMethod: actualPaymentMethod,
      fallbackUsed: gatewayResult.fallbackUsed,
      originalMethod: gatewayResult.originalMethod,
      ...gatewayResult.payload,
      customer: {
        name: user.name,
        email: user.email,
        phone: user.phone || '9999999999',
      },
      renewalDetails: {
        serviceName: order.productName,
        memory: order.memory,
        currentExpiry: order.expiryDate,
        renewalPrice,
        provider,
      },
    });

  } catch (error) {
    console.error('Error initiating renewal payment:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}
