// /src/app/api/smartvps/sync/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
const SmartVpsAPI = require('@/services/smartvpsApi');

// ---- helpers -------------------------------------------------------
function toPlainMemoryEntry(v: any) {
  if (!v) return null;
  return {
    price: v.price ?? null,
    hostycareProductId: v.hostycareProductId ?? null,
    hostycareProductName: v.hostycareProductName ?? null,
  };
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

/**
 * Build memory options. If overwrite === true (default), we ALWAYS write the template price.
 * If overwrite === false, we keep an existing non-null price.
 */
function buildMemoryOptions(
  current: any,
  pricing: Record<'4GB'|'8GB'|'16GB', number>,
  overwrite: boolean
) {
  const getExisting = (k: '4GB'|'8GB'|'16GB') => {
    const raw = (typeof current?.get === 'function') ? current.get(k) : current?.[k];
    return toPlainMemoryEntry(raw);
  };
  const choose = (k: '4GB'|'8GB'|'16GB') => {
    const existing = getExisting(k);
    if (!overwrite && existing && existing.price != null) return existing;
    return { price: pricing[k], hostycareProductId: null, hostycareProductName: null };
  };
  return {
    '4GB':  choose('4GB'),
    '8GB':  choose('8GB'),
    '16GB': choose('16GB'),
  };
}

async function runSync(req: Request) {
  await connectDB();

  const url = new URL(req.url);
  const q = url.searchParams;

  // --- Defaults (your global template) ---
  let pricing: Record<'4GB'|'8GB'|'16GB', number> = {
    '4GB':  699,
    '8GB':  899,
    '16GB': 1299,
  };
  let defaultOS: Record<'4GB'|'8GB'|'16GB', string> = {
    '4GB': 'ubuntu',
    '8GB': 'ubuntu',
    '16GB': 'ubuntu',
  };
  let tag = 'Ocean Linux';
  let serverType = 'VPS';

  // ❗ Default overwrite = true (force apply template pricing)
  let overwrite = true;

  // Read body (optional)
  const body = await req.clone().json().catch(() => ({}));

  // Body overrides (if you *really* want to keep existing prices, pass overwrite=false)
  if (typeof body.overwrite === 'boolean') overwrite = body.overwrite;
  if (body.pricing) {
    pricing = {
      '4GB': Number(body.pricing['4GB'] ?? pricing['4GB']),
      '8GB': Number(body.pricing['8GB'] ?? pricing['8GB']),
      '16GB': Number(body.pricing['16GB'] ?? pricing['16GB']),
    };
  }
  if (body.defaultOSByMemory) {
    defaultOS = {
      '4GB': String(body.defaultOSByMemory['4GB'] ?? defaultOS['4GB']),
      '8GB': String(body.defaultOSByMemory['8GB'] ?? defaultOS['8GB']),
      '16GB': String(body.defaultOSByMemory['16GB'] ?? defaultOS['16GB']),
    };
  }
  if (body.tag) tag = String(body.tag);
  if (body.serverType) serverType = String(body.serverType);

  // Query overrides (useful for quick tests)
  if (q.has('overwrite')) {
    const ov = q.get('overwrite')!;
    overwrite = ov === '1' || ov === 'true';
  }
  pricing = {
    '4GB': Number(q.get('p4')  ?? pricing['4GB']),
    '8GB': Number(q.get('p8')  ?? pricing['8GB']),
    '16GB': Number(q.get('p16') ?? pricing['16GB']),
  };
  defaultOS = {
    '4GB': String(q.get('os4')  ?? defaultOS['4GB']),
    '8GB': String(q.get('os8')  ?? defaultOS['8GB']),
    '16GB': String(q.get('os16') ?? defaultOS['16GB']),
  };
  if (q.get('tag')) tag = String(q.get('tag'));
  if (q.get('serverType')) serverType = String(q.get('serverType'));

  // --- Fetch SmartVPS packages ---
  const SmartVpsAPI = require('@/services/smartvpsApi');
  const api = new SmartVpsAPI();
  const resp = await api.ipstock(); // JSON string
  const obj = typeof resp === 'string' ? JSON.parse(resp) : resp;
  const packages = Array.isArray(obj?.packages) ? obj.packages : [];

  let created = 0, updated = 0;
  const results: any[] = [];

  for (const pkg of packages) {
    const pid  = String(pkg.id);
    const name = String(pkg.name);
    const qty  = Number(pkg.ipv4 || 0);

    const existing = await IPStock.findOne({
      'defaultConfigurations.smartvps.packagePid': pid
    });

    const baseTags = new Set([...(existing?.tags || []), tag]);
    const memoryOptionsBuilt = buildMemoryOptions(existing?.memoryOptions, pricing, overwrite);

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

    const existingDefaults = toPlainMap(existing?.defaultConfigurations);

    const payload = {
      name: `Ocean Linux - ${name}`,
      description: `SmartVPS package ${name} (PID ${pid})`,
      available: qty > 0,
      serverType,
      tags: Array.from(baseTags),
      memoryOptions: memoryOptionsBuilt, // POJOs only
      promoCodes: existing?.promoCodes || [],
      defaultConfigurations: {
        ...existingDefaults,
        smartvps: smartvpsBlock
      }
    };

    if (existing) {
      const updatedDoc = await IPStock.findByIdAndUpdate(existing._id, payload, { new: true });
      updated++;
      results.push({
        action: 'updated',
        id: updatedDoc._id.toString(),
        pid, name, qty,
        appliedPrices: {
          '4GB': payload.memoryOptions['4GB']?.price ?? null,
          '8GB': payload.memoryOptions['8GB']?.price ?? null,
          '16GB': payload.memoryOptions['16GB']?.price ?? null,
        }
      });
    } else {
      const createdDoc = await IPStock.create(payload);
      created++;
      results.push({
        action: 'created',
        id: createdDoc._id.toString(),
        pid, name, qty,
        appliedPrices: {
          '4GB': payload.memoryOptions['4GB']?.price ?? null,
          '8GB': payload.memoryOptions['8GB']?.price ?? null,
          '16GB': payload.memoryOptions['16GB']?.price ?? null,
        }
      });
    }
  }

  return NextResponse.json({
    success: true,
    summary: { created, updated, overwrite, pricing },
    results
  });
}

// ---- expose both GET and POST -------------------------------------
export async function GET(req: Request) {
  try { return await runSync(req); }
  catch (e: any) {
    console.error('[SmartVPS sync GET] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try { return await runSync(req); }
  catch (e: any) {
    console.error('[SmartVPS sync POST] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
