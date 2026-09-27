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
import { getCustomPriceForStockMemory } from '@/lib/resellerPlanGroups';

const SlotIPPackage = require('@/models/slotIpPackageModel');

const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
const AutoProvisioningService = require('@/services/autoProvisioningService');
const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');

export function memoryOptionsToObject(memoryOptions) {
  if (!memoryOptions) return {};
  if (memoryOptions instanceof Map) return Object.fromEntries(memoryOptions);
  return memoryOptions;
}

/** Reseller price for one memory plan (custom price → global markup → base). */
export function calculateResellerPlanPrice(reseller, productId, memoryOption, basePrice, extra = {}) {
  let price = basePrice;
  const fallbackMemoryKeys = Array.isArray(extra.fallbackMemoryKeys) ? extra.fallbackMemoryKeys : [];
  const keys = [memoryOption, ...fallbackMemoryKeys].filter(Boolean);

  const customPrices = reseller.pricing?.customPrices;
  if (customPrices) {
    for (const mem of keys) {
      const custom = getCustomPriceForStockMemory(productId, mem, customPrices);
      if (custom > 0) return Math.ceil(custom);
    }
  }

  if (reseller.pricing?.globalMarkup?.enabled) {
    const { type, value } = reseller.pricing.globalMarkup;
    if (type === 'percentage') price += basePrice * (value / 100);
    else if (type === 'fixed') price += value;
  }

  return Math.ceil(price);
}

/**
 * Provisioning runs after the wallet is already debited, so an upstream
 * failure (no capacity at the provider, plan sold out between the stock check
 * and the purchase) would otherwise leave the reseller paying for a server
 * they never got. Put the money back and mark the order failed.
 *
 * Idempotent: a second call for the same order is a no-op.
 */
async function refundUnfulfilledResellerOrder(order, reseller, amount, reason) {
  try {
    const fresh = await Order.findById(order._id).select('walletDeduction status');
    if (!fresh || fresh.walletDeduction?.refunded) return;

    await ResellerWalletService.refundOrder(
      reseller._id,
      amount,
      order._id,
      `Refund for failed order ${order._id} — ${reason || 'provisioning failed'}`,
    );

    await Order.findByIdAndUpdate(order._id, {
      status: 'failed',
      provisioningStatus: 'failed',
      provisioningError: reason || 'Provisioning failed — amount refunded to wallet',
    });

    console.log(`[RESELLER-ORDER] refunded ₹${amount} for failed order ${order._id}`);
  } catch (err) {
    console.error('[RESELLER-ORDER] refund failed:', err.message);
  }
}

function countAvailableSlotIps(pkg) {
  const ips = pkg?.ips || [];
  return ips.filter((ip) => !ip.allocated).length;
}

export function slotPackageInStock(pkg) {
  if (!pkg || pkg.available === false) return false;
  return countAvailableSlotIps(pkg) > 0;
}

export function formatResellerSlotProduct(pkg, reseller) {
  const obj = pkg.toObject ? pkg.toObject() : pkg;
  const availableCount = countAvailableSlotIps(obj);
  const basePrice = Number(obj.price) || 0;
  const price = calculateResellerPlanPrice(reseller, String(obj._id), 'slot', basePrice);

  return {
    _id: String(obj._id),
    id: String(obj._id),
    productType: 'slotip',
    slotIpPackageId: String(obj._id),
    name: obj.name,
    description: obj.description || '',
    serverType: 'SlotIP',
    tags: ['slotip'],
    available: slotPackageInStock(obj),
    inStock: slotPackageInStock(obj),
    price,
    basePrice,
    availableCount,
    totalCount: (obj.ips || []).length,
    memoryOptions: {
      slot: { price, basePrice },
    },
  };
}

