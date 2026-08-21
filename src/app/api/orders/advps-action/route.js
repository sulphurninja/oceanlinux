import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { resolveOrderForUserOrAdmin } from '@/lib/resolveOrderAccess';
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
  consumeAdvpsRebuildCredit,
} = require('@/lib/advpsRebuildLimit');
const {
  syncAdvpsOrderCredentials,
  resolveAdvpsServiceIdForPower,
  formatAdvpsActionError,
  configureAdvpsServiceIp,
} = require('@/lib/advpsOrderSync');
const { extractPasswordFromGenerateError } = require('@/lib/advpsPasswordFetch');
const { sanitizeCustomerApiPayload, customerServiceErrorMessage } = require('@/lib/customerFacingErrors');

function customerJson(body, status = 200, action = null) {
  return NextResponse.json(sanitizeCustomerApiPayload(body, { action }), { status });
}

async function resolveServiceIdForOrder(api, order, orderId) {
  const resolved = await resolveAdvpsServiceIdForPower(api, order, { Order });
  if (!resolved.serviceId) {
    return {
      error: customerServiceErrorMessage(resolved.error || 'No ADVPS service ID attached', {
        action: 'sync',
        code: 'ADVPS_SERVICE_NOT_FOUND',
      }),
      status: 400,
    };
  }

  if (resolved.corrected) {
    await Order.findByIdAndUpdate(orderId, {
      advpsServiceId: resolved.serviceId,
      ...(resolved.advpsOrderId && !order.advpsOrderId ? { advpsOrderId: resolved.advpsOrderId } : {}),
    });
    order.advpsServiceId = resolved.serviceId;
    console.log(
      `[ADVPS-ACTION] Corrected service id ${resolved.previousServiceId} → ${resolved.serviceId}`
    );
  }

  return { serviceId: resolved.serviceId, statusRes: resolved.statusRes };
}

export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) return customerJson({ success: false, message: 'Order ID is required' }, 400, 'sync');

    const access = await resolveOrderForUserOrAdmin(request, orderId);
    if (access.error) return access.error;
    const order = access.order;

    const api = new AdvpsAPI();
    const resolved = await resolveServiceIdForOrder(api, order, orderId);
    if (resolved.error) {
      return customerJson({ success: false, message: resolved.error, error: resolved.error, code: 'ADVPS_SERVICE_NOT_FOUND' }, resolved.status, 'sync');
    }
    const serviceId = resolved.serviceId;

    let details = null;
    let statusRes = resolved.statusRes || null;
    let statusError = null;

    // Fetch live running status (reuse resolver status when available)
    if (!statusRes) {
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
        statusError = err.message;
        console.error('[ADVPS-ACTION][GET] Status error:', err.message);
        details = {
          serviceId,
          ip: order.ipAddress || '',
          runningStatus: 'UNKNOWN',
        };
      }
    } else {
      const d = unwrapAdvpsEnvelope(statusRes) || {};
      details = {
        serviceId: d.serviceId || d.service?.serviceId || serviceId,
        serviceType: d.serviceType,
        runningStatus: pickAdvpsRunningStatusRaw(d) || undefined,
        ip: pickAdvpsIp(d, order.ipAddress),
        uptime: pickAdvpsUptime(d),
        powerState: normalizeAdvpsPowerState(d),
      };
    }

    const sync = await syncAdvpsOrderCredentials(api, order, {
      statusPayload: statusRes,
      statusError,
      Order,
      tryGeneratePasswordFallback: true,
    });
    if (sync.freshIp) details.ip = sync.freshIp;

    if (Object.keys(sync.dbUpdates).length > 1 || sync.credentialsUpdated) {
      await Order.findByIdAndUpdate(orderId, sync.dbUpdates);
    } else {
      await Order.findByIdAndUpdate(orderId, { lastSyncTime: sync.dbUpdates.lastSyncTime });
    }

    return customerJson({
      success: !sync.syncFailed,
      serviceId,
      details,
      syncResult: {
        credentialsUpdated: sync.credentialsUpdated,
        changes: sync.changes,
        advpsOrderIdMissing: sync.advpsOrderIdMissing,
        advpsOrderId: sync.purchaseOrderId || order.advpsOrderId || null,
        lastSyncTime: sync.dbUpdates.lastSyncTime,
        statusApiOk: sync.statusApiOk,
        purchaseApiOk: sync.purchaseApiOk,
        syncFailed: sync.syncFailed,
        apiBlocked: sync.apiBlocked,
        passwordStale: sync.passwordStale,
        passwordSource: sync.passwordSource,
        passwordFoundInApi: sync.passwordFoundInApi,
      },
    });
  } catch (error) {
    console.error('[ADVPS-ACTION][GET] Error:', error.message);
    return customerJson({ success: false, error: error.message }, 500, 'sync');
  }
}

