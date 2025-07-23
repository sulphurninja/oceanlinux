import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
// Remove this import since we're not using it
// import { getDataFromToken } from '@/helper/getDataFromToken';

// Configure with your actual API key
const UPI_GATEWAY_API_KEY = process.env.UPI_GATEWAY_API_KEY || "9502f310-cc59-4217-ad6c-e24924c01478";
const UPI_GATEWAY_STATUS_URL = "https://api.ekqr.in/api/check_order_status";

export async function POST(request) {
  await connectDB();
  console.log("[PAYMENT-STATUS] Checking payment status...");

  try {
    // Remove user authentication check completely
    // const userId = await getDataFromToken(request);
    // if (!userId) {
    //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    // }

    // Read request data
    const reqBody = await request.json();
    console.log("[PAYMENT-STATUS] Request body:", reqBody);
    const { clientTxnId, manualSuccess, checkAllPending } = reqBody;

    // If checking all pending orders, we need to modify this since we don't have userId
    if (checkAllPending) {
      console.log(`[PAYMENT-STATUS] Checking all pending orders`);
      const pendingOrders = await Order.find({ 
        status: 'pending'
      }).sort({ createdAt: -1 });
      
      console.log(`[PAYMENT-STATUS] Found ${pendingOrders.length} pending orders`);
      
      const results = [];
      
      // Process each pending order
      for (const order of pendingOrders) {
        try {
          const orderResult = await checkAndUpdateOrderStatus(order);
          results.push(orderResult);
        } catch (orderError) {
          console.error(`[PAYMENT-STATUS] Error checking order ${order._id}:`, orderError);
          results.push({
            orderId: order._id,
            clientTxnId: order.clientTxnId,
            status: 'error',
            error: orderError.message
          });
        }
      }
      
      console.log(`[PAYMENT-STATUS] Completed checking ${results.length} pending orders`);
      return NextResponse.json({
        success: true,
        results
      });
    }

    // Regular case: check specific order
    if (!clientTxnId) {
      console.log("[PAYMENT-STATUS] Missing transaction ID");
      return NextResponse.json(
        { message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    console.log(`[PAYMENT-STATUS] Looking for order with clientTxnId: ${clientTxnId}`);

    // Find the order without requiring user ID
    const order = await Order.findOne({ clientTxnId });
    
    if (!order) {
      console.log(`[PAYMENT-STATUS] Order not found for clientTxnId: ${clientTxnId}`);
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`[PAYMENT-STATUS] Found order: ${order._id}, status: ${order.status}`);

    // Handle manual success flag (for testing/debugging)
    if (manualSuccess === true) {
      console.log(`[PAYMENT-STATUS] Manual success flag received for order ${order._id}, updating status`);
      order.status = 'confirmed';
      await order.save();
      
      return NextResponse.json({
        order: {
          id: order._id,
          status: 'confirmed',
          productName: order.productName,
          memory: order.memory,
          price: order.price,
          clientTxnId: order.clientTxnId,
          createdAt: order.createdAt
        },
        gatewayResponse: { 
          status: true, 
          message: "Manual confirmation" 
        }
      });
    }

    // If order is already confirmed, just return it
    if (order.status === 'confirmed') {
      console.log(`[PAYMENT-STATUS] Order ${order._id} is already confirmed`);
      return NextResponse.json({
        order: {
          id: order._id,
          status: order.status,
          productName: order.productName,
          memory: order.memory,
          price: order.price,
          clientTxnId: order.clientTxnId,
          createdAt: order.createdAt
        },
        gatewayResponse: { 
          status: true, 
          message: "Already confirmed" 
        }
      });
    }

    // Check and update order status
    const result = await checkAndUpdateOrderStatus(order);
    console.log(`[PAYMENT-STATUS] Order ${order._id} check result:`, result);

    return NextResponse.json({
      order: {
        id: order._id,
        status: order.status, // This will reflect any updates
        productName: order.productName,
        memory: order.memory,
        price: order.price,
        clientTxnId: order.clientTxnId,
        createdAt: order.createdAt
      },
      gatewayResponse: result.gatewayResponse || { status: false, msg: "No valid response from gateway" },
      checkResult: result
    });

  } catch (error) {
    console.error('[PAYMENT-STATUS] Error checking payment status:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}

// Helper function to check and update an order's status
async function checkAndUpdateOrderStatus(order) {
  console.log(`[PAYMENT-STATUS] Checking payment status for order ${order._id} (${order.clientTxnId})`);
  
  // Try multiple date formats to handle potential timezone issues
  const createdAt = new Date(order.createdAt);
  
  // Format dates as DD-MM-YYYY
  const formatDate = (date) => {
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  };
  
  // Main date format (DD-MM-YYYY)
  const txnDate = formatDate(createdAt);
  
  // Alternative date formats to try
  const today = new Date();
  const todayDate = formatDate(today);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = formatDate(yesterday);
  
  // Try all date formats
  const datesToTry = [txnDate, todayDate, yesterdayDate];
  let foundValidResponse = false;
  let statusResponse;
  let successfulDate = null;
  
  console.log(`[PAYMENT-STATUS] Will try dates for order ${order._id}: ${datesToTry.join(', ')}`);

  // Try each date until we find a valid response
  for (const dateToTry of datesToTry) {
    console.log(`[PAYMENT-STATUS] Checking payment for order ${order._id} with date: ${dateToTry}`);
    
    const statusData = {
      key: UPI_GATEWAY_API_KEY,
      client_txn_id: order.clientTxnId,
      txn_date: dateToTry
    };

    try {
      const response = await fetch(UPI_GATEWAY_STATUS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusData),
      });

      statusResponse = await response.json();
      console.log(`[PAYMENT-STATUS] Gateway response for ${order._id} with date ${dateToTry}:`, statusResponse);

      if (statusResponse.status && statusResponse.data && Object.keys(statusResponse.data).length > 0) {
        console.log(`[PAYMENT-STATUS] Found valid response for order ${order._id} with date ${dateToTry}`);
        foundValidResponse = true;
        successfulDate = dateToTry;
        break;
      }
    } catch (error) {
      console.error(`[PAYMENT-STATUS] Error checking order ${order._id} with date ${dateToTry}:`, error);
    }
  }

  // Check if payment was successful and update order
  if (foundValidResponse && statusResponse.status && statusResponse.data?.status === 'success') {
    console.log(`[PAYMENT-STATUS] Payment confirmed for order ${order._id} with date ${successfulDate}`);
    
    // Only update if the order is still pending
    if (order.status === 'pending') {
      console.log(`[PAYMENT-STATUS] Updating order ${order._id} to confirmed status`);
      order.status = 'confirmed';
      order.transactionId = statusResponse.data.upi_txn_id || '';
      await order.save();
      console.log(`[PAYMENT-STATUS] Order ${order._id} updated to confirmed status`);
    } else {
      console.log(`[PAYMENT-STATUS] Order ${order._id} is already in ${order.status} status, no update needed`);
    }
    
    return {
      orderId: order._id,
      clientTxnId: order.clientTxnId,
      status: order.status,
      paymentStatus: 'success',
      checkedDate: successfulDate,
      gatewayResponse: statusResponse
    };
  } else {
    console.log(`[PAYMENT-STATUS] Payment not confirmed for order ${order._id}`);
    return {
      orderId: order._id,
      clientTxnId: order.clientTxnId,
      status: order.status,
      paymentStatus: 'not_confirmed',
      checkedDates: datesToTry,
      gatewayResponse: statusResponse
    };
  }
}