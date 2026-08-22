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
import { storeAutoUnhideUpdate } from '@/lib/ipStockAvailability';
import { enforceCronOrLoggedInUser } from '@/lib/apiSecurity';
const {
  buildSmartVpsBlockFromPackage,
  buildSmartVpsMemorySync,
} = require('@/lib/smartvpsPackageRam');

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
  const packages: Array<{
    id: number | string;
    name: string;
    ipv4: number;
    status: string;
    On4GB?: boolean;
    On8GB?: boolean;
    On16GB?: boolean;
    On32GB?: boolean;
  }> =
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

  // Default configs for brand-new entries (tiers filtered by On*GB flags below)
  const defaultPricing = { '4GB': 699, '8GB': 999, '16GB': 1499, '32GB': 1999 };

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

    const existingDefaults = existing ? toPlainMap(existing.defaultConfigurations) : {};
    const existingSmartvps = existingDefaults?.smartvps || {};
    const existingMemory = existing ? toPlainMap(existing.memoryOptions) : {};

    const { memoryOptions, smartvpsBlock } = buildSmartVpsBlockFromPackage(
      pkg,
      existingSmartvps,
      existingMemory
    );

    if (existing) {
      // UPDATE existing — sync availability, SmartVPS config, and RAM tiers from On*GB flags
      const updateFields: Record<string, unknown> = {
        memoryOptions,
        defaultConfigurations: {
          ...existingDefaults,
          smartvps: smartvpsBlock,
        },
      };
      if (!existing.availabilityManual) {
        updateFields.available = isAvailable;
        Object.assign(updateFields, storeAutoUnhideUpdate(existing, isAvailable));
      }

      await IPStock.findByIdAndUpdate(existing._id, updateFields);
      
      updated++;
      console.log(
        `[SVPS-SYNC] Updated: ${existing.name} - available: ${isAvailable}, qty: ${qty}, RAM: ${smartvpsBlock.allowedRams?.join(',') || 'none'}GB`
      );
      results.push({
        action: 'updated',
        id: existing._id.toString(),
        name: existing.name,
        packageName: name,
        qty,
        available: isAvailable,
        allowedRams: smartvpsBlock.allowedRams,
      });
    } else {
      // CREATE new IPStock — only tiers SmartVPS allows (On4GB / On8GB / …)
      const { memoryOptions: newMemoryOptions } = buildSmartVpsMemorySync(pkg, {
        '4GB': { price: defaultPricing['4GB'], hostycareProductId: null, hostycareProductName: null },
        '8GB': { price: defaultPricing['8GB'], hostycareProductId: null, hostycareProductName: null },
        '16GB': { price: defaultPricing['16GB'], hostycareProductId: null, hostycareProductName: null },
        '32GB': { price: defaultPricing['32GB'], hostycareProductId: null, hostycareProductName: null },
      });

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
        memoryOptions: newMemoryOptions,
        promoCodes: defaultPromoCodes,
        defaultConfigurations: { smartvps: smartvpsBlock },
      });

      created++;
      console.log(`[SVPS-SYNC] Created: ${namePrefix} RAM: ${smartvpsBlock.allowedRams?.join(',') || 'none'}GB`);
      results.push({
        action: 'created',
        id: newDoc._id.toString(),
        name: namePrefix,
        packageName: name,
        qty,
        available: isAvailable,
        allowedRams: smartvpsBlock.allowedRams,
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
    if (!activeNames.has(packageName) && doc.available && !doc.availabilityManual) {
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

function authorizeSync(req: Request) {
  const authDenied = enforceCronOrLoggedInUser(req as any);
  if (authDenied) return authDenied;
  return null;
}

export async function GET(req: Request) {
  const denied = authorizeSync(req);
  if (denied) return denied;
  try { return await runSync(req); }
  catch (e: any) {
    console.error('[SVPS-SYNC GET] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = authorizeSync(req);
  if (denied) return denied;
  try { return await runSync(req); }
  catch (e: any) {
    console.error('[SVPS-SYNC POST] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
