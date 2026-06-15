import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const AdvpsAPI = require('@/services/advpsApi');
const {
  normalizeAdvpsPowerState,
  pickAdvpsRunningStatusRaw,
  pickAdvpsIp,
  pickAdvpsUptime,
  unwrapAdvpsEnvelope,
} = require('@/lib/advpsStatusNormalize');
const { runAdvpsPostRebuildGeneratePasswordFlow } = require('@/lib/advpsPostRebuildFlow');
const {
  ADVPS_REBUILD_LIMIT,
  getAdvpsRebuildUsage,
  getAdvpsRebuildLimitMessage,
} = require('@/lib/advpsRebuildLimit');
const {
  syncAdvpsOrderCredentials,
  resolveAdvpsPurchaseOrderId,
} = require('@/lib/advpsOrderSync');

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
    let statusRes = null;

    // Fetch live running status
    try {
      statusRes = await api.status(serviceId);
      const d = unwrapAdvpsEnvelope(statusRes) || {};
      details = {
        serviceId: d.serviceId || d.service?.serviceId || serviceId,
        serviceType: d.serviceType,
        runningStatus: pickAdvpsRunningStatusRaw(d) || undefined,
        ip: pickAdvpsIp(d, order.ipAddress),
        uptime: pickAdvpsUptime(d),
        powerState: normalizeAdvpsPowerState(d),
      };
    } catch (err) {
      console.error('[ADVPS-ACTION][GET] Status error:', err.message);
      details = {
        serviceId,
        ip: order.ipAddress || '',
        runningStatus: 'UNKNOWN',
      };
    }

    const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes });
    if (sync.freshIp) details.ip = sync.freshIp;

    await Order.findByIdAndUpdate(orderId, sync.dbUpdates);

    return NextResponse.json({
      success: true,
      serviceId,
      details,
      syncResult: {
        credentialsUpdated: sync.credentialsUpdated,
        changes: sync.changes,
        advpsOrderIdMissing: sync.advpsOrderIdMissing,
        advpsOrderId: resolveAdvpsPurchaseOrderId(order) || null,
        lastSyncTime: sync.dbUpdates.lastSyncTime,
        error: sync.error || null,
      },
    });
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

      case 'resetmac':
      case 'reset-mac': {
        try {
          const macRes = await api.resetMac(serviceId);
          const d = macRes?.data || macRes;
          await Order.findByIdAndUpdate(orderId, {
            lastAction: 'resetmac',
            lastActionTime: new Date(),
          });
          result = d;
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
        break;
      }

      case 'status': {
        try {
          const statusRes = await api.status(serviceId);
          const d = unwrapAdvpsEnvelope(statusRes) || {};
          const powerState = normalizeAdvpsPowerState(d);

          return NextResponse.json({
            success: true,
            powerState,
            runningStatus: pickAdvpsRunningStatusRaw(d) || null,
            serviceType: d.serviceType,
            ip: pickAdvpsIp(d),
            uptime: pickAdvpsUptime(d),
            lastSync: new Date().toISOString(),
          });
        } catch (err) {
          return NextResponse.json({ success: false, error: err.message, powerState: 'unknown' });
        }
      }

      case 'generatepassword': {
        try {
          const passRes = await api.generatePassword(serviceId);
          const d = passRes?.data || {};
          const newPassword = d.password || d.newPassword || d.existingPassword;
          if (newPassword) {
            console.log(`[ADVPS-ACTION] 🔑 PASSWORD for service=${serviceId} order=${orderId}: ${newPassword}`);

            let saved = false;
            for (let dbAttempt = 0; dbAttempt < 5; dbAttempt++) {
              try {
                await Order.findByIdAndUpdate(orderId, {
                  password: newPassword,
                  lastAction: 'changepassword',
                  lastActionTime: new Date(),
                });
                console.log(`[ADVPS-ACTION] ✅ Password SAVED to DB (attempt ${dbAttempt + 1})`);
                saved = true;
                break;
              } catch (dbErr) {
                console.error(`[ADVPS-ACTION] ❌ DB save attempt ${dbAttempt + 1}/5 FAILED:`, dbErr.message);
                if (dbAttempt < 4) await new Promise(r => setTimeout(r, 2000));
              }
            }
            if (!saved) {
              console.error(`[ADVPS-ACTION] 🚨 CRITICAL: Password but ALL DB saves failed! service=${serviceId} order=${orderId} password=${newPassword}`);
            }
            result = { ...passRes, passwordSaved: saved };
          } else {
            result = passRes;
          }
        } catch (passErr) {
          const msg = passErr.message || '';
          if (msg.includes('already exists') || msg.includes('Password already')) {
            return NextResponse.json({
              success: false,
              error: 'Password was already generated for this service and cannot be regenerated. If it was not saved, rebuild the server to get a new password.',
              code: 'PASSWORD_ALREADY_EXISTS',
            }, { status: 400 });
          }
          throw passErr;
        }
        break;
      }

      case 'rebuild':
      case 'format': {
        const os = payload?.templateId || payload?.os;
        if (!os) return NextResponse.json({ message: 'OS template is required for rebuild' }, { status: 400 });

        const { count: currentCount, currentMonth } = getAdvpsRebuildUsage(order);

        if (currentCount >= ADVPS_REBUILD_LIMIT) {
          return NextResponse.json({
            message: `Rebuild limit reached. ${getAdvpsRebuildLimitMessage()}`,
            code: 'REBUILD_LIMIT_REACHED',
            rebuildsUsed: currentCount,
            rebuildsRemaining: 0,
            rebuildLimit: ADVPS_REBUILD_LIMIT,
            resetsOn: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
          }, { status: 429 });
        }

        // Increment count before calling API (optimistic lock)
        await Order.findByIdAndUpdate(orderId, {
          advpsRebuildCount: currentCount + 1,
          advpsRebuildCountMonth: currentMonth,
        });

        const rebuildRes = await api.rebuild(serviceId, os);
        const taskId = rebuildRes?.data?.taskId;

        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'provisioning',
          lastAction: 'format',
          lastActionTime: new Date(),
        });

        if (taskId) {
          const rebuildOrderId = orderId;
          const rebuildServiceId = serviceId;

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
                console.log(`[ADVPS-ACTION] Rebuild poll ${i + 1}: status=${taskStatus}, progress=${taskData.progress}`);

                if (taskStatus === 'COMPLETED' || taskStatus === 'SUCCESS' || taskStatus === 'DONE') {
                  console.log(`[ADVPS-ACTION] Rebuild task completed for ${rebuildServiceId}; new password only via generate-password → saving to order`);

                  await runAdvpsPostRebuildGeneratePasswordFlow({
                    api,
                    Order,
                    rebuildOrderId,
                    rebuildServiceId,
                    logPrefix: '[ADVPS-ACTION]',
                  });
                  return;
                }
                if (taskStatus === 'FAILED' || taskStatus === 'ERROR') {
                  console.error(`[ADVPS-ACTION] Rebuild task FAILED for ${rebuildServiceId}`);
                  await Order.findByIdAndUpdate(rebuildOrderId, { provisioningStatus: 'failed', provisioningError: 'Rebuild task failed' });
                  return;
                }
              } catch (pollErr) {
                console.error(`[ADVPS-ACTION] Rebuild poll ${i + 1} error:`, pollErr.message);
              }
            }
          })();
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
          const d = unwrapAdvpsEnvelope(statusRes) || {};
          const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes });
          await Order.findByIdAndUpdate(orderId, sync.dbUpdates);
          result = {
            synced: true,
            message: sync.credentialsUpdated
              ? `ADVPS synced — updated: ${sync.changes.join(', ')}`
              : 'ADVPS status synced (no credential changes)',
            runningStatus: pickAdvpsRunningStatusRaw(d) || null,
            credentialsUpdated: sync.credentialsUpdated,
            changes: sync.changes,
            advpsOrderIdMissing: sync.advpsOrderIdMissing,
          };
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
