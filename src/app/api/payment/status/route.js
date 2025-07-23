import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

// Configure with your actual API key
const UPI_GATEWAY_API_KEY = process.env.UPI_GATEWAY_API_KEY || "9502f310-cc59-4217-ad6c-e24924c01478";
const UPI_GATEWAY_STATUS_URL = "https://api.ekqr.in/api/v2/check_order_status";

export async function POST(request) {
  await connectDB();
  console.log("[PAYMENT-STATUS] Checking payment status...");
  console.log("[PAYMENT-STATUS] Environment:", process.env.NODE_ENV);
  console.log("[PAYMENT-STATUS] API URL:", UPI_GATEWAY_STATUS_URL);

  try {
    // Read request data
    const reqBody = await request.json();
    console.log("[PAYMENT-STATUS] Request body:", reqBody);
    const { clientTxnId, manualSuccess, returnedFromPayment } = reqBody;

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
    let order;
    try {
      order = await Order.findOne({ clientTxnId });
    } catch (dbError) {
      console.error("[PAYMENT-STATUS] Database error:", dbError);
      return NextResponse.json(
        { message: 'Database error', error: dbError.message },
        { status: 500 }
      );
    }
    
    if (!order) {
      console.log(`[PAYMENT-STATUS] Order not found for clientTxnId: ${clientTxnId}`);
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`[PAYMENT-STATUS] Found order: ${order._id}, status: ${order.status}`);

    // Handle manual success flag (for testing/debugging)
    if (manualSuccess === true && process.env.NODE_ENV === 'development') {
      console.log(`[PAYMENT-STATUS] Manual success flag received for order ${order._id}, updating status`);
      try {
        order.status = 'confirmed';
        await order.save();
        console.log(`[PAYMENT-STATUS] Order status updated to confirmed via manual flag`);
      } catch (saveError) {
        console.error("[PAYMENT-STATUS] Error saving order status:", saveError);
        return NextResponse.json(
          { message: 'Error saving order status', error: saveError.message },
          { status: 500 }
        );
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
          id: order._id.toString(),
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

    // If user just returned from payment and we want to be optimistic
    if (returnedFromPayment === true) {
      console.log(`[PAYMENT-STATUS] User returned from payment page, setting optimistic status`);
      try {
        order.status = 'confirmed';
        await order.save();
        console.log(`[PAYMENT-STATUS] Order status updated to confirmed via optimistic update`);
      } catch (saveError) {
        console.error("[PAYMENT-STATUS] Error saving optimistic status:", saveError);
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
        gatewayResponse: { 
          status: true, 
          message: "Optimistic confirmation" 
        }
      });
    }

    // Check and update order status
    try {
      const result = await checkAndUpdateOrderStatus(order);
      console.log(`[PAYMENT-STATUS] Order ${order._id} check result:`, result);

      return NextResponse.json({
        order: {
          id: order._id.toString(),
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
    } catch (checkError) {
      console.error("[PAYMENT-STATUS] Error checking payment status:", checkError);
      return NextResponse.json(
        { 
          message: 'Error checking payment status', 
          error: checkError.message,
          order: {
            id: order._id.toString(),
            status: order.status,
            clientTxnId: order.clientTxnId
          }
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[PAYMENT-STATUS] Error in main handler:', error);
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
      console.log(`[PAYMENT-STATUS] Sending request to gateway:`, statusData);
      const response = await fetch(UPI_GATEWAY_STATUS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusData),
      });

      console.log(`[PAYMENT-STATUS] Gateway response status: ${response.status}`);
      
      // Handle non-200 responses
      if (!response.ok) {
        console.error(`[PAYMENT-STATUS] Gateway returned error ${response.status}`);
        try {
          const errorText = await response.text();
          console.error(`[PAYMENT-STATUS] Error response: ${errorText}`);
        } catch (e) {
          console.error(`[PAYMENT-STATUS] Could not read error response`);
        }
        continue;
      }
      
      try {
        statusResponse = await response.json();
      } catch (jsonError) {
        console.error(`[PAYMENT-STATUS] Error parsing JSON response:`, jsonError);
        continue;
      }
      
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

  // For now, always mark as successful to debug production issues
  // REMOVE THIS IN PRODUCTION - FOR DEBUGGING ONLY
  if (process.env.FORCE_SUCCESS === 'true') {
    console.log(`[PAYMENT-STATUS] FORCED SUCCESS MODE - updating order ${order._id} to confirmed status`);
    try {
      order.status = 'confirmed';
      await order.save();
      console.log(`[PAYMENT-STATUS] Order ${order._id} updated to confirmed status (FORCED)`);
      
      return {
        orderId: order._id,
        clientTxnId: order.clientTxnId,
        status: order.status,
        paymentStatus: 'success',
        forced: true,
        gatewayResponse: { status: true, message: "Forced success" }
      };
    } catch (saveError) {
      console.error(`[PAYMENT-STATUS] Error saving forced status update:`, saveError);
    }
  }

  // Check if payment was successful and update order
  if (foundValidResponse && statusResponse.status && statusResponse.data?.status === 'success') {
    console.log(`[PAYMENT-STATUS] Payment confirmed for order ${order._id} with date ${successfulDate}`);
    
    // Only update if the order is still pending
    if (order.status === 'pending') {
      console.log(`[PAYMENT-STATUS] Updating order ${order._id} to confirmed status`);
      try {
        order.status = 'confirmed';
        order.transactionId = statusResponse.data.upi_txn_id || '';
        await order.save();
        console.log(`[PAYMENT-STATUS] Order ${order._id} updated to confirmed status`);
      } catch (saveError) {
        console.error(`[PAYMENT-STATUS] Error saving status update:`, saveError);
        return {
          orderId: order._id,
          clientTxnId: order.clientTxnId,
          status: 'error',
          error: saveError.message,
          gatewayResponse: statusResponse
        };
      }
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