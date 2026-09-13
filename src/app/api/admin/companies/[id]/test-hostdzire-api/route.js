import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
const HostdzireApi = require('@/services/hostdzireApi');
const { HOSTDZIRE_API_DEFAULTS } = require('@/lib/companyHostdzireApi');
import { enforceAdmin } from '@/lib/apiSecurity';

/** POST — validate HostDzire API key via action=orders */
export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const incoming = body?.hostdzireApi || body?.entry || null;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const baseline = company.hostdzireApi || null;

  let baseUrl = ((incoming?.baseUrl ?? baseline?.baseUrl ?? '').trim()) || HOSTDZIRE_API_DEFAULTS.baseUrl;
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  const cfg = {
    baseUrl,
    apiKey: ((incoming?.apiKey ?? baseline?.apiKey ?? '').trim()),
    label: (incoming?.label ?? baseline?.label ?? '').trim(),
    email: (incoming?.email ?? baseline?.email ?? '').trim(),
  };

  if (!cfg.apiKey) {
    return NextResponse.json({
      success: false,
      error: 'API key is required.',
    }, { status: 400 });
  }

  try {
    const api = new HostdzireApi({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, label: cfg.label });
    const result = await api.test();
    return NextResponse.json({
      success: true,
      message: `Connected — ${result.orderCount} active service(s) on HostDzire account.`,
      label: cfg.label,
    });
  } catch (err) {
    const hint = err.message?.includes('not authorized')
      ? ' Whitelist OceanLinux server IP on your HostDzire API key.'
      : '';
    return NextResponse.json({
      success: false,
      error: (err.message || `Failed to reach ${cfg.baseUrl}`) + hint,
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
