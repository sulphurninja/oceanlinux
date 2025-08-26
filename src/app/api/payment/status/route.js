import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

    // Check with Razorpay API
    try {
      console.log(`Checking Razorpay order status: ${order.gatewayOrderId}`);
      
      const razorpayOrder = await razorpay.orders.fetch(order.gatewayOrderId);
      console.log(`Razorpay order status: ${razorpayOrder.status}`);

      // If order is paid, get payment details
      if (razorpayOrder.status === 'paid') {
        const payments = await razorpay.orders.fetchPayments(order.gatewayOrderId);
        
        if (payments.items.length > 0) {
          const payment = payments.items[0];
          
          if (payment.status === 'captured') {
            console.log(`Payment confirmed for order ${order._id}`);
            
            // Update order status
            order.status = 'confirmed';
            order.transactionId = payment.id;
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
      }
    } catch (razorpayError) {
      console.error('Razorpay API error:', razorpayError);
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