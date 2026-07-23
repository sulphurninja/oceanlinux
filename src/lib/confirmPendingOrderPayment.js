import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';
import { getRazorpayClient } from '@/lib/razorpayClient';
import { assignPanelCredentials } from '@/lib/panelCredentials';
import NotificationService from '@/services/notificationService';

const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
const AutoProvisioningService = require('@/services/autoProvisioningService');
const WhatsAppService = require('@/services/whatsappService');
import userWalletService from '@/services/userWalletService';
const PaymentOrderLogger = require('@/services/paymentOrderLogger');

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment =
  process.env.CASHFREE_ENVIRONMENT === 'SANDBOX'
    ? Cashfree.Environment.SANDBOX
    : Cashfree.Environment.PRODUCTION;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gatewayMethodsForOrder(order) {
  const label = String(order.paymentMethod || '').toLowerCase();
  const methods = new Set();
  if (label.includes('cashfree')) methods.add('cashfree');
  if (label.includes('razorpay')) methods.add('razorpay');
  if (label.includes('upi')) methods.add('upi');
  if (methods.size === 0) {
    if (order.gatewayOrderId?.startsWith('order_')) methods.add('razorpay');
    else methods.add('cashfree');
    methods.add('upi');
  }
  return [...methods];
}

export async function verifyUPIPayment(clientTxnId) {
  const UPI_GATEWAY_KEY = process.env.UPI_GATEWAY_API_KEY;
  if (!UPI_GATEWAY_KEY) {
    return { verified: false, error: 'API key not configured' };
  }

  try {
    const response = await fetch('https://merchant.upigateway.com/api/check_order_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: UPI_GATEWAY_KEY, client_txn_id: clientTxnId }),
    });
    const data = await response.json();

    if (data.status === true && data.data?.status === 'success') {
      return {
        verified: true,
        amount: parseFloat(data.data.amount),
        upi_txn_id: data.data.upi_txn_id,
      };
    }
    return { verified: false, status: data.data?.status, error: data.msg };
  } catch (error) {
    return { verified: false, error: error.message };
  }
}

async function checkCashfreePayment(order) {
  const orderId = order.clientTxnId;
  const response = await Cashfree.PGOrderFetchPayments('2023-08-01', orderId);
  const payments = response?.data || [];
  const success = payments.find((p) => p.payment_status === 'SUCCESS');
  if (!success) {
    const latest = payments[0];
    return {
      success: false,
      status: latest?.payment_status || 'PENDING',
      method: 'cashfree',
    };
  }
  return {
    success: true,
    method: 'cashfree',
    transactionId: success.cf_payment_id,
    gatewayOrderId: orderId,
    paymentDetails: {
      cf_payment_id: success.cf_payment_id,
      cf_order_id: orderId,
      payment_status: success.payment_status,
      payment_amount: success.payment_amount,
      payment_currency: success.payment_currency,
      payment_time: success.payment_time,
      payment_method: success.payment_method,
      bank_reference: success.bank_reference,
      confirmedAt: new Date(),
    },
  };
}

async function checkRazorpayPayment(order) {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return { success: false, status: 'UNCONFIGURED', method: 'razorpay' };
  }

  const razorpayOrderId = order.gatewayOrderId;
  if (!razorpayOrderId) {
    return { success: false, status: 'PENDING', method: 'razorpay' };
  }

  const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
  if (razorpayOrder.status === 'paid') {
    const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
    const captured = payments.items?.find((p) => p.status === 'captured') || payments.items?.[0];
    return {
      success: true,
      method: 'razorpay',
      transactionId: captured?.id || razorpayOrderId,
      gatewayOrderId: razorpayOrderId,
      paymentDetails: {
        razorpay_payment_id: captured?.id,
        razorpay_order_id: razorpayOrderId,
        confirmedAt: new Date(),
      },
    };
  }

  if (razorpayOrder.status === 'attempted') {
    const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
    const captured = payments.items?.find((p) => p.status === 'captured');
    if (captured) {
      return {
        success: true,
        method: 'razorpay',
        transactionId: captured.id,
        gatewayOrderId: razorpayOrderId,
        paymentDetails: {
          razorpay_payment_id: captured.id,
          razorpay_order_id: razorpayOrderId,
          confirmedAt: new Date(),
        },
      };
    }
  }

  return {
    success: false,
    status: razorpayOrder.status === 'created' ? 'PENDING' : razorpayOrder.status.toUpperCase(),
    method: 'razorpay',
  };
}

