import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import userWalletService from '@/services/userWalletService';
import { assertIpStockPurchasable } from '@/lib/ipStockAvailability';
import { refreshAndVerifyPurchase } from '@/lib/syncIpStockBeforePurchase';
import { assignPanelCredentials } from '@/lib/panelCredentials';
import { calculateExpiryDate } from '@/lib/expiryHelper';
import NotificationService from '@/services/notificationService';
import { incrementApiUsage } from '@/lib/api-utils';

const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
const AutoProvisioningService = require('@/services/autoProvisioningService');
const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');

const ALLOWED_OS = ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'];

export function memoryOptionsToObject(memoryOptions) {
  if (!memoryOptions) return {};
  if (memoryOptions instanceof Map) return Object.fromEntries(memoryOptions);
  return memoryOptions;
}

export function formatServerProduct(stock) {
  const obj = stock.toObject ? stock.toObject() : stock;
  const options = memoryOptionsToObject(obj.memoryOptions);
  const plans = Object.entries(options).map(([memory, details]) => ({
    memory,
    price: details?.price ?? null,
    monthlyPrice: details?.price ?? null,
  }));

  const prices = plans.map((p) => p.price).filter((p) => typeof p === 'number' && p > 0);

  return {
    id: String(obj._id),
    name: obj.name,
    description: obj.description || '',
    serverType: obj.serverType,
    tags: obj.tags || [],
    available: !!obj.available,
    plans,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
}

export function normalizeOs(input) {
  if (!input) return 'Ubuntu 22';
  const value = String(input).trim();
  if (ALLOWED_OS.includes(value)) return value;
  const lower = value.toLowerCase();
  if (lower.includes('ubuntu')) return 'Ubuntu 22';
  if (lower.includes('centos')) return 'CentOS 7';
  if (lower.includes('windows')) return 'Windows 2022 64';
  return 'Ubuntu 22';
}

export function filterServerProducts(products, { location, minRam, maxPrice } = {}) {
  let filtered = products;

  if (location) {
    const q = location.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        (p.tags || []).some((t) => String(t).toLowerCase().includes(q)),
    );
  }

  if (minRam) {
    const min = parseInt(String(minRam).replace(/\D/g, ''), 10);
    if (Number.isFinite(min) && min > 0) {
      filtered = filtered.filter((p) =>
        p.plans.some((plan) => {
          const ram = parseInt(String(plan.memory).replace(/\D/g, ''), 10);
          return Number.isFinite(ram) && ram >= min;
        }),
      );
    }
  }

  if (maxPrice) {
    const max = Number(maxPrice);
    if (Number.isFinite(max) && max > 0) {
      filtered = filtered.filter((p) => p.minPrice != null && p.minPrice <= max);
    }
  }

  return filtered;
}

