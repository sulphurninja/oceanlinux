import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AdvpsAPI = require('@/services/advpsApi');
const { runAdvpsPostRebuildGeneratePasswordFlow } = require('@/lib/advpsPostRebuildFlow');

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
    const { orderId, action, payload } = await request.json();
    if (!orderId || !action) {
      return NextResponse.json({ success: false, error: 'orderId and action required' }, { status: 400 });
    }

    const order = await Order.findById(orderId);
    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });

    const serviceId = order.advpsServiceId;
    if (!serviceId) return NextResponse.json({ success: false, error: 'No ADVPS service ID' }, { status: 400 });

    const api = new AdvpsAPI();

    const parseAdvpsPowerState = (d) => {
      if (!d || typeof d !== 'object') return 'unknown';
      const vmSt =
        d.vmStatus?.status ||
        d.runningStatus ||
        d.service?.runningStatus ||
        d.service?.status ||
        d.service?.vmStatus?.status ||
        '';
      if (typeof vmSt !== 'string' || !vmSt) return 'unknown';
      const sl = vmSt.toLowerCase();
      if (['running', 'online', 'started', 'active'].includes(sl)) return 'running';
      if (['stopped', 'offline', 'shutdown'].includes(sl)) return 'stopped';
      if (['suspended', 'paused'].includes(sl)) return 'suspended';
      return sl;
    };

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
          const powerState = parseAdvpsPowerState(d);
          return NextResponse.json({ success: true, powerState, rawStatus: d, provider: 'advps', lastSync: new Date().toISOString() });
        } catch (e) {
          return NextResponse.json({ success: false, error: e.message, powerState: 'unknown', provider: 'advps' });
        }
      }

      case 'sync': {
        try {
          const statusRes = await api.status(serviceId);
          const d = statusRes?.data || statusRes;
          const powerState = parseAdvpsPowerState(d);

          const syncUpdates = { lastSyncTime: new Date() };
          let syncCredentialsUpdated = false;

          if (order.advpsOrderId) {
            try {
              const detailsRes = await api.getOrderDetails(order.advpsOrderId);
              const orderDetails = detailsRes?.data || detailsRes;
              const services = orderDetails?.services || [];

              if (services.length > 0) {
                const svc = services[0];
                const freshIp = svc.ip || '';
                const freshUsername = svc.username || '';
                const freshPassword = svc.password || '';
                const freshOs = svc.os || '';

                if (freshIp && freshIp !== order.ipAddress) { syncUpdates.ipAddress = freshIp; syncCredentialsUpdated = true; }
                if (freshUsername && freshUsername !== order.username) { syncUpdates.username = freshUsername; syncCredentialsUpdated = true; }
                if (freshPassword && freshPassword !== order.password) { syncUpdates.password = freshPassword; syncCredentialsUpdated = true; }
                if (freshOs && freshOs !== order.os) { syncUpdates.os = freshOs; syncCredentialsUpdated = true; }

                if (syncCredentialsUpdated) {
                  console.log(`[INTERNAL-ADVPS][SYNC] Credentials updated from getOrderDetails for order ${orderId}`);
                }
              }
            } catch (detailsErr) {
              console.error('[INTERNAL-ADVPS][SYNC] getOrderDetails error:', detailsErr.message);
            }
          }

          await Order.findByIdAndUpdate(orderId, syncUpdates);
          const orderSnapshot = await Order.findById(orderId)
            .select('ipAddress username password os provisioningStatus provisioningError lastSyncTime advpsRebuildCount advpsRebuildCountMonth status')
            .lean();

          return NextResponse.json({
            success: true,
            powerState,
            rawStatus: d,
            provider: 'advps',
            lastSync: new Date().toISOString(),
            result: {
              synced: true,
              message: syncCredentialsUpdated ? 'ADVPS synced; credentials updated' : 'ADVPS synced',
              credentialsUpdated: syncCredentialsUpdated,
            },
            order: orderSnapshot,
          });
        } catch (err) {
          return NextResponse.json({ success: false, error: err.message, powerState: 'unknown', provider: 'advps' });
        }
      }

      case 'templates': {
        return NextResponse.json({
          success: true,
          result: {
            'ubuntu-22.04': 'Ubuntu 22.04',
            'centos-7': 'CentOS 7',
            'windows-2022': 'Windows Server 2022',
          },
        });
      }

      case 'format': {
        const os = payload?.templateId || payload?.os
          || (order.os?.toLowerCase().includes('ubuntu') ? 'ubuntu-22.04'
          : order.os?.toLowerCase().includes('centos') ? 'centos-7'
          : order.os?.toLowerCase().includes('windows') ? 'windows-2022'
          : 'ubuntu-22.04');

        const REBUILD_LIMIT = 10;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const storedMonth = order.advpsRebuildCountMonth || '';
        const currentCount = storedMonth === currentMonth ? (order.advpsRebuildCount || 0) : 0;
        if (currentCount >= REBUILD_LIMIT) {
          return NextResponse.json({
            success: false,
            message: `Rebuild limit reached. You can only rebuild/format your server ${REBUILD_LIMIT} times per month. Your limit resets on the 1st of next month.`,
            code: 'REBUILD_LIMIT_REACHED',
            rebuildsUsed: currentCount,
            rebuildsRemaining: 0,
          }, { status: 429 });
        }
        await Order.findByIdAndUpdate(orderId, {
          advpsRebuildCount: currentCount + 1,
          advpsRebuildCountMonth: currentMonth,
        });

        const rebuildRes = await api.rebuild(serviceId, os);
        const taskId = rebuildRes?.data?.taskId;

        await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'provisioning', lastAction: 'format', lastActionTime: new Date() });

        if (taskId) {
          (async () => {
            try {
              await connectDB();
            } catch (_) { /* already connected */ }

            const pollDelays = [10000, 15000, 20000, 30000, 60000, 60000];
            for (let i = 0; i < pollDelays.length; i++) {
              await new Promise(r => setTimeout(r, pollDelays[i]));
              try {
                const taskRes = await api.taskStatus(taskId);
                const taskData = taskRes?.data || taskRes;
                const taskStatus = (taskData.status || '').toUpperCase();
                console.log(`[INTERNAL-ADVPS] Rebuild poll ${i + 1}: status=${taskStatus}`);

                if (taskStatus === 'COMPLETED' || taskStatus === 'SUCCESS' || taskStatus === 'DONE') {
                  console.log(`[INTERNAL-ADVPS] Rebuild completed for ${serviceId}; generate-password → save on order`);

                  await runAdvpsPostRebuildGeneratePasswordFlow({
                    api,
                    Order,
                    rebuildOrderId: orderId,
                    rebuildServiceId: serviceId,
                    logPrefix: '[INTERNAL-ADVPS]',
                  });
                  return;
                }
                if (taskStatus === 'FAILED' || taskStatus === 'ERROR') {
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
