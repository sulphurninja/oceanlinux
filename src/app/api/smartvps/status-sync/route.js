// --- Force Node runtime & disable static caching (critical on Vercel) ---
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Optional: let this run longer if needed (Vercel)
export const maxDuration = 120; // seconds

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceCronSecret } from '@/lib/apiSecurity';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';

// If your SmartVpsAPI is CommonJS (module.exports = class ...),
// require() is fine under Node runtime:
const SmartVpsAPI = require('@/services/smartvpsApi');
const {
  extractIpFromAddress,
  buildSmartVpsStatusOrderUpdates,
} = require('@/lib/smartvpsOrderSync');
const {
  buildInventoryOwnerMaps,
  buildOrderSyncContext,
  shouldSyncPanelDataToOrder,
  markOrderExpiredIfPastDue,
  cleanOrderIp,
} = require('@/lib/orderIpOwnership');

// --- tiny logger
const L = {
  head: (label) => {
    console.log("\n" + "🛰️".repeat(80));
    console.log(`[SVPS-SYNC] ${label}`);
    console.log("🛰️".repeat(80));
  },
  kv: (k, v) => console.log(`[SVPS-SYNC] ${k}:`, v),
  line: (msg = '') => console.log(`[SVPS-SYNC] ${msg}`),
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isSmartVpsStock(ipStock) {
  if (!ipStock) return false;
  const tags = Array.isArray(ipStock?.tags) ? ipStock.tags.map((t) => String(t).toLowerCase()) : [];
  const provider = String(ipStock?.provider || '').toLowerCase();
  const name = String(ipStock?.name || '').toLowerCase();
  const hasSmartvpsConfig = !!(
    ipStock?.defaultConfigurations?.smartvps ||
    ipStock?.defaultConfigurations?.get?.('smartvps')
  );
  return (
    tags.includes('smartvps') ||
    tags.includes('ocean linux') ||
    provider === 'smartvps' ||
    name.includes('smartvps') ||
    name.startsWith('🌊') ||
    hasSmartvpsConfig
  );
}

// --- update one order from SmartVPS status()
async function refreshOneOrder(order, smartvpsApi, { updateCreds = true, syncCtx = null } = {}) {
  const ip = order?.ipAddress && extractIpFromAddress(order.ipAddress);
  if (!ip) {
    return { orderId: order._id.toString(), skipped: true, reason: 'No valid IP on order' };
  }

  const ctx = syncCtx || { ownerByIp: new Map(), ownerByItemId: new Map(), ordersByIp: new Map() };
  if (!shouldSyncPanelDataToOrder(order, ctx)) {
    const markedExpired = await markOrderExpiredIfPastDue(order);
    return {
      orderId: order._id.toString(),
      skipped: true,
      reason: markedExpired ? 'order_expired_detached' : 'not_current_ip_owner',
      markedExpired,
    };
  }

  L.kv('Checking status for IP', ip);

  const raw = await smartvpsApi.status(ip);
  L.kv('status(raw)', typeof raw === 'string' ? raw.slice(0, 500) : raw);

  const { update, obj, hasCreds, panelExpiry, expirySynced } = buildSmartVpsStatusOrderUpdates(
    order,
    raw,
    { updateCreds, syncPanelData: true }
  );

  L.kv('status(parsed)', obj);

  if (!hasCreds) {
    L.line('No credentials yet — keeping order active/provisioning, will try again later.');
  } else {
    L.line(`Got credentials! user=${update.username}, pass=${String(update.password).substring(0, 4)}****`);
  }
  if (panelExpiry) {
    L.line(`Panel expiry synced: ${panelExpiry.toISOString()}`);
  }

  await Order.findByIdAndUpdate(order._id, update);

  return {
    orderId: order._id.toString(),
    ip,
    updated: true,
    gotCredentials: hasCreds,
    expirySynced,
    expiryDate: panelExpiry ? panelExpiry.toISOString() : null,
    machineStatus: obj.MachineStatus,
    powerStatus: obj.PowerStatus,
    actionStatus: obj.ActionStatus,
  };
}

/**
 * POST /api/smartvps/status-sync
 *
 * Body (optional):
 * {
 *   "limit": 10,
 *   "sleepMs": 800,
 *   "onlyMissingCreds": false,
 *   "includeStatuses": ["active","confirmed"]
 * }
 *
 * Query (cron-friendly): ?limit=40&onlyMissingCreds=0
 */
export async function POST(req) {
  const started = Date.now();
  L.head('SMARTVPS STATUS SYNC — START');

  try {
    const cronDenied = enforceCronSecret(req);
    if (cronDenied) return cronDenied;

    // Ensure we are on Node runtime and can open a real DB socket
    await connectDB();

    const smartvpsApi = new SmartVpsAPI();

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(
      1,
      Math.min(50, Number(body?.limit ?? url.searchParams.get('limit') ?? 20))
    );
    const sleepMs = Math.max(
      0,
      Math.min(3000, Number(body?.sleepMs ?? url.searchParams.get('sleepMs') ?? 600))
    );
    const onlyMissingCredsRaw =
      body?.onlyMissingCreds ?? url.searchParams.get('onlyMissingCreds');
    const onlyMissingCreds =
      onlyMissingCredsRaw === true ||
      onlyMissingCredsRaw === '1' ||
      onlyMissingCredsRaw === 'true';
    const includeStatuses = Array.isArray(body?.includeStatuses) && body.includeStatuses.length
      ? body.includeStatuses
      : ['active', 'confirmed'];

    L.kv('limit', limit);
    L.kv('sleepMs', sleepMs);
    L.kv('onlyMissingCreds', onlyMissingCreds);
    L.kv('includeStatuses', includeStatuses);

    // Base query — all SmartVPS orders with an IP (expiry + creds from panel)
    const baseQuery = {
      ipStockId: { $exists: true, $ne: null },
      ipAddress: { $exists: true, $ne: null, $nin: [null, ''] },
      status: { $in: includeStatuses },
    };
    if (onlyMissingCreds) {
      baseQuery.$or = [
        { username: { $exists: false } },
        { username: null },
        { username: '' },
        { password: { $exists: false } },
        { password: null },
        { password: '' },
      ];
    }

    const candidates = await Order.find(baseQuery)
      .sort({ lastSyncTime: 1, updatedAt: 1 })
      .limit(limit * 4);

    L.kv('candidateOrders(found)', candidates.length);

    if (!candidates.length) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No candidate orders found',
        tookMs: Date.now() - started,
      });
    }

    // Only SmartVPS stocks
    const ipStockIds = [...new Set(candidates.map(o => o.ipStockId).filter(Boolean))];
    const ipStocks = await IPStock.find({ _id: { $in: ipStockIds } });
    const ipStockMap = new Map(ipStocks.map(s => [String(s._id), s]));
    L.kv('ipStocksLoaded', ipStocks.length);

    const smartvpsOrders = candidates.filter(o => {
      if (String(o.provider || '').toLowerCase() === 'smartvps') return true;
      const s = ipStockMap.get(String(o.ipStockId));
      return isSmartVpsStock(s);
    }).slice(0, limit);

    L.kv('smartvpsOrders(to process)', smartvpsOrders.length);

    if (!smartvpsOrders.length) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No SmartVPS orders in candidate set',
        tookMs: Date.now() - started,
      });
    }

    const { ownerByIp, ownerByItemId } = buildInventoryOwnerMaps(ipStocks);

    const ipsInBatch = [
      ...new Set(smartvpsOrders.map((o) => cleanOrderIp(o.ipAddress)).filter(Boolean)),
    ];
    let relatedOrders = smartvpsOrders;
    if (ipsInBatch.length) {
      relatedOrders = await Order.find({
        status: { $nin: ['cancelled', 'failed'] },
        $or: ipsInBatch.map((ip) => ({
          ipAddress: new RegExp(`^${ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        })),
      }).lean();
    }
    const syncCtx = buildOrderSyncContext(relatedOrders, ipStocks);

    // Process each with small delay
    const results = [];
    for (let i = 0; i < smartvpsOrders.length; i++) {
      const order = smartvpsOrders[i];
      try {
        const res = await refreshOneOrder(order, smartvpsApi, {
          updateCreds: true,
          syncCtx: { ...syncCtx, ownerByIp, ownerByItemId },
        });
        results.push({ ok: true, ...res });
      } catch (err) {
        results.push({ ok: false, orderId: order._id.toString(), error: err.message });
      }
      if (i < smartvpsOrders.length - 1 && sleepMs > 0) {
        await sleep(sleepMs);
      }
    }

    const gotCreds = results.filter(r => r.ok && r.gotCredentials).length;
    const expirySynced = results.filter(r => r.ok && r.expirySynced).length;

    return NextResponse.json({
      success: true,
      processed: results.length,
      gotCredentials: gotCreds,
      expirySynced,
      results,
      tookMs: Date.now() - started,
    });

  } catch (e) {
    console.error('[SVPS-SYNC] 💥 Endpoint error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// Simple health check (helpful to verify on prod quickly)
export async function GET(req) {
  return POST(req);
}
