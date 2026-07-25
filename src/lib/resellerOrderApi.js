import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import Reseller from '@/models/resellerModel';
import { assertIpStockPurchasable } from '@/lib/ipStockAvailability';
import { refreshAndVerifyPurchase } from '@/lib/syncIpStockBeforePurchase';
import { assignPanelCredentials } from '@/lib/panelCredentials';
import { calculateExpiryDate } from '@/lib/expiryHelper';
import NotificationService from '@/services/notificationService';
import ResellerWalletService from '@/services/resellerWalletService';
import { normalizeOs } from '@/lib/v1ServerApi';

const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
const AutoProvisioningService = require('@/services/autoProvisioningService');
const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');

export function memoryOptionsToObject(memoryOptions) {
  if (!memoryOptions) return {};
  if (memoryOptions instanceof Map) return Object.fromEntries(memoryOptions);
  return memoryOptions;
}

/** Reseller price for one memory plan (custom price → global markup → base). */
export function calculateResellerPlanPrice(reseller, productId, memoryOption, basePrice) {
  let price = basePrice;

  const priceKey = `${productId}_${memoryOption}`;
  const customPrices = reseller.pricing?.customPrices;
  if (customPrices) {
    let custom = null;
    if (customPrices instanceof Map) custom = customPrices.get(priceKey);
    else if (typeof customPrices === 'object') custom = customPrices[priceKey];
    if (custom && Number(custom) > 0) return Math.ceil(Number(custom));
  }

  if (reseller.pricing?.globalMarkup?.enabled) {
    const { type, value } = reseller.pricing.globalMarkup;
    if (type === 'percentage') price += basePrice * (value / 100);
    else if (type === 'fixed') price += value;
  }

  return Math.ceil(price);
}

export function formatResellerProduct(stock, reseller) {
  const obj = stock.toObject ? stock.toObject() : stock;
  const options = memoryOptionsToObject(obj.memoryOptions);
  const memoryOptions = {};

  for (const [key, details] of Object.entries(options || {})) {
    if (!details?.price) continue;
    memoryOptions[key] = {
      ...details,
      price: calculateResellerPlanPrice(reseller, String(obj._id), key, details.price),
      basePrice: details.price,
    };
  }

  return {
    _id: String(obj._id),
    id: String(obj._id),
    name: obj.name,
    description: obj.description || '',
    serverType: obj.serverType,
    tags: obj.tags || [],
    available: !!obj.available,
    memoryOptions,
  };
}

export function sanitizeResellerOrder(order) {
  if (!order) return null;
  const o = order.toObject ? order.toObject() : order;
  return {
    id: String(o._id),
    _id: String(o._id),
    productName: o.productName,
    memory: o.memory,
    price: o.price,
    status: o.status,
    provisioningStatus: o.provisioningStatus || 'pending',
    ipAddress: o.ipAddress || null,
    username: o.username || null,
    password: o.password || null,
    os: o.os || null,
    expiryDate: o.expiryDate || null,
    customerEmail: o.apiMetadata?.endUserEmail || o.customerEmail || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export async function createResellerOrder(reseller, body) {
  await connectDB();

  const productId = body.productId || body.serverId;
  const memoryOption = body.memoryOption || body.memory;
  const userEmail = body.userEmail || body.customerEmail || '';
  const os = normalizeOs(body.os || body.specifications?.os);

  if (!productId || !memoryOption) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'productId and memoryOption are required',
      },
    };
  }

  if (!reseller.userId) {
    return {
      ok: false,
      status: 500,
      body: { success: false, message: 'Reseller account is not linked to a user' },
    };
  }

  const liveStock = await refreshAndVerifyPurchase({ ipStockId: productId, memory: memoryOption });
  if (!liveStock.ok) {
    return {
      ok: false,
      status: 409,
      body: { success: false, message: liveStock.message || 'Product unavailable' },
    };
  }

  const stockCheck = await assertIpStockPurchasable(productId, 1);
  if (!stockCheck.ok) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: stockCheck.message },
    };
  }

  const product = stockCheck.stock;
  const option = product.memoryOptions.get(memoryOption);
  if (!option?.price) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: `Invalid memory option: ${memoryOption}` },
    };
  }

  const finalPrice = calculateResellerPlanPrice(
    reseller,
    String(product._id),
    memoryOption,
    option.price,
  );

  const hasFunds = await ResellerWalletService.hasSufficientBalance(reseller._id, finalPrice);
  if (!hasFunds) {
    return {
      ok: false,
      status: 402,
      body: {
        success: false,
        message: 'Insufficient wallet balance',
        required: finalPrice,
      },
    };
  }

  const clientTxnId = `RESELLER_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  let expiryDate = await resolveOrderExpiryOnPayment({
    ipStockId: productId,
    productName: product.name,
  });
  if (!expiryDate) expiryDate = calculateExpiryDate();

  const order = await Order.create({
    user: reseller.userId,
    resellerId: reseller._id,
    productName: `${product.name} - ${memoryOption}`,
    memory: memoryOption,
    price: finalPrice,
    originalPrice: option.price,
    ipStockId: String(product._id),
    clientTxnId,
    gatewayOrderId: clientTxnId,
    paymentMethod: 'reseller_wallet',
    status: 'pending',
    os,
    customerEmail: userEmail || undefined,
    expiryDate,
    paymentDetails: {
      walletOnly: true,
      walletAmount: finalPrice,
      purchasedViaResellerApi: true,
      resellerId: String(reseller._id),
    },
    apiMetadata: {
      endUserEmail: userEmail || '',
      resellerBusinessName: reseller.businessName || '',
    },
    pricing: {
      basePrice: option.price,
      resellerPrice: finalPrice,
      markup: finalPrice - option.price,
    },
  });

  try {
    await ResellerWalletService.deductForOrder(
      reseller._id,
      finalPrice,
      order._id,
      `Reseller API order ${order._id} — ${product.name} (${memoryOption}) @ ₹${finalPrice}`,
    );
  } catch (err) {
    await Order.findByIdAndDelete(order._id).catch(() => {});
    return {
      ok: false,
      status: 402,
      body: { success: false, message: err.message || 'Wallet deduction failed' },
    };
  }

  order.transactionId = clientTxnId;
  order.status = 'confirmed';
  order.paymentDetails = {
    ...(order.paymentDetails || {}),
    confirmedAt: new Date(),
  };
  await order.save();

  await assignPanelCredentials(order);
  await fulfillOrderInventory(order);

  try {
    await NotificationService.notifyOrderConfirmed(order.user, order);
    await NotificationService.notifyOrderProvisioning(order.user, order);
  } catch (err) {
    console.error('[RESELLER-ORDER] notification failed:', err.message);
  }

  try {
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
        }
      })
      .catch((err) => console.error('[RESELLER-ORDER] provision failed:', err.message));
  } catch (err) {
    console.error('[RESELLER-ORDER] provision start failed:', err.message);
  }

  const freshReseller = await Reseller.findById(reseller._id).lean();

  return {
    ok: true,
    status: 201,
    body: {
      success: true,
      message: 'Order created successfully',
      order: sanitizeResellerOrder(order),
      walletBalance: freshReseller?.wallet?.balance ?? 0,
      creditLimit: freshReseller?.wallet?.creditLimit ?? 0,
    },
  };
}
