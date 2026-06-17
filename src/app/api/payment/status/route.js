import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';
import { getRazorpayClient } from '@/lib/razorpayClient';
import {
  recoverPendingOrderPayment,
  probeGatewayPayment,
} from '@/lib/confirmPendingOrderPayment';
import { enforceOrderAccess } from '@/lib/apiSecurity';

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' 
  ? Cashfree.Environment.SANDBOX 
  : Cashfree.Environment.PRODUCTION;

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
        const accessDenied = await enforceOrderAccess(request, orderWithRenewal);
        if (accessDenied) return accessDenied;

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

      if (!orderWithPending) {
        return NextResponse.json(
          { message: 'Renewal order not found' },
          { status: 404 }
        );
      }

      const pendingAccessDenied = await enforceOrderAccess(request, orderWithPending);
      if (pendingAccessDenied) return pendingAccessDenied;

      const paymentMethod = orderWithPending?.pendingRenewal?.paymentMethod || 'cashfree';
      const razorpayOrderId = orderWithPending?.pendingRenewal?.gatewayOrderId;

      console.log(`[PAYMENT-STATUS] Pending renewal found, payment method: ${paymentMethod}`);

      // Check payment status based on method
      if (paymentMethod === 'razorpay' && razorpayOrderId) {
        console.log(`[PAYMENT-STATUS] Checking Razorpay order status: ${razorpayOrderId}`);
        try {
          const razorpay = getRazorpayClient();
          if (!razorpay) {
            throw new Error('Razorpay credentials not configured');
          }

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

    const accessDenied = await enforceOrderAccess(request, order);
    if (accessDenied) return accessDenied;

    console.log(`Order found: ${order._id}, status: ${order.status}`);

    // If order is already confirmed, check if provisioning is needed
    if (order.status === 'confirmed') {
      console.log(`Order ${order._id} is already confirmed`);

      const needsProvisioning =
        !order.ipAddress &&
        order.provisioningStatus !== 'completed' &&
        order.provisioningStatus !== 'in_progress' &&
        order.provisioningStatus !== 'provisioning' &&
        !order.slotIpPackageId;

      if (needsProvisioning) {
        console.log(`[PAYMENT-STATUS] Order ${order._id} confirmed but not provisioned, triggering now...`);
        const AutoProvisioningService = require('@/services/autoProvisioningService');
        try {
          const provisioningService = new AutoProvisioningService();
          provisioningService.provisionServer(order._id.toString())
            .then((result) => console.log(`[PAYMENT-STATUS] Late provisioning result for ${order._id}:`, result))
            .catch((error) => console.error(`[PAYMENT-STATUS] Late provisioning failed for ${order._id}:`, error));
        } catch (provisionError) {
          console.error('[PAYMENT-STATUS] Error starting late provisioning:', provisionError);
        }
      }

      return NextResponse.json({
        paymentStatus: 'SUCCESS',
        order: {
          id: order._id.toString(),
          status: order.status,
          productName: order.productName,
          memory: order.memory,
          price: order.price,
          clientTxnId: order.clientTxnId,
          createdAt: order.createdAt,
        },
        message: 'Order already confirmed',
      });
    }

    // Recover: probe Cashfree / Razorpay / UPI and confirm when gateway says paid
    const returnedFromPayment = !!reqBody.returnedFromPayment;
    const recovery = await recoverPendingOrderPayment(order, {
      maxAttempts: returnedFromPayment ? 5 : 2,
      delayMs: returnedFromPayment ? 1500 : 0,
    });

    if (recovery.confirmed) {
      const confirmedOrder = recovery.order || order;
      return NextResponse.json({
        paymentStatus: 'SUCCESS',
        order: {
          id: confirmedOrder._id.toString(),
          status: 'confirmed',
          productName: confirmedOrder.productName,
          memory: confirmedOrder.memory,
          price: confirmedOrder.price,
          clientTxnId: confirmedOrder.clientTxnId,
          createdAt: confirmedOrder.createdAt,
        },
        message: recovery.alreadyProcessed ? 'Order already confirmed' : 'Payment confirmed',
      });
    }

    const gatewayProbe = await probeGatewayPayment(order);

    return NextResponse.json({
      paymentStatus: gatewayProbe.status || 'PENDING',
      order: {
        id: order._id.toString(),
        status: order.status,
        productName: order.productName,
        memory: order.memory,
        price: order.price,
        clientTxnId: order.clientTxnId,
        createdAt: order.createdAt,
      },
      message:
        gatewayProbe.status === 'PENDING' || !gatewayProbe.status
          ? 'Payment is still processing — please wait, do not retry payment'
          : 'Payment pending or failed',
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