export async function purchaseServerViaApi(user, body) {
  await connectDB();

  const serverId = body.serverId || body.productId || body.ipStockId;
  const memory = body.memory || body.memoryOption;
  const specifications = body.specifications || {};
  const durationMonths = Math.max(1, parseInt(body.duration, 10) || 1);

  if (!serverId || !memory) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'serverId and memory are required',
        message: 'Provide serverId (product id) and memory plan key from GET /v1/servers',
      },
    };
  }

  const liveStock = await refreshAndVerifyPurchase({ ipStockId: serverId, memory });
  if (!liveStock.ok) {
    return {
      ok: false,
      status: 409,
      body: { error: 'Product unavailable', message: liveStock.message || 'Out of stock' },
    };
  }

  const stockCheck = await assertIpStockPurchasable(serverId, 1);
  if (!stockCheck.ok) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Product unavailable', message: stockCheck.message },
    };
  }

  const ipStock = stockCheck.stock;
  const memoryOption = ipStock.memoryOptions.get(memory);
  if (!memoryOption?.price) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Invalid memory plan', message: `Memory option "${memory}" is not available` },
    };
  }

  const monthlyPrice = memoryOption.price;
  const totalCost = monthlyPrice * durationMonths;
  let discount = 0;

  if (durationMonths >= 12) discount = totalCost * 0.15;
  else if (durationMonths >= 6) discount = totalCost * 0.1;
  else if (durationMonths >= 3) discount = totalCost * 0.05;

  const finalAmount = Math.round(totalCost - discount);
  const balance = await userWalletService.getBalance(user._id);

  if (balance < finalAmount) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'Insufficient wallet balance',
        message: `Your wallet balance (₹${balance}) is insufficient for this purchase (₹${finalAmount})`,
        code: 'INSUFFICIENT_BALANCE',
        required: finalAmount,
        available: balance,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const clientTxnId = `API_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const os = normalizeOs(specifications.os);
  const productName = `${ipStock.name} - ${memory}`;

  let expiryDate = await resolveOrderExpiryOnPayment({ ipStockId: serverId, productName });
  if (!expiryDate) expiryDate = calculateExpiryDate();

  const order = await Order.create({
    user: user._id,
    productName,
    memory,
    price: finalAmount,
    originalPrice: Math.round(totalCost),
    promoDiscount: Math.round(discount),
    ipStockId: String(serverId),
    clientTxnId,
    gatewayOrderId: clientTxnId,
    transactionId: clientTxnId,
    paymentMethod: 'wallet',
    status: 'confirmed',
    os,
    customerName: user.name,
    customerEmail: user.email,
    expiryDate,
    paymentDetails: {
      walletOnly: true,
      walletAmount: finalAmount,
      gatewayAmount: 0,
      purchasedViaAPI: true,
      durationMonths,
      specifications,
      confirmedAt: new Date(),
    },
  });

  let debitResult;
  try {
    debitResult = await userWalletService.debit(user._id, finalAmount, {
      description: `API purchase - ${productName}`,
      reference: order._id.toString(),
      metadata: {
        orderId: order._id,
        ipStockId: serverId,
        memory,
        durationMonths,
        clientTxnId,
      },
    });
  } catch (err) {
    await Order.findByIdAndDelete(order._id).catch(() => {});
    return {
      ok: false,
      status: 400,
      body: { error: 'Wallet debit failed', message: err.message },
    };
  }

  order.walletDeduction = {
    deducted: true,
    amount: finalAmount,
    transactionId: debitResult.walletTxnId,
    timestamp: new Date(),
  };
  order.transactionId = debitResult.walletTxnId;
  await order.save();

  await assignPanelCredentials(order);
  await order.save();
  await fulfillOrderInventory(order);

  await incrementApiUsage(user._id);

  try {
    await NotificationService.notifyOrderConfirmed(order.user, order);
  } catch (err) {
    console.error('[V1-API] notifyOrderConfirmed failed:', err.message);
  }

  try {
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
        } else if (!result.success && !result.alreadyProvisioning && !result.advpsPending && !result.resellerApiPending) {
          await NotificationService.notifyOrderFailed(order.user, order, result.error);
        }
      })
      .catch(async (error) => {
        if (!String(error.message).startsWith('ADVPS_PENDING')) {
          await NotificationService.notifyOrderFailed(order.user, order, error.message);
        }
      });
  } catch (err) {
    console.error('[V1-API] provisioning start failed:', err.message);
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      message: 'Server purchased successfully',
      order: {
        id: order._id,
        productName: order.productName,
        memory: order.memory,
        amount: finalAmount,
        originalAmount: Math.round(totalCost),
        discount: Math.round(discount),
        duration: durationMonths,
        os: order.os,
        status: order.status,
        expiryDate: order.expiryDate,
        estimatedDeployment: '5-15 minutes',
      },
      wallet: {
        previousBalance: debitResult.balanceBefore,
        newBalance: debitResult.balanceAfter,
        transactionId: debitResult.walletTxnId,
      },
    },
  };
}

export async function rebootOrderViaApi(user, orderId) {
  await connectDB();

  const order = await Order.findOne({ _id: orderId, user: user._id });
  if (!order) {
    return { ok: false, status: 404, body: { error: 'Order not found', message: 'Server order not found' } };
  }

  if (!['confirmed', 'active'].includes(String(order.status))) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Order not active', message: 'Only active orders can be rebooted' },
    };
  }

  let result;
  try {
    if (order.advpsServiceId) {
      const AdvpsAPI = require('@/services/advpsApi');
      const api = new AdvpsAPI();
      result = await api.reboot(order.advpsServiceId);
    } else if (order.hostycareServiceId) {
      const HostycareAPI = require('@/services/hostycareApi');
      const api = new HostycareAPI();
      result = await api.rebootService(order.hostycareServiceId);
    } else if (order.smartvpsServiceId || order.ipAddress) {
      const SmartVPSAPI = require('@/services/smartvpsApi');
      const api = new SmartVPSAPI();
      const id = order.smartvpsServiceId || order.ipAddress;
      await api.stopVps(id);
      result = await api.startVps(id);
    } else {
      return {
        ok: false,
        status: 400,
        body: {
          error: 'Reboot not supported',
          message: 'This order is not linked to an automated provider yet. Try again after provisioning completes.',
        },
      };
    }

    await Order.findByIdAndUpdate(order._id, {
      lastAction: 'reboot',
      lastActionTime: new Date(),
    });

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        message: 'Reboot initiated',
        orderId: String(order._id),
        result: result ?? { status: 'ok' },
      },
    };
  } catch (error) {
    console.error('[V1-API] reboot failed:', error.message);
    return {
      ok: false,
      status: 500,
      body: { error: 'Reboot failed', message: error.message },
    };
  }
}
