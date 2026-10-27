import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import IPStock from '@/models/ipStockModel';
const SlotIPPackage = require('@/models/slotIpPackageModel');
const TrialVpsPackage = require('@/models/trialVpsPackageModel');
const AutoProvisioningService = require('@/services/autoProvisioningService');
const WhatsAppService = require('@/services/whatsappService');
import { assertIpStockPurchasable } from '@/lib/ipStockAvailability';
import { refreshAndVerifyPurchase } from '@/lib/syncIpStockBeforePurchase';
import { customerStockUnavailableMessage } from '@/lib/customerStockMessages';
const { customerApiCatchPayload } = require('@/lib/customerFacingErrors');
import { enforcePaymentRateLimit } from '@/lib/rateLimit';
import { calculateExpiryDate } from '@/lib/expiryHelper';
import { assignPanelCredentials } from '@/lib/panelCredentials';
const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
import userWalletService from '@/services/userWalletService';
import NotificationService from '@/services/notificationService';
import { createGatewayOrder, buildClientTxnId } from '@/lib/paymentGateways';
import { getPrimaryPaymentMethod } from '@/lib/platformPaymentSettings';
import crypto from 'crypto';
const { resolvePromoForPrice, getMemoryOption, normalizePromoCode } = require('@/lib/promoCode');
const { defaultOsForProduct } = require('@/lib/orderOs');

async function refundWalletReservation(userId, amount, clientTxnId) {
  if (!amount || amount <= 0) return;
  try {
    await userWalletService.refund(userId, amount, {
      description: `Buy-now checkout refund ${clientTxnId}`,
      reference: clientTxnId,
    });
  } catch (err) {
    console.error('[Payment] Wallet refund failed:', err.message);
  }
}

