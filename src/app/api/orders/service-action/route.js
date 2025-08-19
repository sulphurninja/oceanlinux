import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const HostycareAPI = require('@/services/hostycareApi');

export async function GET(request) {
  try {
    await connectDB();
    const userId = await getDataFromToken(request);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) return NextResponse.json({ message: 'orderId is required' }, { status: 400 });

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    if (!order.hostycareServiceId) return NextResponse.json({ message: 'No Hostycare service attached' }, { status: 400 });

    const api = new HostycareAPI();
    const [details, info] = await Promise.all([
      api.getServiceDetails(order.hostycareServiceId),
      api.getServiceInfo(order.hostycareServiceId).catch(() => null)
    ]);

    // Sync the latest server state to our database
    await syncServerState(order._id, details, info);

    return NextResponse.json({ success: true, serviceId: order.hostycareServiceId, details, info });
  } catch (error) {
    console.error('[SERVICE-ACTION][GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const userId = await getDataFromToken(request);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { orderId, action, payload } = await request.json();
    if (!orderId || !action) return NextResponse.json({ message: 'orderId and action are required' }, { status: 400 });

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    if (!order.hostycareServiceId) return NextResponse.json({ message: 'No Hostycare service attached' }, { status: 400 });

    const api = new HostycareAPI();
    const sid = order.hostycareServiceId;
    let result;

    switch (action) {
      case 'start':
        result = await api.startService(sid);
        // Update local status to reflect starting state
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'active',
          lastAction: 'start',
          lastActionTime: new Date()
        });
        break;

      case 'stop':
        result = await api.stopService(sid);
        // Update local status to reflect stopped state
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'suspended',
          lastAction: 'stop',
          lastActionTime: new Date()
        });
        break;

      case 'reboot':
        result = await api.rebootService(sid);
        // Update local status to reflect reboot action
        await Order.findByIdAndUpdate(orderId, {
          lastAction: 'reboot',
          lastActionTime: new Date()
        });
        break;

      case 'changepassword':
        if (!payload?.password) return NextResponse.json({ message: 'password is required' }, { status: 400 });
        result = await api.changePassword(sid, payload.password);
        // Sync the new password into our Order record
        await Order.findByIdAndUpdate(orderId, {
          password: payload.password,
          lastAction: 'changepassword',
          lastActionTime: new Date()
        });
        break;

      case 'reinstall':
        if (!payload?.password) return NextResponse.json({ message: 'password is required' }, { status: 400 });
        result = await api.reinstallService(sid, payload.password);
        // Update local password and status to reflect the reinstall
        await Order.findByIdAndUpdate(orderId, {
          password: payload.password,
          provisioningStatus: 'provisioning', // Will be updated to active once complete
          lastAction: 'reinstall',
          lastActionTime: new Date()
        });
        break;

      case 'templates':
        result = await api.getReinstallTemplates(sid);
        break;

      case 'details':
        result = await api.getServiceDetails(sid);
        break;

      default:
        return NextResponse.json({ message: 'Unsupported action' }, { status: 400 });
    }

    // After any action, fetch the latest server state and sync it
    if (['start', 'stop', 'reboot', 'changepassword', 'reinstall'].includes(action)) {
      try {
        // Wait a moment for the action to take effect
        setTimeout(async () => {
          const [details, info] = await Promise.all([
            api.getServiceDetails(sid),
            api.getServiceInfo(sid).catch(() => null)
          ]);
          await syncServerState(orderId, details, info);
        }, 2000); // 2 second delay to allow action to complete
      } catch (syncError) {
        console.error('[SERVICE-ACTION] Sync error:', syncError);
        // Don't fail the request if sync fails
      }
    }

    return NextResponse.json({ success: true, action, result });
  } catch (error) {
    console.error('[SERVICE-ACTION][POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Helper function to sync server state from Hostycare API to our database
async function syncServerState(orderId, details, info) {
  try {
    const updateData = {
      lastSyncTime: new Date()
    };

    // Extract server state from details/info and map to our schema
    if (details) {
      // Map server status from Hostycare API to our provisioningStatus
      if (details.status) {
        const hostycareStatus = details.status.toLowerCase();
        switch (hostycareStatus) {
          case 'online':
          case 'running':
            updateData.provisioningStatus = 'active';
            break;
          case 'offline':
          case 'stopped':
            updateData.provisioningStatus = 'suspended';
            break;
          case 'installing':
          case 'provisioning':
            updateData.provisioningStatus = 'provisioning';
            break;
          case 'failed':
            updateData.provisioningStatus = 'failed';
            break;
          case 'terminated':
            updateData.provisioningStatus = 'terminated';
            break;
          default:
            // Keep existing status if we don't recognize the new one
            break;
        }
      }

      // Update IP address if available and not already set
      if (details.ip && details.ip !== 'pending') {
        updateData.ipAddress = details.ip;
      }

      // Update username if available
      if (details.username) {
        updateData.username = details.username;
      }

      // Store raw server details for debugging/reference
      updateData.serverDetails = {
        lastUpdated: new Date(),
        rawDetails: details,
        rawInfo: info
      };
    }

    // Only update if we have meaningful data to sync
    if (Object.keys(updateData).length > 1) { // More than just lastSyncTime
      await Order.findByIdAndUpdate(orderId, updateData);
      console.log(`[SYNC] Updated order ${orderId} with server state:`, updateData);
    }

  } catch (error) {
    console.error('[SYNC] Error syncing server state:', error);
    throw error;
  }
}
