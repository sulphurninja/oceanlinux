import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
const JoyApi = require('@/services/joyApi');
const { JOY_API_DEFAULTS, getEnvFallback } = require('@/lib/companyJoyApi');
import { enforceAdmin } from '@/lib/apiSecurity';

/**
 * Validate a Joy Services API config for a company by performing a real
 * authenticated request (account_info). Accepts either:
 *   - `{ joyApi: { baseUrl?, apiToken, apiKey, label? } }` — ad-hoc config the
 *      admin is editing in the dialog.
 *   - no body — falls back to the persisted `joyApi` on the company.
 */
export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const incoming = body?.joyApi || body?.entry || null;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const baseline = company.joyApi || null;
  const env = getEnvFallback();

  // Same resolution order as `getCompanyJoyApiConfig`: dialog input ▶ saved
  // company config ▶ env vars ▶ hardcoded base URL default.
  const cfg = {
    baseUrl: ((incoming?.baseUrl ?? baseline?.baseUrl ?? '').trim().replace(/\/+$/, ''))
      || env.baseUrl
      || JOY_API_DEFAULTS.baseUrl,
    apiToken: ((incoming?.apiToken ?? baseline?.apiToken ?? '').trim()) || env.apiToken,
    apiKey: ((incoming?.apiKey ?? baseline?.apiKey ?? '').trim()) || env.apiKey,
    label: (incoming?.label ?? baseline?.label ?? '').trim(),
  };

  if (!cfg.baseUrl || !cfg.apiToken || !cfg.apiKey) {
    return NextResponse.json({
      success: false,
      error: 'Base URL, API token and API key are all required. Set them in the dialog or via JOY_API_TOKEN / JOY_API_KEY env vars.',
    }, { status: 400 });
  }

  try {
    const api = new JoyApi({
      baseUrl: cfg.baseUrl,
      apiToken: cfg.apiToken,
      apiKey: cfg.apiKey,
    });
    const result = await api.test();
    return NextResponse.json({
      success: true,
      message: result.username
        ? `Connected as ${result.username}${result.email ? ` (${result.email})` : ''}.`
        : `Connected to ${cfg.baseUrl}.`,
      label: cfg.label,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || `Failed to reach ${cfg.baseUrl}`,
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
