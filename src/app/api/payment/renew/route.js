import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { Cashfree } from 'cashfree-pg';
import { getRazorpayClient } from '@/lib/razorpayClient';
import axios from 'axios';
import { detectCompanyManagedRenewal, resolveRenewalProvider } from '@/lib/companyRenewal';
import {
  getDaysUntilExpiry,
  isWithinRenewalWindow,
  RENEWAL_DAYS_BEFORE_EXPIRY,
} from '@/lib/expiryHelper';
import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { resolveOrderRenewalPrice } from '@/lib/orderRenewalPricingServer';

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

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

    // Helper function to sanitize strings for Cashfree (remove emojis and special chars)
    const sanitizeForCashfree = (str) => {
      if (!str) return '';
      // Remove emojis and keep only alphanumeric, spaces, and basic punctuation
      return String(str).replace(/[^\w\s\-\.,:]/g, '').trim();
    };

    // 10. Create payment order based on selected method with backend fallback
    const returnUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/payment/callback?client_txn_id=${renewalTxnId}&order_id=${order._id}`;
    let actualPaymentMethod = paymentMethod;
    let orderCreationError = null;
    const responseData = {};

    // Try Cashfree first if selected
    if (actualPaymentMethod === 'cashfree') {
      try {
        console.log('[RENEWAL-INIT] Creating Cashfree renewal order');
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
            return_url: returnUrl,
            notify_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/webhook`
          },
          order_note: sanitizeForCashfree(`Renewal: ${order.productName} - ${order.memory}`),
          order_tags: {
            order_id: String(order._id),
            renewal_for: sanitizeForCashfree(order.productName),
            memory: sanitizeForCashfree(order.memory),
            renewal_type: 'service_renewal',
            provider: String(provider),
            service_identifier: String(provider === 'smartvps' ? (order.smartvpsServiceId || order.ipAddress) : '')
          }
        };

        const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', cashfreeRequest);
        console.log('[RENEWAL-INIT] ✅ Cashfree renewal order created successfully');
        
        responseData.cashfree = {
          order_id: renewalTxnId,
          payment_session_id: cashfreeOrder.data.payment_session_id,
          order_token: cashfreeOrder.data.payment_session_id,
          amount: Math.round(renewalPrice * 100) / 100,
          currency: 'INR'
        };
      } catch (error) {
        console.error('[RENEWAL-INIT] ❌ Cashfree renewal order creation failed:', error.message);
        orderCreationError = error;
        actualPaymentMethod = 'razorpay'; // Fallback to Razorpay
      }
    }

    // Try Razorpay if selected or if Cashfree failed
    if (actualPaymentMethod === 'razorpay') {
      try {
        console.log('[RENEWAL-INIT] Creating Razorpay renewal order');
        const razorpay = getRazorpayClient();
        if (!razorpay) {
          throw new Error('Razorpay credentials not configured');
        }

        const razorpayOrder = await razorpay.orders.create({
          amount: Math.round(renewalPrice * 100),
          currency: 'INR',
          receipt: renewalTxnId,
          notes: {
            orderId: String(order._id),
            renewal_for: String(order.productName).replace(/[^\x20-\x7E]/g, '').trim(),
            memory: order.memory,
            renewal_type: 'service_renewal',
            provider: provider
          }
        });

        console.log('[RENEWAL-INIT] ✅ Razorpay renewal order created successfully');
        
        responseData.razorpay = {
          order_id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID
        };
      } catch (error) {
        console.error('[RENEWAL-INIT] ❌ Razorpay renewal order creation failed:', error.message);
        orderCreationError = error;
        actualPaymentMethod = 'upi'; // Fallback to UPI Gateway
      }
    }

    // Try UPI Gateway if selected or if previous methods failed
    if (actualPaymentMethod === 'upi') {
      const UPI_GATEWAY_KEY = process.env.UPI_GATEWAY_API_KEY;
      if (!UPI_GATEWAY_KEY) {
        console.error('[RENEWAL-INIT] UPI Gateway API key not configured');
        orderCreationError = new Error('UPI Gateway API key not configured');
        actualPaymentMethod = 'cashfree'; // Fallback to Cashfree as last resort
        
        // Try Cashfree again if we haven't tried it yet
        if (!responseData.cashfree) {
          try {
            console.log('[RENEWAL-INIT] Falling back to Cashfree after UPI failure');
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
                return_url: returnUrl,
                notify_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/webhook`
              },
              order_note: sanitizeForCashfree(`Renewal: ${order.productName} - ${order.memory}`),
              order_tags: {
                order_id: String(order._id),
                renewal_for: sanitizeForCashfree(order.productName),
                memory: sanitizeForCashfree(order.memory),
                renewal_type: 'service_renewal',
                provider: String(provider)
              }
            };

            const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', cashfreeRequest);
            console.log('[RENEWAL-INIT] ✅ Cashfree renewal order created (fallback)');
            
            responseData.cashfree = {
              order_id: renewalTxnId,
              payment_session_id: cashfreeOrder.data.payment_session_id,
              order_token: cashfreeOrder.data.payment_session_id,
              amount: Math.round(renewalPrice * 100) / 100,
              currency: 'INR'
            };
          } catch (cashfreeError) {
            console.error('[RENEWAL-INIT] ❌ All payment methods failed');
            return NextResponse.json(
              { message: 'All payment gateways failed. Please try again later.' },
              { status: 500 }
            );
          }
        }
      } else {
        try {
          console.log('[RENEWAL-INIT] Creating UPI Gateway renewal order');
          const upiRequest = {
            key: UPI_GATEWAY_KEY,
            client_txn_id: renewalTxnId,
            amount: Math.round(renewalPrice * 100) / 100,
            p_info: sanitizeForCashfree(`Renewal: ${order.productName} - ${order.memory}`),
            customer_name: user.name,
            customer_email: user.email,
            customer_mobile: user.phone || '9999999999',
            redirect_url: returnUrl,
            udf1: String(order._id),
            udf2: 'renewal',
            udf3: String(provider)
          };

          const upiResponse = await axios.post('https://merchant.upigateway.com/api/create_order', upiRequest);
          
          if (upiResponse.data && upiResponse.data.status === 'success') {
            console.log('[RENEWAL-INIT] ✅ UPI Gateway renewal order created successfully');
            
            responseData.upi = {
              order_id: upiResponse.data.id,
              payment_url: upiResponse.data.payment_url,
              amount: upiRequest.amount,
              currency: 'INR'
            };
          } else {
            throw new Error(upiResponse.data.message || 'UPI Gateway order creation failed');
          }
        } catch (error) {
          console.error('[RENEWAL-INIT] ❌ UPI Gateway renewal order creation failed:', error.message);
          return NextResponse.json(
            { message: 'All payment gateways failed. Please try again later.' },
            { status: 500 }
          );
        }
      }
    }

    console.log(`[RENEWAL-INIT] ✅ Final payment method: ${actualPaymentMethod}`);

    // 10.5 Store pending renewal info on the order for webhook/recovery
    const pendingRenewalData = {
      renewalTxnId: renewalTxnId,
      initiatedAt: new Date(),
      paymentMethod: actualPaymentMethod,
      amount: renewalPrice,
      gatewayOrderId: actualPaymentMethod === 'razorpay' ? responseData.razorpay?.order_id : renewalTxnId
    };

    await Order.findByIdAndUpdate(orderId, {
      pendingRenewal: pendingRenewalData
    });
    console.log(`[RENEWAL-INIT] ✅ Stored pending renewal info on order:`, pendingRenewalData);

    // 11. Return payment order details for frontend
    return NextResponse.json({
      message: 'Renewal payment initiated',
      orderId: order._id,
      renewalTxnId: renewalTxnId,
      provider: provider,
      paymentMethod: actualPaymentMethod,
      ...responseData,
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
