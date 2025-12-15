// /src/app/api/smartvps/reset/route.ts
// RESET SmartVPS IPStock entries:
// 1. Delete ALL IPStock entries tagged 'ocean linux' with 🌊 prefix
// 2. Re-create them fresh from the SmartVPS API

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

const SmartVpsAPI = require('@/services/smartvpsApi');

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

export async function GET(req: Request) {
  // GET = preview only
  try {
    await connectDB();
    
    // Find entries to delete: tagged 'ocean linux' with 🌊 prefix
    const toDelete = await IPStock.find({
      tags: 'ocean linux',
      name: /^🌊 /
    });
    
    const api = new SmartVpsAPI();
    const raw = await api.ipstock();
    const obj = normalizeSmartVpsResponse(raw);
    const packages = Array.isArray(obj?.packages) ? obj.packages : [];
    
    // Dedupe
    const seen = new Set<string>();
    const deduped = packages.filter((p: any) => {
      const key = `${String(p.id)}::${String(p.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    return NextResponse.json({
      success: true,
      message: 'Preview only. POST to this endpoint to reset SmartVPS entries.',
      toDelete: toDelete.map(d => ({ id: d._id, name: d.name })),
      toDeleteCount: toDelete.length,
      packagesFromAPI: deduped.map((p: any) => ({ id: p.id, name: p.name, ipv4: p.ipv4, status: p.status })),
      packagesCount: deduped.length
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    
    console.log('[SVPS-RESET] Starting reset...');
    
    // Step 1: Delete all SmartVPS/Ocean Linux IPStock entries (tagged 'ocean linux' with 🌊 prefix)
    const deleteResult = await IPStock.deleteMany({
      tags: 'ocean linux',
      name: /^🌊 /
    });
    console.log(`[SVPS-RESET] Deleted ${deleteResult.deletedCount} Ocean Linux IPStock entries`);
    
    // Step 2: Fetch fresh from SmartVPS API
    const api = new SmartVpsAPI();
    const raw = await api.ipstock();
    const obj = normalizeSmartVpsResponse(raw);
    const packages: Array<{ id: number | string; name: string; ipv4: number; status: string }> =
      Array.isArray(obj?.packages) ? obj.packages : [];
    
    // Dedupe
    const seen = new Set<string>();
    const deduped = packages.filter(p => {
      const key = `${String(p.id)}::${String(p.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    console.log(`[SVPS-RESET] Packages from API: ${deduped.length}`);
    
    // Step 3: Create fresh IPStock entries
    const defaultOS = { '4GB': 'ubuntu-22.04', '8GB': 'ubuntu-22.04', '16GB': 'ubuntu-22.04' };
    const defaultPricing = { '4GB': 699, '8GB': 999, '16GB': 1499 };
    const defaultPromoCodes = [
      { code: 'OCEAN50', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
      { code: 'ROCKYSELLPROMO', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
      { code: 'RAJSINGH77', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
      { code: 'TOPUPBOOST', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() }
    ];
    
    const created: any[] = [];
    
    for (const pkg of deduped) {
      const pid = String(pkg.id);
      const name = String(pkg.name);
      const qty = Number(pkg.ipv4 || 0);
      const isAvailable = qty > 0 && String(pkg.status).toLowerCase() === 'active';
      
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
      
      const memoryOptions = {
        '4GB': { price: defaultPricing['4GB'], hostycareProductId: null, hostycareProductName: null },
        '8GB': { price: defaultPricing['8GB'], hostycareProductId: null, hostycareProductName: null },
        '16GB': { price: defaultPricing['16GB'], hostycareProductId: null, hostycareProductName: null },
      };
      
      const newDoc = await IPStock.create({
        name: `🌊 ${name}`,
        description: `SmartVPS package ${name} (PID ${pid})`,
        available: isAvailable,
        serverType: 'VPS',
        tags: ['ocean linux'],
        memoryOptions,
        promoCodes: defaultPromoCodes,
        defaultConfigurations: { smartvps: smartvpsBlock }
      });
      
      created.push({
        id: newDoc._id.toString(),
        name: `🌊 ${name}`,
        pid,
        packageName: name,
        qty,
        available: isAvailable
      });
      
      console.log(`[SVPS-RESET] Created: 🌊 ${name} (PID ${pid})`);
    }
    
    console.log(`[SVPS-RESET] Done. Deleted: ${deleteResult.deletedCount}, Created: ${created.length}`);
    
    return NextResponse.json({
      success: true,
      summary: {
        deleted: deleteResult.deletedCount,
        created: created.length
      },
      created
    });
    
  } catch (e: any) {
    console.error('[SVPS-RESET] Error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}


