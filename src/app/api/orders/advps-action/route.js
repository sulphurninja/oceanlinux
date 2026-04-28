import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const AdvpsAPI = require('@/services/advpsApi');

/** Wait this long after order-details polling fails before trying generate-password (ADVPS post-rebuild). */
const ADVPS_REBUILD_GENERATE_PASSWORD_FALLBACK_DELAY_MS = 4.5 * 60 * 1000;

/**
 * ADVPS returns a placeholder password until the purchase order is COMPLETED/ASSIGNED.
 * After rebuild we poll this first; if it never yields a final password, callers wait ~4–5 min
 * then fall back to generate-password with spaced retries.
 */
async function waitForAdvpsFinalServiceFromOrderDetails(api, advpsOrderId) {
  const delaysMs = [20000, 45000, 60000, 120000, 60000, 60000];
  for (let i = 0; i < delaysMs.length; i++) {
    await new Promise((r) => setTimeout(r, delaysMs[i]));
    try {
      const detailsRes = await api.getOrderDetails(advpsOrderId);
      const orderDetails = detailsRes?.data || detailsRes;
      const orderStatus = (orderDetails?.order?.status || '').toUpperCase();
      const services = orderDetails?.services || [];

      console.log(`[ADVPS-ACTION] Order-details poll ${i + 1}/${delaysMs.length}: status=${orderStatus}, services=${services.length}`);

      if (['FAILED', 'CANCELLED', 'REJECTED'].includes(orderStatus)) {
        throw new Error(`ADVPS order reached terminal status: ${orderStatus}`);
      }

      if (services.length > 0 && services[0].ip) {
        const svc = services[0];
        if (orderStatus === 'COMPLETED' || orderStatus === 'ASSIGNED') {
          const pwd = (svc.password || '').trim();
          if (pwd) {
            return svc;
          }
        }
      }
    } catch (e) {
      if (String(e.message || '').includes('terminal status')) throw e;
      console.error(`[ADVPS-ACTION] getOrderDetails poll ${i + 1} error:`, e.message);
    }
  }
  return null;
}

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
    const dbUpdates = { lastSyncTime: new Date() };
    let credentialsUpdated = false;

    // Fetch live running status
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

    // Pull full order details from ADVPS to sync credentials
    if (order.advpsOrderId) {
      try {
        const detailsRes = await api.getOrderDetails(order.advpsOrderId);
        const orderDetails = detailsRes?.data || detailsRes;
        const services = orderDetails?.services || [];

        if (services.length > 0) {
          const svc = services[0];
          const freshIp       = svc.ip       || '';
          const freshUsername = svc.username  || '';
          const freshPassword = svc.password  || '';
          const freshOs       = svc.os        || '';

          if (freshIp       && freshIp       !== order.ipAddress) { dbUpdates.ipAddress = freshIp;       credentialsUpdated = true; }
          if (freshUsername && freshUsername  !== order.username)  { dbUpdates.username  = freshUsername; credentialsUpdated = true; }
          if (freshPassword && freshPassword  !== order.password)  { dbUpdates.password  = freshPassword; credentialsUpdated = true; }
          if (freshOs       && freshOs        !== order.os)        { dbUpdates.os        = freshOs;       credentialsUpdated = true; }

          if (credentialsUpdated) {
            console.log(`[ADVPS-ACTION][GET] Credentials updated from getOrderDetails for order ${orderId}`);
          }

          // Merge freshIp into details so the caller gets the latest IP too
          if (freshIp) details.ip = freshIp;
        }
      } catch (detailsErr) {
        console.error('[ADVPS-ACTION][GET] getOrderDetails error:', detailsErr.message);
      }
    }

    await Order.findByIdAndUpdate(orderId, dbUpdates);

    return NextResponse.json({ success: true, serviceId, details, syncResult: { credentialsUpdated, lastSyncTime: dbUpdates.lastSyncTime } });
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

        // Rate-limit: max 10 rebuilds per calendar month
        const REBUILD_LIMIT = 10;
        const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        const storedMonth = order.advpsRebuildCountMonth || '';
        const currentCount = storedMonth === currentMonth ? (order.advpsRebuildCount || 0) : 0;

        if (currentCount >= REBUILD_LIMIT) {
          return NextResponse.json({
            message: `Rebuild limit reached. You can only rebuild/format your server ${REBUILD_LIMIT} times per month. Your limit resets on the 1st of next month.`,
            code: 'REBUILD_LIMIT_REACHED',
            rebuildsUsed: currentCount,
            rebuildsRemaining: 0,
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
          const advpsOrderIdForRebuild = order.advpsOrderId;

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
                  console.log(`[ADVPS-ACTION] Rebuild task completed for ${rebuildServiceId}, polling getOrderDetails for final credentials (generate-password only if this fails)...`);

                  try {
                    await api.start(rebuildServiceId);
                    console.log(`[ADVPS-ACTION] Post-rebuild start command sent for ${rebuildServiceId}`);
                  } catch (startErr) {
                    console.log(`[ADVPS-ACTION] Post-rebuild start: ${startErr.message} (may already be running)`);
                  }

                  await new Promise(r => setTimeout(r, 45000));

                  if (!advpsOrderIdForRebuild) {
                    console.error(`[ADVPS-ACTION] Post-rebuild: no advpsOrderId on order ${rebuildOrderId}`);
                    await Order.findByIdAndUpdate(rebuildOrderId, {
                      provisioningStatus: 'active',
                      provisioningError: 'Rebuild completed but this order has no ADVPS order id stored — use Sync to refresh credentials from ADVPS.',
                    });
                    return;
                  }

                  try {
                    const svc = await waitForAdvpsFinalServiceFromOrderDetails(api, advpsOrderIdForRebuild);
                    if (svc) {
                      const updateFields = {
                        password: svc.password,
                        provisioningStatus: 'active',
                        provisioningError: '',
                      };
                      if (svc.username) updateFields.username = svc.username;
                      if (svc.ip) updateFields.ipAddress = svc.ip;
                      if (svc.os) updateFields.os = svc.os;

                      for (let dbAttempt = 0; dbAttempt < 5; dbAttempt++) {
                        try {
                          await Order.findByIdAndUpdate(rebuildOrderId, updateFields);
                          console.log(`[ADVPS-ACTION] ✅ Post-rebuild credentials from getOrderDetails saved (attempt ${dbAttempt + 1})`);
                          return;
                        } catch (dbErr) {
                          console.error(`[ADVPS-ACTION] ❌ DB save attempt ${dbAttempt + 1}/5 FAILED:`, dbErr.message);
                          if (dbAttempt < 4) await new Promise(r => setTimeout(r, 2000));
                        }
                      }
                      console.error(`[ADVPS-ACTION] 🚨 Post-rebuild: credentials from ADVPS but DB save failed for order ${rebuildOrderId}`);
                      return;
                    }

                    console.log(
                      `[ADVPS-ACTION] Post-rebuild: getOrderDetails did not return final password in time — ` +
                      `waiting ${ADVPS_REBUILD_GENERATE_PASSWORD_FALLBACK_DELAY_MS / 60000} min before generate-password fallback`
                    );
                    await new Promise((r) => setTimeout(r, ADVPS_REBUILD_GENERATE_PASSWORD_FALLBACK_DELAY_MS));

                    const passRetryDelays = [0, 20000, 30000, 60000];
                    for (let attempt = 0; attempt < passRetryDelays.length; attempt++) {
                      if (attempt > 0) await new Promise(r => setTimeout(r, passRetryDelays[attempt]));
                      try {
                        const passRes = await api.generatePassword(rebuildServiceId);
                        const pd = passRes?.data || {};
                        const newPass = pd.password || pd.newPassword || pd.existingPassword;
                        console.log(`[ADVPS-ACTION] Post-rebuild generate-password attempt ${attempt + 1}: status=${pd.status}, hasPassword=${!!newPass}`);
                        if (newPass) {
                          console.log(`[ADVPS-ACTION] 🔑 POST-REBUILD PASSWORD (fallback) for service=${rebuildServiceId} order=${rebuildOrderId}`);

                          for (let dbAttempt = 0; dbAttempt < 5; dbAttempt++) {
                            try {
                              await Order.findByIdAndUpdate(rebuildOrderId, {
                                password: newPass,
                                provisioningStatus: 'active',
                                provisioningError: '',
                              });
                              console.log(`[ADVPS-ACTION] ✅ Post-rebuild password from generate-password saved (attempt ${dbAttempt + 1})`);
                              return;
                            } catch (dbErr) {
                              console.error(`[ADVPS-ACTION] ❌ DB save attempt ${dbAttempt + 1}/5 FAILED:`, dbErr.message);
                              if (dbAttempt < 4) await new Promise(r => setTimeout(r, 2000));
                            }
                          }
                          console.error(`[ADVPS-ACTION] 🚨 Post-rebuild fallback password DB save failed for order ${rebuildOrderId}`);
                          return;
                        }
                      } catch (passErr) {
                        const msg = passErr.message || '';
                        console.log(`[ADVPS-ACTION] Post-rebuild generate-password error (attempt ${attempt + 1}): ${msg}`);

                        const existingMatch = msg.match(/existingPassword[:\s]+"?([^"}\s,]+)/);
                        if (existingMatch) {
                          const extractedPass = existingMatch[1];
                          console.log(`[ADVPS-ACTION] 🔑 Extracted existingPassword from error: ${extractedPass}`);
                          await Order.findByIdAndUpdate(rebuildOrderId, {
                            password: extractedPass,
                            provisioningStatus: 'active',
                            provisioningError: '',
                          });
                          return;
                        }

                        if (msg.includes('must be running')) {
                          console.log(`[ADVPS-ACTION] Server not ready for password gen (attempt ${attempt + 1})`);
                          continue;
                        }
                      }
                    }

                    console.error(`[ADVPS-ACTION] Post-rebuild: getOrderDetails and generate-password both exhausted for order ${rebuildOrderId}`);
                    await Order.findByIdAndUpdate(rebuildOrderId, {
                      provisioningStatus: 'active',
                      provisioningError: 'Rebuild completed but password could not be confirmed — use Sync in a few minutes or check the ADVPS dashboard.',
                    });
                  } catch (credErr) {
                    console.error(`[ADVPS-ACTION] Post-rebuild credential poll failed:`, credErr.message);
                    await Order.findByIdAndUpdate(rebuildOrderId, {
                      provisioningStatus: 'failed',
                      provisioningError: `Post-rebuild: ${credErr.message}`,
                    });
                  }
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
          const d = statusRes?.data || statusRes;

          const syncUpdates = { lastSyncTime: new Date() };
          let syncCredentialsUpdated = false;

          // Also pull full order details to sync credentials
          if (order.advpsOrderId) {
            try {
              const detailsRes = await api.getOrderDetails(order.advpsOrderId);
              const orderDetails = detailsRes?.data || detailsRes;
              const services = orderDetails?.services || [];

              if (services.length > 0) {
                const svc = services[0];
                const freshIp       = svc.ip       || '';
                const freshUsername = svc.username  || '';
                const freshPassword = svc.password  || '';
                const freshOs       = svc.os        || '';

                if (freshIp       && freshIp       !== order.ipAddress) { syncUpdates.ipAddress = freshIp;       syncCredentialsUpdated = true; }
                if (freshUsername && freshUsername  !== order.username)  { syncUpdates.username  = freshUsername; syncCredentialsUpdated = true; }
                if (freshPassword && freshPassword  !== order.password)  { syncUpdates.password  = freshPassword; syncCredentialsUpdated = true; }
                if (freshOs       && freshOs        !== order.os)        { syncUpdates.os        = freshOs;       syncCredentialsUpdated = true; }

                if (syncCredentialsUpdated) {
                  console.log(`[ADVPS-ACTION][SYNC] Credentials updated from getOrderDetails for order ${orderId}`);
                }
              }
            } catch (detailsErr) {
              console.error('[ADVPS-ACTION][SYNC] getOrderDetails error:', detailsErr.message);
            }
          }

          await Order.findByIdAndUpdate(orderId, syncUpdates);
          result = {
            synced: true,
            message: syncCredentialsUpdated ? 'ADVPS status synced and credentials updated' : 'ADVPS status synced',
            runningStatus: d.runningStatus,
            credentialsUpdated: syncCredentialsUpdated,
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
