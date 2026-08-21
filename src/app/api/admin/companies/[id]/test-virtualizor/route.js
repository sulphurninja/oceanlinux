import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { VirtualizorAPI } from '@/services/virtualizorApi';
import { enforceAdmin } from '@/lib/apiSecurity';

/**
 * Test ONE Virtualizor panel for a company by calling `act=listvs` against it
 * and returning the visible VM count. Accepts either:
 *  - `{ virtualizor: { host, port, apiKey, apiPassword, protocol, label } }`
 *    — ad-hoc config the admin is editing in the dialog
 *  - `{ index: number }` — index into the persisted `virtualizors[]` array
 *
 * Falls back to the legacy single-config field when nothing else is provided.
 */
export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const incoming = body?.virtualizor || body?.entry || null;
  const indexParam = Number.isInteger(body?.index) ? body.index : null;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  let baseline = null;
  if (Array.isArray(company.virtualizors) && indexParam !== null) {
    baseline = company.virtualizors[indexParam] || null;
  }
  if (!baseline) {
    baseline = company.virtualizor || null;
  }

  const cfg = {
    host: (incoming?.host || baseline?.host || '').trim(),
    port: Number(incoming?.port ?? baseline?.port ?? 4083) || 4083,
    apiKey: (incoming?.apiKey || baseline?.apiKey || '').trim(),
    apiPassword: incoming?.apiPassword || baseline?.apiPassword || '',
    protocol: incoming?.protocol === 'http'
      ? 'http'
      : (baseline?.protocol === 'http' ? 'http' : 'https'),
    label: (incoming?.label || baseline?.label || '').trim(),
  };

  if (!cfg.host || !cfg.apiKey || !cfg.apiPassword) {
    return NextResponse.json({
      success: false,
      error: 'Host, API key, and API password are all required.',
    }, { status: 400 });
  }

  try {
    const api = new VirtualizorAPI({
      accounts: [{
        host: cfg.host,
        port: cfg.port,
        key: cfg.apiKey,
        pass: cfg.apiPassword,
        protocol: cfg.protocol,
      }],
    });
    const vms = await api._listMyVms(0);
    return NextResponse.json({
      success: true,
      vmCount: vms.length,
      label: cfg.label,
      message: `Connected to ${cfg.host} — panel reports ${vms.length} VM(s).`,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || `Failed to reach ${cfg.host}`,
    }, { status: 502 });
  }
}
