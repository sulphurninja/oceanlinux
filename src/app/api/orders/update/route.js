import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { assignPanelCredentials } from '@/lib/panelCredentials';
const AdvpsAPI = require('@/services/advpsApi');

export async function POST(request) {
  await connectDB();

  try {
    const { orderId, ipAddress, username, password, status, os, provider, provisioningStatus, advpsServiceId } = await request.json();
    if (!orderId) {
      return NextResponse.json(
        { message: 'Missing orderId' },
        { status: 400 }
      );
    }

    const updateFields = {
      ipAddress: ipAddress || '',
      username: username || '',
      password: password || '',
      os: os || 'CentOS 7',
      status: status || 'pending',
    };
    if (provider) updateFields.provider = provider;
    if (provisioningStatus !== undefined) updateFields.provisioningStatus = provisioningStatus || 'pending';
    if (advpsServiceId !== undefined) updateFields.advpsServiceId = advpsServiceId || '';

    // Auto-provision ADVPS when a service ID is set/changed
    const advpsNotes = [];
    let advpsProvisioningStarted = false;
    if (advpsServiceId) {
      const existingOrder = await Order.findById(orderId);
      const isNewServiceId = !existingOrder?.advpsServiceId || existingOrder.advpsServiceId !== advpsServiceId;

      if (isNewServiceId) {
        console.log('[ORDER-UPDATE] New ADVPS serviceId detected, starting provisioning flow...');
        const api = new AdvpsAPI();

        // Immediately fetch IP and service info
        try {
          const statusRes = await api.status(advpsServiceId);
          const svcData = statusRes?.data || statusRes;
          const svc = svcData?.service || svcData;

          if (svc?.ip || svcData?.ip) {
            updateFields.ipAddress = svc?.ip || svcData?.ip;
            advpsNotes.push(`IP fetched: ${updateFields.ipAddress}`);
          }

          if (svc?.productInfo?.os || svc?.os?.name) {
            const osName = svc?.os?.name || svc?.productInfo?.os || '';
            if (osName.toLowerCase().includes('windows')) {
              updateFields.os = 'Windows 2022 64';
            } else if (osName.toLowerCase().includes('ubuntu')) {
              updateFields.os = 'Ubuntu 22';
            } else if (osName.toLowerCase().includes('centos')) {
              updateFields.os = 'CentOS 7';
            }

            if (osName.toLowerCase().includes('windows')) {
              // For Windows, username is in parentheses e.g. "WINDOWS SERVER 2022 (GHOST)" → "GHOST"
              const usernameMatch = osName.match(/\(([^)]+)\)/);
              updateFields.username = usernameMatch ? usernameMatch[1] : 'administrator';
            } else {
              updateFields.username = 'root';
            }
            advpsNotes.push(`Username: ${updateFields.username}`);
          }

          if (svc?.expiryDate) {
            updateFields.expiryDate = new Date(svc.expiryDate);
          }
        } catch (err) {
          console.error('[ORDER-UPDATE] ADVPS status fetch failed:', err.message);
          advpsNotes.push('Failed to fetch service status from ADVPS');
        }

        // Set order to provisioning state — customer sees a loader
        updateFields.provider = 'advps';
        updateFields.provisioningStatus = 'provisioning';
        updateFields.status = 'active';
        updateFields.lastSyncTime = new Date();
        advpsProvisioningStarted = true;
        advpsNotes.push('Server provisioning started. Starting server → generating password (takes ~2 min).');

        // Assign panel credentials if missing
        if (!existingOrder.panelUsername) {
          await assignPanelCredentials(existingOrder);
          updateFields.panelUsername = existingOrder.panelUsername;
          updateFields.panelPassword = existingOrder.panelPassword;
          advpsNotes.push(`Panel credentials generated: ${existingOrder.panelUsername}`);
        }

        // Background: start server → wait 60s → attempt password gen with retries
        const bgOrderId = orderId;
        const bgServiceId = advpsServiceId;

        // Helper: save password to DB with retries (password is one-shot from ADVPS, cannot be retrieved again)
        async function savePasswordToDB(password, svcId, oId) {
          for (let dbAttempt = 0; dbAttempt < 5; dbAttempt++) {
            try {
              await Order.findByIdAndUpdate(oId, {
                password: password,
                provisioningStatus: 'active',
                lastAction: 'provision',
                lastActionTime: new Date(),
              });
              console.log(`[ADVPS-PROVISION] ✅ Password SAVED to DB for ${svcId} (attempt ${dbAttempt + 1})`);
              return true;
            } catch (dbErr) {
              console.error(`[ADVPS-PROVISION] ❌ DB save attempt ${dbAttempt + 1}/5 FAILED for ${svcId}:`, dbErr.message);
              if (dbAttempt < 4) await new Promise(r => setTimeout(r, 2000));
            }
          }
          return false;
        }

        (async () => {
          const bgApi = new AdvpsAPI();
          try {
            // Step 1: Start the server
            console.log(`[ADVPS-PROVISION] Starting server ${bgServiceId}...`);
            try {
              await bgApi.start(bgServiceId);
              console.log(`[ADVPS-PROVISION] Start command sent for ${bgServiceId}`);
            } catch (startErr) {
              console.log(`[ADVPS-PROVISION] Start response: ${startErr.message} (may already be running)`);
            }

            // Step 2: Wait 60 seconds for the server to boot
            console.log(`[ADVPS-PROVISION] Waiting 60s for server to boot...`);
            await new Promise(resolve => setTimeout(resolve, 60000));

            // Step 3: Try generating password with retries (server may need more time)
            const retryDelays = [0, 30000, 30000, 60000]; // immediate, then 30s, 30s, 60s
            let passwordSaved = false;

            for (let attempt = 0; attempt < retryDelays.length; attempt++) {
              if (attempt > 0) {
                console.log(`[ADVPS-PROVISION] Password retry ${attempt}, waiting ${retryDelays[attempt] / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
              }

              try {
                const passRes = await bgApi.generatePassword(bgServiceId);
                const d = passRes?.data || {};
                const newPassword = d.password || d.newPassword || d.existingPassword;
                if (newPassword) {
                  console.log(`[ADVPS-PROVISION] 🔑 PASSWORD GENERATED for service=${bgServiceId} order=${bgOrderId}: ${newPassword}`);

                  const saved = await savePasswordToDB(newPassword, bgServiceId, bgOrderId);
                  if (!saved) {
                    console.error(`[ADVPS-PROVISION] 🚨 CRITICAL: Password generated but ALL DB saves failed! service=${bgServiceId} order=${bgOrderId} password=${newPassword}`);
                  }
                  passwordSaved = true;
                  break;
                }
              } catch (passErr) {
                const msg = passErr.message || '';
                if (msg.includes('already exists') || msg.includes('Password already')) {
                  console.log(`[ADVPS-PROVISION] Password already exists for ${bgServiceId}, marking as active`);
                  await Order.findByIdAndUpdate(bgOrderId, {
                    provisioningStatus: 'active',
                    provisioningError: 'Password was generated previously but not captured. Check ADVPS dashboard or rebuild the server to get a new password.',
                    lastAction: 'provision',
                    lastActionTime: new Date(),
                  });
                  passwordSaved = true;
                  break;
                }
                if (msg.includes('must be running')) {
                  console.log(`[ADVPS-PROVISION] Server not ready yet (attempt ${attempt + 1}/${retryDelays.length})`);
                  continue;
                }
                console.error(`[ADVPS-PROVISION] Password gen attempt ${attempt + 1} failed:`, msg);
              }
            }

            if (!passwordSaved) {
              console.error(`[ADVPS-PROVISION] All password attempts failed for ${bgServiceId}`);
              await Order.findByIdAndUpdate(bgOrderId, {
                provisioningStatus: 'failed',
                provisioningError: 'Password generation failed after multiple attempts. Try "Generate Password" from the order page when server is running.',
              });
            }
          } catch (bgErr) {
            console.error(`[ADVPS-PROVISION] Background provisioning failed for ${bgServiceId}:`, bgErr.message);
            await Order.findByIdAndUpdate(bgOrderId, {
              provisioningStatus: 'failed',
              provisioningError: `Provisioning failed: ${bgErr.message}`,
            });
          }
        })();
      }
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      updateFields,
      { new: true }
    );

    if (!updatedOrder) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json(
      { message: 'Order updated', order: updatedOrder, advpsNotes: advpsNotes.length > 0 ? advpsNotes : undefined },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
