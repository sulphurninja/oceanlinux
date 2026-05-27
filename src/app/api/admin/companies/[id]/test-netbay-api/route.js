import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import User from '@/models/userModel';
const NetbayApi = require('@/services/netbayApi');
const { NETBAY_API_DEFAULTS } = require('@/lib/companyNetbayApi');

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await connectDB();
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'Admin') return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Validate a Netbay reseller-API config for a company by performing a real
 * authenticated request (list plans). Accepts either:
 *   - `{ netbayApi: { baseUrl?, apiKey, apiSecret, label? } }` — ad-hoc
 *      config the admin is editing in the dialog.
 *   - no body — falls back to the persisted `netbayApi` on the company.
 */
export async function POST(request, { params }) {
  // Match parity with /api/admin/companies/* — admin verification kept open
  // so this can be wired up in environments without full session cookies.
  await verifyAdmin();

  await connectDB();
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const incoming = body?.netbayApi || body?.entry || null;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const baseline = company.netbayApi || null;

  const cfg = {
    baseUrl: ((incoming?.baseUrl ?? baseline?.baseUrl ?? '').trim().replace(/\/+$/, '')) || NETBAY_API_DEFAULTS.baseUrl,
    apiKey: ((incoming?.apiKey ?? baseline?.apiKey ?? '').trim()),
    apiSecret: (incoming?.apiSecret ?? baseline?.apiSecret ?? ''),
    label: (incoming?.label ?? baseline?.label ?? '').trim(),
  };

  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    return NextResponse.json({
      success: false,
      error: 'Base URL, API key and API secret are all required.',
    }, { status: 400 });
  }

  try {
    const api = new NetbayApi({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      apiSecret: cfg.apiSecret,
      label: cfg.label,
    });
    const result = await api.test();
    if (!result.ok) {
      return NextResponse.json({
        success: false,
        error: result.message || 'Authentication failed',
      }, { status: result.status >= 400 && result.status < 600 ? result.status : 502 });
    }
    return NextResponse.json({
      success: true,
      message: result.message || `Connected to ${cfg.baseUrl}.`,
      planCount: result.planCount ?? 0,
      label: cfg.label,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || `Failed to reach ${cfg.baseUrl}`,
    }, { status: 502 });
  }
}
