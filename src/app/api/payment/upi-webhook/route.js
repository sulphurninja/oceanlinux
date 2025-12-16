import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import NotificationService from '@/services/notificationService';
const AutoProvisioningService = require('@/services/autoProvisioningService');

/**
 * UPI Gateway Webhook Handler
 * Documentation: https://documenter.getpostman.com/view/1665248/2s9Y5U15tk
 * 
 * Webhook receives form-urlencoded data with following fields:
 * - amount, client_txn_id, createdAt, customer_email, customer_mobile
 * - customer_name, customer_vpa, id, p_info, redirect_url, remark
 * - status (success/failure), txnAt, udf1, udf2, udf3, upi_txn_id
 */

// Verify payment with UPI Gateway API
async function verifyUPIPayment(clientTxnId) {
  const UPI_GATEWAY_KEY = process.env.UPI_GATEWAY_API_KEY;
  if (!UPI_GATEWAY_KEY) {
    console.error('[UPI Webhook] UPI_GATEWAY_API_KEY not configured');
    return { verified: false, error: 'API key not configured' };
  }

  try {
    const response = await fetch('https://merchant.upigateway.com/api/check_order_status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: UPI_GATEWAY_KEY,
        client_txn_id: clientTxnId
      })
    });

    const data = await response.json();
    console.log('[UPI Webhook] Verification response:', data);

    if (data.status === true && data.data?.status === 'success') {
      return { 
        verified: true, 
        amount: parseFloat(data.data.amount),
        upi_txn_id: data.data.upi_txn_id
      };
    }

    return { verified: false, status: data.data?.status, error: data.msg };
  } catch (error) {
    console.error('[UPI Webhook] Verification error:', error);
    return { verified: false, error: error.message };
  }
}

export async function POST(request) {
  await connectDB();

  console.log("========== UPI GATEWAY WEBHOOK ==========");

  try {
    // Parse form-urlencoded data
    const formData = await request.formData();
    
    const webhookData = {
      amount: formData.get('amount'),
      client_txn_id: formData.get('client_txn_id'),
      createdAt: formData.get('createdAt'),
      customer_email: formData.get('customer_email'),
      customer_mobile: formData.get('customer_mobile'),
      customer_name: formData.get('customer_name'),
      customer_vpa: formData.get('customer_vpa'),
      id: formData.get('id'), // UPI Gateway order ID
      p_info: formData.get('p_info'),
      redirect_url: formData.get('redirect_url'),
      remark: formData.get('remark'),
      status: formData.get('status'), // success or failure
      txnAt: formData.get('txnAt'),
      udf1: formData.get('udf1'),
      udf2: formData.get('udf2'),
      udf3: formData.get('udf3'),
      upi_txn_id: formData.get('upi_txn_id') // UTR number
    };

    console.log('[UPI Webhook] Received data:', webhookData);

    const { client_txn_id, status, upi_txn_id, id, amount: webhookAmount } = webhookData;

    if (!client_txn_id) {
      console.error('[UPI Webhook] Missing client_txn_id');
      return NextResponse.json(
        { success: false, message: 'Missing client_txn_id' },
        { status: 400 }
      );
    }

    // Find the order in our database
    const order = await Order.findOne({ clientTxnId: client_txn_id });
    
    if (!order) {
      console.error(`[UPI Webhook] Order not found: ${client_txn_id}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    console.log(`[UPI Webhook] Found order: ${order._id}, Status from webhook: ${status}`);

    // Only process successful payments
    if (status === 'success') {
      // SECURITY: Verify the payment with UPI Gateway API before confirming
      console.log('[UPI Webhook] Verifying payment with UPI Gateway API...');
      const verification = await verifyUPIPayment(client_txn_id);
      
      if (!verification.verified) {
        console.error(`[UPI Webhook] Payment verification FAILED for ${client_txn_id}:`, verification);
        return NextResponse.json(
          { success: false, message: 'Payment verification failed', error: verification.error },
          { status: 400 }
        );
      }

      // SECURITY: Verify the amount matches what we expected
      const expectedAmount = order.price;
      const paidAmount = verification.amount || parseFloat(webhookAmount);
      
      if (Math.abs(paidAmount - expectedAmount) > 1) { // Allow ₹1 tolerance for rounding
        console.error(`[UPI Webhook] Amount mismatch! Expected: ${expectedAmount}, Paid: ${paidAmount}`);
        return NextResponse.json(
          { success: false, message: 'Payment amount mismatch' },
          { status: 400 }
        );
      }

      console.log(`[UPI Webhook] Payment verified! Amount: ${paidAmount}, Expected: ${expectedAmount}`);

      // Calculate expiry date as exactly 30 days from NOW (payment confirmation time)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      // Update order status
      order.status = 'confirmed';
      order.transactionId = verification.upi_txn_id || upi_txn_id || id;
      order.gatewayOrderId = id; // Store UPI Gateway order ID
      order.expiryDate = expiryDate; // Set expiry to 30 days from payment confirmation
      order.paymentDetails = {
        upi_txn_id: verification.upi_txn_id || upi_txn_id,
        customer_vpa: webhookData.customer_vpa,
        txnAt: webhookData.txnAt,
        remark: webhookData.remark,
        verified: true,
        verifiedAmount: paidAmount
      };
      await order.save();

      console.log(`[UPI Webhook] Order ${order._id} confirmed with UPI txn ${upi_txn_id}`);
      console.log(`[UPI Webhook] Order expiry set to: ${expiryDate.toISOString()} (30 days from now)`);

      // Send notifications
      try {
        await NotificationService.notifyOrderConfirmed(order.user, order);
      } catch (notifError) {
        console.error('[UPI Webhook] Failed to create payment confirmation notification:', notifError);
      }

      // Trigger auto-provisioning
      try {
        const provisioningService = new AutoProvisioningService();

        // Create notification for provisioning start
        await NotificationService.notifyOrderProvisioning(order.user, order);

        // Start provisioning in background
        provisioningService.provisionServer(order._id.toString())
          .then(async result => {
            console.log(`[UPI Webhook] Auto-provisioning completed for order ${order._id}:`, result);

            if (result.success) {
              await NotificationService.notifyOrderCompleted(order.user, order, {
                ipAddress: result.ipAddress || 'Available in dashboard',
                username: result.username || 'root',
                password: result.password || 'Check dashboard'
              });
            } else {
              await NotificationService.notifyOrderFailed(order.user, order, result.error);
            }
          })
          .catch(async error => {
            console.error(`[UPI Webhook] Auto-provisioning failed for order ${order._id}:`, error);
            await NotificationService.notifyOrderFailed(order.user, order, error.message);
          });

        console.log("[UPI Webhook] Auto-provisioning initiated");
      } catch (error) {
        console.error("[UPI Webhook] Error starting auto-provisioning:", error);
        // Don't fail the response - provisioning can be retried
      }

      return NextResponse.json({
        success: true,
        message: 'Payment confirmed and order processed'
      });

    } else if (status === 'failure') {
      // Update order status to failed
      order.status = 'failed';
      order.paymentDetails = {
        remark: webhookData.remark,
        txnAt: webhookData.txnAt
      };
      await order.save();

      console.log(`[UPI Webhook] Order ${order._id} marked as failed`);

      return NextResponse.json({
        success: true,
        message: 'Payment failure recorded'
      });

    } else {
      console.log(`[UPI Webhook] Unknown status: ${status}`);
      return NextResponse.json({
        success: true,
        message: 'Webhook received'
      });
    }

  } catch (error) {
    console.error('[UPI Webhook] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}