export function formatResellerProduct(stock, reseller) {
  const obj = stock.toObject ? stock.toObject() : stock;
  const options = memoryOptionsToObject(obj.memoryOptions);
  const {
    isNetbayProxyStock,
    listNetbayGroupTags,
    pickPricedMemoryKey,
  } = require('@/lib/netbayGroupTags');
  const proxy = isNetbayProxyStock(obj);

  if (proxy) {
    const billingKey = pickPricedMemoryKey(options);
    const details = options[billingKey];
    const basePrice = Number(details?.price) || 0;
    const tags = listNetbayGroupTags(obj);
    const fallbackMemoryKeys = [billingKey, '4GB', 'proxy', 'slot'].filter(Boolean);
    const memoryOptions = {};
    const keys = tags.length ? tags : (billingKey ? [billingKey] : []);
    for (const key of keys) {
      if (!basePrice) continue;
      memoryOptions[key] = {
        ...(details || {}),
        price: calculateResellerPlanPrice(reseller, String(obj._id), key, basePrice, {
          fallbackMemoryKeys,
        }),
        basePrice,
      };
    }
    return {
      _id: String(obj._id),
      id: String(obj._id),
      productType: 'proxy',
      name: obj.name,
      description: obj.description || '',
      serverType: obj.serverType || 'Proxy',
      tags: obj.tags || [],
      available: !!obj.available,
      inStock: !!obj.available,
      os: 'PROXY',
      groupTags: tags,
      memoryOptions,
    };
  }

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
    productType: 'vps',
    name: obj.name,
    description: obj.description || '',
    serverType: obj.serverType,
    tags: obj.tags || [],
    available: !!obj.available,
    inStock: !!obj.available,
    memoryOptions,
  };
}

