// /src/app/api/smartvps/sync/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

const SmartVpsAPI = require('@/services/smartvpsApi');

// ---------- utils ----------
function normalizeSmartVpsResponse(payload: any) {
  if (payload == null) return payload;
  try {
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch { }
      const unquoted = payload.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
      try { return JSON.parse(unquoted); } catch { }
    }
    return payload;
  } catch {
    return payload;
  }
}
function toPlainMap(maybeMap: any): Record<string, any> {
  if (!maybeMap) return {};
  if (typeof maybeMap.toObject === 'function') {
    return maybeMap.toObject({ minimize: true }) as Record<string, any>;
  }
  if (maybeMap instanceof Map) {
    return Object.fromEntries(maybeMap as Map<string, any>);
  }
  return { ...maybeMap };
}
function uniq<T>(arr: T[]) { return Array.from(new Set(arr)); }

// ... existing imports and helper functions ...

async function runSync(req: Request) {
  const started = Date.now();
  // 🔎 Lambda/cron visibility
  console.log('\n' + '🛰️'.repeat(60));
  console.log('[SVPS-SYNC] HIT', {
    ts: new Date().toISOString(),
    method: req.method,
    path: new URL(req.url).pathname,
    ua: req.headers.get('user-agent') || '(no UA)',
    from: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '(no ip)',
    xLambda: req.headers.get('x-lambda-source') || '(not lambda)'
  });
  console.log('🛰️'.repeat(60));

  await connectDB();

  // Default configuration for SmartVPS packages
  const defaultOS = {
    '4GB': 'ubuntu-22.04',
    '8GB': 'ubuntu-22.04',
    '16GB': 'ubuntu-22.04',
  };

  const defaultPricing = {
    '4GB': 699,
    '8GB': 999,
    '16GB': 1499,
  };

  const defaultTag = 'Premium';
  const defaultServerType = 'Linux';

  // --- Fetch SmartVPS packages (string often double-encoded) ---
  const api = new SmartVpsAPI();
  const raw = await api.ipstock();
  const obj = normalizeSmartVpsResponse(raw);
  const packages: Array<{ id: number | string; name: string; ipv4: number; status: string }> =
    Array.isArray(obj?.packages) ? obj.packages : [];

  // De-dup the weird duplicates by (id + name)
  const seen = new Set<string>();
  const deduped = packages.filter(p => {
    const key = `${String(p.id)}::${String(p.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[SVPS-SYNC] packages fetched: ${packages.length}, deduped: ${deduped.length}`);

  // Get all existing SmartVPS IPStock entries to check what's missing
  const allExistingSmartVPS = await IPStock.find({
    'defaultConfigurations.smartvps': { $exists: true }
  });

  console.log(`[SVPS-SYNC] existing SmartVPS IPStock entries: ${allExistingSmartVPS.length}`);

  // Create a map of active packages for quick lookup
  const activePackagesMap = new Map<string, any>();
  for (const pkg of deduped) {
    const key = `${String(pkg.id)}::${String(pkg.name)}`;
    activePackagesMap.set(key, pkg);
  }

  let created = 0, updated = 0, disabled = 0, reEnabled = 0;
  const results: any[] = [];

  // Process active packages from SmartVPS API
  for (const pkg of deduped) {
    const pid = String(pkg.id);
    const name = String(pkg.name);
    const qty = Number(pkg.ipv4 || 0);

    // IMPORTANT: match by PID (primary unique identifier)
    // Note: We keep packageName in storage for reference, but PID is the source of truth
    const existing = await IPStock.findOne({
      'defaultConfigurations.smartvps.packagePid': pid,
    });

    const smartvpsBlock = {
      provider: 'smartvps',
      packagePid: pid,
      packageName: name,
      availableQty: qty,
      byMemory: {
        '4GB': { pid, pool: name, defaultOS: defaultOS['4GB'] },
        '8GB': { pid, pool: name, defaultOS: defaultOS['8GB'] },
        '16GB': { pid, pool: name, defaultOS: defaultOS['16GB'] },
      }
    };

    // Determine availability: qty > 0 AND status is active
    const isAvailable = qty > 0 && String(pkg.status).toLowerCase() === 'active';

    if (existing) {
      // ⚠️ DO NOT touch name
      // ⚠️ DO NOT touch existing memoryOptions pricing
      // Safe update: availability, tags, serverType (optional), defaultConfigurations.smartvps
      const existingDefaults = toPlainMap(existing.defaultConfigurations);
      const nextTags = uniq([...(existing.tags || []), 'smartvps', defaultTag]);

      const updatePayload: any = {
        // name: keep as-is
        available: isAvailable,
        serverType: existing.serverType || defaultServerType, // keep if already set; else set
        tags: nextTags,
        // DO NOT send memoryOptions at all; preserves existing prices and structure
        defaultConfigurations: {
          ...existingDefaults,
          smartvps: smartvpsBlock
        }
      };

      const updatedDoc = await IPStock.findByIdAndUpdate(existing._id, updatePayload, { new: true });
      updated++;
      
      // Track if we're re-enabling a previously disabled package
      if (!existing.available && isAvailable) {
        reEnabled++;
        console.log(`[SVPS-SYNC] Package re-enabled (was disabled, now available): ${pid}::${name}`);
      }
      
      results.push({
        action: existing.available === isAvailable ? 'updated' : (isAvailable ? 're-enabled' : 'status-changed'),
        id: updatedDoc._id.toString(),
        pid, name, qty,
        available: isAvailable,
        status: pkg.status,
        keptName: true,
        keptPricing: true,
        wasAvailable: existing.available,
        nowAvailable: isAvailable,
      });
    } else {
      // NEW DOC: we can safely build a default name and default pricing
      const memoryOptions = {
        '4GB': { price: defaultPricing['4GB'], hostycareProductId: null, hostycareProductName: null },
        '8GB': { price: defaultPricing['8GB'], hostycareProductId: null, hostycareProductName: null },
        '16GB': { price: defaultPricing['16GB'], hostycareProductId: null, hostycareProductName: null },
      };

      const payload = {
        // choose a consistent naming convention for NEW docs only
        name: `Ocean Linux - ${name}`,
        description: `SmartVPS package ${name} (PID ${pid})`,
        provider: 'smartvps',
        available: isAvailable,
        serverType: defaultServerType,
        tags: uniq(['smartvps', defaultTag]),
        memoryOptions,
        promoCodes: [],
        defaultConfigurations: { smartvps: smartvpsBlock }
      };

      const createdDoc = await IPStock.create(payload);
      created++;
      results.push({
        action: 'created',
        id: createdDoc._id.toString(),
        pid, name, qty,
        available: isAvailable,
        status: pkg.status,
      });
    }
  }

  // 🆕 NOW HANDLE MISSING PACKAGES - Mark as unavailable if not in API response
  for (const existingDoc of allExistingSmartVPS) {
    const smartvpsConfig = existingDoc.defaultConfigurations?.get?.('smartvps') ||
      existingDoc.defaultConfigurations?.smartvps;

    if (!smartvpsConfig) continue;

    const pid = String(smartvpsConfig.packagePid || '');
    const name = String(smartvpsConfig.packageName || '');
    const key = `${pid}::${name}`;

    // If this package is not in the current API response, mark as unavailable
    if (!activePackagesMap.has(key)) {
      console.log(`[SVPS-SYNC] Package missing from API, marking unavailable: ${key}`);

      // Only update if it's currently marked as available
      if (existingDoc.available) {
        const existingDefaults = toPlainMap(existingDoc.defaultConfigurations);

        // Update the smartvps block to show 0 quantity
        const updatedSmartVpsBlock = {
          ...smartvpsConfig,
          availableQty: 0,
          lastSeen: new Date().toISOString()
        };

        const updatePayload = {
          available: false,
          defaultConfigurations: {
            ...existingDefaults,
            smartvps: updatedSmartVpsBlock
          }
        };

        await IPStock.findByIdAndUpdate(existingDoc._id, updatePayload);
        disabled++;
        results.push({
          action: 'disabled',
          id: existingDoc._id.toString(),
          pid, name,
          reason: 'missing_from_api',
          available: false,
        });
      }
    }
  }

  const tookMs = Date.now() - started;
  console.log('[SVPS-SYNC] ✅ done', { created, updated, disabled, reEnabled, tookMs });

  return NextResponse.json({
    success: true,
    summary: { 
      created, 
      updated, 
      disabled, 
      reEnabled, 
      tookMs,
      totalPackagesInAPI: deduped.length,
      totalIPStockEntries: allExistingSmartVPS.length
    },
    results
  });
}

// ... rest of the file remains the same ...
export async function GET(req: Request) {
  try { return await runSync(req); }
  catch (e: any) {
    console.error('[SVPS-SYNC GET] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try { return await runSync(req); }
  catch (e: any) {
    console.error('[SVPS-SYNC POST] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
