import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AdvpsAPI = require('@/services/advpsApi');
const { normalizeAdvpsPowerState, unwrapAdvpsEnvelope } = require('@/lib/advpsStatusNormalize');
const { runAdvpsPostRebuildGeneratePasswordFlow } = require('@/lib/advpsPostRebuildFlow');
const {
  ADVPS_REBUILD_LIMIT,
  getAdvpsRebuildUsage,
  getAdvpsRebuildLimitMessage,
  consumeAdvpsRebuildCredit,
} = require('@/lib/advpsRebuildLimit');
const { syncAdvpsOrderCredentials, configureAdvpsServiceIp, commitAdvpsOrderSync } = require('@/lib/advpsOrderSync');
import { internalKeyMatches } from '@/lib/internalApiKey';

function validateInternalKey(request) {
  return internalKeyMatches(request.headers.get('x-internal-key'));
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

    const { isExpiredServiceForCustomer, expiredPanelSyncPayload, isExpiredPanelActionBlocked } = require('@/lib/expiredPanelSync');
    if (isExpiredServiceForCustomer(order) && isExpiredPanelActionBlocked(action)) {
      return NextResponse.json(expiredPanelSyncPayload(action), { status: 409 });
    }

    const serviceId = order.advpsServiceId;
    if (!serviceId) return NextResponse.json({ success: false, error: 'No ADVPS service ID' }, { status: 400 });

    const api = new AdvpsAPI();

    switch (action) {
      case 'start': {
        const res = await api.start(serviceId);
        const ipConfig = await configureAdvpsServiceIp(api, serviceId, { logPrefix: '[ADVPS-INTERNAL]' });
        const dbUpdate = {
          provisioningStatus: 'active',
          lastAction: 'start',
          lastActionTime: new Date(),
        };
        if (ipConfig.ip && ipConfig.ip !== order.ipAddress) {
          dbUpdate.ipAddress = ipConfig.ip;
        }
        await Order.findByIdAndUpdate(orderId, dbUpdate);
        return NextResponse.json({ success: true, result: { start: res, ipConfig } });
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

      case 'resetmac':
      case 'reset-mac': {
        try {
          const macRes = await api.resetMac(serviceId);
          await Order.findByIdAndUpdate(orderId, { lastAction: 'resetmac', lastActionTime: new Date() });
          return NextResponse.json({ success: true, result: macRes?.data || macRes });
        } catch (macErr) {
          const status = macErr?.status;
          if (status === 429) {
            return NextResponse.json({
              success: false,
              error: 'MAC reset is only allowed once every 24 hours without an active MAC reset subscription.',
              code: 'MAC_RESET_RATE_LIMIT',
            }, { status: 429 });
          }
          if (status === 404) {
            return NextResponse.json({
              success: false,
              error: 'Service not found or MAC reset is not supported for this assignment (VPS only).',
              code: 'MAC_RESET_NOT_APPLICABLE',
            }, { status: 404 });
          }
          throw macErr;
        }
      }

      case 'status': {
        try {
          const statusRes = await api.status(serviceId);
          const d = unwrapAdvpsEnvelope(statusRes) || {};
          const powerState = normalizeAdvpsPowerState(d);
          return NextResponse.json({ success: true, powerState, rawStatus: d, provider: 'advps', lastSync: new Date().toISOString() });
        } catch (e) {
          return NextResponse.json({ success: false, error: e.message, powerState: 'unknown', provider: 'advps' });
        }
      }

      case 'sync': {
        try {
          const statusRes = await api.status(serviceId);
          const d = unwrapAdvpsEnvelope(statusRes) || {};
          const powerState = normalizeAdvpsPowerState(d);
          const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes, Order });
          await commitAdvpsOrderSync(order, sync);
          const orderSnapshot = await Order.findById(orderId)
            .select('ipAddress username password os provisioningStatus provisioningError lastSyncTime advpsRebuildCount advpsRebuildCountMonth status advpsOrderId advpsServiceId')
            .lean();

          return NextResponse.json({
            success: true,
            powerState,
            rawStatus: d,
            provider: 'advps',
            lastSync: new Date().toISOString(),
            result: {
              synced: true,
              message: sync.credentialsUpdated
                ? `ADVPS synced — updated: ${sync.changes.join(', ')}`
                : 'ADVPS synced',
              credentialsUpdated: sync.credentialsUpdated,
              changes: sync.changes,
              advpsOrderIdMissing: sync.advpsOrderIdMissing,
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

        const { count: currentCount } = getAdvpsRebuildUsage(order);
        if (currentCount >= ADVPS_REBUILD_LIMIT) {
          return NextResponse.json({
            success: false,
            message: `Rebuild limit reached. ${getAdvpsRebuildLimitMessage()}`,
            code: 'REBUILD_LIMIT_REACHED',
            rebuildsUsed: currentCount,
            rebuildsRemaining: 0,
            rebuildLimit: ADVPS_REBUILD_LIMIT,
          }, { status: 429 });
        }

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
                  console.log(`[INTERNAL-ADVPS] Rebuild completed for ${serviceId}; consuming rebuild credit`);

                  await consumeAdvpsRebuildCredit(Order, orderId);

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
                  console.error(`[INTERNAL-ADVPS] Rebuild task FAILED for ${serviceId} — rebuild credit not consumed`);
                  await Order.findByIdAndUpdate(orderId, { provisioningStatus: 'failed', provisioningError: 'Rebuild task failed' });
                  return;
                }
              } catch (e) {
                console.error(`[INTERNAL-ADVPS] Poll error:`, e.message);
              }
            }
          })();
        } else {
          await consumeAdvpsRebuildCredit(Order, orderId);
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
