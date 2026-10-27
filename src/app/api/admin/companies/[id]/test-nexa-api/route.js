import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
const NexaApi = require('@/services/nexaApi');
const { NEXA_API_DEFAULTS } = require('@/lib/companyNexaApi');
import { enforceAdmin } from '@/lib/apiSecurity';

/** POST — validate the Nexa key by listing plans. */
export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const incoming = body?.nexaApi || null;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const baseline = company.nexaApi || {};
  const cfg = {
    baseUrl: ((incoming?.baseUrl ?? baseline?.baseUrl ?? '').trim()) || NEXA_API_DEFAULTS.baseUrl,
    apiKey: ((incoming?.apiKey ?? baseline?.apiKey ?? '').trim()),
    label: (incoming?.label ?? baseline?.label ?? '').trim(),
  };

  if (!cfg.apiKey) {
    return NextResponse.json({ success: false, error: 'API key is required.' }, { status: 400 });
  }

  try {
    const api = new NexaApi(cfg);
    const result = await api.test();
    return NextResponse.json({
      success: true,
      message: `Connected — ${result.planCount} plan(s), wallet ${result.currency}${result.walletBalance ?? 0}, ${result.orderCount} order(s).`,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Could not reach Nexa.',
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
