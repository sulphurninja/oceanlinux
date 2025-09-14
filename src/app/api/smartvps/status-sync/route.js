import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
const SmartVpsAPI = require('@/services/smartvpsApi'); // your existing client with Basic Auth

// --- small logging helper
const L = {
  head: (label) => {
    console.log("\n" + "🛰️".repeat(80));
    console.log(`[SVPS-SYNC] ${label}`);
    console.log("🛰️".repeat(80));
  },
  kv: (k, v) => console.log(`[SVPS-SYNC] ${k}:`, v),
  line: (msg='') => console.log(`[SVPS-SYNC] ${msg}`),
};

// --- normalize weird SmartVPS JSON (sometimes stringified twice, with \" etc.)
function normalizeSmartVpsResponse(payload) {
  if (payload == null) return payload;
  try {
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch {}
      const unquoted = payload.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
      try { return JSON.parse(unquoted); } catch {}
    }
    return payload;
  } catch {
    return payload;
  }
}

// --- sleep utility so we don't hammer their API
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- is this IPStock a SmartVPS product?
function isSmartVpsStock(ipStock) {
  const tags = Array.isArray(ipStock?.tags) ? ipStock.tags.map(t => String(t).toLowerCase()) : [];
  const provider = String(ipStock?.provider || '').toLowerCase();
  const name = String(ipStock?.name || '').toLowerCase();
  return (
    tags.includes('smartvps') ||
    provider === 'smartvps' ||
    name.includes('smartvps')
  );
}

// --- extract first IPv4 from any string/object
function extractIp(from) {
  const text = typeof from === 'string' ? from : JSON.stringify(from || '');
  const m = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  return m ? m[0] : null;
}

// --- core updater per order
async function refreshOneOrder(order, smartvpsApi) {
  // Only attempt if we at least have an IP
  const ip = order?.ipAddress && extractIp(order.ipAddress);
  if (!ip) {
    return { orderId: order._id.toString(), skipped: true, reason: 'No valid IP on order' };
  }

  L.kv('Checking status for IP', ip);

  const raw = await smartvpsApi.status(ip);          // POST { ip } per your client
  const normalized = normalizeSmartVpsResponse(raw); // could still be string
  L.kv('status(raw)', typeof raw === 'string' ? raw.slice(0, 500) : raw);
  L.kv('status(normalized)', normalized);

  let obj = normalized;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch {
      try {
        const unquoted = obj.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
        obj = JSON.parse(unquoted);
      } catch {
        obj = {};
      }
    }
  }

  // Known keys (note: SmartVPS typo "Usernane")
  const username = obj.Usernane || obj.Username || order.username || null;
  const password = obj.Password || order.password || null;
  const os = obj.OS || order.os || undefined;
  const expiryDate = obj.ExpiryDate ? new Date(obj.ExpiryDate) : order.expiryDate;
  const machineStatus = obj.MachineStatus;
  const powerStatus = obj.PowerStatus;
  const actionStatus = obj.ActionStatus;

  // Decide if we have anything new to save
  const hasCreds = Boolean(username && password);
  const update = {
    ...(hasCreds ? { username, password } : {}),
    ...(os ? { os } : {}),
    ...(expiryDate ? { expiryDate } : {}),
    ...(machineStatus ? { machineStatus } : {}),
    ...(powerStatus ? { powerStatus } : {}),
    ...(actionStatus ? { actionStatus } : {}),
    autoProvisioned: true,
    provisioningStatus: hasCreds ? 'active' : (order.provisioningStatus || 'provisioning'),
    provisioningError: '',
    status: hasCreds ? 'active' : (order.status || 'active'),
  };

  if (!hasCreds) {
    L.line('No credentials yet — keeping order active/provisioning, will try again later.');
  } else {
    L.line(`Got credentials! user=${username}, pass=${String(password).substring(0,4)}****`);
  }

  await Order.findByIdAndUpdate(order._id, update);

  return {
    orderId: order._id.toString(),
    ip,
    updated: true,
    gotCredentials: hasCreds,
    machineStatus,
    powerStatus,
    actionStatus,
  };
}

/**
 * POST /api/smartvps/status-sync
 *
 * Body (optional):
 * {
 *   "limit": 10,              // max orders to process this call (default 10)
 *   "sleepMs": 800,           // delay between status calls (default 800ms)
 *   "onlyMissingCreds": true, // if true, restrict to orders without password/username (default true)
 *   "includeStatuses": ["active","confirmed"] // which order.status values to include
 * }
 *
 * This endpoint:
 *  1) Finds SmartVPS orders that look eligible
 *  2) Calls status(ip) for each
 *  3) Updates order with credentials when available
 */
export async function POST(req) {
  const started = Date.now();
  L.head('SMARTVPS STATUS SYNC — START');

  try {
    await connectDB();

    const smartvpsApi = new SmartVpsAPI();

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body?.limit ?? 10)));
    const sleepMs = Math.max(0, Math.min(3000, Number(body?.sleepMs ?? 800)));
    const onlyMissingCreds = body?.onlyMissingCreds !== false; // default true
    const includeStatuses = Array.isArray(body?.includeStatuses) && body.includeStatuses.length
      ? body.includeStatuses
      : ['active', 'confirmed'];

    L.kv('limit', limit);
    L.kv('sleepMs', sleepMs);
    L.kv('onlyMissingCreds', onlyMissingCreds);
    L.kv('includeStatuses', includeStatuses);

    // 1) Find candidate orders (simple pre-filter)
    //    - Have an ipStockId
    //    - Have some IP-like string in ipAddress (or at least a non-empty ipAddress)
    //    - Status in allowed set
    //    - If onlyMissingCreds: username or password missing/empty
    const baseQuery = {
      ipStockId: { $exists: true, $ne: null },
      ipAddress: { $exists: true, $ne: null },
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
      .sort({ updatedAt: 1 }) // oldest updated first
      .limit(limit * 3);       // fetch a bit extra; we’ll filter by SmartVPS next

    L.kv('candidateOrders(found)', candidates.length);

    if (!candidates.length) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No candidate orders found',
        tookMs: Date.now() - started,
      });
    }

    // 2) Build ipStock cache and filter to SmartVPS only
    const ipStockIds = [...new Set(candidates.map(o => o.ipStockId).filter(Boolean))];
    const ipStocks = await IPStock.find({ _id: { $in: ipStockIds } });
    const ipStockMap = new Map(ipStocks.map(s => [String(s._id), s]));
    L.kv('ipStocksLoaded', ipStocks.length);

    const smartvpsOrders = candidates.filter(o => {
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

    // 3) Process each order (with small delay between calls)
    const results = [];
    for (let i = 0; i < smartvpsOrders.length; i++) {
      const order = smartvpsOrders[i];
      try {
        const res = await refreshOneOrder(order, smartvpsApi);
        results.push({ ok: true, ...res });
      } catch (err) {
        results.push({
          ok: false,
          orderId: order._id.toString(),
          error: err.message,
        });
      }

      if (i < smartvpsOrders.length - 1 && sleepMs > 0) {
        await sleep(sleepMs);
      }
    }

    const gotCreds = results.filter(r => r.ok && r.gotCredentials).length;

    return NextResponse.json({
      success: true,
      processed: results.length,
      gotCredentials: gotCreds,
      results,
      tookMs: Date.now() - started,
    });

  } catch (e) {
    console.error('[SVPS-SYNC] 💥 Endpoint error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// Optional: quick health check
export async function GET() {
  return NextResponse.json({ ok: true, name: 'smartvps/status-sync' });
}
