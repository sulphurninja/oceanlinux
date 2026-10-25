import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';

const RackatoApi = require('@/services/rackatoApi');
const { DEFAULT_BASE_URL } = require('@/lib/companyRackatoApi');

export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const incoming = body?.rackatoApi || null;
  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const saved = company.rackatoApi || {};
  const cfg = {
    baseUrl: String(incoming?.baseUrl || saved.baseUrl || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL,
    keyId: String(incoming?.keyId || saved.keyId || '').trim(),
    keySecret: String(incoming?.keySecret || saved.keySecret || '').trim(),
  };
  if (!cfg.keyId || !cfg.keySecret) {
    return NextResponse.json({ success: false, error: 'Key id and secret are required.' }, { status: 400 });
  }

  try {
    const api = new RackatoApi(cfg);
    const wallet = await api.getWallet();
    const balance = wallet?.balance ?? wallet?.cash_balance ?? wallet?.data?.balance ?? wallet?.data?.cash_balance;
    const message = balance != null
      ? `Connected. Rackato wallet balance: ${balance}`
      : 'Connected to Rackato.';
    return NextResponse.json({ success: true, message });
  } catch (err) {
    const hint = err.status === 403
      ? ' Production keys also need this server IP on the Rackato whitelist.'
      : '';
    return NextResponse.json({
      success: false,
      error: (err.message || 'Rackato connection failed') + hint,
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
