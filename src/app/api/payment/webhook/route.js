import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import crypto from 'crypto';
const AutoProvisioningService = require('@/services/autoProvisioningService');
const HostycareAPI = require('@/services/hostycareApi');
const SmartVPSAPI = require('@/services/smartvpsApi');

export async function POST(request) {
  const webhookStartTime = Date.now();
  console.log("\n" + "=".repeat(80));
  console.log(`[WEBHOOK] 🚀 CASHFREE WEBHOOK RECEIVED AT ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  await connectDB();
  console.log("[WEBHOOK] ✅ Database connected");

  try {
    // Get the raw body and signature
    const body = await request.text();
    const signature = request.headers.get('x-cashfree-signature');
    const timestamp = request.headers.get('x-cashfree-timestamp');

    if (!signature) {
      console.error("[WEBHOOK] ❌ Missing Cashfree signature");
      return NextResponse.json(
        { success: false, message: 'Missing signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const signatureData = timestamp + body;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(signatureData)
      .digest('base64');

    if (signature !== expectedSignature) {
      console.error("[WEBHOOK] ❌ Invalid signature");
      return NextResponse.json(
        { success: false, message: 'Invalid signature' },
        { status: 400 }
      );
    }

    const data = JSON.parse(body);
    console.log("[WEBHOOK] 📦 RECEIVED PAYLOAD:");
    console.log(JSON.stringify(data, null, 2));

    // Handle payment success event
    if (data.type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const payment = data.data;
      const orderId = payment.order.order_id;

      console.log(`[WEBHOOK] 💳 Payment successful for order: ${orderId}`);

      // Check if this is a RENEWAL transaction
      if (orderId.startsWith('RENEWAL_')) {
        console.log(`[WEBHOOK] 🔄 Detected RENEWAL transaction: ${orderId}`);
        return await handleRenewalWebhook(orderId, payment, webhookStartTime);
      }

      // Find the order in our database (for new orders)
      const order = await Order.findOne({ clientTxnId: orderId });

      if (!order) {
        console.error(`[WEBHOOK] ❌ Order not found for Cashfree order ID: ${orderId}`);
        return NextResponse.json(
          { success: false, message: 'Order not found' },
          { status: 404 }
        );
      }

      console.log(`[WEBHOOK] ✅ FOUND ORDER: ${order._id}`);
      console.log(`[WEBHOOK] 📊 ORDER CURRENT STATE:`);
      console.log(`   - Status: ${order.status}`);
      console.log(`   - Product Name: ${order.productName}`);
      console.log(`   - Memory: ${order.memory}`);

      // Update order status
      const orderUpdateStart = Date.now();
      console.log(`[WEBHOOK] 📝 UPDATING ORDER STATUS...`);

      order.status = 'confirmed';
      order.transactionId = payment.payment.cf_payment_id;
      order.gatewayOrderId = payment.order.order_id; // Store Cashfree order ID
      order.paymentMethod = 'cashfree';
      
      // Store additional payment info
      order.webhookAmount = payment.payment.payment_amount.toString();
      order.webhookCustomerEmail = payment.customer_details.customer_email;
      
      // Store comprehensive payment details
      order.paymentDetails = {
        cf_payment_id: payment.payment.cf_payment_id,
        cf_order_id: payment.order.order_id,
        payment_status: payment.payment.payment_status,
        payment_amount: payment.payment.payment_amount,
        payment_currency: payment.payment.payment_currency,
        payment_time: payment.payment.payment_time,
        payment_method: payment.payment.payment_method,
        bank_reference: payment.payment.bank_reference,
        customer_email: payment.customer_details.customer_email,
        customer_phone: payment.customer_details.customer_phone,
        webhookReceivedAt: new Date()
      };

      await order.save();
      const orderUpdateTime = Date.now() - orderUpdateStart;
      console.log(`[WEBHOOK] ✅ ORDER UPDATED to 'confirmed' in ${orderUpdateTime}ms`);

      // 🚀 TRIGGER AUTO-PROVISIONING
      console.log("\n" + "-".repeat(60));
      console.log(`[WEBHOOK] 🚀 STARTING AUTO-PROVISIONING for order ${order._id}`);
      console.log("-".repeat(60));

      try {
        const provisioningService = new AutoProvisioningService();
        console.log(`[WEBHOOK] 🔄 Creating AutoProvisioningService instance...`);

        // Start auto-provisioning in background
        const provisioningPromise = provisioningService.provisionServer(order._id.toString());

        // Handle the promise in background
        provisioningPromise
          .then(result => {
            const provisioningEndTime = Date.now();
            console.log("\n" + "★".repeat(60));
            console.log(`[AUTO-PROVISION] 🏁 PROVISIONING COMPLETED for order ${order._id}`);
            console.log(`[AUTO-PROVISION] ⏱️ Total time: ${provisioningEndTime - webhookStartTime}ms`);
            console.log("★".repeat(60));

            if (result && result.success) {
              console.log(`[AUTO-PROVISION] ✅ SUCCESS! Details:`);
              console.log(`   - Service ID: ${result.serviceId || 'N/A'}`);
              console.log(`   - IP Address: ${result.ipAddress || 'N/A'}`);
            } else {
              console.error(`[AUTO-PROVISION] ❌ FAILED! Error: ${result?.error || 'Unknown error'}`);
            }
          })
          .catch(error => {
            console.error("\n" + "💥".repeat(60));
            console.error(`[AUTO-PROVISION] 💥 CRITICAL ERROR for order ${order._id}:`);
            console.error(`   - Error Message: ${error.message}`);
            console.error("💥".repeat(60));
          });

        console.log(`[WEBHOOK] ✅ Auto-provisioning initiated successfully`);

      } catch (provisioningError) {
        console.error(`[WEBHOOK] ❌ ERROR initiating auto-provisioning:`, provisioningError);
      }

    } else if (data.event === 'payment.failed') {
      const payment = data.payload.payment.entity;
      const orderId = payment.order_id;

      console.log(`[WEBHOOK] ❌ Payment failed for order: ${orderId}`);

      const order = await Order.findOne({ gatewayOrderId: orderId });
      if (order) {
        order.status = 'failed';
        await order.save();
        console.log(`[WEBHOOK] ✅ Order ${order._id} marked as failed`);
      }
    }

    const totalWebhookTime = Date.now() - webhookStartTime;
    console.log(`[WEBHOOK] ⏱️ Total webhook processing time: ${totalWebhookTime}ms`);

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      processingTime: totalWebhookTime
    });

  } catch (error) {
    const totalWebhookTime = Date.now() - webhookStartTime;
    console.error("\n" + "💥".repeat(80));
    console.error('[WEBHOOK] 💥 CRITICAL WEBHOOK ERROR:', error);
    console.error("💥".repeat(80));

    return NextResponse.json({
      success: false,
      message: 'Error processing webhook',
      error: error.message,
      processingTime: totalWebhookTime
    });
  }
}

// Helper function to determine provider from order with IPStock data
async function getProviderFromOrder(order) {
  console.log('[WEBHOOK-RENEWAL-PROVIDER] Determining provider for order:', order._id);

  // Primary logic: Check if order has hostycare service ID
  if (order.hostycareServiceId) {
    console.log('[WEBHOOK-RENEWAL-PROVIDER] ✅ Detected Hostycare via serviceId');
    return 'hostycare';
  }

  // Secondary logic: Check if ipStock has smartvps tag
  if (order.ipStockId) {
    try {
      const ipStock = await IPStock.findById(order.ipStockId);
      if (ipStock && ipStock.tags && ipStock.tags.includes('smartvps')) {
        console.log('[WEBHOOK-RENEWAL-PROVIDER] ✅ Detected SmartVPS via ipStock tags');
        return 'smartvps';
      }
    } catch (ipStockError) {
      console.error('[WEBHOOK-RENEWAL-PROVIDER] Error fetching IPStock:', ipStockError);
    }
  }

  // Additional fallback: Check smartvps service ID
  if (order.smartvpsServiceId) {
    console.log('[WEBHOOK-RENEWAL-PROVIDER] ✅ Detected SmartVPS via serviceId');
    return 'smartvps';
  }

  // Final fallback: Check product name patterns for SmartVPS
  if (order.productName?.includes('103.195') ||
    order.ipAddress?.startsWith('103.195') ||
    order.productName?.includes('🏅')) {
    console.log('[WEBHOOK-RENEWAL-PROVIDER] ✅ Detected SmartVPS via patterns');
    return 'smartvps';
  }

  // Default to oceanlinux
  console.log('[WEBHOOK-RENEWAL-PROVIDER] ⚪ Defaulting to OceanLinux');
  return 'oceanlinux';
}

// Handle renewal payment webhooks
async function handleRenewalWebhook(renewalTxnId, payment, webhookStartTime) {
  console.log(`[WEBHOOK-RENEWAL] 🔄 Processing renewal webhook for: ${renewalTxnId}`);

  try {
    // Find order by pending renewal transaction ID
    const order = await Order.findOne({ 'pendingRenewal.renewalTxnId': renewalTxnId });

    if (!order) {
      console.error(`[WEBHOOK-RENEWAL] ❌ No order found with pending renewal: ${renewalTxnId}`);
      return NextResponse.json(
        { success: false, message: 'Order with pending renewal not found' },
        { status: 404 }
      );
    }

    console.log(`[WEBHOOK-RENEWAL] ✅ Found order: ${order._id}`);
    console.log(`[WEBHOOK-RENEWAL] Product: ${order.productName}`);
    console.log(`[WEBHOOK-RENEWAL] Current expiry: ${order.expiryDate}`);

    // Check if this renewal was already processed (idempotency)
    const alreadyProcessed = order.renewalPayments?.some(
      rp => rp.renewalTxnId === renewalTxnId
    );

    if (alreadyProcessed) {
      console.log(`[WEBHOOK-RENEWAL] ⚠️ Renewal already processed: ${renewalTxnId}`);
      return NextResponse.json({
        success: true,
        message: 'Renewal already processed',
        alreadyProcessed: true
      });
    }

    // Determine provider
    const provider = await getProviderFromOrder(order);
    console.log(`[WEBHOOK-RENEWAL] Provider: ${provider}`);

    // Calculate new expiry date
    const currentExpiry = new Date(order.expiryDate);
    const now = new Date();
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiryDate = new Date(baseDate);
    newExpiryDate.setDate(newExpiryDate.getDate() + 30);

    console.log(`[WEBHOOK-RENEWAL] New expiry date: ${newExpiryDate}`);

    // Process provider-specific renewal
    let providerRenewalResult = null;
    let providerRenewalSuccess = false;

    if (provider === 'hostycare' && order.hostycareServiceId) {
      console.log('[WEBHOOK-RENEWAL] Processing Hostycare renewal via API...');
      try {
        const api = new HostycareAPI();
        providerRenewalResult = await api.renewService(order.hostycareServiceId);
        console.log(`[WEBHOOK-RENEWAL] Hostycare renewal result:`, providerRenewalResult);
        providerRenewalSuccess = true;
      } catch (hostycareError) {
        console.error(`[WEBHOOK-RENEWAL] Hostycare renewal API failed:`, hostycareError);
        providerRenewalResult = { error: hostycareError.message };
      }
    } else if (provider === 'smartvps') {
      const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
      console.log(`[WEBHOOK-RENEWAL] Processing SmartVPS renewal for: ${serviceIdentifier}`);

      if (serviceIdentifier) {
        try {
          const smartvpsApi = new SmartVPSAPI();
          providerRenewalResult = await smartvpsApi.renewVps(serviceIdentifier);
          console.log(`[WEBHOOK-RENEWAL] SmartVPS renewal result:`, providerRenewalResult);
          providerRenewalSuccess = true;
        } catch (smartvpsError) {
          console.error(`[WEBHOOK-RENEWAL] SmartVPS renewal API failed:`, smartvpsError);
          providerRenewalResult = { error: smartvpsError.message };
        }
      } else {
        console.warn('[WEBHOOK-RENEWAL] SmartVPS missing service identifier');
        providerRenewalResult = { error: 'Missing service identifier' };
      }
    } else {
      console.log(`[WEBHOOK-RENEWAL] ${provider} renewal - no API call needed`);
      providerRenewalSuccess = true;
    }

    // Create renewal payment record
    const renewalPayment = {
      paymentId: payment.payment.cf_payment_id,
      amount: order.price,
      paidAt: new Date(),
      previousExpiry: currentExpiry,
      newExpiry: newExpiryDate,
      renewalTxnId: renewalTxnId,
      provider: provider,
      paymentMethod: 'cashfree',
      providerRenewalResult: providerRenewalResult,
      providerRenewalSuccess: providerRenewalSuccess,
      processedViaWebhook: true
    };

    // Update order
    const updatedOrder = await Order.findByIdAndUpdate(order._id, {
      expiryDate: newExpiryDate,
      lastAction: 'renew',
      lastActionTime: new Date(),
      transactionId: payment.payment.cf_payment_id,
      gatewayOrderId: renewalTxnId,
      paymentMethod: 'cashfree',
      paymentDetails: {
        cf_payment_id: payment.payment.cf_payment_id,
        cf_order_id: renewalTxnId,
        payment_status: payment.payment.payment_status,
        payment_amount: payment.payment.payment_amount,
        webhookProcessedAt: new Date()
      },
      $push: { renewalPayments: renewalPayment },
      $unset: { pendingRenewal: 1 } // Clear pending renewal
    }, { new: true });

    const totalTime = Date.now() - webhookStartTime;
    console.log(`[WEBHOOK-RENEWAL] ✅ Renewal completed successfully in ${totalTime}ms`);
    console.log(`[WEBHOOK-RENEWAL] Order ${order._id} renewed until ${newExpiryDate}`);

    return NextResponse.json({
      success: true,
      message: 'Renewal processed successfully via webhook',
      orderId: order._id,
      newExpiryDate: newExpiryDate,
      provider: provider,
      providerRenewalSuccess: providerRenewalSuccess,
      processingTime: totalTime
    });

  } catch (error) {
    console.error(`[WEBHOOK-RENEWAL] ❌ Error processing renewal:`, error);
    return NextResponse.json({
      success: false,
      message: 'Error processing renewal webhook',
      error: error.message
    }, { status: 500 });
  }
}