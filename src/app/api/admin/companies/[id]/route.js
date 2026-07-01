import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';

function normalizeVirtualizorEntry(v) {
  return {
    enabled: typeof v?.enabled === 'boolean' ? v.enabled : true,
    label: typeof v?.label === 'string' ? v.label.trim() : '',
    host: typeof v?.host === 'string' ? v.host.trim() : '',
    port: Number.isFinite(Number(v?.port)) ? Number(v.port) : 4083,
    apiKey: typeof v?.apiKey === 'string' ? v.apiKey.trim() : '',
    apiPassword: typeof v?.apiPassword === 'string' ? v.apiPassword : '',
    protocol: v?.protocol === 'http' ? 'http' : 'https',
  };
}

function normalizeResellerApiEntry(v) {
  if (v === null) return null;
  return {
    enabled: typeof v?.enabled === 'boolean' ? v.enabled : false,
    label: typeof v?.label === 'string' ? v.label.trim() : '',
    baseUrl: typeof v?.baseUrl === 'string'
      ? v.baseUrl.trim().replace(/\/+$/, '')
      : '',
    resellerDomain: typeof v?.resellerDomain === 'string' ? v.resellerDomain.trim() : '',
    email: typeof v?.email === 'string' ? v.email.trim() : '',
    password: typeof v?.password === 'string' ? v.password : '',
  };
}

function asBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function normalizeNetbayApiEntry(v) {
  if (v === null) return null;
  const enabled = asBool(v?.enabled);
  const useLiveStockApi = enabled && asBool(v?.useLiveStockApi);
  return {
    enabled,
    label: typeof v?.label === 'string' ? v.label.trim() : '',
    baseUrl: typeof v?.baseUrl === 'string'
      ? v.baseUrl.trim().replace(/\/+$/, '')
      : '',
    apiKey: typeof v?.apiKey === 'string' ? v.apiKey.trim() : '',
    apiSecret: typeof v?.apiSecret === 'string' ? v.apiSecret : '',
    useLiveStockApi,
  };
}

function pickAllowedUpdates(body) {
  const out = {};
  if (typeof body?.name === 'string') out.name = body.name;
  if (typeof body?.password === 'string') out.password = body.password;
  if (typeof body?.isActive === 'boolean') out.isActive = body.isActive;

  if (Array.isArray(body?.virtualizors)) {
    out.virtualizors = body.virtualizors.map(normalizeVirtualizorEntry);
  }

  // Back-compat: still accept the legacy single object, but it gets converted
  // into a single-entry `virtualizors` array so we don't have two sources of
  // truth going forward.
  if (out.virtualizors === undefined && body?.virtualizor && typeof body.virtualizor === 'object') {
    out.virtualizors = [normalizeVirtualizorEntry(body.virtualizor)];
  }

  // External reseller-panel API automation (Hostheaven / SomaniOne style).
  // Sending `null` explicitly clears the config; sending an object replaces
  // it. Omitting the key leaves the saved config untouched.
  if (Object.prototype.hasOwnProperty.call(body || {}, 'resellerApi')) {
    out.resellerApi = body.resellerApi === null
      ? null
      : normalizeResellerApiEntry(body.resellerApi);
  }

  // Netbay reseller API automation (https://api.netbayhosts.in style).
  // Same null/object/omit semantics as `resellerApi` above.
  if (Object.prototype.hasOwnProperty.call(body || {}, 'netbayApi')) {
    out.netbayApi = body.netbayApi === null
      ? null
      : normalizeNetbayApiEntry(body.netbayApi);
  }

  return out;
}

export async function PUT(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;
  const body = await request.json();
  const updates = pickAllowedUpdates(body);

  const company = await Company.findById(id);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const prevNetbayLive = company.netbayApi?.useLiveStockApi === true;

  if (Object.prototype.hasOwnProperty.call(updates, 'netbayApi')) {
    // Write netbayApi directly — bypasses stale Mongoose model cache in dev HMR
    // (useLiveStockApi was silently dropped when the cached schema lacked that path).
    await Company.collection.updateOne(
      { _id: company._id },
      { $set: { netbayApi: updates.netbayApi } }
    );
    delete updates.netbayApi;
  }

  if (Object.keys(updates).length > 0) {
    Object.assign(company, updates);
    await company.save();
  }

  const saved = await Company.findById(id).lean();
  if (!saved) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const nextNetbayLive = saved.netbayApi?.useLiveStockApi === true;
  if (prevNetbayLive && !nextNetbayLive) {
    try {
      const { restoreNetbayManualStockAvailability } = require('@/lib/netbayLiveStock');
      await restoreNetbayManualStockAvailability(saved._id);
    } catch (err) {
      console.warn('[admin/companies] restore manual Netbay stock failed:', err.message);
    }
  }
  if (!prevNetbayLive && nextNetbayLive) {
    try {
      const { refreshNetbayStockForCustomer } = require('@/lib/netbayLiveStock');
      await refreshNetbayStockForCustomer({ force: true });
    } catch (err) {
      console.warn('[admin/companies] Netbay live stock refresh failed:', err.message);
    }
  }

  return NextResponse.json(saved);
}

export async function DELETE(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const company = await Company.findByIdAndDelete(id);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  return NextResponse.json({ message: 'Company deleted' });
}
