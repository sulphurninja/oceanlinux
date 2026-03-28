import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const AdvpsAPI = require('@/services/advpsApi');

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

    const serviceId = order.advpsServiceId;
    if (!serviceId) return NextResponse.json({ message: 'No ADVPS service ID attached' }, { status: 400 });

    const api = new AdvpsAPI();
    let details = null;

    try {
      const statusRes = await api.status(serviceId);
      const d = statusRes?.data || statusRes;
      details = {
        serviceId: d.serviceId || serviceId,
        serviceType: d.serviceType,
        runningStatus: d.runningStatus,
        ip: d.ip || order.ipAddress,
        uptime: d.uptime,
      };
    } catch (err) {
      console.error('[ADVPS-ACTION][GET] Status error:', err.message);
      details = {
        serviceId,
        ip: order.ipAddress || '',
        runningStatus: 'UNKNOWN',
      };
    }

    await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });

    return NextResponse.json({ success: true, serviceId, details });
  } catch (error) {
    console.error('[ADVPS-ACTION][GET] Error:', error.message);
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

    const serviceId = order.advpsServiceId;
    if (!serviceId) return NextResponse.json({ message: 'No ADVPS service ID attached' }, { status: 400 });

    const api = new AdvpsAPI();
    let result;

    switch (action) {
      case 'start': {
        result = await api.start(serviceId);
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'active',
          lastAction: 'start',
          lastActionTime: new Date(),
        });
        break;
      }

      case 'stop': {
        result = await api.stop(serviceId);
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'suspended',
          lastAction: 'stop',
          lastActionTime: new Date(),
        });
        break;
      }

      case 'reboot':
      case 'restart': {
        result = await api.reboot(serviceId);
        await Order.findByIdAndUpdate(orderId, {
          lastAction: 'reboot',
          lastActionTime: new Date(),
        });
        break;
      }

      case 'status': {
        try {
          const statusRes = await api.status(serviceId);
          const d = statusRes?.data || statusRes;
          const running = (d.runningStatus || '').toUpperCase();

          let powerState = 'unknown';
          if (running === 'RUNNING') powerState = 'running';
          else if (running === 'STOPPED') powerState = 'stopped';

          return NextResponse.json({
            success: true,
            powerState,
            runningStatus: d.runningStatus,
            serviceType: d.serviceType,
            ip: d.ip,
            uptime: d.uptime,
            lastSync: new Date().toISOString(),
          });
        } catch (err) {
          return NextResponse.json({ success: false, error: err.message, powerState: 'unknown' });
        }
      }

      case 'generatepassword': {
        const passRes = await api.generatePassword(serviceId);
        const newPassword = passRes?.data?.password;
        if (newPassword) {
          await Order.findByIdAndUpdate(orderId, {
            password: newPassword,
            lastAction: 'changepassword',
            lastActionTime: new Date(),
          });
        }
        result = passRes;
        break;
      }

      case 'rebuild':
      case 'format': {
        const os = payload?.templateId || payload?.os;
        if (!os) return NextResponse.json({ message: 'OS template is required for rebuild' }, { status: 400 });

        const rebuildRes = await api.rebuild(serviceId, os);
        const taskId = rebuildRes?.data?.taskId;

        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'provisioning',
          lastAction: 'format',
          lastActionTime: new Date(),
        });

        if (taskId) {
          const pollDelays = [5000, 10000, 20000, 40000, 60000];
          pollDelays.forEach((delay, i) => {
            setTimeout(async () => {
              try {
                const taskRes = await api.taskStatus(taskId);
                const taskData = taskRes?.data || taskRes;
                console.log(`[ADVPS-ACTION] Rebuild poll ${i + 1}: status=${taskData.status}, progress=${taskData.progress}`);

                if (taskData.status === 'COMPLETED') {
                  try {
                    const passRes = await api.generatePassword(serviceId);
                    const newPass = passRes?.data?.password;
                    if (newPass) {
                      await Order.findByIdAndUpdate(orderId, {
                        password: newPass,
                        provisioningStatus: 'active',
                      });
                      console.log('[ADVPS-ACTION] Post-rebuild password updated');
                    }
                  } catch (passErr) {
                    console.error('[ADVPS-ACTION] Post-rebuild password gen failed:', passErr.message);
                  }
                }
              } catch (pollErr) {
                console.error(`[ADVPS-ACTION] Rebuild poll ${i + 1} error:`, pollErr.message);
              }
            }, delay);
          });
        }

        result = rebuildRes;
        break;
      }

      case 'templates': {
        result = {
          'ubuntu-22.04': 'Ubuntu 22.04',
          'centos-7': 'CentOS 7',
          'windows-2022': 'Windows Server 2022',
        };
        break;
      }

      case 'sync': {
        try {
          const statusRes = await api.status(serviceId);
          const d = statusRes?.data || statusRes;
          await Order.findByIdAndUpdate(orderId, { lastSyncTime: new Date() });
          result = { synced: true, message: 'ADVPS status synced', runningStatus: d.runningStatus };
        } catch (err) {
          result = { synced: false, message: `Sync failed: ${err.message}` };
        }
        break;
      }

      default:
        return NextResponse.json({ message: 'Unsupported action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, action, result });
  } catch (error) {
    console.error('[ADVPS-ACTION][POST] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
