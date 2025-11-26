import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';

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
      
      // Check with Cashfree API for renewal payment status
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
              message: "Renewal payment confirmed"
            });
          } else {
            console.log(`[PAYMENT-STATUS] ❌ Renewal payment not successful: ${payment.payment_status}`);
            return NextResponse.json({
              isRenewal: true,
              renewalTxnId: txnId,
              paymentStatus: payment.payment_status,
              message: "Renewal payment pending or failed"
            });
          }
        } else {
          console.log(`[PAYMENT-STATUS] No payment data found for renewal: ${txnId}`);
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

    // If order is already confirmed, just return it
    if (order.status === 'confirmed') {
      console.log(`Order ${order._id} is already confirmed`);
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
          
          // Update order status and store payment details
          order.status = 'confirmed';
          order.transactionId = payment.cf_payment_id;
          order.gatewayOrderId = order.clientTxnId; // Cashfree uses clientTxnId as order_id
          order.paymentMethod = 'cashfree';
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