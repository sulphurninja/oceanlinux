import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';

const HostycareAPI = require('@/services/hostycareApi');
const SmartVPSAPI = require('@/services/smartvpsApi');

// Initialize payment gateways
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX'
  ? Cashfree.Environment.SANDBOX
  : Cashfree.Environment.PRODUCTION;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Helper to determine provider
async function getProviderFromOrder(order) {
  if (order.hostycareServiceId) return 'hostycare';

  if (order.ipStockId) {
    try {
      const ipStock = await IPStock.findById(order.ipStockId);
      if (ipStock?.tags?.includes('smartvps')) return 'smartvps';
    } catch (e) { }
  }

  if (order.smartvpsServiceId) return 'smartvps';

  if (order.productName?.includes('103.195') ||
    order.ipAddress?.startsWith('103.195') ||
    order.productName?.includes('🏅')) {
    return 'smartvps';
  }

  return 'oceanlinux';
}

// Check payment status for a pending renewal
async function checkPaymentStatus(pendingRenewal) {
  const { renewalTxnId, paymentMethod, gatewayOrderId } = pendingRenewal;

  // Check Razorpay
  if (paymentMethod === 'razorpay' && gatewayOrderId) {
    try {
      const razorpayOrder = await razorpay.orders.fetch(gatewayOrderId);
      if (razorpayOrder.status === 'paid') {
        const payments = await razorpay.orders.fetchPayments(gatewayOrderId);
        const successPayment = payments.items?.find(p => p.status === 'captured');
        return {
          success: true,
          paymentId: successPayment?.id || gatewayOrderId,
          method: 'razorpay'
        };
      }
    } catch (e) {
      console.error('[RECOVER] Razorpay check failed:', e.message);
    }
  }

  // Check Cashfree
  try {
    const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', renewalTxnId);
    if (cashfreeResponse.data?.length > 0) {
      const payment = cashfreeResponse.data[0];
      if (payment.payment_status === 'SUCCESS') {
        return {
          success: true,
          paymentId: payment.cf_payment_id,
          method: 'cashfree'
        };
      }
    }
  } catch (e) {
    console.error('[RECOVER] Cashfree check failed:', e.message);
  }

  return { success: false };
}

// Process a single renewal
async function processRenewal(order, paymentInfo) {
  const provider = await getProviderFromOrder(order);
  const pendingRenewal = order.pendingRenewal;

  // Calculate new expiry
  const currentExpiry = new Date(order.expiryDate);
  const now = new Date();
  const baseDate = currentExpiry > now ? currentExpiry : now;
  const newExpiryDate = new Date(baseDate);
  newExpiryDate.setDate(newExpiryDate.getDate() + 30);

  // Process provider-specific renewal
  let providerRenewalResult = null;
  let providerRenewalSuccess = false;

  if (provider === 'hostycare' && order.hostycareServiceId) {
    try {
      const api = new HostycareAPI();
      providerRenewalResult = await api.renewService(order.hostycareServiceId);
      providerRenewalSuccess = true;
    } catch (e) {
      providerRenewalResult = { error: e.message };
    }
  } else if (provider === 'smartvps') {
    const serviceId = order.smartvpsServiceId || order.ipAddress;
    if (serviceId) {
      try {
        const api = new SmartVPSAPI();
        providerRenewalResult = await api.renewVps(serviceId);
        providerRenewalSuccess = true;
      } catch (e) {
        providerRenewalResult = { error: e.message };
      }
    }
  } else {
    providerRenewalSuccess = true; // OceanLinux - no API call needed
  }

  // Create renewal record
  const renewalPayment = {
    paymentId: paymentInfo.paymentId,
    amount: pendingRenewal.amount || order.price,
    paidAt: new Date(),
    previousExpiry: currentExpiry,
    newExpiry: newExpiryDate,
    renewalTxnId: pendingRenewal.renewalTxnId,
    provider: provider,
    paymentMethod: paymentInfo.method,
    providerRenewalResult,
    providerRenewalSuccess,
    recoveredAt: new Date() // Mark as recovered
  };

  // Update order
  await Order.findByIdAndUpdate(order._id, {
    expiryDate: newExpiryDate,
    lastAction: 'renew',
    lastActionTime: new Date(),
    transactionId: paymentInfo.paymentId,
    paymentMethod: paymentInfo.method,
    $push: { renewalPayments: renewalPayment },
    $unset: { pendingRenewal: 1 }
  });

  return {
    orderId: order._id,
    productName: order.productName,
    provider,
    newExpiryDate,
    providerRenewalSuccess
  };
}

