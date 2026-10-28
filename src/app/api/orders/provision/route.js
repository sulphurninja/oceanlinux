import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceAdmin, enforceOrderAccess, isCronAuthorized } from '@/lib/apiSecurity';
const AutoProvisioningService = require('@/services/autoProvisioningService');
const { customerApiCatchPayload } = require('@/lib/customerFacingErrors');

export async function POST(request) {
  const isCron = isCronAuthorized(request);
  if (!isCron) {
    const denied = await enforceAdmin(request);
    if (denied) return denied;
  }

  await connectDB();
  
  console.log('\n' + '='.repeat(80));
  console.log('[PROVISION API] Manual provision request received');
  console.log('='.repeat(80));
  
  try {
    const { orderId, orderIds, force } = await request.json();
    // Only an authenticated admin (never cron) may override the payment guard
    // to deliver a complimentary / manually-settled order.
    const allowUnpaid = force === true && !isCron;
    const provisioningService = new AutoProvisioningService();

    if (orderId) {
      console.log(`[PROVISION API] Single order provision requested: ${orderId}`);
      
      // === CRITICAL: Check if order is already being provisioned ===
      const order = await Order.findById(orderId);
      
      if (!order) {
        console.error(`[PROVISION API] ❌ Order not found: ${orderId}`);
        return NextResponse.json({
          success: false,
          message: 'Order not found'
        }, { status: 404 });
      }

      console.log(`[PROVISION API] Order status: ${order.status}`);
      console.log(`[PROVISION API] Provisioning status: ${order.provisioningStatus || 'none'}`);
      console.log(`[PROVISION API] Auto-provisioned: ${order.autoProvisioned}`);
      console.log(`[PROVISION API] Provider: ${order.provider || 'not set'}`);
      console.log(`[PROVISION API] IP Address: ${order.ipAddress || 'none'}`);

      // Check if already provisioned successfully
      if (order.provisioningStatus === 'active' && order.ipAddress) {
        console.log(`[PROVISION API] ✅ Order already provisioned successfully`);
        return NextResponse.json({
          success: true,
          message: 'Order already provisioned',
          alreadyProvisioned: true,
          details: {
            ipAddress: order.ipAddress,
            username: order.username,
            provider: order.provider
          }
        });
      }

      // Check if currently being provisioned
      if (order.provisioningStatus === 'provisioning') {
        console.log(`[PROVISION API] ⏳ Order is currently being provisioned`);
        return NextResponse.json({
          success: false,
          message: 'Order is currently being provisioned. Please wait...',
          inProgress: true
        }, { status: 409 }); // 409 Conflict
      }

      // Check if order has failed and needs retry
      const canRetry = order.provisioningStatus === 'failed' || !order.provisioningStatus;
      
      if (!canRetry && order.provisioningStatus !== 'pending') {
        console.log(`[PROVISION API] ❌ Order cannot be provisioned (status: ${order.provisioningStatus})`);
        return NextResponse.json({
          success: false,
          message: `Order cannot be provisioned (current status: ${order.provisioningStatus})`
        }, { status: 400 });
      }

      console.log(`[PROVISION API] ✅ Order can be provisioned, starting...`);
      
      // DON'T set order to 'provisioning' here - let the provisioning service handle it
      // This prevents race conditions where the duplicate check blocks manual retries
      // The provisioning service will set the status after acquiring locks

      // Provision single order
      const result = await provisioningService.provisionServer(orderId, { allowUnpaid });

      console.log(`[PROVISION API] Provisioning result:`, {
        success: result.success,
        error: result.error || 'none'
      });

      // Payment guard blocked an unpaid order — surface a clear, actionable error.
      if (!result.success && result.paymentRequired) {
        return NextResponse.json({
          success: false,
          paymentRequired: true,
          message:
            'This order has no confirmed payment. It will NOT be provisioned. ' +
            'Verify the payment first, or re-submit with force:true to deliver a complimentary order.',
          details: result
        }, { status: 402 }); // 402 Payment Required
      }

      return NextResponse.json({
        success: result.success,
        message: result.nexaPending
          ? 'Nexa is still provisioning this IP. It stays locked and will be assigned when Nexa delivers it.'
          : result.success ? 'Server provisioned successfully' : 'Provisioning failed',
        details: result
      });

    } else if (orderIds && Array.isArray(orderIds)) {
      // Bulk provision multiple orders
      const results = await provisioningService.bulkProvision(orderIds);

      return NextResponse.json({
        success: true,
        message: 'Bulk provisioning completed',
        results
      });

    } else {
      return NextResponse.json(
        { message: 'Either orderId or orderIds array is required' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Provisioning API error:', error);
    return NextResponse.json(
      { message: 'Provisioning failed', ...customerApiCatchPayload(error.message, { action: 'provision' }) },
      { status: 500 }
    );
  }
}

// Get provisioning status
export async function GET(request) {
  await connectDB();

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { message: 'orderId is required' },
        { status: 400 }
      );
    }
    const order = await Order.findById(orderId).select(
      'user provisioningStatus provisioningError hostycareServiceId autoProvisioned'
    );
    if (!order) {
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    if (!isCronAuthorized(request)) {
      const denied = await enforceOrderAccess(request, order);
      if (denied) return denied;
    }

    return NextResponse.json({
      orderId,
      provisioningStatus: order.provisioningStatus,
      provisioningError: order.provisioningError,
      hostycareServiceId: order.hostycareServiceId,
      autoProvisioned: order.autoProvisioned
    });

  } catch (error) {
    console.error('Get provisioning status error:', error);
    return NextResponse.json(
      { message: 'Failed to get provisioning status', ...customerApiCatchPayload(error.message, { action: 'provision' }) },
      { status: 500 }
    );
  }
}
