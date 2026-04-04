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
            const pollDelays = [10000, 15000, 20000, 30000, 60000, 60000];
            for (let i = 0; i < pollDelays.length; i++) {
              await new Promise(r => setTimeout(r, pollDelays[i]));
              try {
                const taskRes = await api.taskStatus(taskId);
                const taskData = taskRes?.data || taskRes;
                const taskStatus = (taskData.status || '').toUpperCase();
                console.log(`[ADVPS-ACTION] Rebuild poll ${i + 1}: status=${taskStatus}, progress=${taskData.progress}`);

                if (taskStatus === 'COMPLETED' || taskStatus === 'SUCCESS' || taskStatus === 'DONE') {
                  console.log(`[ADVPS-ACTION] Rebuild task completed for ${rebuildServiceId}, starting post-rebuild password flow...`);

                  // Start the server first (LXC may be stopped after rebuild)
                  try {
                    await api.start(rebuildServiceId);
                    console.log(`[ADVPS-ACTION] Post-rebuild start command sent for ${rebuildServiceId}`);
                  } catch (startErr) {
                    console.log(`[ADVPS-ACTION] Post-rebuild start: ${startErr.message} (may already be running)`);
                  }

                  // Wait for the server to fully boot
                  await new Promise(r => setTimeout(r, 45000));

                  const passRetryDelays = [0, 20000, 30000, 60000];
                  for (let attempt = 0; attempt < passRetryDelays.length; attempt++) {
                    if (attempt > 0) await new Promise(r => setTimeout(r, passRetryDelays[attempt]));
                    try {
                      const passRes = await api.generatePassword(rebuildServiceId);
                      const pd = passRes?.data || {};
                      const newPass = pd.password || pd.newPassword || pd.existingPassword;
                      console.log(`[ADVPS-ACTION] generate-password response: status=${pd.status}, hasPassword=${!!pd.password}, hasNewPassword=${!!pd.newPassword}, hasExistingPassword=${!!pd.existingPassword}`);
                      if (newPass) {
                        console.log(`[ADVPS-ACTION] 🔑 POST-REBUILD PASSWORD for service=${rebuildServiceId} order=${rebuildOrderId}: ${newPass}`);

                        for (let dbAttempt = 0; dbAttempt < 5; dbAttempt++) {
                          try {
                            await Order.findByIdAndUpdate(rebuildOrderId, {
                              password: newPass,
                              provisioningStatus: 'active',
                            });
                            console.log(`[ADVPS-ACTION] ✅ Post-rebuild password SAVED (attempt ${dbAttempt + 1})`);
                            return;
                          } catch (dbErr) {
                            console.error(`[ADVPS-ACTION] ❌ DB save attempt ${dbAttempt + 1}/5 FAILED:`, dbErr.message);
                            if (dbAttempt < 4) await new Promise(r => setTimeout(r, 2000));
                          }
                        }
                        console.error(`[ADVPS-ACTION] 🚨 CRITICAL: Post-rebuild password ALL DB saves failed! service=${rebuildServiceId} order=${rebuildOrderId} password=${newPass}`);
                        return;
                      }
                    } catch (passErr) {
                      const msg = passErr.message || '';
                      console.log(`[ADVPS-ACTION] generate-password error (attempt ${attempt + 1}): ${msg}`);

                      // Extract password from error response if available (e.g. "already exists" with existingPassword)
                      const existingMatch = msg.match(/existingPassword[:\s]+"?([^"}\s,]+)/);
                      if (existingMatch) {
                        const extractedPass = existingMatch[1];
                        console.log(`[ADVPS-ACTION] 🔑 Extracted existingPassword from error: ${extractedPass}`);
                        await Order.findByIdAndUpdate(rebuildOrderId, { password: extractedPass, provisioningStatus: 'active' });
                        return;
                      }

                      if (msg.includes('must be running')) {
                        console.log(`[ADVPS-ACTION] Server not ready for password gen (attempt ${attempt + 1})`);
                        continue;
                      }
                    }
                  }
                  console.error(`[ADVPS-ACTION] Post-rebuild password gen exhausted all retries for ${rebuildServiceId}`);
                  await Order.findByIdAndUpdate(rebuildOrderId, {
                    provisioningStatus: 'active',
                    provisioningError: 'Rebuild completed but password could not be retrieved. Check ADVPS dashboard for the new password.',
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
