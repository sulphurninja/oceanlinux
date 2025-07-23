import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

// Configure with your actual API key
const UPI_GATEWAY_API_KEY = process.env.UPI_GATEWAY_API_KEY || "9502f310-cc59-4217-ad6c-e24924c01478";
const UPI_GATEWAY_STATUS_URL = "https://api.ekqr.in/api/v2/check_order_status";

export async function POST(request) {
  await connectDB();
  
  // Add comprehensive logging
  console.log("========== PAYMENT STATUS API CALLED ==========");
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Server timestamp: ${new Date().toISOString()}`);
  console.log(`Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(`API URL: ${UPI_GATEWAY_STATUS_URL}`);

  try {
    // Read request data
    const reqBody = await request.json();
    console.log(`Request body: ${JSON.stringify(reqBody)}`);
    const { clientTxnId } = reqBody;

    // Validate transaction ID
    if (!clientTxnId) {
      console.log("ERROR: Missing transaction ID");
      return NextResponse.json(
        { message: 'Missing transaction ID' },
        { status: 400 }
      );
    }

    // Find the order
    let order;
    try {
      console.log(`Looking for order with clientTxnId: ${clientTxnId}`);
      order = await Order.findOne({ clientTxnId });
      
      if (order) {
        console.log(`Order found: ${order._id}`);
        console.log(`Order status: ${order.status}`);
        console.log(`Order createdAt: ${order.createdAt}`);
      } else {
        console.log(`Order not found for clientTxnId: ${clientTxnId}`);
      }
    } catch (dbError) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        { message: 'Database error', error: dbError.message },
        { status: 500 }
      );
    }
    
    if (!order) {
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

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

    // Check with the payment gateway
    console.log(`Checking payment status with gateway for order ${order._id}`);
    
    // Format dates using Indian Standard Time (IST)
    const formatDateInIST = (date) => {
      // Force the date to be formatted in Indian Standard Time (IST)
      const options = { timeZone: 'Asia/Kolkata' };
      const istDate = new Date(date.toLocaleString('en-US', options));
      
      return `${String(istDate.getDate()).padStart(2, '0')}-${String(istDate.getMonth() + 1).padStart(2, '0')}-${istDate.getFullYear()}`;
    };
    
    // Generate multiple dates to try, all in IST
    const orderCreatedAt = new Date(order.createdAt);
    const orderDateFormatted = formatDateInIST(orderCreatedAt);
    
    const today = new Date();
    const todayFormatted = formatDateInIST(today);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayFormatted = formatDateInIST(yesterday);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowFormatted = formatDateInIST(tomorrow);
    
    // Log all date formats we'll try
    console.log(`Order date (original): ${order.createdAt}`);
    console.log(`Order date (IST formatted): ${orderDateFormatted}`);
    console.log(`Today's date (IST formatted): ${todayFormatted}`);
    console.log(`Yesterday's date (IST formatted): ${yesterdayFormatted}`);
    console.log(`Tomorrow's date (IST formatted): ${tomorrowFormatted}`);
    
    // Try all possible date formats
    const datesToTry = [orderDateFormatted, todayFormatted, yesterdayFormatted, tomorrowFormatted];
    console.log(`Will try dates (IST): ${JSON.stringify(datesToTry)}`);
    
    let gatewaySuccess = false;
    let finalResponse = null;
    let successfulDate = null;
    
    // Try each date until we get a successful response
    for (const dateToTry of datesToTry) {
      console.log(`Trying with date: ${dateToTry}`);
      
      const statusData = {
        key: UPI_GATEWAY_API_KEY,
        client_txn_id: order.clientTxnId,
        txn_date: dateToTry
      };
      
      console.log(`Sending to gateway: ${JSON.stringify(statusData)}`);
      
      try {
        const response = await fetch(UPI_GATEWAY_STATUS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(statusData),
        });
        
        console.log(`Gateway response status: ${response.status}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gateway error (${response.status}): ${errorText}`);
          continue;
        }
        
        const statusResponse = await response.json();
        console.log(`Gateway response with date ${dateToTry}: ${JSON.stringify(statusResponse)}`);
        
        // Store response for reference
        finalResponse = statusResponse;
        
        // We found a valid response with success status
        if (statusResponse.status && statusResponse.data && statusResponse.data.status === 'success') {
          console.log(`SUCCESS! Payment confirmed with date ${dateToTry}`);
          gatewaySuccess = true;
          successfulDate = dateToTry;
          
          // Update order status
          order.status = 'confirmed';
          order.transactionId = statusResponse.data.upi_txn_id || '';
          await order.save();
          console.log(`Order ${order._id} status updated to confirmed`);
          
          // Return successful response
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
            gatewayResponse: statusResponse,
            message: "Payment confirmed",
            successfulDate
          });
        } else if (statusResponse.code === 1610) {
          console.log(`Record not found with date ${dateToTry}`);
        } else {
          console.log(`Unknown status with date ${dateToTry}: ${JSON.stringify(statusResponse)}`);
        }
      } catch (fetchError) {
        console.error(`Error fetching gateway for date ${dateToTry}:`, fetchError);
      }
    }
    
    // If we get here, payment was not confirmed with any date
    console.log(`Payment not confirmed for order ${order._id} with any date format`);
    
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
      gatewayResponse: finalResponse,
      message: "Payment not confirmed",
      triedDates: datesToTry
    });
    
  } catch (error) {
    console.error('Error in main handler:', error);
    return NextResponse.json(
      { message: 'Server error', error: error.message },
      { status: 500 }
    );
  } finally {
    console.log("========== PAYMENT STATUS API COMPLETED ==========");
  }
}