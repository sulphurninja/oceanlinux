import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';

const RackatoApi = require('@/services/rackatoApi');
const { getCompanyRackatoApiConfig } = require('@/lib/companyRackatoApi');

function productRows(payload) {
  const list = payload?.products || payload?.data?.products || payload?.data || payload;
  return Array.isArray(list) ? list : [];
}

function mapProduct(row) {
  return {
    id: row.product_id || row.id,
    name: row.product_name || row.name || row.title || '',
    price: row.reseller_amount ?? row.net_price ?? row.discounted_price ?? row.price ?? null,
    diskSize: row.disk_size ?? null,
    memory: row.memory_count ?? null,
    type: row.type || '',
    duration: row.duration != null ? `${row.duration} ${row.duration_type || ''}`.trim() : '',
    apps: (Array.isArray(row.apps) ? row.apps : []).map((app) => ({
      id: app.app_id || app.id,
      name: app.name || app.os_name || '',
    })),
    appId: row.app_id || row.apps?.[0]?.app_id || row.apps?.[0]?.id || null,
  };
}

async function listAllProducts(api) {
  const seen = new Set();
  const products = [];
  let page = 1;
  const limit = 100;
  while (page <= 20) {
    const payload = await api.listProducts({ page, limit });
    const rows = productRows(payload);
    if (!rows.length) break;
    let added = 0;
    for (const row of rows) {
      const mapped = mapProduct(row);
      const key = String(mapped.id || `${mapped.name}-${products.length}`);
      if (seen.has(key)) continue;
      seen.add(key);
      products.push(mapped);
      added += 1;
    }
    if (rows.length < limit || added === 0) break;
    page += 1;
  }
  return products;
}

export async function GET(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;
  const company = await Company.findById(id).lean();
  const cfg = getCompanyRackatoApiConfig(company);
  if (!cfg) {
    return NextResponse.json({ error: 'Save a Rackato key id and secret first.' }, { status: 400 });
  }

  try {
    const api = new RackatoApi(cfg);
    const products = await listAllProducts(api);
    return NextResponse.json({ success: true, count: products.length, products });
  } catch (err) {
    return NextResponse.json({
      error: err.message || 'Could not load Rackato products',
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
