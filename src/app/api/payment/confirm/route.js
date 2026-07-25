import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';
import crypto from 'crypto';
import NotificationService from '@/services/notificationService';
import { assignPanelCredentials } from '@/lib/panelCredentials';
const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
const AutoProvisioningService = require('@/services/autoProvisioningService');
const WhatsAppService = require('@/services/whatsappService');
import { enforceOrderAccess } from '@/lib/apiSecurity';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';
const { customerApiCatchPayload } = require('@/lib/customerFacingErrors');
import { chargeDeferredWalletForOrder, recoverPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import { verifyRazorpaySignature } from '@/lib/paymentGateways';
import { toQueryString } from '@/lib/queryIds';

function resolveGatewayMethod(paymentMethod, order) {
  const raw = String(paymentMethod || order?.paymentMethod || 'razorpay').toLowerCase();
  if (raw.includes('razorpay')) return 'razorpay';
  if (raw.includes('upi')) return 'upi';
  if (raw.includes('cashfree')) return 'cashfree';
  return 'razorpay';
}

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

export async function POST(request) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  await connectDB();

  console.log("========== PAYMENT CONFIRMATION API ==========");

  try {
    const body = await request.json();
    const { clientTxnId, orderId, paymentMethod, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

    console.log('[Payment Confirm] Request body:', { clientTxnId, orderId, paymentMethod, razorpay_payment_id });

    // Coerced to a string: a raw object here would be read as Mongo query
    // operators and match somebody else's order.
    const orderIdentifier = toQueryString(clientTxnId) || toQueryString(orderId);

    if (!orderIdentifier) {
      return NextResponse.json(
        { success: false, message: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Find the order in our database
    const order = await Order.findOne({ clientTxnId: orderIdentifier });
    if (!order) {
      console.error(`Order not found: ${orderIdentifier}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    const accessDenied = await enforceOrderAccess(request, order);
    if (accessDenied) return accessDenied;

    console.log(`[Payment Confirm] Found order: ${order._id}, Payment method: ${order.paymentMethod || paymentMethod || 'cashfree'}`);

    // Determine payment method (wallet+razorpay → razorpay, etc.)
    const method = resolveGatewayMethod(paymentMethod, order);

    if (order.status === 'confirmed' || order.status === 'active') {
      return NextResponse.json({
        success: true,
        message: 'Payment already confirmed',
        orderId: order._id,
        alreadyProcessed: true,
      });
    }

    // Verify payment based on method
    if (method === 'upi') {
      console.log(`Verifying UPI payment for order: ${orderIdentifier}`);
      
      // For UPI Gateway, payment confirmation happens via webhook
      // This endpoint is called from frontend after redirect
      // Check if order is already confirmed by webhook
      if (order.status === 'confirmed') {
        console.log(`[UPI] Order ${order._id} already confirmed by webhook`);
        
        // Check if provisioning is needed (might have been missed by webhook)
        if (!order.ipAddress && order.provisioningStatus !== 'completed' && order.provisioningStatus !== 'in_progress') {
          console.log(`[UPI] Order ${order._id} needs provisioning, triggering now...`);
          // Don't return early - let it fall through to provisioning section
        } else {
          console.log(`[UPI] Order ${order._id} already provisioned or in progress`);
          return NextResponse.json({
            success: true,
            message: 'Payment already confirmed',
            orderId: order._id
          });
        }
      } else {
        // Order not yet confirmed, webhook might be pending
        console.log(`[UPI] Order ${order._id} awaiting webhook confirmation`);
        return NextResponse.json(
          { success: true, message: 'Payment pending confirmation', status: 'pending' },
          { status: 200 }
        );
      }

    } else if (method === 'razorpay') {
      console.log(`Verifying Razorpay payment for order: ${orderIdentifier}`);
      
      // Verify signature — if missing (callback recovery), probe Razorpay API directly
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        const recovery = await recoverPendingOrderPayment(order, { maxAttempts: 3, delayMs: 1000 });
        if (recovery.confirmed) {
          return NextResponse.json({
            success: true,
            message: 'Payment confirmed via gateway recovery',
            orderId: order._id,
            recovered: true,
          });
        }
        return NextResponse.json(
          { success: false, message: 'Missing Razorpay payment details' },
          { status: 400 }
        );
      }

      // No stored gateway order id to bind against (legacy row) — the only safe
      // route is to ask Razorpay directly rather than trust the posted ids.
      if (!order.gatewayOrderId) {
        const recovery = await recoverPendingOrderPayment(order, { maxAttempts: 3, delayMs: 1000 });
        if (recovery.confirmed) {
          return NextResponse.json({
            success: true,
            message: 'Payment confirmed via gateway recovery',
            orderId: order._id,
            recovered: true,
          });
        }
        return NextResponse.json(
          { success: false, message: 'Payment verification failed' },
          { status: 400 }
        );
      }

      const signatureOk = verifyRazorpaySignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        expectedOrderId: order.gatewayOrderId,
      });

      if (!signatureOk) {
        console.error('Razorpay signature verification failed');
        return NextResponse.json(
          { success: false, message: 'Payment verification failed' },
          { status: 400 }
        );
      }

      // ADVPS: expiry comes from upstream when service is linked; others use days-in-month
      const expiryDate = await resolveOrderExpiryOnPayment(order);

      // Deduct-on-success: charge the deferred wallet portion now that Razorpay paid.
      const walletCharge = await chargeDeferredWalletForOrder(order);
      if (!walletCharge.ok) {
        return NextResponse.json(
          { success: false, message: 'Insufficient wallet balance to complete this order. Please top up your wallet and contact support.' },
          { status: 400 }
        );
      }

      // Update order status and store payment details
      order.status = 'confirmed';
      order.transactionId = razorpay_payment_id;
      order.gatewayOrderId = razorpay_order_id;
      order.paymentMethod = order.walletDeduction?.deducted ? `wallet+razorpay` : 'razorpay';
      if (expiryDate) order.expiryDate = expiryDate;
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        confirmedAt: new Date(),
      };
      await assignPanelCredentials(order);
      await order.save();

      console.log(`Order ${order._id} confirmed with Razorpay payment ${razorpay_payment_id} (order: ${razorpay_order_id})`);
      console.log(`Order expiry set to: ${expiryDate ? expiryDate.toISOString() : 'deferred (ADVPS upstream)'}`);

    } else {
      // Cashfree verification
      console.log(`Verifying Cashfree payment for order: ${orderIdentifier}`);
      
      try {
        const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', orderIdentifier);
        console.log('Cashfree payment verification response:', cashfreeResponse.data);

        // Check if payment is successful
        if (!cashfreeResponse.data || cashfreeResponse.data.length === 0) {
          return NextResponse.json(
            { success: false, message: 'No payment found for this order' },
            { status: 400 }
          );
        }

        const payment = cashfreeResponse.data[0];
        
        if (payment.payment_status !== 'SUCCESS') {
          return NextResponse.json(
            { success: false, message: 'Payment not successful' },
            { status: 400 }
          );
        }

        // ADVPS: expiry comes from upstream when service is linked; others use days-in-month
        const expiryDate = await resolveOrderExpiryOnPayment(order);

        // Deduct-on-success: charge the deferred wallet portion now that Cashfree paid.
        const walletCharge = await chargeDeferredWalletForOrder(order);
        if (!walletCharge.ok) {
          return NextResponse.json(
            { success: false, message: 'Insufficient wallet balance to complete this order. Please top up your wallet and contact support.' },
            { status: 400 }
          );
        }

        // Update order status and store payment details
        order.status = 'confirmed';
        order.transactionId = payment.cf_payment_id;
        order.gatewayOrderId = order.clientTxnId;
        order.paymentMethod = order.walletDeduction?.deducted ? `wallet+cashfree` : 'cashfree';
        if (expiryDate) order.expiryDate = expiryDate;
        order.paymentDetails = {
          cf_payment_id: payment.cf_payment_id,
          cf_order_id: order.clientTxnId,
          payment_status: payment.payment_status,
          payment_amount: payment.payment_amount,
          payment_currency: payment.payment_currency,
          payment_time: payment.payment_time,
          payment_method: payment.payment_method,
          bank_reference: payment.bank_reference,
          confirmedAt: new Date()
        };
        await assignPanelCredentials(order);
        await order.save();

        console.log(`Order ${order._id} confirmed with Cashfree payment ${payment.cf_payment_id} (order: ${order.clientTxnId})`);
        console.log(`Order expiry set to: ${expiryDate ? expiryDate.toISOString() : 'deferred (ADVPS upstream)'}`);

      } catch (cashfreeError) {
        console.error('Cashfree verification error:', cashfreeError);
        return NextResponse.json(
          { success: false, message: 'Payment verification failed', error: cashfreeError.message },
          { status: 500 }
        );
      }
    }

    // Send notifications
    try {
      await NotificationService.notifyOrderConfirmed(order.user, order);
    } catch (notifError) {
      console.error('Failed to create payment confirmation notification:', notifError);
    }

    const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');
    await fulfillOrderInventory(order);

    try {
      const freshOrder = await Order.findById(order._id);
      if (freshOrder?.slotIpPackageId || freshOrder?.inventoryItemId || freshOrder?.ipAddress) {
        console.log(`[PAYMENT-CONFIRM] Pre-assigned inventory — skipping auto-provisioning`);
        try {
          if (NotificationService.isOrderDeliverable(freshOrder)) {
            await NotificationService.notifyOrderCompleted(order.user, freshOrder, {
              ipAddress: freshOrder.ipAddress,
              username: freshOrder.username,
              password: freshOrder.password,
            });
          }
        } catch (completeErr) {
          console.error('[PAYMENT-CONFIRM] Failed to notify inventory order completion:', completeErr.message);
        }
      } else if (
        freshOrder?.provisioningStatus === 'provisioning' ||
        freshOrder?.provisioningStatus === 'active'
      ) {
        console.log(`[PAYMENT-CONFIRM] Order ${order._id} already provisioning/provisioned, skipping`);
      } else {
        console.log(`[PAYMENT-CONFIRM] Starting auto-provisioning for order ${order._id}`);
        const provisioningService = new AutoProvisioningService();
        await NotificationService.notifyOrderProvisioning(order.user, order);
        provisioningService
          .provisionServer(order._id.toString())
          .then(async (result) => {
            if (result.success && !result.alreadyProvisioned && !result.alreadyProvisioning) {
              await NotificationService.notifyOrderCompleted(order.user, order, {
                ipAddress: result.ipAddress || 'Available in dashboard',
                username: result.username || 'root',
                password: result.password || 'Check dashboard',
              });
              WhatsAppService.notifyOrderViaWhatsApp(order.user, order).catch(() => {});
            } else if (!result.success && !result.alreadyProvisioning && !result.advpsPending && !result.resellerApiPending) {
              await NotificationService.notifyOrderFailed(order.user, order, result.error);
            }
          })
          .catch(async (error) => {
            if (!String(error.message).startsWith('ADVPS_PENDING')) {
              await NotificationService.notifyOrderFailed(order.user, order, error.message);
            }
          });
      }
    } catch (error) {
      console.error('[PAYMENT-CONFIRM] Error starting auto-provisioning:', error);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed and order processed',
      orderId: order._id
    });

  } catch (error) {
    console.error('Payment confirmation error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', ...customerApiCatchPayload(error.message) },
      { status: 500 }
    );
  }
}
