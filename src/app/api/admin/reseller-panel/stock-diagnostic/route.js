import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import Company from '@/models/companyModel';
import IPStock from '@/models/ipStockModel';
import ResellerApi from '@/services/resellerApi';
import { getCompanyResellerApiConfig, companyUsesResellerLiveStock } from '@/lib/companyResellerApi';
import { readResellerApiStockConfig } from '@/lib/resellerApiStockConfig';
import { toPlainConfigurations, getIpStockMemoryKeys } from '@/lib/advpsLiveStock';
import { usesResellerLiveStock } from '@/lib/ipStockAvailability';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Admin — explain WHY a reseller (PrimeVPS) plan reads in/out of stock.
 * GET /api/admin/reseller-panel/stock-diagnostic?stockId=<id>
 *   (omit stockId to diagnose all reseller plans)
 */
export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const stockId = searchParams.get('stockId');

    const query = stockId ? { _id: stockId } : { company: { $ne: null } };
    const stocks = await IPStock.find(query).lean();

    const zonesByCompany = {};
    const results = [];

    for (const stock of stocks) {
      const plainCfg = toPlainConfigurations(stock.defaultConfigurations)?.resellerApi;
      const isReseller = !!plainCfg ||
        (stock.tags || []).some((t) =>
          ['reseller-api', 'primevps', 'primevm'].includes(String(t).toLowerCase())
        );
      if (!isReseller) continue;

      const company = stock.company
        ? await Company.findById(stock.company).select('resellerApi name').lean()
        : null;
      const cfg = getCompanyResellerApiConfig(company);
      const liveMode = companyUsesResellerLiveStock(company);
      const stockCfg = readResellerApiStockConfig(stock);

      const entry = {
        stockId: String(stock._id),
        name: stock.name,
        company: company?.name || null,
        liveStockMode: liveMode,
        availabilityManual: !!stock.availabilityManual,
        manualStockCount: stock.stockCount ?? null,
        manualStockCountUsed: !liveMode,
        currentlyAvailable: !!stock.available,
        zoneId: stockCfg.zoneId,
        stockMode: stockCfg.zoneId != null ? 'zone' : 'wallet',
        memoryTiers: getIpStockMemoryKeys(stock),
      };

      if (cfg && liveMode) {
        const cid = String(stock.company);
        if (!zonesByCompany[cid]) {
          try {
            const api = new ResellerApi(cfg);
            zonesByCompany[cid] = await api.listZones();
          } catch (err) {
            zonesByCompany[cid] = { error: err.message };
          }
        }
        const zones = zonesByCompany[cid];
        if (Array.isArray(zones)) {
          const zone = zones.find((z) => Number(z.id) === Number(stockCfg.zoneId));
          if (zone) {
            entry.panelZone = {
              id: zone.id,
              name: zone.name,
              status: zone.status,
              isLive: ResellerApi.isZoneStatusLive(zone.status),
            };
            entry.diagnosis = zone
              ? (ResellerApi.isZoneStatusLive(zone.status)
                ? 'Zone is LIVE on panel — should be in stock'
                : `Zone status "${zone.status}" not treated as live (only ACTIVE/AVAILABLE count)`)
              : 'Zone not found on panel';
          } else {
            entry.panelZone = null;
            entry.availableZones = zones.map((z) => ({ id: z.id, name: z.name, status: z.status }));
            entry.diagnosis = stockCfg.zoneId == null
              ? 'No zoneId configured on this plan (wallet mode) — set a panel zone'
              : `Configured zoneId ${stockCfg.zoneId} not found in panel zones list`;
          }
        } else {
          entry.diagnosis = `Could not fetch panel zones: ${zones?.error || 'unknown'}`;
        }
      } else if (!liveMode) {
        entry.diagnosis = `Live stock OFF — availability follows manual stockCount (${stock.stockCount ?? 0})`;
      } else {
        entry.diagnosis = 'Reseller API not configured on company';
      }

      results.push(entry);
    }

    return NextResponse.json(
      { success: true, count: results.length, results },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[ADMIN/RESELLER-STOCK-DIAGNOSTIC]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Diagnostic failed' },
      { status: 500 }
    );
  }
}
