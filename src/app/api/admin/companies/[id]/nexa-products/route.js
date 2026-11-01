import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';

const NexaApi = require('@/services/nexaApi');
const { getCompanyNexaApiConfig } = require('@/lib/companyNexaApi');
const IPStock = require('@/models/ipStockModel');
const {
  mapPlansPayload,
  nexaStoreSellPrice,
  stockUnits,
  nexaStockKey,
  buildNexaStockName,
  buildNexaStockDocument,
} = require('@/lib/nexaCatalogHelpers');

function mapPool(pool) {
  return {
    poolId: pool.pool_id ?? pool.id ?? null,
    name: pool.pool_name || pool.name || '',
    subnet: pool.subnet || '',
    location: pool.location || '',
    regularPrice: pool.regular_price ?? null,
    apiPrice: pool.api_price ?? pool.price ?? null,
    currency: pool.currency || 'INR',
    inStock: pool.in_stock !== false,
    stock: pool.stock ?? null,
  };
}

function mapPlan(plan) {
  const pools = Array.isArray(plan.pools) ? plan.pools.map(mapPool) : [];
  return {
    planId: plan.plan_id ?? plan.id ?? null,
    name: plan.plan_name || plan.name || '',
    category: plan.category_name || '',
    tier: plan.tier || '',
    tierLabel: plan.tier_label || '',
    controlMode: plan.control_mode || '',
    location: plan.location || plan.country_name || '',
    duration: plan.duration || '',
    speed: plan.speed || '',
    protocol: plan.protocol || '',
    protocols: Array.isArray(plan.supported_protocols) ? plan.supported_protocols : [],
    regularPrice: plan.regular_price ?? null,
    apiPrice: plan.api_price ?? null,
    currency: plan.currency || 'INR',
    inStock: plan.in_stock !== false,
    stock: plan.stock ?? null,
    subnet: plan.default_subnet || '',
    pools,
  };
}

/** GET — every plan and subnet pool from Nexa action=plans. */
export async function GET(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;
  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const cfg = getCompanyNexaApiConfig(company);
  if (!cfg) {
    return NextResponse.json({ error: 'Save and enable the Nexa API key first.' }, { status: 400 });
  }

  try {
    const api = new NexaApi(cfg);
    const payload = await api.getPlans();
    const plans = (Array.isArray(payload?.plans) ? payload.plans : []).map(mapPlan);
    const poolCount = plans.reduce((sum, plan) => sum + plan.pools.length, 0);
    return NextResponse.json({
      success: true,
      count: Number(payload?.total_plans || plans.length),
      poolCount,
      categories: Array.isArray(payload?.categories) ? payload.categories : [],
      plans,
    });
  } catch (err) {
    return NextResponse.json({
      error: err.message || 'Could not load Nexa products',
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}

function asConfigObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return typeof value === 'object' ? value : {};
}

function stockUnits(value, inStock) {
  if (inStock === false) return 0;
  if (value == null || value === '' || String(value).toLowerCase() === 'unlimited') return 100;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 100;
  return Math.min(100000, Math.floor(n));
}

function targetsForPlan(plan, poolId) {
  if (poolId != null && poolId !== '') {
    const pool = (plan.pools || []).find((row) => Number(row.poolId) === Number(poolId));
    return [{ plan, pool: pool || null }];
  }
  if (plan.pools?.length) {
    return plan.pools.filter((pool) => pool.inStock !== false).map((pool) => ({ plan, pool }));
  }
  return [{ plan, pool: null }];
}

/** POST — create one IP stock per Nexa plan pool. Hidden from the store until the sell price is reviewed. */
export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;
  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const cfg = getCompanyNexaApiConfig(company);
  if (!cfg) {
    return NextResponse.json({ error: 'Save and enable the Nexa API key first.' }, { status: 400 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const api = new NexaApi(cfg);
    const payload = await api.getPlans();
    const plans = (Array.isArray(payload?.plans) ? payload.plans : []).map(mapPlan);
    const wantedPlanId = body.planId != null && body.planId !== '' ? Number(body.planId) : null;
    const selected = wantedPlanId != null
      ? plans.filter((plan) => Number(plan.planId) === wantedPlanId)
      : plans;
    if (!selected.length) {
      return NextResponse.json({ error: 'That Nexa plan was not in the latest product list.' }, { status: 404 });
    }

    const targets = selected.flatMap((plan) => targetsForPlan(plan, wantedPlanId != null ? body.poolId : undefined));
    const existing = await IPStock.find({ company: company._id, tags: 'nexa' })
      .select('name defaultConfigurations')
      .lean();
    const existingKeys = new Set(existing.map((stock) => {
      const nexa = asConfigObject(stock.defaultConfigurations).nexa || {};
      return nexaStockKey(nexa.planId, nexa.poolId);
    }));

    const created = [];
    const skipped = [];
    for (const { plan, pool } of targets) {
      const planId = Number(plan.planId);
      const key = nexaStockKey(planId, pool?.poolId);
      const label = buildNexaStockName(plan, pool);
      if (existingKeys.has(key)) {
        skipped.push(label);
        continue;
      }

      const units = stockUnits(pool?.stock ?? plan.stock, pool ? pool.inStock !== false : plan.inStock !== false);
      const price = nexaStoreSellPrice(pool, plan);
      const live = { available: units > 0, stockCount: units };
      const docFields = buildNexaStockDocument(company._id, plan, pool, live);
      if (price <= 0) {
        skipped.push(`${label} (no Nexa user rate — set price manually)`);
        continue;
      }
      const doc = await IPStock.create(docFields);
      existingKeys.add(key);
      created.push({ id: String(doc._id), name: doc.name, price, stockCount: units });
    }

    return NextResponse.json({ success: true, created, skipped });
  } catch (err) {
    return NextResponse.json({
      error: err.message || 'Could not add Nexa product to IP stock',
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
