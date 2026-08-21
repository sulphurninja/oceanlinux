import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import userWalletService from '@/services/userWalletService';
import { createGatewayOrder } from '@/lib/paymentGateways';
import { getPrimaryPaymentMethod } from '@/lib/platformPaymentSettings';
import { detectCompanyManagedRenewal, resolveRenewalProvider } from '@/lib/companyRenewal';
import {
  getDaysUntilExpiry,
  isWithinRenewalWindow,
  RENEWAL_DAYS_BEFORE_EXPIRY,
} from '@/lib/expiryHelper';
import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { resolveOrderRenewalPrice } from '@/lib/orderRenewalPricingServer';
const { customerApiCatchPayload } = require('@/lib/customerFacingErrors');
import { enforcePaymentRateLimit } from '@/lib/rateLimit';

async function refundRenewalWalletReservation(userId, amount, renewalTxnId) {
  if (!amount || amount <= 0) return;
  try {
    await userWalletService.refund(userId, amount, {
      description: `Renewal wallet refund ${renewalTxnId}`,
      reference: renewalTxnId,
    });
  } catch (err) {
    console.error('[RENEWAL-INIT] Wallet refund failed:', err.message);
  }
}

export async function POST(request) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  await connectDB();
  console.log("MongoDB connected");

  let walletApplied = 0;
  let walletDebit = null;
  let renewalTxnId = null;
  let userId = null;
  let orderId = null;
  let pendingSaved = false;

  try {
    // 1. Check which user is making this renewal request
    userId = await getDataFromToken(request);
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
    const primaryGateway = await getPrimaryPaymentMethod();
    const { orderId: reqOrderId, useWallet = false } = reqBody;
    const paymentMethod = ['razorpay', 'upi'].includes(reqBody.paymentMethod)
      ? reqBody.paymentMethod
      : primaryGateway;
    orderId = reqOrderId;
    
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

    // 7b. Netbay — require service id from auto-provision.
    if (provider === 'netbay') {
      if (!order.netbayServiceId) {
        return NextResponse.json({
          message: 'This server is still being set up. Please wait a few minutes and try again.',
        }, { status: 400 });
      }
      console.log('[RENEWAL-INIT] Netbay renewal eligible:', {
        netbayServiceId: order.netbayServiceId,
        diffDays,
      });
    }

    // 8. Generate a unique renewal transaction ID
    renewalTxnId = `RENEWAL_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 9. Renewal = current product list price − locked promo discount
    const renewalPrice = await resolveOrderRenewalPrice(order);
    console.log(
      `[RENEWAL-INIT] Renewal price: ₹${renewalPrice} ` +
      `(promoOff=₹${order.promoDiscount ?? 0}, paid=${order.price}, originalPrice=${order.originalPrice ?? 'n/a'})`
    );

    if (!Number.isFinite(renewalPrice) || renewalPrice <= 0) {
      return NextResponse.json(
        { message: 'Invalid renewal price. Please contact support.' },
        { status: 400 }
      );
    }

    const preferredMethod = ['razorpay', 'upi'].includes(paymentMethod)
      ? paymentMethod
      : primaryGateway;

    if (useWallet) {
      const balance = await userWalletService.getBalance(userId);
      walletApplied = Math.min(balance, renewalPrice);
    }
    const gatewayCharge = Math.max(0, Math.round((renewalPrice - walletApplied) * 100) / 100);

    // Only debit wallet immediately for wallet-only renewals.
    // When gateway payment is also required, wallet is debited on renew-confirm
    // after gateway success — so cancelling Razorpay does not steal wallet funds.
    if (walletApplied > 0 && gatewayCharge === 0) {
      try {
        walletDebit = await userWalletService.debit(userId, walletApplied, {
          description: `Renewal ${order.productName} - ${order.memory}`,
          reference: renewalTxnId,
          metadata: {
            orderId: String(order._id),
            renewalTxnId,
            totalPrice: renewalPrice,
            gatewayCharge,
          },
        });
        console.log(`[RENEWAL-INIT] Wallet debited ₹${walletApplied}, txn=${walletDebit.walletTxnId}`);
      } catch (err) {
        return NextResponse.json(
          { message: err.message || 'Insufficient wallet balance' },
          { status: 400 }
        );
      }
    } else if (walletApplied > 0) {
      console.log(`[RENEWAL-INIT] Wallet ₹${walletApplied} reserved — debited after gateway payment confirms`);
    }

    let gatewayResult = null;
    let actualPaymentMethod = gatewayCharge === 0 ? 'wallet' : preferredMethod;

    if (gatewayCharge > 0) {
      try {
        gatewayResult = await createGatewayOrder({
          preferredMethod,
          clientTxnId: renewalTxnId,
          amount: gatewayCharge,
          customer: {
            id: String(userId),
            name: user.name,
            email: user.email,
            phone: user.phone || '9999999999',
          },
          callbackPath: `/payment/callback?order_id=${order._id}`,
          notifyPath: '/api/payment/kwikupi-webhook',
          notes: {
            order_id: String(order._id),
            renewal_for: String(order.productName),
            memory: String(order.memory),
            renewal_type: 'service_renewal',
            provider: String(provider),
            wallet_amount: String(walletApplied),
            gateway_amount: String(gatewayCharge),
            service_identifier: String(
              provider === 'smartvps' ? (order.smartvpsServiceId || order.ipAddress || '') : ''
            ),
          },
          description: `Renewal: ${order.productName} - ${order.memory}`,
        });
      } catch (err) {
        if (walletDebit) {
          await refundRenewalWalletReservation(userId, walletApplied, renewalTxnId);
        }
        console.error('[RENEWAL-INIT] All payment gateways failed:', err.message);
        return NextResponse.json(
          { message: 'All payment gateways failed. Please try again later.', error: err.message },
          { status: 500 }
        );
      }

      actualPaymentMethod = gatewayResult.method;
      console.log(`[RENEWAL-INIT] ✅ Final payment method: ${actualPaymentMethod}`);
    } else {
      console.log('[RENEWAL-INIT] ✅ Wallet-only renewal — no gateway charge');
    }

    const paymentMethodLabel =
      walletApplied > 0 && gatewayCharge > 0
        ? `wallet+${actualPaymentMethod}`
        : walletApplied > 0
          ? 'wallet'
          : actualPaymentMethod;

    const pendingRenewalData = {
      renewalTxnId,
      initiatedAt: new Date(),
      paymentMethod: paymentMethodLabel,
      amount: renewalPrice,
      gatewayAmount: gatewayCharge,
      walletAmount: walletApplied,
      walletDeducted: !!walletDebit,
      walletPending: walletApplied > 0 && gatewayCharge > 0,
      walletTxnId: walletDebit?.walletTxnId || '',
      gatewayOrderId: gatewayResult?.gatewayOrderId || '',
    };

    await Order.findByIdAndUpdate(orderId, {
      pendingRenewal: pendingRenewalData,
    });
    pendingSaved = true;
    console.log('[RENEWAL-INIT] ✅ Stored pending renewal info on order:', pendingRenewalData);

    if (gatewayCharge === 0) {
      return NextResponse.json({
        message: 'Renewal paid from wallet',
        orderId: order._id,
        renewalTxnId,
        provider,
        paymentMethod: 'wallet',
        walletOnly: true,
        walletApplied,
        gatewayCharge: 0,
        renewalDetails: {
          serviceName: order.productName,
          memory: order.memory,
          currentExpiry: order.expiryDate,
          renewalPrice,
          provider,
        },
      });
    }

    return NextResponse.json({
      message: 'Renewal payment initiated',
      orderId: order._id,
      renewalTxnId,
      provider,
      paymentMethod: actualPaymentMethod,
      walletApplied,
      gatewayCharge,
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
    if (userId && walletDebit && walletApplied > 0 && !pendingSaved) {
      await refundRenewalWalletReservation(userId, walletApplied, renewalTxnId || 'unknown');
    }
    return NextResponse.json(
      { message: 'Server error', ...customerApiCatchPayload(error.message) },
      { status: 500 }
    );
  }
}