export async function POST(request) {
  await connectDB();
  console.log("MongoDB connected");

  let walletApplied = 0;
  let walletDebit = null;
  let orderCreated = false;
  let clientTxnId = null;
  let userId = null;

  try {
    // 1. Check which user is making this purchase
    userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user details
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Reseller panel buying is disabled — promo stacking on reseller rates.
    // Resellers must place orders via the Reseller API (/api/v1/reseller/orders).
    if (user.userType === 'reseller') {
      return NextResponse.json(
        { message: 'Panel purchasing is disabled for reseller accounts. Please place orders via the Reseller API (see Reseller API Docs).' },
        { status: 403 }
      );
    }

    const rateLimited = enforcePaymentRateLimit(request);
    if (rateLimited) return rateLimited;

    // 3. Read request data with promo code info and payment method
    const reqBody = await request.json();
    const primaryGateway = await getPrimaryPaymentMethod();
    const { 
      productName, 
      memory, 
      promoCode, 
      ipStockId,
      slotIpPackageId,
      trialVpsPackageId,
      useWallet = false,
      netbayGroupTag = '',
    } = reqBody;
    const paymentMethod = ['razorpay', 'upi'].includes(reqBody.paymentMethod)
      ? reqBody.paymentMethod
      : primaryGateway;

    let originalPrice, price, promoDiscount = 0;
    let isSlotIpPurchase = false;
    let isTrialVpsPurchase = false;
    /** Set when loading trial package — used for order memory (e.g. 8GB). */
    let trialVpsPkgDoc = null;

    if (trialVpsPackageId) {
      isTrialVpsPurchase = true;
      if (!productName) {
        return NextResponse.json({ message: 'Missing productName' }, { status: 400 });
      }
      const trialPkg = await TrialVpsPackage.findById(trialVpsPackageId);
      trialVpsPkgDoc = trialPkg;
      if (!trialPkg) {
        return NextResponse.json({ message: 'Trial VPS package not found' }, { status: 404 });
      }
      if (!trialPkg.available) {
        return NextResponse.json({ message: 'This trial package is unavailable' }, { status: 400 });
      }
      const availableSlots = (trialPkg.slots || []).filter((s) => !s.allocated);
      if (availableSlots.length === 0) {
        return NextResponse.json({ message: 'No trial VPS slots available' }, { status: 400 });
      }
      const trialLive = await refreshAndVerifyPurchase({ trialVpsPackageId });
      if (!trialLive.ok) {
        return NextResponse.json(
          { message: customerStockUnavailableMessage(trialLive.message, { kind: 'plan' }) },
          { status: 409 }
        );
      }
      originalPrice = trialPkg.price;
      if (user.userType === 'reseller' && user.resellerId) {
        const { getResellerForUserId, resellerPriceForSlot } = await import('@/lib/resellerStorePricing');
        const reseller = await getResellerForUserId(userId);
        if (reseller) originalPrice = resellerPriceForSlot(reseller, trialPkg, originalPrice);
      }
      price = originalPrice;
      const normalizedPromo = normalizePromoCode(promoCode);
      if (normalizedPromo) {
        const promoResult = resolvePromoForPrice({
          promoCodes: trialPkg.promoCodes,
          promoCode: normalizedPromo,
          originalPrice,
        });
        if (!promoResult.valid) {
          return NextResponse.json(
            { message: promoResult.message || 'Invalid or inactive promo code' },
            { status: 400 }
          );
        }
        promoDiscount = promoResult.discount;
        price = promoResult.finalPrice;
      }
      console.log(
        `[Payment] Trial VPS: pkg=${trialPkg.name}, days=${trialPkg.trialDays}, price=${price}, slots=${availableSlots.length}`
      );
    } else if (slotIpPackageId) {
      // ===== SLOT IP PURCHASE FLOW =====
      isSlotIpPurchase = true;

      if (!productName) {
        return NextResponse.json({ message: 'Missing productName' }, { status: 400 });
      }

      const slotPkg = await SlotIPPackage.findById(slotIpPackageId);
      if (!slotPkg) {
        return NextResponse.json({ message: 'Slot IP package not found' }, { status: 404 });
      }
      if (!slotPkg.available) {
        return NextResponse.json({ message: 'This slot IP package is currently unavailable' }, { status: 400 });
      }

      const availableIps = slotPkg.ips.filter(ip => !ip.allocated);
      if (availableIps.length === 0) {
        return NextResponse.json({ message: 'No slot IPs available in this package' }, { status: 400 });
      }

      const slotLive = await refreshAndVerifyPurchase({ slotIpPackageId });
      if (!slotLive.ok) {
        return NextResponse.json(
          {
            message: customerStockUnavailableMessage(slotLive.message, { kind: 'slot' }),
          },
          { status: 409 }
        );
      }

      originalPrice = slotPkg.price;
      if (user.userType === 'reseller' && user.resellerId) {
        const { getResellerForUserId, resellerPriceForSlot } = await import('@/lib/resellerStorePricing');
        const reseller = await getResellerForUserId(userId);
        if (reseller) originalPrice = resellerPriceForSlot(reseller, slotPkg, originalPrice);
      }
      price = originalPrice;

      const normalizedPromo = normalizePromoCode(promoCode);
      if (normalizedPromo) {
        const promoResult = resolvePromoForPrice({
          promoCodes: slotPkg.promoCodes,
          promoCode: normalizedPromo,
          originalPrice,
        });
        if (!promoResult.valid) {
          return NextResponse.json(
            { message: promoResult.message || 'Invalid or inactive promo code' },
            { status: 400 }
          );
        }
        promoDiscount = promoResult.discount;
        price = promoResult.finalPrice;
        if (promoDiscount > 0) {
          console.log(`[Payment] Slot IP promo applied: ${originalPrice} - ${promoDiscount} = ${price}`);
        }
      }

      console.log(`[Payment] Slot IP purchase: pkg=${slotPkg.name}, price=${price}, available=${availableIps.length}`);

    } else {
      // ===== REGULAR IP STOCK PURCHASE FLOW =====
      if (!productName || !memory || !ipStockId) {
        return NextResponse.json(
          { message: 'Missing required fields (productName, memory, ipStockId)' },
          { status: 400 }
        );
      }

      const liveStock = await refreshAndVerifyPurchase({ ipStockId, memory });
      if (!liveStock.ok) {
        return NextResponse.json(
          {
            message: customerStockUnavailableMessage(liveStock.message),
          },
          { status: 409 }
        );
      }

      const stockCheck = await assertIpStockPurchasable(ipStockId, 1);
      if (!stockCheck.ok) {
        return NextResponse.json({ message: stockCheck.message }, { status: 400 });
      }
      const ipStock = stockCheck.stock;

      if (!ipStock) {
        return NextResponse.json({ message: 'Product not found' }, { status: 404 });
      }

      const memoryOption = getMemoryOption(ipStock, memory);
      if (!memoryOption || !memoryOption.price) {
        return NextResponse.json(
          { message: `Memory option ${memory} is not available for this product` },
          { status: 400 }
        );
      }

      originalPrice = memoryOption.price;
      if (user.userType === 'reseller' && user.resellerId) {
        const { getResellerForUserId, resellerPriceForStockMemory } = await import('@/lib/resellerStorePricing');
        const reseller = await getResellerForUserId(userId);
        if (reseller) {
          originalPrice = resellerPriceForStockMemory(reseller, ipStock, memory, originalPrice);
        }
      }
      price = originalPrice;

      const normalizedPromo = normalizePromoCode(promoCode);
      if (normalizedPromo) {
        const promoResult = resolvePromoForPrice({
          promoCodes: ipStock.promoCodes,
          promoCode: normalizedPromo,
          originalPrice,
        });
        if (!promoResult.valid) {
          return NextResponse.json(
            { message: promoResult.message || 'Invalid or inactive promo code' },
            { status: 400 }
          );
        }
        promoDiscount = promoResult.discount;
        price = promoResult.finalPrice;
        if (promoDiscount > 0) {
          console.log(`[Payment] Applied promo code ${normalizedPromo}: ${originalPrice} - ${promoDiscount} = ${price}`);
        }
      }
    }

    console.log(`[Payment] Server-validated price: originalPrice=${originalPrice}, discount=${promoDiscount}, finalPrice=${price}`);

    clientTxnId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    walletApplied = 0;
    walletDebit = null;
    if (useWallet) {
      const balance = await userWalletService.getBalance(userId);
      walletApplied = Math.min(balance, price);
    }
    const gatewayCharge = Math.max(0, price - walletApplied);

    // Deduct-on-success: only charge the wallet up-front when it FULLY covers
    // the price (no gateway step — the wallet debit itself IS the payment).
    // For a partial wallet + gateway payment we DEFER the wallet debit until the
    // gateway payment actually lands (see confirmPendingOrderPayment), so the
    // customer's wallet is never touched for an order they don't complete.
    if (walletApplied > 0 && gatewayCharge === 0) {
      try {
        walletDebit = await userWalletService.debit(userId, walletApplied, {
          description: `Buy now ${productName} - ${memory || 'Slot IP'}`,
          reference: clientTxnId,
          metadata: { productName, memory, totalPrice: price, gatewayCharge },
        });
      } catch (err) {
        return NextResponse.json(
          { message: err.message || 'Insufficient wallet balance' },
          { status: 400 }
        );
      }
    }

    // 7. Calculate expiry date (30 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    console.log(`[Payment] Creating ${paymentMethod} order for user ${userId}`);

    let gatewayOrderId = walletDebit?.walletTxnId || null;
    let responseData = {
      message: 'Payment initiated',
      orderId: null,
      clientTxnId: clientTxnId,
      totalPrice: price,
      originalPrice,
      promoDiscount,
      promoApplied: promoDiscount > 0,
      walletApplied,
      gatewayCharge,
      customer: {
        name: user.name,
        email: user.email,
        phone: user.phone || '9999999999'
      }
    };

    let actualPaymentMethod = ['razorpay', 'upi'].includes(paymentMethod) ? paymentMethod : primaryGateway;
    let orderCreationError = null;
    let fallbackUsed = false;
    // UPI orders can be issued at a slightly higher amount so the gateway can tell
    // concurrent same-priced payments apart. Verification must compare against
    // what was actually requested, not what we originally computed.
    let payableAmount = gatewayCharge;
    let upiProvider = '';
    let upiExpiresAt = null;

    const { resolveTrialVpsOrderMemory } = require('@/lib/trialVpsCatalog');
    const resolvedOrderMemory =
      isTrialVpsPurchase && trialVpsPkgDoc
        ? resolveTrialVpsOrderMemory(trialVpsPkgDoc)
        : isSlotIpPurchase
          ? 'Slot IP'
          : memory;

    if (gatewayCharge > 0) {
      try {
        const gatewayResult = await createGatewayOrder({
          preferredMethod: actualPaymentMethod,
          clientTxnId,
          amount: gatewayCharge,
          customer: {
            id: userId,
            name: user.name,
            email: user.email,
            phone: user.phone || '9999999999',
          },
          callbackPath: '/payment/callback',
          notes: {
            product_name: productName,
            memory: resolvedOrderMemory,
            promo_code: promoCode || '',
            original_price: originalPrice || price,
            discount: promoDiscount || 0,
            wallet_applied: walletApplied || 0,
          },
          description: `${productName} - ${isSlotIpPurchase ? 'Slot IP' : memory}`,
        });

        gatewayOrderId = gatewayResult.gatewayOrderId;
        actualPaymentMethod = gatewayResult.method;
        fallbackUsed = gatewayResult.fallbackUsed;
        payableAmount = Number(gatewayResult.chargedAmount) || gatewayCharge;
        upiProvider = gatewayResult.upiProvider || '';
        upiExpiresAt = gatewayResult.expiresAt || null;
        responseData.gatewayCharge = payableAmount;
        Object.assign(responseData, gatewayResult.payload);
      } catch (gatewayError) {
        console.error('[Payment] Gateway order creation failed:', gatewayError.message);
        orderCreationError = gatewayError;
      }
    } else {
      actualPaymentMethod = 'wallet';
      gatewayOrderId = walletDebit?.walletTxnId || `WALLET_${clientTxnId}`;
    }

    const paymentMethodLabel =
      walletApplied >= price
        ? 'wallet'
        : walletApplied > 0
          ? `wallet+${actualPaymentMethod}`
          : actualPaymentMethod;

    if (gatewayCharge > 0 && !gatewayOrderId) {
      // Only refund if we actually debited (wallet-only never reaches here).
      if (walletDebit) await refundWalletReservation(userId, walletApplied, clientTxnId);
      return NextResponse.json({ message: 'Failed to create payment order' }, { status: 500 });
    }

    // 9. Create a pending order in our database
    const appliedPromoCode = promoDiscount > 0 ? promoCode : null;

    let confirmedExpiryDate = gatewayCharge === 0 ? calculateExpiryDate() : null;
    if (gatewayCharge === 0 && !isSlotIpPurchase && !isTrialVpsPurchase) {
      const resolvedExpiry = await resolveOrderExpiryOnPayment({ ipStockId, productName });
      confirmedExpiryDate = resolvedExpiry;
    }
    if (gatewayCharge === 0 && isTrialVpsPurchase) {
      confirmedExpiryDate = await resolveOrderExpiryOnPayment({ trialVpsPackageId, productName });
    }

    const orderData = {
      user: userId,
      productName,
      memory: resolvedOrderMemory,
      price: Math.round(price),
      originalPrice: originalPrice,
      promoCode: appliedPromoCode,
      promoDiscount: promoDiscount,
      os: defaultOsForProduct(productName),
      clientTxnId,
      gatewayOrderId: gatewayOrderId,
      paymentMethod: paymentMethodLabel,
      status: gatewayCharge === 0 ? 'confirmed' : 'pending',
      customerName: user.name,
      customerEmail: user.email,
      expiryDate: gatewayCharge === 0 ? (confirmedExpiryDate || undefined) : expiryDate,
      paymentDetails: {
        gatewayAmount: payableAmount,
        walletAmount: walletApplied,
        ...(upiProvider ? { upiProvider } : {}),
        ...(upiExpiresAt ? { upiExpiresAt } : {}),
      },
    };

    if (walletApplied > 0) {
      // deducted:true only when we actually charged now (wallet-only path).
      // For mixed wallet+gateway we record the intended amount with
      // deducted:false so the confirm step charges it once payment lands.
      orderData.walletDeduction = walletDebit
        ? {
            deducted: true,
            amount: walletApplied,
            transactionId: walletDebit.walletTxnId,
            timestamp: new Date(),
          }
        : {
            deducted: false,
            amount: walletApplied,
          };
    }

    if (gatewayCharge === 0) {
      orderData.transactionId = walletDebit?.walletTxnId || `WALLET_${clientTxnId}`;
      orderData.paymentDetails = {
        ...orderData.paymentDetails,
        walletOnly: true,
        confirmedAt: new Date(),
      };
    }

    if (isTrialVpsPurchase) {
      orderData.trialVpsPackageId = trialVpsPackageId;
      orderData.trialVpsPlanCategory = trialVpsPkgDoc?.planCategory || 'linux';
      orderData.provider = 'trialvps';
      const trialManageCompanyId = trialVpsPkgDoc?.manageCompanyId
        ? String(trialVpsPkgDoc.manageCompanyId)
        : '';
      const trialManageStockId = trialVpsPkgDoc?.manageIpStockId
        ? String(trialVpsPkgDoc.manageIpStockId)
        : '';
      const trialCat = String(trialVpsPkgDoc?.planCategory || 'linux').toLowerCase();
      if (trialCat !== 'premium_proxy' && (trialManageCompanyId || trialManageStockId)) {
        orderData.trialVpsPanelManage = true;
        if (trialManageCompanyId) orderData.trialManageCompanyId = trialManageCompanyId;
        if (trialManageStockId) orderData.ipStockId = trialManageStockId;
      }
    } else if (isSlotIpPurchase) {
      orderData.slotIpPackageId = slotIpPackageId;
      orderData.provider = 'slotip';
    } else {
      orderData.ipStockId = ipStockId;
      const ipStockDoc = await IPStock.findById(ipStockId).lean();
      const { resolveNetbayGroupTag, isNetbayProxyStock, isNexaDedicatedIpStock } = require('@/lib/netbayGroupTags');
      if (isNexaDedicatedIpStock(ipStockDoc)) {
        orderData.provider = 'nexa';
      } else {
        const tag = resolveNetbayGroupTag(ipStockDoc, netbayGroupTag);
        if (tag) orderData.netbayGroupTag = tag;
        if (isNetbayProxyStock(ipStockDoc)) {
          orderData.netbayProductKind = 'proxy';
          orderData.provider = 'netbay';
        }
      }
    }
    
    const newOrder = await Order.create(orderData);
    orderCreated = true;

    if (gatewayCharge === 0) {
      await assignPanelCredentials(newOrder);
      await newOrder.save();
      const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');
      await fulfillOrderInventory(newOrder);

      try {
        await NotificationService.notifyOrderConfirmed(newOrder.user, newOrder);
      } catch (notifError) {
        console.error('[Payment] notifyOrderConfirmed failed:', notifError.message);
      }

      if (!isSlotIpPurchase && !isTrialVpsPurchase) {
        try {
          const provisioningService = new AutoProvisioningService();
          await NotificationService.notifyOrderProvisioning(newOrder.user, newOrder);
          provisioningService.provisionServer(newOrder._id.toString())
            .then(async (result) => {
              if (result.success && !result.alreadyProvisioned && !result.alreadyProvisioning) {
                await NotificationService.notifyOrderCompleted(newOrder.user, newOrder, {
                  ipAddress: result.ipAddress || 'Available in dashboard',
                  username: result.username || 'root',
                  password: result.password || 'Check dashboard',
                });
                WhatsAppService.notifyOrderViaWhatsApp(newOrder.user, newOrder).catch(() => {});
              } else if (!result.success && !result.alreadyProvisioning && !result.advpsPending && !result.resellerApiPending) {
                await NotificationService.notifyOrderFailed(newOrder.user, newOrder, result.error);
              }
            })
            .catch(async (error) => {
              if (!String(error.message).startsWith('ADVPS_PENDING')) {
                await NotificationService.notifyOrderFailed(newOrder.user, newOrder, error.message);
              }
            });
        } catch (provErr) {
          console.error('[Payment] Auto-provisioning start failed:', provErr.message);
        }
      }
    }

    console.log("[Payment] Order created in database:", newOrder._id);
    console.log("[Payment] Using payment method:", paymentMethodLabel);

    responseData.orderId = newOrder._id;
    responseData.actualPaymentMethod = actualPaymentMethod;
    responseData.paymentMethodLabel = paymentMethodLabel;
    
    if (gatewayCharge === 0) {
      responseData.walletOnly = true;
      responseData.message = 'Order paid using wallet balance';
    }
    
    if (fallbackUsed) {
      responseData.fallbackUsed = true;
      responseData.originalMethod = paymentMethod === 'cashfree' ? 'upi' : paymentMethod;
    } else if (orderCreationError && actualPaymentMethod !== paymentMethod) {
      responseData.fallbackUsed = true;
      responseData.originalMethod = paymentMethod;
    }

    // 10. Return order details for frontend
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error initiating payment:', error);
    if (userId && walletDebit && walletApplied > 0 && !orderCreated) {
      await refundWalletReservation(userId, walletApplied, clientTxnId || 'unknown');
    }
    return NextResponse.json(
      { message: 'Server error', ...customerApiCatchPayload(error.message) },
      { status: 500 }
    );
  }
}