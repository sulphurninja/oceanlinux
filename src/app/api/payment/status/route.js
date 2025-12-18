import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';
import NotificationService from '@/services/notificationService';
const AutoProvisioningService = require('@/services/autoProvisioningService');

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

export async function POST(request) {
  await connectDB();
  
  console.log("========== PAYMENT STATUS API CALLED ==========");
  console.log(`Server timestamp: ${new Date().toISOString()}`);

  try {
    const reqBody = await request.json();
    console.log(`Request body: ${JSON.stringify(reqBody)}`);
    const { clientTxnId, renewalTxnId } = reqBody;

    const txnId = renewalTxnId || clientTxnId;
    const isRenewal = !!renewalTxnId;

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
        console.log(`[PAYMENT-STATUS] ✅ Renewal already processed for: ${txnId}`);
        return NextResponse.json({
          isRenewal: true,
          renewalTxnId: txnId,
          paymentStatus: 'SUCCESS',
          alreadyProcessed: true,
          message: "Renewal already processed"
        });
      }

      // Find the order with this pending renewal
      const orderWithPending = await Order.findOne({
        'pendingRenewal.renewalTxnId': txnId
      });

      const paymentMethod = orderWithPending?.pendingRenewal?.paymentMethod || 'cashfree';
      const razorpayOrderId = orderWithPending?.pendingRenewal?.gatewayOrderId;

      console.log(`[PAYMENT-STATUS] Pending renewal found, payment method: ${paymentMethod}`);

      // Check payment status based on method
      if (paymentMethod === 'razorpay' && razorpayOrderId) {
        console.log(`[PAYMENT-STATUS] Checking Razorpay order status: ${razorpayOrderId}`);
        try {
          const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
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
            const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
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
          // Fall through to Cashfree check
        }
      }

      // Check with Cashfree API (default or fallback)
      try {
        console.log(`[PAYMENT-STATUS] Checking Cashfree renewal order status: ${txnId}`);
        
        const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', txnId);
        console.log(`[PAYMENT-STATUS] Cashfree renewal response:`, cashfreeResponse.data);

        if (cashfreeResponse.data && cashfreeResponse.data.length > 0) {
          const payment = cashfreeResponse.data[0];
          
          if (payment.payment_status === 'SUCCESS') {
            console.log(`[PAYMENT-STATUS] ✅ Renewal payment confirmed: ${txnId}`);
            
            return NextResponse.json({
              isRenewal: true,
              renewalTxnId: txnId,
              paymentStatus: 'SUCCESS',
              paymentMethod: 'cashfree',
              message: "Renewal payment confirmed"
            });
          } else {
            console.log(`[PAYMENT-STATUS] ❌ Renewal payment not successful: ${payment.payment_status}`);
            return NextResponse.json({
              isRenewal: true,
              renewalTxnId: txnId,
              paymentStatus: payment.payment_status,
              paymentMethod: 'cashfree',
              message: "Renewal payment pending or failed"
            });
          }
        } else {
          console.log(`[PAYMENT-STATUS] No payment data found for renewal: ${txnId}`);
          
          // For UPI gateway payments, check if we have pending renewal info
          if (paymentMethod === 'upi' && orderWithPending) {
            // UPI payments are verified via webhook, so if we reach here, it's still pending
            return NextResponse.json({
              isRenewal: true,
              renewalTxnId: txnId,
              paymentStatus: 'PENDING',
              paymentMethod: 'upi',
              message: "UPI renewal payment pending - waiting for confirmation"
            });
          }

          return NextResponse.json({
            isRenewal: true,
            renewalTxnId: txnId,
            paymentStatus: 'PENDING',
            message: "Renewal payment not found"
          }, { status: 404 });
        }
      } catch (cashfreeError) {
        console.error('[PAYMENT-STATUS] Cashfree API error for renewal:', cashfreeError);
        return NextResponse.json(
          { message: 'Failed to check renewal payment status', error: cashfreeError.message },
          { status: 500 }
        );
      }
    }

    // Handle NEW ORDER transactions (existing logic)
    const order = await Order.findOne({ clientTxnId: txnId });
    
    if (!order) {
      console.log(`Order not found for clientTxnId: ${txnId}`);
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`Order found: ${order._id}, status: ${order.status}`);

    // If order is already confirmed, check if provisioning is needed
    if (order.status === 'confirmed') {
      console.log(`Order ${order._id} is already confirmed`);
      
      // Check if provisioning was missed (no IP assigned and not in progress)
      const needsProvisioning = !order.ipAddress && 
        order.provisioningStatus !== 'completed' && 
        order.provisioningStatus !== 'in_progress';
      
      if (needsProvisioning) {
        console.log(`[PAYMENT-STATUS] Order ${order._id} confirmed but not provisioned, triggering now...`);
        try {
          const provisioningService = new AutoProvisioningService();
          provisioningService.provisionServer(order._id.toString())
            .then(result => console.log(`[PAYMENT-STATUS] Late provisioning result for ${order._id}:`, result))
            .catch(error => console.error(`[PAYMENT-STATUS] Late provisioning failed for ${order._id}:`, error));
          console.log("[PAYMENT-STATUS] Late provisioning initiated");
        } catch (provisionError) {
          console.error("[PAYMENT-STATUS] Error starting late provisioning:", provisionError);
        }
      }
      
      return NextResponse.json({
        order: {
          id: order._id.toString(),
          status: order.status,
          productName: order.productName,
          memory: order.memory,
          price: order.price,
          clientTxnId: order.clientTxnId,
          createdAt: order.createdAt
        },
        message: "Order already confirmed"
      });
    }

    // Check with Cashfree API
    try {
      console.log(`Checking Cashfree order status: ${order.clientTxnId}`);
      
      const cashfreeResponse = await Cashfree.PGOrderFetchPayments('2023-08-01', order.clientTxnId);
      console.log(`Cashfree order response:`, cashfreeResponse.data);

      // If payment is successful
      if (cashfreeResponse.data && cashfreeResponse.data.length > 0) {
        const payment = cashfreeResponse.data[0];
        
        if (payment.payment_status === 'SUCCESS') {
          console.log(`Payment confirmed for order ${order._id}`);
          
          // Calculate expiry date as exactly 30 days from NOW (payment confirmation time)
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 30);
          
          // Update order status and store payment details
          order.status = 'confirmed';
          order.transactionId = payment.cf_payment_id;
          order.gatewayOrderId = order.clientTxnId; // Cashfree uses clientTxnId as order_id
          order.paymentMethod = 'cashfree';
          order.expiryDate = expiryDate; // Set expiry to 30 days from payment confirmation
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
          await order.save();
          
          console.log(`Order expiry set to: ${expiryDate.toISOString()} (30 days from now)`);

          // 🚀 TRIGGER AUTO-PROVISIONING FOR CASHFREE PAYMENTS
          // This is critical - webhook may not always be received
          // First check if already provisioned or in progress
          const freshOrder = await Order.findById(order._id);
          const alreadyProvisioning = freshOrder?.provisioningStatus === 'in_progress' || 
                                       freshOrder?.provisioningStatus === 'completed' ||
                                       freshOrder?.ipAddress;
          
          if (alreadyProvisioning) {
            console.log(`[PAYMENT-STATUS] ⚠️ Order ${order._id} already provisioning/provisioned, skipping`);
            console.log(`[PAYMENT-STATUS]   → Status: ${freshOrder?.provisioningStatus}`);
            console.log(`[PAYMENT-STATUS]   → IP: ${freshOrder?.ipAddress || 'none'}`);
          } else {
            console.log(`[PAYMENT-STATUS] 🚀 Triggering auto-provisioning for Cashfree order ${order._id}`);
            try {
              const provisioningService = new AutoProvisioningService();

            // Send notifications
            try {
              await NotificationService.notifyOrderConfirmed(order.user, order);
              await NotificationService.notifyOrderProvisioning(order.user, order);
            } catch (notifError) {
              console.error('[PAYMENT-STATUS] Notification error:', notifError);
            }

            // Start provisioning in background (don't await)
            // The provisionServer method now has atomic DB locking to prevent duplicates
            provisioningService.provisionServer(order._id.toString())
              .then(async result => {
                console.log(`[PAYMENT-STATUS] Auto-provisioning completed for order ${order._id}:`, result);
                // Only send notifications if actually provisioned (not skipped due to duplicate)
                if (result.success && !result.alreadyProvisioned && !result.alreadyProvisioning) {
                  await NotificationService.notifyOrderCompleted(order.user, order, {
                    ipAddress: result.ipAddress || 'Available in dashboard',
                    username: result.username || 'root',
                    password: result.password || 'Check dashboard'
                  });
                } else if (!result.success && !result.alreadyProvisioning) {
                  await NotificationService.notifyOrderFailed(order.user, order, result.error);
                }
              })
              .catch(async error => {
                console.error(`[PAYMENT-STATUS] Auto-provisioning failed for order ${order._id}:`, error);
                await NotificationService.notifyOrderFailed(order.user, order, error.message);
              });

              console.log("[PAYMENT-STATUS] Auto-provisioning initiated for Cashfree payment");
            } catch (provisionError) {
              console.error("[PAYMENT-STATUS] Error starting auto-provisioning:", provisionError);
              // Don't fail the response - provisioning can be retried
            }
          }
          
          return NextResponse.json({
            order: {
              id: order._id.toString(),
              status: 'confirmed',
              productName: order.productName,
              memory: order.memory,
              price: order.price,
              clientTxnId: order.clientTxnId,
              createdAt: order.createdAt
            },
            message: "Payment confirmed"
          });
        }
      }
    } catch (cashfreeError) {
      console.error('Cashfree API error:', cashfreeError);
    }

    // Payment not confirmed
    return NextResponse.json({
      order: {
        id: order._id.toString(),
        status: order.status,
        productName: order.productName,
        memory: order.memory,
        price: order.price,
        clientTxnId: order.clientTxnId,
        createdAt: order.createdAt
      },
      message: "Payment pending or failed"
    });
    
  } catch (error) {
    console.error('Error in payment status API:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  } finally {
    console.log("========== PAYMENT STATUS API COMPLETED ==========");
  }
}