import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { assignPanelCredentials } from '@/lib/panelCredentials';
const AdvpsAPI = require('@/services/advpsApi');
const WhatsAppService = require('@/services/whatsappService');

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

        // Background: fetch password from ADVPS order details (never generate — that overwrites the real one)
        const bgOrderId = orderId;
        const bgServiceId = advpsServiceId;
        const bgAdvpsOrderId = existingOrder?.advpsOrderId;

        (async () => {
          const bgApi = new AdvpsAPI();
          try {
            if (!bgAdvpsOrderId) {
              console.log(`[ADVPS-PROVISION] No advpsOrderId on order ${bgOrderId}, skipping password fetch`);
              return;
            }

            // Poll order details for password (2 attempts: immediate + 60s)
            const pollDelays = [0, 60000];
            let passwordSaved = false;

            for (let attempt = 0; attempt < pollDelays.length; attempt++) {
              if (pollDelays[attempt] > 0) {
                console.log(`[ADVPS-PROVISION] Waiting ${pollDelays[attempt] / 1000}s before password poll...`);
                await new Promise(r => setTimeout(r, pollDelays[attempt]));
              }

              try {
                const detailsRes = await bgApi.getOrderDetails(bgAdvpsOrderId);
                const svc = (detailsRes?.data?.services || [])[0];
                if (svc?.password) {
                  console.log(`[ADVPS-PROVISION] Password from order details (poll ${attempt + 1}): ${svc.password.substring(0, 4)}****`);
                  await Order.findByIdAndUpdate(bgOrderId, {
                    password: svc.password,
                    ...(svc.username ? { username: svc.username } : {}),
                    provisioningStatus: 'active',
                    lastAction: 'provision',
                    lastActionTime: new Date(),
                  });
                  passwordSaved = true;
                  break;
                }
                console.log(`[ADVPS-PROVISION] Password poll ${attempt + 1}/${pollDelays.length}: not available yet`);
              } catch (err) {
                console.log(`[ADVPS-PROVISION] Password poll ${attempt + 1} error: ${err.message}`);
              }
            }

            if (!passwordSaved) {
              console.log(`[ADVPS-PROVISION] Password not yet available for ${bgAdvpsOrderId}, pending cron will handle it`);
            }
          } catch (bgErr) {
            console.error(`[ADVPS-PROVISION] Background password fetch failed for ${bgServiceId}:`, bgErr.message);
          }
        })();
      }
    }

    const existingBeforeUpdate = await Order.findById(orderId).select('status provisioningStatus ipAddress user').lean();
    const wasActive = existingBeforeUpdate?.status === 'active' || existingBeforeUpdate?.provisioningStatus === 'active';

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      updateFields,
      { new: true }
    );

    if (!updatedOrder) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    const isNowActive = (updateFields.status === 'active' || updateFields.provisioningStatus === 'active') && updateFields.ipAddress;
    if (isNowActive && !wasActive && updatedOrder.user) {
      WhatsAppService.notifyOrderViaWhatsApp(updatedOrder.user, updatedOrder).catch(() => {});
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
