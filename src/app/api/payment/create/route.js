import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import IPStock from '@/models/ipStockModel';
const SlotIPPackage = require('@/models/slotIpPackageModel');
const AutoProvisioningService = require('@/services/autoProvisioningService');
const WhatsAppService = require('@/services/whatsappService');
import { assertIpStockPurchasable } from '@/lib/ipStockAvailability';
import { refreshAndVerifyPurchase } from '@/lib/syncIpStockBeforePurchase';
import { customerStockUnavailableMessage } from '@/lib/customerStockMessages';
import { calculateExpiryDate } from '@/lib/expiryHelper';
import { assignPanelCredentials } from '@/lib/panelCredentials';
const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
import userWalletService from '@/services/userWalletService';
import NotificationService from '@/services/notificationService';
import { Cashfree } from 'cashfree-pg';
import { getRazorpayClient } from '@/lib/razorpayClient';
import crypto from 'crypto';
const { resolvePromoForPrice, getMemoryOption, normalizePromoCode } = require('@/lib/promoCode');
const { defaultOsForProduct } = require('@/lib/orderOs');

// Initialize Cashfree with your credentials
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
// Use Cashfree.Environment enum instead of string
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

console.log('[Cashfree Init] Environment:', process.env.CASHFREE_ENVIRONMENT);
console.log('[Cashfree Init] Using:', Cashfree.XEnvironment === Cashfree.Environment.PRODUCTION ? 'PRODUCTION' : 'SANDBOX');

