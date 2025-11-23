import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { Cashfree } from 'cashfree-pg';

// Initialize Cashfree
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT || 'PRODUCTION';

export async function POST(request) {
  await connectDB();
  
  console.log("========== PAYMENT STATUS API CALLED ==========");
  console.log(`Server timestamp: ${new Date().toISOString()}`);

  try {
    const reqBody = await request.json();
    console.log(`Request body: ${JSON.stringify(reqBody)}`);
    const { clientTxnId } = reqBody;

    if (!clientTxnId) {
      console.log("ERROR: Missing transaction ID");
      return NextResponse.json(
        { message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    // Find the order
    const order = await Order.findOne({ clientTxnId });
    
    if (!order) {
      console.log(`Order not found for clientTxnId: ${clientTxnId}`);
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
          
          // Update order status
          order.status = 'confirmed';
          order.transactionId = payment.cf_payment_id;
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