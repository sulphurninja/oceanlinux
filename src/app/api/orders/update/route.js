import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { assignPanelCredentials } from '@/lib/panelCredentials';
import { requireAdmin } from '@/lib/adminAuth';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
const AdvpsAPI = require('@/services/advpsApi');
const WhatsAppService = require('@/services/whatsappService');
const { syncAdvpsOrderCredentials } = require('@/lib/advpsOrderSync');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const ResellerApi = require('@/services/resellerApi');
const {
  syncResellerVmCredentials,
  resolveResellerVmForOrder,
} = require('@/lib/resellerApiOrderSync');

const ADMIN_ORDER_STATUSES = new Set(['pending', 'confirmed', 'active']);

function normalizeAdminOrderStatus(status) {
  const value = String(status || 'pending').trim().toLowerCase();
  if (value === 'paid' || value === 'completed') return 'confirmed';
  if (ADMIN_ORDER_STATUSES.has(value)) return value;
  return 'pending';
}

export async function POST(request) {
  await connectDB();

  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  try {
    const { orderId, ipAddress, username, password, status, os, provider, provisioningStatus, advpsServiceId, advpsOrderId, trialManageCompanyId } = await request.json();
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
      status: normalizeAdminOrderStatus(status),
    };
    if (provider) updateFields.provider = provider;
    if (provisioningStatus !== undefined) updateFields.provisioningStatus = provisioningStatus || 'pending';
    if (advpsServiceId !== undefined) updateFields.advpsServiceId = advpsServiceId || '';
    if (advpsOrderId !== undefined) updateFields.advpsOrderId = String(advpsOrderId || '').trim();
    if (trialManageCompanyId !== undefined) {
      updateFields.trialManageCompanyId = String(trialManageCompanyId || '').trim();
    }

    const existingBeforeUpdate = await Order.findById(orderId).select(
      'status provisioningStatus ipAddress user ipStockId resellerVmId username password os expiryDate provider trialManageCompanyId'
    ).lean();
    const wasActive = existingBeforeUpdate?.status === 'active' || existingBeforeUpdate?.provisioningStatus === 'active';

    const manageCompanyChanged =
      trialManageCompanyId !== undefined &&
      String(trialManageCompanyId || '').trim() !== String(existingBeforeUpdate?.trialManageCompanyId || '').trim();

    const ipChanged =
      ipAddress &&
      String(existingBeforeUpdate?.ipAddress || '').split(':')[0].trim() !==
        String(ipAddress || '').split(':')[0].trim();

    const resolveManageCompanyId = () => {
      if (trialManageCompanyId !== undefined) return String(trialManageCompanyId || '').trim();
      return String(existingBeforeUpdate?.trialManageCompanyId || '').trim();
    };

    async function relinkResellerVmFromCompany(companyId, ipForLookup) {
      if (!companyId || !ipForLookup) return;
      const company = await Company.findById(companyId).select('resellerApi name').lean();
      const resellerCfg = getCompanyResellerApiConfig(company);
      if (!resellerCfg) return;
      const api = new ResellerApi(resellerCfg);
      const draftOrder = { ...existingBeforeUpdate, ipAddress: ipForLookup };
      const found = await resolveResellerVmForOrder(api, draftOrder);
      if (found?.vmId) {
        const synced = await syncResellerVmCredentials(api, draftOrder, found.vmId);
        updateFields.resellerVmId = String(synced.vmId || found.vmId);
        updateFields.provider = updateFields.provider || 'reseller-api';
        updateFields.ipAddress = synced.updates.ipAddress || ipForLookup;
        Object.assign(updateFields, synced.updates);
      } else {
        updateFields.resellerVmId = '';
      }
    }

    if (manageCompanyChanged || ipChanged) {
      const ipForLookup = ipAddress || existingBeforeUpdate?.ipAddress;
      const manageId = resolveManageCompanyId();
      try {
        if (manageId) {
          await relinkResellerVmFromCompany(manageId, ipForLookup);
        } else if (ipChanged && existingBeforeUpdate?.ipStockId) {
          const ipStock = await IPStock.findById(existingBeforeUpdate.ipStockId).select('company').lean();
          const company = ipStock?.company
            ? await Company.findById(ipStock.company).select('resellerApi name').lean()
            : null;
          const resellerCfg = getCompanyResellerApiConfig(company);
          if (resellerCfg) {
            const api = new ResellerApi(resellerCfg);
            const draftOrder = { ...existingBeforeUpdate, ipAddress };
            const found = await resolveResellerVmForOrder(api, draftOrder);
            if (found?.vmId) {
              const synced = await syncResellerVmCredentials(api, draftOrder, found.vmId);
              updateFields.resellerVmId = String(synced.vmId || found.vmId);
              updateFields.provider = 'reseller-api';
              updateFields.ipAddress = synced.updates.ipAddress || ipAddress;
              Object.assign(updateFields, synced.updates);
            } else {
              updateFields.resellerVmId = '';
            }
          }
        }
      } catch (resellerErr) {
        console.warn('[ORDER-UPDATE] Reseller VM re-link failed:', resellerErr.message);
        if (manageCompanyChanged) updateFields.resellerVmId = '';
      }
    }

    // Auto-provision ADVPS when a service ID is set/changed
    const advpsNotes = [];
    let advpsProvisioningStarted = false;
    if (advpsServiceId) {
      const existingOrder = await Order.findById(orderId);
      const isNewServiceId = !existingOrder?.advpsServiceId || existingOrder.advpsServiceId !== advpsServiceId;

      if (isNewServiceId) {
        console.log('[ORDER-UPDATE] New ADVPS serviceId detected, auto-syncing from ADVPS...');
        const api = new AdvpsAPI();

        try {
          const statusRes = await api.status(advpsServiceId);
          const sync = await syncAdvpsOrderCredentials(api, existingOrder, {
            statusPayload: statusRes,
            Order,
          });

          Object.assign(updateFields, sync.dbUpdates);
          if (sync.dbUpdates.ipAddress) {
            advpsNotes.push(`IP fetched: ${sync.dbUpdates.ipAddress}`);
          }
          if (sync.dbUpdates.username) {
            advpsNotes.push(`Username: ${sync.dbUpdates.username}`);
          }
          if (sync.dbUpdates.password) {
            advpsNotes.push('Password synced from ADVPS');
          }
          if (sync.dbUpdates.advpsOrderId) {
            advpsNotes.push(`ADVPS purchase order linked: ${sync.dbUpdates.advpsOrderId}`);
          } else if (sync.advpsOrderIdMissing) {
            advpsNotes.push('Credentials synced from service status (purchase order ID not found yet)');
          }
          if (sync.dbUpdates.expiryDate) {
            advpsNotes.push(`Expiry synced from ADVPS: ${new Date(sync.dbUpdates.expiryDate).toISOString()}`);
          }

          updateFields.provider = 'advps';
          updateFields.provisioningStatus = sync.dbUpdates.password ? 'active' : 'provisioning';
          updateFields.status = 'active';
          advpsProvisioningStarted = true;
          if (!sync.dbUpdates.password) {
            advpsNotes.push('Password not yet available — will retry automatically');
          }
        } catch (err) {
          console.error('[ORDER-UPDATE] ADVPS auto-sync failed:', err.message);
          advpsNotes.push('Failed to fetch service status from ADVPS');
        }

        // Set order to provisioning state when sync did not complete credentials
        if (!advpsProvisioningStarted) {
          updateFields.provider = 'advps';
          updateFields.provisioningStatus = 'provisioning';
          updateFields.status = 'active';
          updateFields.lastSyncTime = new Date();
          advpsProvisioningStarted = true;
        }

        // Assign panel credentials if missing
        if (!existingOrder.panelUsername) {
          await assignPanelCredentials(existingOrder);
          updateFields.panelUsername = existingOrder.panelUsername;
          updateFields.panelPassword = existingOrder.panelPassword;
          advpsNotes.push(`Panel credentials generated: ${existingOrder.panelUsername}`);
        }

        // Background: retry password/purchase sync if still incomplete
        const bgOrderId = orderId;
        const bgServiceId = advpsServiceId;
        const bgAdvpsOrderId = updateFields.advpsOrderId || existingOrder?.advpsOrderId;

        (async () => {
          const bgApi = new AdvpsAPI();
          try {
            const bgOrder = await Order.findById(bgOrderId);
            if (!bgOrder) return;

            const statusRes = await bgApi.status(bgServiceId);
            const sync = await syncAdvpsOrderCredentials(bgApi, bgOrder, {
              statusPayload: statusRes,
              Order,
            });

            if (sync.credentialsUpdated) {
              await Order.findByIdAndUpdate(bgOrderId, {
                ...sync.dbUpdates,
                provisioningStatus: sync.dbUpdates.password ? 'active' : bgOrder.provisioningStatus,
                lastAction: 'provision',
                lastActionTime: new Date(),
              });
              return;
            }

            if (!bgAdvpsOrderId) {
              console.log(`[ADVPS-PROVISION] No advpsOrderId on order ${bgOrderId}, status sync will retry on user Sync`);
              return;
            }

            // Poll order details for password (2 attempts: immediate + 60s)
            const pollDelays = [0, 60000];
            for (let attempt = 0; attempt < pollDelays.length; attempt++) {
              if (pollDelays[attempt] > 0) {
                await new Promise(r => setTimeout(r, pollDelays[attempt]));
              }

              try {
                const detailsRes = await bgApi.getOrderDetails(bgAdvpsOrderId);
                const svc = (detailsRes?.data?.services || [])[0];
                if (svc?.password) {
                  await Order.findByIdAndUpdate(bgOrderId, {
                    password: svc.password,
                    ...(svc.username ? { username: svc.username } : {}),
                    provisioningStatus: 'active',
                    lastAction: 'provision',
                    lastActionTime: new Date(),
                  });
                  return;
                }
              } catch (err) {
                console.log(`[ADVPS-PROVISION] Password poll ${attempt + 1} error: ${err.message}`);
              }
            }

            console.log(`[ADVPS-PROVISION] Password not yet available for ${bgAdvpsOrderId}, pending cron will handle it`);
          } catch (bgErr) {
            console.error(`[ADVPS-PROVISION] Background sync failed for ${bgServiceId}:`, bgErr.message);
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