export function sanitizeResellerOrder(order) {
  if (!order) return null;
  const o = order.toObject ? order.toObject() : order;
  return {
    id: String(o._id),
    _id: String(o._id),
    productType: o.slotIpPackageId ? 'slotip' : (o.netbayProductKind === 'proxy' ? 'proxy' : 'vps'),
    slotIpPackageId: o.slotIpPackageId ? String(o.slotIpPackageId) : null,
    ipStockId: o.ipStockId ? String(o.ipStockId) : null,
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

  const productId = body.productId || body.planId || body.plan_id || body.serverId;
  const slotIpPackageId =
    body.slotIpPackageId ||
    (body.productType === 'slotip' && productId ? productId : null);

  if (slotIpPackageId) {
    return createResellerSlotOrder(reseller, body, slotIpPackageId);
  }

  const memoryOption = body.memoryOption || body.memory || body.groupTag || body.netbayGroupTag;
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
  const {
    isNetbayProxyStock,
    resolveNetbayBillingMemory,
    resolveNetbayGroupTag,
    pickPricedMemoryKey,
  } = require('@/lib/netbayGroupTags');
  const proxy = isNetbayProxyStock(product);
  const billingMemory = proxy
    ? (resolveNetbayBillingMemory(product, memoryOption) || pickPricedMemoryKey(memoryOptionsToObject(product.memoryOptions)))
    : memoryOption;
  const mo = memoryOptionsToObject(product.memoryOptions);
  const option = mo[billingMemory] || mo[memoryOption];
  if (!option?.price) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: `Invalid memory option: ${memoryOption}` },
    };
  }

  const groupTag = resolveNetbayGroupTag(
    product,
    body.groupTag || body.netbayGroupTag || (proxy ? memoryOption : ''),
  );

  const finalPrice = calculateResellerPlanPrice(
    reseller,
    String(product._id),
    proxy ? (groupTag || memoryOption) : memoryOption,
    option.price,
    proxy ? { fallbackMemoryKeys: [billingMemory, '4GB', 'proxy', 'slot'] } : {},
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
    productName: `${product.name} - ${proxy && groupTag ? groupTag : memoryOption}`,
    memory: proxy && groupTag ? groupTag : memoryOption,
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
    netbayGroupTag: groupTag || undefined,
    netbayProductKind: proxy ? 'proxy' : undefined,
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

  const paidOrder = (await Order.findById(order._id)) || order;
  await assignPanelCredentials(paidOrder);
  await fulfillOrderInventory(paidOrder);

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
          return;
        }
        // provisionServer resolves (not rejects) with success:false, so this is
        // the only place an upstream out-of-stock actually surfaces.
        // alreadyProvisioning means another worker holds the lock — not a failure.
        if (!result.success && !result.alreadyProvisioning) {
          await refundUnfulfilledResellerOrder(order, reseller, finalPrice, result.error);
        }
      })
      .catch(async (err) => {
        console.error('[RESELLER-ORDER] provision failed:', err.message);
        await refundUnfulfilledResellerOrder(order, reseller, finalPrice, err.message);
      });
  } catch (err) {
    console.error('[RESELLER-ORDER] provision start failed:', err.message);
    await refundUnfulfilledResellerOrder(order, reseller, finalPrice, err.message);
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

async function createResellerSlotOrder(reseller, body, slotIpPackageId) {
  const userEmail = body.userEmail || body.customerEmail || '';

  if (!reseller.userId) {
    return {
      ok: false,
      status: 500,
      body: { success: false, message: 'Reseller account is not linked to a user' },
    };
  }

  const liveStock = await refreshAndVerifyPurchase({ slotIpPackageId });
  if (!liveStock.ok) {
    return {
      ok: false,
      status: 409,
      body: { success: false, message: liveStock.message || 'Slot IP package unavailable' },
    };
  }

  const slotPkg = await SlotIPPackage.findById(slotIpPackageId);
  if (!slotPkg || !slotPackageInStock(slotPkg)) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Slot IP package not found or out of stock' },
    };
  }

  const basePrice = Number(slotPkg.price) || 0;
  const finalPrice = calculateResellerPlanPrice(
    reseller,
    String(slotPkg._id),
    'slot',
    basePrice,
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

  const clientTxnId = `RESELLER_SLOT_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const order = await Order.create({
    user: reseller.userId,
    resellerId: reseller._id,
    productName: slotPkg.name,
    memory: 'Slot IP',
    price: finalPrice,
    originalPrice: basePrice,
    slotIpPackageId: String(slotPkg._id),
    provider: 'slotip',
    clientTxnId,
    gatewayOrderId: clientTxnId,
    paymentMethod: 'reseller_wallet',
    status: 'pending',
    customerEmail: userEmail || undefined,
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
      basePrice,
      resellerPrice: finalPrice,
      markup: finalPrice - basePrice,
    },
  });

  try {
    await ResellerWalletService.deductForOrder(
      reseller._id,
      finalPrice,
      order._id,
      `Reseller API slot order ${order._id} — ${slotPkg.name} @ ₹${finalPrice}`,
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

  const paidOrder = (await Order.findById(order._id)) || order;
  await fulfillOrderInventory(paidOrder);

  const fulfilledOrder = await Order.findById(order._id);

  try {
    await NotificationService.notifyOrderConfirmed(fulfilledOrder.user, fulfilledOrder);
    if (fulfilledOrder?.ipAddress) {
      await NotificationService.notifyOrderCompleted(fulfilledOrder.user, fulfilledOrder, {
        ipAddress: fulfilledOrder.ipAddress,
        username: fulfilledOrder.username || '',
        password: fulfilledOrder.password || '',
      });
    }
  } catch (err) {
    console.error('[RESELLER-SLOT-ORDER] notification failed:', err.message);
  }

  const freshReseller = await Reseller.findById(reseller._id).lean();

  return {
    ok: true,
    status: 201,
    body: {
      success: true,
      message: fulfilledOrder?.ipAddress
        ? 'Slot IP order created and assigned'
        : 'Slot IP order created — awaiting assignment',
      order: sanitizeResellerOrder(fulfilledOrder || order),
      walletBalance: freshReseller?.wallet?.balance ?? 0,
      creditLimit: freshReseller?.wallet?.creditLimit ?? 0,
    },
  };
}