// UPI Gateway configuration (URL only - key will be read inside handler)
const UPI_GATEWAY_URL = 'https://merchant.upigateway.com/api/create_order';

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

    // 3. Read request data with promo code info and payment method
    const reqBody = await request.json();
    const { 
      productName, 
      memory, 
      promoCode, 
      ipStockId,
      slotIpPackageId,
      paymentMethod = 'razorpay',
      useWallet = false,
    } = reqBody;

    let originalPrice, price, promoDiscount = 0;
    let isSlotIpPurchase = false;

    if (slotIpPackageId) {
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

    if (walletApplied > 0) {
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

    let actualPaymentMethod = paymentMethod;
    let orderCreationError = null;

    if (gatewayCharge > 0) {
      if (paymentMethod === 'upi') {
        try {
          const UPI_GATEWAY_KEY = process.env.UPI_GATEWAY_API_KEY;
          
          if (!UPI_GATEWAY_KEY) {
            console.error("[Payment] UPI_GATEWAY_API_KEY not found in environment variables");
            throw new Error('UPI Gateway API key not configured');
          }

          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
          const returnUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

          const upiPayload = {
            key: UPI_GATEWAY_KEY,
            client_txn_id: clientTxnId,
            amount: gatewayCharge.toString(),
            p_info: `${productName} - ${memory}`,
            customer_name: user.name,
            customer_email: user.email,
            customer_mobile: user.phone || '9999999999',
            redirect_url: `${returnUrl}/payment/callback?client_txn_id=${clientTxnId}`,
            udf1: productName,
            udf2: memory,
            udf3: promoCode || ''
          };

          const upiResponse = await fetch(UPI_GATEWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(upiPayload)
          });

          const upiData = await upiResponse.json();
          
          if (!upiResponse.ok || upiData.status === false) {
            throw new Error(upiData.msg || 'UPI Gateway order creation failed');
          }

          gatewayOrderId = upiData.data.order_id;
          responseData.upi = {
            order_id: upiData.data.order_id,
            payment_url: upiData.data.payment_url,
            amount: gatewayCharge,
            currency: 'INR'
          };
        } catch (upiError) {
          console.error("[Payment] UPI Gateway order creation failed:", upiError.message);
          orderCreationError = upiError;
          actualPaymentMethod = 'cashfree';
        }
      }

      if (actualPaymentMethod === 'cashfree') {
        try {
          const sanitizeForCashfree = (str) => {
            if (!str) return '';
            return String(str).replace(/[^\w\s\-\.,:]/g, '').trim();
          };

          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
          const returnUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

          const cashfreeRequest = {
            order_id: clientTxnId,
            order_amount: Math.round(gatewayCharge * 100) / 100,
            order_currency: 'INR',
            customer_details: {
              customer_id: userId,
              customer_name: user.name,
              customer_email: user.email,
              customer_phone: user.phone || '9999999999'
            },
            order_meta: {
              return_url: `${returnUrl}/payment/callback?client_txn_id=${clientTxnId}`,
              notify_url: `${returnUrl}/api/payment/webhook`
            },
            order_note: sanitizeForCashfree(`${productName} - ${memory}`),
            order_tags: {
              product_name: sanitizeForCashfree(productName),
              memory: sanitizeForCashfree(memory),
              promo_code: sanitizeForCashfree(promoCode || ''),
              original_price: String(originalPrice || price),
              discount: String(promoDiscount || 0),
              wallet_applied: String(walletApplied || 0),
            }
          };

          const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', cashfreeRequest);
          gatewayOrderId = clientTxnId;
          responseData.cashfree = {
            order_id: clientTxnId,
            payment_session_id: cashfreeOrder.data.payment_session_id,
            order_token: cashfreeOrder.data.payment_session_id,
            amount: Math.round(gatewayCharge * 100) / 100,
            currency: 'INR'
          };
        } catch (cashfreeError) {
          console.error("[Payment] Cashfree order creation failed:", cashfreeError.message);
          orderCreationError = cashfreeError;
          actualPaymentMethod = 'razorpay';
        }
      }

      if (actualPaymentMethod === 'razorpay') {
        try {
          const razorpay = getRazorpayClient();
          if (!razorpay) {
            throw new Error('Razorpay credentials not configured');
          }

          const razorpayOrderOptions = {
            amount: Math.round(gatewayCharge * 100),
            currency: 'INR',
            receipt: clientTxnId,
            notes: {
              product_name: String(productName).replace(/[^\x20-\x7E]/g, '').trim(),
              memory: memory,
              customer_email: user.email,
              customer_name: String(user.name).replace(/[^\x20-\x7E]/g, '').trim(),
              promo_code: promoCode || '',
              original_price: originalPrice || price,
              discount: promoDiscount || 0,
              wallet_applied: walletApplied || 0,
            }
          };

          const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);
          gatewayOrderId = razorpayOrder.id;
          responseData.razorpay = {
            order_id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID
          };
        } catch (razorpayError) {
          console.error('[Payment] Razorpay order creation failed:', razorpayError.message);
          orderCreationError = razorpayError;
        }
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
      await refundWalletReservation(userId, walletApplied, clientTxnId);
      return NextResponse.json({ message: 'Failed to create payment order' }, { status: 500 });
    }

    // 9. Create a pending order in our database
    const appliedPromoCode = promoDiscount > 0 ? promoCode : null;

    let confirmedExpiryDate = gatewayCharge === 0 ? calculateExpiryDate() : null;
    if (gatewayCharge === 0 && !isSlotIpPurchase) {
      const resolvedExpiry = await resolveOrderExpiryOnPayment({ ipStockId, productName });
      confirmedExpiryDate = resolvedExpiry;
    }

    const orderData = {
      user: userId,
      productName,
      memory: isSlotIpPurchase ? 'Slot IP' : memory,
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
        gatewayAmount: gatewayCharge,
        walletAmount: walletApplied,
      },
    };

    if (walletApplied > 0 && walletDebit) {
      orderData.walletDeduction = {
        deducted: true,
        amount: walletApplied,
        transactionId: walletDebit.walletTxnId,
        timestamp: new Date(),
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

    if (isSlotIpPurchase) {
      orderData.slotIpPackageId = slotIpPackageId;
      orderData.provider = 'slotip';
    } else {
      orderData.ipStockId = ipStockId;
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

      if (!isSlotIpPurchase) {
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
    
    // If there was a fallback, include a flag
    if (orderCreationError && actualPaymentMethod !== paymentMethod) {
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
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}