async function checkUpiPayment(order) {
  const verification = await verifyUPIPayment(order.clientTxnId);
  if (!verification.verified) {
    return {
      success: false,
      status: verification.status?.toUpperCase() || 'PENDING',
      method: 'upi',
    };
  }

  const expectedAmount =
    Number(order.paymentDetails?.gatewayAmount) ||
    Math.max(0, Number(order.price) - (Number(order.walletDeduction?.amount) || 0));
  const paidAmount = verification.amount;
  if (expectedAmount > 0 && Math.abs(paidAmount - expectedAmount) > 1) {
    return {
      success: false,
      status: 'AMOUNT_MISMATCH',
      method: 'upi',
      error: `Expected ${expectedAmount}, paid ${paidAmount}`,
    };
  }

  return {
    success: true,
    method: 'upi',
    transactionId: verification.upi_txn_id || order.gatewayOrderId,
    gatewayOrderId: order.gatewayOrderId,
    paymentDetails: {
      upi_txn_id: verification.upi_txn_id,
      verified: true,
      verifiedAmount: paidAmount,
      confirmedAt: new Date(),
    },
  };
}

export async function probeGatewayPayment(order) {
  const methods = gatewayMethodsForOrder(order);
  let lastPending = { success: false, status: 'PENDING' };

  for (const method of methods) {
    try {
      let result;
      if (method === 'cashfree') result = await checkCashfreePayment(order);
      else if (method === 'razorpay') result = await checkRazorpayPayment(order);
      else if (method === 'upi') result = await checkUpiPayment(order);
      else continue;

      if (result.success) return result;
      lastPending = result;
    } catch (err) {
      console.error(`[confirmPendingOrderPayment] ${method} probe error:`, err.message);
    }
  }

  return lastPending;
}

/**
 * Deduct-on-success wallet charge. Charges the FULL intended wallet portion
 * the moment gateway payment lands. Mutates `order` in place on success.
 * Safe to call more than once (no-op once charged).
 *
 * Returns ok:false if the full wallet amount cannot be debited — callers must
 * NOT confirm the order in that case (prevents VPS delivery without wallet pay).
 */
export async function chargeDeferredWalletForOrder(order) {
  if (!order) return { ok: true, charged: 0 };
  const walletExpected =
    Number(order.walletDeduction?.amount) ||
    Number(order.paymentDetails?.walletAmount) ||
    0;
  if (order.walletDeduction?.deducted === true || walletExpected <= 0) {
    return { ok: true, charged: 0, alreadyCharged: order.walletDeduction?.deducted === true };
  }

  try {
    const debit = await userWalletService.debit(order.user, walletExpected, {
      description: `Wallet payment ${order.clientTxnId}`,
      reference: `${order.clientTxnId}_walletpay`,
      metadata: { orderId: String(order._id), reason: 'deduct_on_success' },
    });
    order.walletDeduction = {
      deducted: true,
      amount: walletExpected,
      transactionId: debit?.walletTxnId,
      timestamp: new Date(),
    };
    return { ok: true, charged: walletExpected };
  } catch (err) {
    console.error('[chargeDeferredWalletForOrder] wallet debit failed:', err.message);
    return {
      ok: false,
      charged: 0,
      shortfall: walletExpected,
      reason: 'insufficient_wallet_balance',
      error: err.message,
    };
  }
}

