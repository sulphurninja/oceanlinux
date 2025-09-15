import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const SmartVPSAPI = require('@/services/smartvpsApi');

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
    if (!order.smartvpsServiceId) return NextResponse.json({ message: 'No SmartVPS service attached' }, { status: 400 });

    const api = new SmartVPSAPI();
    const [details, info] = await Promise.all([
      api.getServiceDetails(order.smartvpsServiceId),
      api.getServiceInfo(order.smartvpsServiceId).catch(() => null)
    ]);

    // Sync the latest server state to our database
    await syncServerState(order._id, details, info);

    return NextResponse.json({ success: true, serviceId: order.smartvpsServiceId, details, info });
  } catch (error) {
    console.error('[SMARTVPS-ACTION][GET] Error:', error);
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
    if (!order.smartvpsServiceId) return NextResponse.json({ message: 'No SmartVPS service attached' }, { status: 400 });

    const api = new SmartVPSAPI();
    const sid = order.smartvpsServiceId;
    let result;

    switch (action) {
      case 'start':
        result = await api.startService(sid);
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'active',
          lastAction: 'start',
          lastActionTime: new Date()
        });
        break;

      case 'stop':
        result = await api.stopService(sid);
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'suspended',
          lastAction: 'stop',
          lastActionTime: new Date()
        });
        break;

      case 'reboot':
        result = await api.rebootService(sid);
        await Order.findByIdAndUpdate(orderId, {
          lastAction: 'reboot',
          lastActionTime: new Date()
        });
        break;

      case 'format':
        if (!payload?.password) return NextResponse.json({ message: 'password is required' }, { status: 400 });

        console.log('[FORMAT] Starting format for service:', sid);
        console.log('[FORMAT] Payload:', payload);

        try {
          result = await api.formatService(sid, payload.password, payload.templateId || null);
          console.log('[FORMAT] API Success:', result);

          await Order.findByIdAndUpdate(orderId, {
            password: payload.password,
            provisioningStatus: 'provisioning',
            lastAction: 'format',
            lastActionTime: new Date()
          });
        } catch (error) {
          console.error('[FORMAT] API Error:', error.message);
          throw error;
        }
        break;

      case 'changepassword':
        if (!payload?.password) return NextResponse.json({ message: 'password is required' }, { status: 400 });
        result = await api.changePassword(sid, payload.password);
        await Order.findByIdAndUpdate(orderId, {
          password: payload.password,
          lastAction: 'changepassword',
          lastActionTime: new Date()
        });
        break;

      case 'templates':
        console.log('[TEMPLATES] Fetching templates for service:', sid);
        try {
          result = await api.getFormatTemplates(sid);
          console.log('[TEMPLATES] Available templates:', result);
        } catch (error) {
          console.error('[TEMPLATES] Error:', error.message);
          throw error;
        }
        break;

      case 'details':
        result = await api.getServiceDetails(sid);
        break;

      default:
        return NextResponse.json({ message: 'Unsupported action' }, { status: 400 });
    }

    // After any action, fetch the latest server state and sync it
    if (['start', 'stop', 'reboot', 'changepassword', 'format'].includes(action)) {
      try {
        setTimeout(async () => {
          const [details, info] = await Promise.all([
            api.getServiceDetails(sid),
            api.getServiceInfo(sid).catch(() => null)
          ]);
          await syncServerState(orderId, details, info);
        }, 2000);
      } catch (syncError) {
        console.error('[SMARTVPS-ACTION] Sync error:', syncError);
      }
    }

    return NextResponse.json({ success: true, action, result });
  } catch (error) {
    console.error('[SMARTVPS-ACTION][POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Helper function to sync server state from SmartVPS API to our database
async function syncServerState(orderId, details, info) {
  try {
    const updateData = {
      lastSyncTime: new Date()
    };

    if (details) {
      let smartvpsStatus;
      if (typeof details.status === 'string') {
        smartvpsStatus = details.status.toLowerCase();
      } else if (typeof details.status === 'number') {
        smartvpsStatus = details.status.toString();
      } else if (typeof details.status === 'boolean') {
        smartvpsStatus = details.status ? 'active' : 'suspended';
      } else if (details.status && typeof details.status === 'object') {
        smartvpsStatus = details.status.state || details.status.name || details.status.value || 'unknown';
        if (typeof smartvpsStatus === 'string') {
          smartvpsStatus = smartvpsStatus.toLowerCase();
        }
      } else {
        console.warn('[SYNC] Unknown status type:', typeof details.status, details.status);
        smartvpsStatus = String(details.status).toLowerCase();
      }

      switch (smartvpsStatus) {
        case 'online':
        case 'running':
        case 'active':
        case '1':
        case 'true':
          updateData.provisioningStatus = 'active';
          break;
        case 'offline':
        case 'stopped':
        case 'suspended':
        case '0':
        case 'false':
          updateData.provisioningStatus = 'suspended';
          break;
        case 'installing':
        case 'provisioning':
        case 'building':
        case 'creating':
          updateData.provisioningStatus = 'provisioning';
          break;
        case 'failed':
        case 'error':
          updateData.provisioningStatus = 'failed';
          break;
        case 'terminated':
        case 'deleted':
        case 'destroyed':
          updateData.provisioningStatus = 'terminated';
          break;
        default:
          console.warn('[SYNC] Unknown server status:', smartvpsStatus, 'from original:', details.status);
          break;
      }

      if (details.ip && details.ip !== 'pending') {
        updateData.ipAddress = details.ip;
      }

      if (details.username) {
        updateData.username = details.username;
      }

      updateData.serverDetails = {
        lastUpdated: new Date(),
        rawDetails: details,
        rawInfo: info
      };
    }

    if (Object.keys(updateData).length > 1) {
      await Order.findByIdAndUpdate(orderId, updateData);
      console.log(`[SYNC] Updated order ${orderId} with server state:`, {
        ...updateData,
        serverDetails: updateData.serverDetails ? '[Raw data stored]' : undefined
      });
    } else {
      console.log(`[SYNC] No meaningful updates for order ${orderId}`);
    }

  } catch (error) {
    console.error('[SYNC] Error syncing server state for order', orderId, ':', error);
    console.error('[SYNC] Details object:', details);
    console.error('[SYNC] Info object:', info);
    throw error;
  }
}
