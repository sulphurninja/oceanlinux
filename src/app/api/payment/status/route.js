import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getRazorpayClient } from '@/lib/razorpayClient';
import { verifyUPIPayment } from '@/lib/paymentGateways';
import {
  recoverPendingOrderPayment,
  probeGatewayPayment,
} from '@/lib/confirmPendingOrderPayment';
import { enforceOrderAccess } from '@/lib/apiSecurity';
const { customerApiCatchPayload } = require('@/lib/customerFacingErrors');
import {
  findDispatchTarget,
  recoverPendingCheckoutSession,
  recoverPendingWalletRecharge,
} from '@/lib/paymentDispatch';
import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';
import { paymentAmountsMatch, expectedRenewalGatewayAmount } from '@/lib/paymentAmountValidation';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renewalGatewayMethod(pendingRenewal) {
  const raw = pendingRenewal?.paymentMethod || 'razorpay';
  if (raw === 'wallet') return 'wallet';
  if (String(raw).startsWith('wallet+')) return String(raw).slice('wallet+'.length);
  return raw;
}

export async function POST(request) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  await connectDB();
  
  console.log("========== PAYMENT STATUS API CALLED ==========");
  console.log(`Server timestamp: ${new Date().toISOString()}`);

  try {
    const reqBody = await request.json();
    console.log(`Request body: ${JSON.stringify(reqBody)}`);
    const { clientTxnId, renewalTxnId } = reqBody;

    const txnId = renewalTxnId || clientTxnId;
    const isRenewal =
      !!renewalTxnId ||
      (typeof clientTxnId === 'string' && clientTxnId.startsWith('RENEWAL_'));

    if (!txnId) {
      console.log("ERROR: Missing transaction ID");
      return NextResponse.json(
        { message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    console.log(`[PAYMENT-STATUS] Transaction type: ${isRenewal ? 'RENEWAL' : 'NEW ORDER'}`);
    console.log(`[PAYMENT-STATUS] Transaction ID: ${txnId}`);

    // Handle RENEWAL transactions
    if (isRenewal) {
      console.log(`[PAYMENT-STATUS] Processing renewal transaction: ${txnId}`);
      
      // First, check if we already processed this renewal (via webhook or earlier)
      const orderWithRenewal = await Order.findOne({
        'renewalPayments.renewalTxnId': txnId
      });

      if (orderWithRenewal) {
        const accessDenied = await enforceOrderAccess(request, orderWithRenewal);
        if (accessDenied) return accessDenied;

        console.log(`[PAYMENT-STATUS] ✅ Renewal already processed for: ${txnId}`);
        return NextResponse.json({
          isRenewal: true,
          renewalTxnId: txnId,
          paymentStatus: 'SUCCESS',
          alreadyProcessed: true,
          orderId: orderWithRenewal._id,
          message: "Renewal already processed"
        });
      }

      // Find the order with this pending renewal
      const orderWithPending = await Order.findOne({
        'pendingRenewal.renewalTxnId': txnId
      });

      if (!orderWithPending) {
        return NextResponse.json(
          { message: 'Renewal order not found' },
          { status: 404 }
        );
      }

      const pendingAccessDenied = await enforceOrderAccess(request, orderWithPending);
      if (pendingAccessDenied) return pendingAccessDenied;

      const rawPaymentMethod = orderWithPending?.pendingRenewal?.paymentMethod || 'razorpay';
      const gatewayMethod = renewalGatewayMethod(orderWithPending.pendingRenewal);
      const gatewayOrderId = orderWithPending?.pendingRenewal?.gatewayOrderId;
      const returnedFromPayment = !!reqBody.returnedFromPayment;
      const maxAttempts = returnedFromPayment ? 6 : 2;
      const delayMs = returnedFromPayment ? 1500 : 0;

      console.log(`[PAYMENT-STATUS] Pending renewal found, method=${rawPaymentMethod}, gateway=${gatewayMethod}`);

      // UPI (KwikUPI) renewal — probe gateway with retries after redirect
      if (gatewayMethod === 'upi') {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) await sleep(delayMs);
          const upiCheck = await verifyUPIPayment(txnId, gatewayOrderId);
          if (upiCheck.verified) {
            const expected = expectedRenewalGatewayAmount(orderWithPending);
            if (expected > 0 && !paymentAmountsMatch(upiCheck.amount, expected)) {
              return NextResponse.json({
                isRenewal: true,
                renewalTxnId: txnId,
                paymentStatus: 'AMOUNT_MISMATCH',
                paymentMethod: rawPaymentMethod,
                message: 'UPI renewal amount mismatch',
              });
            }
            return NextResponse.json({
              isRenewal: true,
              renewalTxnId: txnId,
              paymentStatus: 'SUCCESS',
              paymentMethod: rawPaymentMethod,
              message: 'UPI renewal payment confirmed',
            });
          }
          if (upiCheck.failed) break;
        }
        return NextResponse.json({
          isRenewal: true,
          renewalTxnId: txnId,
          paymentStatus: 'PENDING',
          paymentMethod: rawPaymentMethod,
          message: 'UPI renewal payment pending — still confirming with bank',
        });
      }

      // Razorpay renewal
      if (gatewayMethod === 'razorpay' && gatewayOrderId) {
        console.log(`[PAYMENT-STATUS] Checking Razorpay order status: ${gatewayOrderId}`);
        try {
          const razorpay = getRazorpayClient();
          if (!razorpay) {
            throw new Error('Razorpay credentials not configured');
          }

          const razorpayOrder = await razorpay.orders.fetch(gatewayOrderId);
          console.log(`[PAYMENT-STATUS] Razorpay order status:`, razorpayOrder.status);

          if (razorpayOrder.status === 'paid') {
            return NextResponse.json({
              isRenewal: true,
              renewalTxnId: txnId,
              paymentStatus: 'SUCCESS',
              paymentMethod: 'razorpay',
              message: "Razorpay renewal payment confirmed"
            });
          } else if (razorpayOrder.status === 'attempted') {
            // Payment was attempted, check for payments
            const payments = await razorpay.orders.fetchPayments(gatewayOrderId);
            const successPayment = payments.items?.find(p => p.status === 'captured');
            if (successPayment) {
              return NextResponse.json({
                isRenewal: true,
                renewalTxnId: txnId,
                paymentStatus: 'SUCCESS',
                paymentMethod: 'razorpay',
                razorpayPaymentId: successPayment.id,
                message: "Razorpay renewal payment confirmed"
              });
            }
          }

          return NextResponse.json({
            isRenewal: true,
            renewalTxnId: txnId,
            paymentStatus: razorpayOrder.status === 'created' ? 'PENDING' : razorpayOrder.status.toUpperCase(),
            paymentMethod: 'razorpay',
            message: "Razorpay renewal payment pending or failed"
          });
        } catch (razorpayError) {
          console.error('[PAYMENT-STATUS] Razorpay API error:', razorpayError);
        }
      }

      return NextResponse.json({
        isRenewal: true,
        renewalTxnId: txnId,
        paymentStatus: 'PENDING',
        paymentMethod: rawPaymentMethod,
        message: 'Renewal payment pending or not found',
      });
    }

    // Handle NEW ORDER transactions (existing logic)
    const returnedFromPayment = !!reqBody.returnedFromPayment;

    // Wallet recharge: parent txn id is WALLET_* on WalletRecharge, not Order.
    if (clientTxnId?.startsWith('WALLET_')) {
      const dispatch = await findDispatchTarget(clientTxnId);
      if (dispatch?.kind === 'recharge') {
        const recharge = dispatch.doc;
        console.log(`[PAYMENT-STATUS] Wallet recharge: ${recharge._id}, status=${recharge.status}`);

        try {
          const userId = await getDataFromToken(request);
          if (userId && String(recharge.user) !== String(userId)) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
          }
        } catch {
          if (recharge.status !== 'confirmed') {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
        }

        if (recharge.status === 'confirmed') {
          const userWalletService = require('@/services/userWalletService').default;
          const newBalance = await userWalletService.getBalance(recharge.user);
          return NextResponse.json({
            paymentStatus: 'SUCCESS',
            isWalletRecharge: true,
            rechargeId: recharge._id.toString(),
            amount: recharge.amount,
            newBalance,
            message: 'Wallet recharge already confirmed',
          });
        }

        const recovery = await recoverPendingWalletRecharge(recharge, {
          maxAttempts: returnedFromPayment ? 5 : 2,
          delayMs: returnedFromPayment ? 1500 : 0,
        });

        if (recovery.success) {
          return NextResponse.json({
            paymentStatus: 'SUCCESS',
            isWalletRecharge: true,
            rechargeId: recharge._id.toString(),
            amount: recharge.amount,
            newBalance: recovery.newBalance,
            message: recovery.alreadyProcessed ? 'Wallet recharge already confirmed' : 'Wallet recharge confirmed',
          });
        }

        return NextResponse.json({
          paymentStatus: 'PENDING',
          isWalletRecharge: true,
          rechargeId: recharge._id.toString(),
          message: recovery.reason || 'Wallet recharge payment is still processing',
        });
      }
    }

    // Cart checkout: parent txn id is CART_* on CheckoutSession, not a single Order.
    if (clientTxnId?.startsWith('CART_')) {
      const dispatch = await findDispatchTarget(clientTxnId);
      if (dispatch?.kind === 'checkout') {
        const session = dispatch.doc;
        console.log(`[PAYMENT-STATUS] Cart checkout session: ${session._id}, status=${session.status}`);

        try {
          const userId = await getDataFromToken(request);
          if (userId && String(session.user) !== String(userId)) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
          }
        } catch {
          // Cron / unauthenticated recovery — allow only if session already confirmed.
          if (session.status !== 'confirmed') {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
        }

        if (session.status === 'confirmed') {
          return NextResponse.json({
            paymentStatus: 'SUCCESS',
            isCartCheckout: true,
            sessionId: session._id.toString(),
            orderIds: session.orderIds.map((id) => id.toString()),
            message: 'Cart checkout already confirmed',
          });
        }

        const recovery = await recoverPendingCheckoutSession(session, {
          maxAttempts: returnedFromPayment ? 5 : 2,
          delayMs: returnedFromPayment ? 1500 : 0,
        });

        if (recovery.success) {
          const confirmed = await CheckoutSession.findById(session._id);
          return NextResponse.json({
            paymentStatus: 'SUCCESS',
            isCartCheckout: true,
            sessionId: session._id.toString(),
            orderIds: (confirmed?.orderIds || session.orderIds).map((id) => id.toString()),
            message: recovery.alreadyProcessed ? 'Cart checkout already confirmed' : 'Cart checkout confirmed',
          });
        }

        return NextResponse.json({
          paymentStatus: 'PENDING',
          isCartCheckout: true,
          sessionId: session._id.toString(),
          message: recovery.reason || 'Cart payment is still processing',
        });
      }
    }

    const order = await Order.findOne({ clientTxnId: txnId });
    
    if (!order) {
      console.log(`Order not found for clientTxnId: ${txnId}`);
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    const accessDenied = await enforceOrderAccess(request, order);
    if (accessDenied) return accessDenied;

    console.log(`Order found: ${order._id}, status: ${order.status}`);

    // If order is already confirmed, check if provisioning is needed
    if (order.status === 'confirmed') {
      console.log(`Order ${order._id} is already confirmed`);

      // Inventory / slot-IP fulfilment must run before any late auto-buy.
      // Otherwise a status poll can purchase from upstream while a webhook is
      // still allocating a pre-configured inventory row for the same payment.
      try {
        const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');
        await fulfillOrderInventory(order);
        const fresh = await Order.findById(order._id).lean();
        if (fresh) Object.assign(order, fresh);
      } catch (fulfillErr) {
        console.error('[PAYMENT-STATUS] Late inventory fulfilment failed:', fulfillErr?.message || fulfillErr);
      }

      const needsProvisioning =
        !order.ipAddress &&
        !order.inventoryItemId &&
        !order.slotIpId &&
        order.provisioningStatus !== 'completed' &&
        order.provisioningStatus !== 'in_progress' &&
        order.provisioningStatus !== 'provisioning' &&
        !order.slotIpPackageId;

      if (needsProvisioning) {
        console.log(`[PAYMENT-STATUS] Order ${order._id} confirmed but not provisioned, triggering now...`);
        const AutoProvisioningService = require('@/services/autoProvisioningService');
        try {
          const provisioningService = new AutoProvisioningService();
          provisioningService.provisionServer(order._id.toString())
            .then((result) => console.log(`[PAYMENT-STATUS] Late provisioning result for ${order._id}:`, result))
            .catch((error) => console.error(`[PAYMENT-STATUS] Late provisioning failed for ${order._id}:`, error));
        } catch (provisionError) {
          console.error('[PAYMENT-STATUS] Error starting late provisioning:', provisionError);
        }
      }

      return NextResponse.json({
        paymentStatus: 'SUCCESS',
        order: {
          id: order._id.toString(),
          status: order.status,
          productName: order.productName,
          memory: order.memory,
          price: order.price,
          clientTxnId: order.clientTxnId,
          createdAt: order.createdAt,
        },
        message: 'Order already confirmed',
      });
    }

    // Recover: probe Cashfree / Razorpay / UPI and confirm when gateway says paid
    const recovery = await recoverPendingOrderPayment(order, {
      maxAttempts: returnedFromPayment ? 5 : 2,
      delayMs: returnedFromPayment ? 1500 : 0,
      logSource: 'status-api',
    });

    if (recovery.confirmed) {
      const confirmedOrder = recovery.order || order;
      return NextResponse.json({
        paymentStatus: 'SUCCESS',
        order: {
          id: confirmedOrder._id.toString(),
          status: 'confirmed',
          productName: confirmedOrder.productName,
          memory: confirmedOrder.memory,
          price: confirmedOrder.price,
          clientTxnId: confirmedOrder.clientTxnId,
          createdAt: confirmedOrder.createdAt,
        },
        message: recovery.alreadyProcessed ? 'Order already confirmed' : 'Payment confirmed',
      });
    }

    const gatewayProbe = await probeGatewayPayment(order);

    if (gatewayProbe.success && order.status === 'pending') {
      const PaymentOrderLogger = require('@/services/paymentOrderLogger');
      const logger = PaymentOrderLogger.forOrder(order, 'status-api');
      logger.warning('Final probe: gateway PAID but order still pending (webhook/recovery missed)', {
        clientTxnId: order.clientTxnId,
        gatewayMethod: gatewayProbe.method,
        transactionId: gatewayProbe.transactionId,
      });
      logger.setPaymentInfo({
        method: gatewayProbe.method,
        gatewayStatus: 'SUCCESS',
        transactionId: gatewayProbe.transactionId,
        gatewayOrderId: gatewayProbe.gatewayOrderId,
      });
      await logger.save({
        success: false,
        anomaly: true,
        errorMessage: 'paid_but_order_pending_on_status_check',
      });
    }

    return NextResponse.json({
      paymentStatus: gatewayProbe.status || 'PENDING',
      order: {
        id: order._id.toString(),
        status: order.status,
        productName: order.productName,
        memory: order.memory,
        price: order.price,
        clientTxnId: order.clientTxnId,
        createdAt: order.createdAt,
      },
      message:
        gatewayProbe.status === 'PENDING' || !gatewayProbe.status
          ? 'Payment is still processing — please wait, do not retry payment'
          : 'Payment pending or failed',
    });
    
  } catch (error) {
    console.error('Error in payment status API:', error);
    return NextResponse.json(
      { message: 'Server error', ...customerApiCatchPayload(error.message) },
      { status: 500 }
    );
  } finally {
    console.log("========== PAYMENT STATUS API COMPLETED ==========");
  }
}