export async function POST(request) {
  let action = null;
  try {
    await connectDB();

    const body = await request.json();
    action = body?.action || null;
    const { orderId, payload } = body;
    if (!orderId || !action) return customerJson({ success: false, message: 'Order and action are required' }, 400, action);

    const access = await resolveOrderForUserOrAdmin(request, orderId);
    if (access.error) return access.error;
    const order = access.order;

    const api = new AdvpsAPI();
    const resolved = await resolveServiceIdForOrder(api, order, orderId);
    if (resolved.error) {
      return customerJson({ success: false, message: resolved.error, error: resolved.error, code: 'ADVPS_SERVICE_NOT_FOUND' }, resolved.status, action);
    }
    const serviceId = resolved.serviceId;
    let result;

    switch (action) {
      case 'start': {
        const startRes = await api.start(serviceId);
        const ipConfig = await configureAdvpsServiceIp(api, serviceId, { logPrefix: '[ADVPS-ACTION]' });
        const dbUpdate = {
          provisioningStatus: 'active',
          lastAction: 'start',
          lastActionTime: new Date(),
        };
        if (ipConfig.ip && ipConfig.ip !== order.ipAddress) {
          dbUpdate.ipAddress = ipConfig.ip;
        }
        await Order.findByIdAndUpdate(orderId, dbUpdate);
        result = { start: startRes, ipConfig };
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
            return customerJson({
              success: false,
              error: 'MAC reset is only allowed once every 24 hours without an active MAC reset subscription.',
              code: 'MAC_RESET_RATE_LIMIT',
            }, 429, 'resetmac');
          }
          if (status === 404) {
            return customerJson({
              success: false,
              error: 'Service not found or MAC reset is not supported for this assignment (VPS only).',
              code: 'MAC_RESET_NOT_APPLICABLE',
            }, 404, 'resetmac');
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

          // Auto-sync IP/password/username on every status poll (same path as manual Sync)
          const sync = await syncAdvpsOrderCredentials(api, order, { statusPayload: statusRes, Order });
          if (sync.credentialsUpdated) {
            await Order.findByIdAndUpdate(orderId, sync.dbUpdates);
          } else {
            await Order.findByIdAndUpdate(orderId, { lastSyncTime: sync.dbUpdates.lastSyncTime });
          }

          return customerJson({
            success: true,
            powerState,
            runningStatus: pickAdvpsRunningStatusRaw(d) || null,
            serviceType: d.serviceType,
            ip: sync.freshIp || pickAdvpsIp(d, order.ipAddress),
            uptime: pickAdvpsUptime(d),
            lastSync: new Date().toISOString(),
            credentialsUpdated: sync.credentialsUpdated,
            changes: sync.changes,
          }, 200, 'status');
        } catch (err) {
          return customerJson({ success: false, error: err.message, powerState: 'unknown' }, 200, 'status');
        }
      }

      case 'generatepassword': {
        const saveGeneratedPassword = async (newPassword, source = 'generate-password') => {
          // Never log the credential itself — platform logs are retained and
          // widely readable. Presence + source is enough to debug this flow.
          console.log(`[ADVPS-ACTION] 🔑 Password generated for service=${serviceId} order=${orderId} (src: ${source})`);

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
          return saved;
        };

        try {
          const passRes = await api.generatePassword(serviceId);
          const d = passRes?.data || {};
          const newPassword = d.password || d.newPassword || d.existingPassword;
          if (newPassword) {
            const passwordSaved = await saveGeneratedPassword(newPassword);
            result = { ...passRes, password: newPassword, passwordSaved, passwordSource: 'generate-password' };
          } else {
            result = passRes;
          }
        } catch (passErr) {
          const msg = passErr.message || '';
          const extracted = extractPasswordFromGenerateError(passErr);
          if (extracted) {
            const passwordSaved = await saveGeneratedPassword(extracted, 'generate-password-error');
            result = {
              password: extracted,
              passwordSaved,
              passwordSource: 'generate-password-error',
              message: 'Recovered current password from ADVPS',
            };
            break;
          }
          if (msg.includes('already exists') || msg.includes('Password already') || msg.includes('cannot be regenerated')) {
            return customerJson({
              success: false,
              error: 'Use Format Server to get a new password.',
              code: 'PASSWORD_ALREADY_EXISTS',
            }, 400, 'generatepassword');
          }
          throw passErr;
        }
        break;
      }

      case 'rebuild':
      case 'format': {
        const os = payload?.templateId || payload?.os;
        if (!os) return customerJson({ success: false, message: 'Please select an operating system.' }, 400, 'format');

        const { count: currentCount } = getAdvpsRebuildUsage(order);

        if (currentCount >= ADVPS_REBUILD_LIMIT) {
          return customerJson({
            success: false,
            message: `Rebuild limit reached. ${getAdvpsRebuildLimitMessage()}`,
            code: 'ADVPS_REBUILD_LIMIT',
            rebuildsUsed: currentCount,
            rebuildsRemaining: 0,
            rebuildLimit: ADVPS_REBUILD_LIMIT,
            resetsOn: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
          }, 429, 'format');
        }

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
                  console.log(`[ADVPS-ACTION] Rebuild task completed for ${rebuildServiceId}; consuming rebuild credit`);

                  await consumeAdvpsRebuildCredit(Order, rebuildOrderId);

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
                  console.error(`[ADVPS-ACTION] Rebuild task FAILED for ${rebuildServiceId} — rebuild credit not consumed`);
                  await Order.findByIdAndUpdate(rebuildOrderId, { provisioningStatus: 'failed', provisioningError: 'Rebuild task failed' });
                  return;
                }
              } catch (pollErr) {
                console.error(`[ADVPS-ACTION] Rebuild poll ${i + 1} error:`, pollErr.message);
              }
            }
          })();
        } else {
          // No async task — treat successful rebuild response as completed
          await consumeAdvpsRebuildCredit(Order, orderId);
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

      case 'sync':
      case 'pullpassword': {
        try {
          const statusRes = await api.status(serviceId);
          const d = unwrapAdvpsEnvelope(statusRes) || {};
          const sync = await syncAdvpsOrderCredentials(api, order, {
            statusPayload: statusRes,
            Order,
            tryGeneratePasswordFallback: action === 'pullpassword' || action === 'sync',
          });
          await Order.findByIdAndUpdate(orderId, sync.dbUpdates);
          result = {
            synced: true,
            message: sync.credentialsUpdated
              ? `Synced — updated: ${sync.changes.join(', ')}`
              : sync.passwordStale
                ? 'The password on file may be outdated. Use Generate New Password on your order page, or Format the server if that is unavailable.'
                : 'Server status synced (no credential changes)',
            runningStatus: pickAdvpsRunningStatusRaw(d) || null,
            credentialsUpdated: sync.credentialsUpdated,
            changes: sync.changes,
            advpsOrderIdMissing: sync.advpsOrderIdMissing,
            passwordStale: sync.passwordStale,
            passwordSource: sync.passwordSource,
          };
        } catch (err) {
          result = {
            synced: false,
            message: customerServiceErrorMessage(err.message, { action: 'sync' }),
          };
        }
        break;
      }

      default:
        return customerJson({ success: false, message: 'This action is not supported for your server.' }, 400, action);
    }

    return customerJson({ success: true, action, result }, 200, action);
  } catch (error) {
    console.error('[ADVPS-ACTION][POST] Error:', error.message);
    const formatted = formatAdvpsActionError(error);
    return customerJson(
      { success: false, error: formatted.message, message: formatted.message, code: formatted.code },
      formatted.status,
      action
    );
  }
}
