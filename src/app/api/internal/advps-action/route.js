import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AdvpsAPI = require('@/services/advpsApi');

function validateInternalKey(request) {
  const key = request.headers.get('x-internal-key');
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || !key || key !== expected) return false;
  return true;
}

export async function POST(request) {
  if (!validateInternalKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    const { orderId, action } = await request.json();
    if (!orderId || !action) {
      return NextResponse.json({ success: false, error: 'orderId and action required' }, { status: 400 });
    }

    const order = await Order.findById(orderId);
    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });

    const serviceId = order.advpsServiceId;
    if (!serviceId) return NextResponse.json({ success: false, error: 'No ADVPS service ID' }, { status: 400 });

    const api = new AdvpsAPI();

    switch (action) {
      case 'start': {
        const res = await api.start(serviceId);
        await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'active', lastAction: 'start', lastActionTime: new Date() });
        return NextResponse.json({ success: true, result: res });
      }

      case 'stop': {
        const res = await api.stop(serviceId);
        await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'suspended', lastAction: 'stop', lastActionTime: new Date() });
        return NextResponse.json({ success: true, result: res });
      }

      case 'restart':
      case 'reboot': {
        const res = await api.reboot(serviceId);
        await Order.findByIdAndUpdate(orderId, { lastAction: 'reboot', lastActionTime: new Date() });
        return NextResponse.json({ success: true, result: res });
      }

      case 'status': {
        try {
          const statusRes = await api.status(serviceId);
          const d = statusRes?.data || statusRes;
          const vmSt = d?.vmStatus?.status || d?.runningStatus || '';
          let powerState = 'unknown';
          if (typeof vmSt === 'string') {
            const sl = vmSt.toLowerCase();
            if (['running', 'online', 'started', 'active'].includes(sl)) powerState = 'running';
            else if (['stopped', 'offline', 'shutdown'].includes(sl)) powerState = 'stopped';
            else powerState = sl;
          }
          return NextResponse.json({ success: true, powerState, rawStatus: d, provider: 'advps', lastSync: new Date().toISOString() });
        } catch (e) {
          return NextResponse.json({ success: false, error: e.message, powerState: 'unknown', provider: 'advps' });
        }
      }

      case 'format': {
        const os = order.os?.toLowerCase().includes('ubuntu') ? 'ubuntu-22.04'
          : order.os?.toLowerCase().includes('centos') ? 'centos-7'
          : order.os?.toLowerCase().includes('windows') ? 'windows-2022'
          : 'ubuntu-22.04';

        const rebuildRes = await api.rebuild(serviceId, os);
        const taskId = rebuildRes?.data?.taskId;

        await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'provisioning', lastAction: 'format', lastActionTime: new Date() });

        if (taskId) {
          (async () => {
            const pollDelays = [10000, 15000, 20000, 30000, 60000, 60000];
            for (let i = 0; i < pollDelays.length; i++) {
              await new Promise(r => setTimeout(r, pollDelays[i]));
              try {
                const taskRes = await api.taskStatus(taskId);
                const taskData = taskRes?.data || taskRes;
                console.log(`[INTERNAL-ADVPS] Rebuild poll ${i + 1}: status=${taskData.status}`);

                if (taskData.status === 'COMPLETED') {
                  await new Promise(r => setTimeout(r, 30000));
                  const passRetryDelays = [0, 20000, 30000, 60000];
                  for (let attempt = 0; attempt < passRetryDelays.length; attempt++) {
                    if (attempt > 0) await new Promise(r => setTimeout(r, passRetryDelays[attempt]));
                    try {
                      const passRes = await api.generatePassword(serviceId);
                      const pd = passRes?.data || {};
                      const newPass = pd.password || pd.newPassword || pd.existingPassword;
                      if (newPass) {
                        console.log(`[INTERNAL-ADVPS] 🔑 POST-REBUILD PASSWORD: ${newPass}`);
                        for (let db = 0; db < 5; db++) {
                          try {
                            await Order.findByIdAndUpdate(orderId, { password: newPass, provisioningStatus: 'active' });
                            console.log(`[INTERNAL-ADVPS] ✅ Password saved (attempt ${db + 1})`);
                            return;
                          } catch (e) {
                            if (db < 4) await new Promise(r => setTimeout(r, 2000));
                          }
                        }
                        return;
                      }
                    } catch (passErr) {
                      if (passErr.message?.includes('must be running')) continue;
                      console.error(`[INTERNAL-ADVPS] Password attempt ${attempt + 1} failed:`, passErr.message);
                    }
                  }
                  return;
                }
                if (taskData.status === 'FAILED') {
                  await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'failed', provisioningError: 'Rebuild task failed' });
                  return;
                }
              } catch (e) {
                console.error(`[INTERNAL-ADVPS] Poll error:`, e.message);
              }
            }
          })();
        }

        return NextResponse.json({ success: true, result: { accepted: true, message: 'Rebuild initiated', taskId } });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[INTERNAL-ADVPS] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
