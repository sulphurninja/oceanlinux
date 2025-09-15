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
      try { return JSON.parse(payload); } catch {}
      const unquoted = payload.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
      try { return JSON.parse(unquoted); } catch {}
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

  // Defaults used ONLY FOR *NEW* IPStock creation
  // (existing docs keep their name & memoryOptions prices)
  let defaultPricing: Record<'4GB'|'8GB'|'16GB', number> = {
    '4GB':  699,
    '8GB':  899,
    '16GB': 1299,
  };
  let defaultOS: Record<'4GB'|'8GB'|'16GB', string> = {
    '4GB': 'ubuntu',
    '8GB': 'ubuntu',
    '16GB': 'ubuntu',
  };
  let defaultTag = 'Ocean Linux';
  let defaultServerType = 'VPS';

  // Optional overrides for *new* docs only
  const url = new URL(req.url);
  const q = url.searchParams;
  const body = await req.clone().json().catch(() => ({} as any));

  defaultPricing = {
    '4GB': Number(body?.pricing?.['4GB'] ?? q.get('p4')  ?? defaultPricing['4GB']),
    '8GB': Number(body?.pricing?.['8GB'] ?? q.get('p8')  ?? defaultPricing['8GB']),
    '16GB': Number(body?.pricing?.['16GB'] ?? q.get('p16') ?? defaultPricing['16GB']),
  };
  defaultOS = {
    '4GB': String(body?.defaultOSByMemory?.['4GB'] ?? q.get('os4')  ?? defaultOS['4GB']),
    '8GB': String(body?.defaultOSByMemory?.['8GB'] ?? q.get('os8')  ?? defaultOS['8GB']),
    '16GB': String(body?.defaultOSByMemory?.['16GB'] ?? q.get('os16') ?? defaultOS['16GB']),
  };
  defaultTag = String(body?.tag ?? q.get('tag') ?? defaultTag);
  defaultServerType = String(body?.serverType ?? q.get('serverType') ?? defaultServerType);

  console.log('[SVPS-SYNC] newDocDefaults', { defaultPricing, defaultOS, defaultTag, defaultServerType });

  // --- Fetch SmartVPS packages (string often double-encoded) ---
  const api = new SmartVpsAPI();
  const raw = await api.ipstock();
  const obj = normalizeSmartVpsResponse(raw);
  const packages: Array<{id: number|string; name: string; ipv4: number; status: string}> =
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

  let created = 0, updated = 0;
  const results: any[] = [];

  for (const pkg of deduped) {
    const pid  = String(pkg.id);
    const name = String(pkg.name);
    const qty  = Number(pkg.ipv4 || 0);

    // IMPORTANT: match by BOTH pid & packageName to handle duplicate IDs with different names
    const existing = await IPStock.findOne({
      'defaultConfigurations.smartvps.packagePid': pid,
      'defaultConfigurations.smartvps.packageName': name,
    });

    const smartvpsBlock = {
      provider: 'smartvps',
      packagePid: pid,
      packageName: name,
      availableQty: qty,
      byMemory: {
        '4GB':  { pid, pool: name, defaultOS: defaultOS['4GB'] },
        '8GB':  { pid, pool: name, defaultOS: defaultOS['8GB'] },
        '16GB': { pid, pool: name, defaultOS: defaultOS['16GB'] },
      }
    };

    if (existing) {
      // ⚠️ DO NOT touch name
      // ⚠️ DO NOT touch existing memoryOptions pricing
      // Safe update: availability, tags, serverType (optional), defaultConfigurations.smartvps
      const existingDefaults = toPlainMap(existing.defaultConfigurations);
      const nextTags = uniq([...(existing.tags || []), 'smartvps', defaultTag]);

      const updatePayload: any = {
        // name: keep as-is
        available: qty > 0,
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
      results.push({
        action: 'updated',
        id: updatedDoc._id.toString(),
        pid, name, qty,
        keptName: true,
        keptPricing: true,
      });
    } else {
      // NEW DOC: we can safely build a default name and default pricing
      const memoryOptions = {
        '4GB':  { price: defaultPricing['4GB'],  hostycareProductId: null, hostycareProductName: null },
        '8GB':  { price: defaultPricing['8GB'],  hostycareProductId: null, hostycareProductName: null },
        '16GB': { price: defaultPricing['16GB'], hostycareProductId: null, hostycareProductName: null },
      };

      const payload = {
        // choose a consistent naming convention for NEW docs only
        name: `Ocean Linux - ${name}`,
        description: `SmartVPS package ${name} (PID ${pid})`,
        provider: 'smartvps',
        available: qty > 0,
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
      });
    }
  }

  const tookMs = Date.now() - started;
  console.log('[SVPS-SYNC] ✅ done', { created, updated, tookMs });

  return NextResponse.json({
    success: true,
    summary: { created, updated, tookMs },
    results
  });
}

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
