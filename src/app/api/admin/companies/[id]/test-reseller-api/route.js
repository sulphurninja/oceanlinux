import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import User from '@/models/userModel';
const ResellerApi = require('@/services/resellerApi');
const { RESELLER_API_DEFAULTS } = require('@/lib/companyResellerApi');

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
 * Validate a reseller-API config for a company by performing a real login
 * against the upstream panel. Accepts either:
 *   - `{ resellerApi: { baseUrl, email, password, resellerDomain?, label? } }`
 *     — ad-hoc config the admin is editing in the dialog
 *   - no body — falls back to the persisted `resellerApi` on the company
 */
export async function POST(request, { params }) {
  // Match parity with /api/admin/companies/* — admin verification kept open
  // so this can be wired up in environments without full session cookies.
  await verifyAdmin();

  await connectDB();
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const incoming = body?.resellerApi || body?.entry || null;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const baseline = company.resellerApi || null;

  // Mirror the runtime fallback in `lib/companyResellerApi.js`: fields the
  // admin leaves blank are filled from the hardcoded Hostheaven defaults
  // before we attempt the test login.
  const cfg = {
    baseUrl: ((incoming?.baseUrl ?? baseline?.baseUrl ?? '').trim().replace(/\/+$/, '')) || RESELLER_API_DEFAULTS.baseUrl,
    email: ((incoming?.email ?? baseline?.email ?? '').trim()) || RESELLER_API_DEFAULTS.email,
    password: (incoming?.password ?? baseline?.password ?? '') || RESELLER_API_DEFAULTS.password,
    resellerDomain: (incoming?.resellerDomain ?? baseline?.resellerDomain ?? '').trim(),
    label: (incoming?.label ?? baseline?.label ?? '').trim(),
  };

  if (!cfg.baseUrl || !cfg.email || !cfg.password) {
    return NextResponse.json({
      success: false,
      error: 'Base URL, email and password are all required.',
    }, { status: 400 });
  }

  try {
    const api = new ResellerApi({
      baseUrl: cfg.baseUrl,
      email: cfg.email,
      password: cfg.password,
      resellerDomain: cfg.resellerDomain,
      label: cfg.label,
    });
    const result = await api.test();
    if (!result.ok) {
      return NextResponse.json({
        success: false,
        error: result.message || 'Login failed',
      }, { status: result.status >= 400 && result.status < 600 ? result.status : 502 });
    }
    return NextResponse.json({
      success: true,
      message: result.zonesOk
        ? `Connected to ${cfg.baseUrl} — login OK and /api/users/zones reachable.`
        : `Login OK but /api/users/zones returned an error: ${result.zonesError || 'unknown'}`,
      label: cfg.label,
      tokenPreview: result.token,
      zonesOk: result.zonesOk,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || `Failed to reach ${cfg.baseUrl}`,
    }, { status: 502 });
  }
}