// GET - List all pending renewals (for admin dashboard)
export async function GET(request) {
  await connectDB();

  try {
    // Verify admin
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(userId);
    if (!user?.isAdmin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    // Find orders with pending renewals
    const pendingOrders = await Order.find({
      'pendingRenewal.renewalTxnId': { $exists: true, $ne: null }
    }).populate('user', 'name email').sort({ 'pendingRenewal.initiatedAt': -1 });

    // Check payment status for each
    const results = await Promise.all(pendingOrders.map(async (order) => {
      const paymentStatus = await checkPaymentStatus(order.pendingRenewal);
      const ageMinutes = Math.floor((Date.now() - new Date(order.pendingRenewal.initiatedAt)) / 60000);

      return {
        orderId: order._id,
        productName: order.productName,
        userName: order.user?.name || 'Unknown',
        userEmail: order.user?.email || 'Unknown',
        renewalTxnId: order.pendingRenewal.renewalTxnId,
        paymentMethod: order.pendingRenewal.paymentMethod,
        amount: order.pendingRenewal.amount,
        initiatedAt: order.pendingRenewal.initiatedAt,
        ageMinutes,
        currentExpiry: order.expiryDate,
        paymentSuccessful: paymentStatus.success,
        paymentId: paymentStatus.paymentId || null
      };
    }));

    // Separate into categories
    const paidButNotProcessed = results.filter(r => r.paymentSuccessful);
    const stillPending = results.filter(r => !r.paymentSuccessful && r.ageMinutes < 30);
    const stale = results.filter(r => !r.paymentSuccessful && r.ageMinutes >= 30);

    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        paidButNotProcessed: paidButNotProcessed.length,
        stillPending: stillPending.length,
        stale: stale.length
      },
      paidButNotProcessed,
      stillPending,
      stale
    });

  } catch (error) {
    console.error('[RECOVER-RENEWALS] Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch pending renewals',
      error: error.message
    }, { status: 500 });
  }
}

// POST - Recover/process pending renewals that have successful payments
export async function POST(request) {
  await connectDB();

  try {
    // Verify admin
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(userId);
    if (!user?.isAdmin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const { orderId, processAll } = await request.json();

    // Find orders to process
    let ordersToProcess = [];

    if (orderId) {
      // Process single order
      const order = await Order.findOne({
        _id: orderId,
        'pendingRenewal.renewalTxnId': { $exists: true, $ne: null }
      });
      if (order) ordersToProcess = [order];
    } else if (processAll) {
      // Find all with pending renewals
      ordersToProcess = await Order.find({
        'pendingRenewal.renewalTxnId': { $exists: true, $ne: null }
      });
    }

    if (ordersToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending renewals found to process',
        processed: 0
      });
    }

    console.log(`[RECOVER-RENEWALS] Processing ${ordersToProcess.length} orders...`);

    const results = {
      processed: [],
      skipped: [],
      failed: []
    };

    for (const order of ordersToProcess) {
      try {
        // Check if payment was successful
        const paymentStatus = await checkPaymentStatus(order.pendingRenewal);

        if (!paymentStatus.success) {
          results.skipped.push({
            orderId: order._id,
            reason: 'Payment not successful'
          });
          continue;
        }

        // Check if already processed (idempotency)
        const alreadyProcessed = order.renewalPayments?.some(
          rp => rp.renewalTxnId === order.pendingRenewal.renewalTxnId
        );

        if (alreadyProcessed) {
          // Just clear the pending renewal
          await Order.findByIdAndUpdate(order._id, {
            $unset: { pendingRenewal: 1 }
          });
          results.skipped.push({
            orderId: order._id,
            reason: 'Already processed'
          });
          continue;
        }

        // Process the renewal
        const result = await processRenewal(order, paymentStatus);
        results.processed.push(result);

        console.log(`[RECOVER-RENEWALS] ✅ Processed order ${order._id}`);

      } catch (error) {
        console.error(`[RECOVER-RENEWALS] ❌ Failed order ${order._id}:`, error);
        results.failed.push({
          orderId: order._id,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recovery complete`,
      summary: {
        processed: results.processed.length,
        skipped: results.skipped.length,
        failed: results.failed.length
      },
      results
    });

  } catch (error) {
    console.error('[RECOVER-RENEWALS] Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Recovery failed',
      error: error.message
    }, { status: 500 });
  }
}

// DELETE - Clear stale pending renewals (payment never completed)
export async function DELETE(request) {
  await connectDB();

  try {
    // Verify admin
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(userId);
    if (!user?.isAdmin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    const { olderThanMinutes = 60 } = await request.json().catch(() => ({}));

    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    // Find stale pending renewals where payment was never completed
    const staleOrders = await Order.find({
      'pendingRenewal.renewalTxnId': { $exists: true, $ne: null },
      'pendingRenewal.initiatedAt': { $lt: cutoffTime }
    });

    let clearedCount = 0;
    let skippedCount = 0;

    for (const order of staleOrders) {
      // Double-check payment wasn't successful
      const paymentStatus = await checkPaymentStatus(order.pendingRenewal);

      if (paymentStatus.success) {
        // Payment was actually successful! Process it instead
        skippedCount++;
        continue;
      }

      // Clear the stale pending renewal
      await Order.findByIdAndUpdate(order._id, {
        $unset: { pendingRenewal: 1 }
      });
      clearedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${clearedCount} stale pending renewals`,
      cleared: clearedCount,
      skipped: skippedCount
    });

  } catch (error) {
    console.error('[RECOVER-RENEWALS] Cleanup error:', error);
    return NextResponse.json({
      success: false,
      message: 'Cleanup failed',
      error: error.message
    }, { status: 500 });
  }
}