async function startProvisioningIfNeeded(order) {
  const freshOrder = await Order.findById(order._id);
  const alreadyProvisioning =
    freshOrder?.provisioningStatus === 'in_progress' ||
    freshOrder?.provisioningStatus === 'provisioning' ||
    freshOrder?.provisioningStatus === 'completed' ||
    freshOrder?.provisioningStatus === 'active' ||
    freshOrder?.ipAddress;

  if (alreadyProvisioning || freshOrder?.slotIpPackageId) return;

  try {
    await NotificationService.notifyOrderProvisioning(order.user, order);
  } catch (err) {
    console.error('[confirmPendingOrderPayment] provisioning notification error:', err.message);
  }

  const provisioningService = new AutoProvisioningService();
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

/**
 * If gateway reports SUCCESS, confirm a pending buy-now order.
 * Idempotent — safe when order is already confirmed.
 */
export async function confirmPendingOrderPayment(order, gatewayResult, opts = {}) {
  if (!order) return { confirmed: false, reason: 'order not found' };

  const parentLogger = opts.logger || null;
  const ownLogger =
    !parentLogger && opts.logSource
      ? PaymentOrderLogger.forOrder(order, opts.logSource)
      : null;
  const logger = parentLogger || ownLogger;

  if (logger) {
    logger.info('confirmPendingOrderPayment', {
      orderStatus: order.status,
      gatewaySuccess: !!gatewayResult?.success,
      gatewayMethod: gatewayResult?.method,
      gatewayStatus: gatewayResult?.status,
    });
    logger.setPaymentInfo({
      method: gatewayResult?.method,
      gatewayStatus: gatewayResult?.status || (gatewayResult?.success ? 'SUCCESS' : 'PENDING'),
      transactionId: gatewayResult?.transactionId,
      gatewayOrderId: gatewayResult?.gatewayOrderId,
    });
  }

  if (order.status === 'confirmed' || order.status === 'active') {
    if (ownLogger) {
      logger.info('Order already confirmed — idempotent skip');
      await ownLogger.save({ success: true });
    }
    return { confirmed: true, alreadyProcessed: true, order };
  }

  if (!gatewayResult?.success) {
    if (ownLogger) {
      await ownLogger.save({
        success: false,
        errorMessage: gatewayResult?.status || 'PENDING',
      });
    }
    return { confirmed: false, paymentStatus: gatewayResult?.status || 'PENDING' };
  }

  // Deduct-on-success: charge the wallet portion only now that the gateway
  // payment has actually landed. Covers deferred debits (mixed buy-now orders
  // created with deducted:false) and cancel→recover races alike.
  const walletCharge = await chargeDeferredWalletForOrder(order);
  if (!walletCharge.ok) {
    if (logger) {
      logger.error('Gateway paid but wallet portion could not be debited', walletCharge);
      if (ownLogger) {
        await ownLogger.save({
          success: false,
          anomaly: true,
          errorMessage: 'wallet_portion_unpaid',
        });
      }
    }
    return {
      confirmed: false,
      reason: 'wallet_portion_unpaid',
      paymentStatus: 'WALLET_REQUIRED',
    };
  }

  const expiryDate = await resolveOrderExpiryOnPayment(order);
  const walletPart = order.walletDeduction?.deducted ? 'wallet+' : '';
  const paymentMethod = walletPart + gatewayResult.method;

  order.status = 'confirmed';
  order.transactionId = gatewayResult.transactionId;
  order.gatewayOrderId = gatewayResult.gatewayOrderId || order.gatewayOrderId;
  order.paymentMethod = paymentMethod;
  if (expiryDate) order.expiryDate = expiryDate;
  order.paymentDetails = {
    ...(order.paymentDetails || {}),
    ...gatewayResult.paymentDetails,
    recoveredAt: new Date(),
  };
  delete order.paymentDetails.unpaidReleased;
  delete order.paymentDetails.unpaidReason;
  delete order.paymentDetails.unpaidReleasedAt;

  await assignPanelCredentials(order);
  await order.save();

  const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');
  const inventoryResult = await fulfillOrderInventory(order);
  if (logger && inventoryResult && !inventoryResult.skipped) {
    logger.info('Order inventory fulfilled', inventoryResult);
  }

  try {
    await NotificationService.notifyOrderConfirmed(order.user, order);
  } catch (err) {
    console.error('[confirmPendingOrderPayment] notify confirm error:', err.message);
  }

  await startProvisioningIfNeeded(order);

  if (ownLogger) {
    logger.success('Order confirmed and saved', {
      orderId: String(order._id),
      paymentMethod,
      transactionId: gatewayResult.transactionId,
    });
    await ownLogger.save({ success: true });
  }

  return { confirmed: true, order, paymentStatus: 'SUCCESS', paymentMethod };
}

/**
 * Poll gateway APIs (with short delays) and confirm when payment landed.
 */
export async function recoverPendingOrderPayment(order, opts = {}) {
  const { maxAttempts = 4, delayMs = 2000, logSource } = opts;
  if (!order) return { confirmed: false, reason: 'order not found' };

  const logger = logSource ? PaymentOrderLogger.forOrder(order, logSource) : null;
  if (logger) {
    logger.info('Payment recovery started', {
      orderStatus: order.status,
      clientTxnId: order.clientTxnId,
      maxAttempts,
      delayMs,
    });
  }

  if (order.status === 'confirmed' || order.status === 'active') {
    if (logger) {
      logger.info('Order already confirmed');
      await logger.save({ success: true });
    }
    return { confirmed: true, alreadyProcessed: true, order };
  }

  let lastResult = { success: false, status: 'PENDING' };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    lastResult = await probeGatewayPayment(order);
    if (logger) {
      logger.debug(`Gateway probe attempt ${attempt + 1}/${maxAttempts}`, {
        success: lastResult.success,
        status: lastResult.status,
        method: lastResult.method,
      });
    }
    if (lastResult.success) {
      const confirmResult = await confirmPendingOrderPayment(order, lastResult, { logger });
      if (confirmResult.confirmed) {
        if (logger) {
          logger.success('Recovery confirmed order via gateway probe');
          await logger.save({ success: true });
        }
        return confirmResult;
      }
      if (logger) {
        logger.warning('Gateway SUCCESS but confirmPendingOrderPayment failed', {
          reason: confirmResult.reason,
          paymentStatus: confirmResult.paymentStatus,
        });
        await logger.save({
          success: false,
          anomaly: true,
          errorMessage: confirmResult.reason || 'confirm_failed_despite_gateway_success',
        });
      }
      return { ...confirmResult, anomaly: true };
    }
    if (lastResult.status && !['PENDING', 'CREATED', 'ATTEMPTED'].includes(lastResult.status)) {
      break;
    }
  }

  const freshOrder = await Order.findById(order._id);
  const finalProbe = await probeGatewayPayment(freshOrder || order);
  const isAnomaly =
    finalProbe.success &&
    freshOrder &&
    freshOrder.status !== 'confirmed' &&
    freshOrder.status !== 'active';

  if (logger) {
    if (isAnomaly) {
      logger.warning('ANOMALY: Gateway shows PAID but order still pending after recovery', {
        orderStatus: freshOrder?.status,
        gatewayMethod: finalProbe.method,
        transactionId: finalProbe.transactionId,
      });
      logger.setPaymentInfo({
        method: finalProbe.method,
        gatewayStatus: 'SUCCESS',
        transactionId: finalProbe.transactionId,
        gatewayOrderId: finalProbe.gatewayOrderId,
      });
    } else {
      logger.info('Recovery finished without confirming order', {
        gatewayStatus: lastResult.status || 'PENDING',
        orderStatus: freshOrder?.status || order.status,
      });
    }
    await logger.save({
      success: false,
      anomaly: isAnomaly,
      errorMessage: isAnomaly ? 'paid_but_order_pending' : lastResult.status || 'PENDING',
    });
  }

  return {
    confirmed: false,
    paymentStatus: lastResult.status || 'PENDING',
    order: freshOrder || order,
    anomaly: isAnomaly,
  };
}
