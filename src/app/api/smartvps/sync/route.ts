// /src/app/api/smartvps/sync/route.ts
// SIMPLE SmartVPS sync - MATCH BY NAME:
// 1. Fetch packages from SmartVPS API
// 2. For each package: find existing IPStock by NAME (🌊 {name}) OR create new
// 3. Update availability based on API response
// 4. DO NOT touch non-SmartVPS entries

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

async function runSync(req: Request) {
  const started = Date.now();
  console.log('\n[SVPS-SYNC] Starting sync...');

  await connectDB();

  // --- Fetch SmartVPS packages ---
  const api = new SmartVpsAPI();
  const raw = await api.ipstock();
  const obj = normalizeSmartVpsResponse(raw);
  const packages: Array<{ id: number | string; name: string; ipv4: number; status: string }> =
    Array.isArray(obj?.packages) ? obj.packages : [];

  // De-dup by name only (name is the key, not PID)
  const seen = new Set<string>();
  const deduped = packages.filter(p => {
    const name = String(p.name);
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  console.log(`[SVPS-SYNC] Packages from API: ${packages.length}, deduped: ${deduped.length}`);

  // Build a set of active package names from API
  const activeNames = new Set<string>();
  for (const pkg of deduped) {
    activeNames.add(String(pkg.name));
  }

  let created = 0, updated = 0, disabled = 0;
  const results: any[] = [];

  // Default configs for new entries
  const defaultOS = { '4GB': 'ubuntu-22.04', '8GB': 'ubuntu-22.04', '16GB': 'ubuntu-22.04' };
  const defaultPricing = { '4GB': 699, '8GB': 999, '16GB': 1499 };

  // Process each package from SmartVPS API
  for (const pkg of deduped) {
    const pid = String(pkg.id);
    const name = String(pkg.name);
    const qty = Number(pkg.ipv4 || 0);
    const isAvailable = qty > 0 && String(pkg.status).toLowerCase() === 'active';

    // The expected IPStock name STARTS WITH "🌊 {name}"
    // This allows custom suffixes like "🌊 103.184 (Diamond Pro AMD 3.1GHz)"
    const namePrefix = `🌊 ${name}`;
    
    // Escape special regex chars in the package name
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Find existing by name starting with "🌊 {packageName}"
    let existing = await IPStock.findOne({ 
      name: { $regex: new RegExp(`^🌊 ${escapedName}(\\s|$)`, 'i') }
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

    if (existing) {
      // UPDATE existing - only update availability and smartvps config
      // DO NOT touch name, tags, or anything else
      const existingDefaults = toPlainMap(existing.defaultConfigurations);
      
      await IPStock.findByIdAndUpdate(existing._id, {
        available: isAvailable,
        defaultConfigurations: {
          ...existingDefaults,
          smartvps: smartvpsBlock
        }
      });
      
      updated++;
      console.log(`[SVPS-SYNC] Updated: ${existing.name} - available: ${isAvailable}, qty: ${qty}`);
      results.push({
        action: 'updated',
        id: existing._id.toString(),
        name: existing.name,
        packageName: name,
        qty,
        available: isAvailable
      });
    } else {
      // CREATE new IPStock for this SmartVPS package
      const memoryOptions = {
        '4GB': { price: defaultPricing['4GB'], hostycareProductId: null, hostycareProductName: null },
        '8GB': { price: defaultPricing['8GB'], hostycareProductId: null, hostycareProductName: null },
        '16GB': { price: defaultPricing['16GB'], hostycareProductId: null, hostycareProductName: null },
      };

      const defaultPromoCodes = [
        { code: 'OCEAN50', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
        { code: 'ROCKYSELLPROMO', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
        { code: 'RAJSINGH77', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
        { code: 'TOPUPBOOST', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() }
      ];

      const newDoc = await IPStock.create({
        name: namePrefix,
        description: `SmartVPS package ${name}`,
        available: isAvailable,
        serverType: 'VPS',
        tags: ['ocean linux'],
        memoryOptions,
        promoCodes: defaultPromoCodes,
        defaultConfigurations: { smartvps: smartvpsBlock }
      });

      created++;
      console.log(`[SVPS-SYNC] Created: ${namePrefix}`);
      results.push({
        action: 'created',
        id: newDoc._id.toString(),
        name: namePrefix,
        packageName: name,
        qty,
        available: isAvailable
      });
    }
  }

  // Mark SmartVPS entries as unavailable if their name is not in the API response
  // Only check entries tagged with 'ocean linux' that have the 🌊 prefix
  const allOceanLinuxEntries = await IPStock.find({
    tags: 'ocean linux',
    name: /^🌊 /
  });

  for (const doc of allOceanLinuxEntries) {
    // Extract base package name from "🌊 {name} (optional suffix)"
    // e.g., "🌊 103.184 (Diamond Pro AMD 3.1GHz)" -> "103.184"
    const fullName = doc.name.replace(/^🌊 /, '');
    // Get just the IP/package part (before any space or parenthesis)
    const packageName = fullName.split(/[\s(]/)[0];
    
    // If this base package name is not in the current API response, mark unavailable
    if (!activeNames.has(packageName) && doc.available) {
      await IPStock.findByIdAndUpdate(doc._id, { available: false });
      disabled++;
      console.log(`[SVPS-SYNC] Disabled (not in API): ${doc.name} (extracted: ${packageName})`);
      results.push({
        action: 'disabled',
        id: doc._id.toString(),
        name: doc.name,
        packageName,
        reason: 'not_in_api_response'
      });
    }
  }

  const tookMs = Date.now() - started;
  console.log(`[SVPS-SYNC] Done: created=${created}, updated=${updated}, disabled=${disabled}, took=${tookMs}ms`);

  return NextResponse.json({
    success: true,
    summary: { created, updated, disabled, tookMs, packagesInAPI: deduped.length },
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
