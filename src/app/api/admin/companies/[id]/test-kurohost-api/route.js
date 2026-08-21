import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
const KurohostApi = require('@/services/kurohostApi');
const { KUROHOST_API_DEFAULTS, getEnvFallback } = require('@/lib/companyKurohostApi');
import { enforceAdmin } from '@/lib/apiSecurity';

/**
 * Validate a KuroHost Cloud Platform API config by listing zones.
 */
export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const incoming = body?.kurohostApi || body?.entry || null;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const baseline = company.kurohostApi || null;
  const env = getEnvFallback();

  const cfg = {
    baseUrl: ((incoming?.baseUrl ?? baseline?.baseUrl ?? '').trim().replace(/\/+$/, ''))
      || env.baseUrl
      || KUROHOST_API_DEFAULTS.baseUrl,
    apiKey: ((incoming?.apiKey ?? baseline?.apiKey ?? '').trim()) || env.apiKey,
    label: (incoming?.label ?? baseline?.label ?? '').trim(),
  };

  if (!cfg.baseUrl || !cfg.apiKey) {
    return NextResponse.json({
      success: false,
      error: 'Base URL and API key are required. Set them in the dialog or via KUROHOST_API_KEY env var.',
    }, { status: 400 });
  }

  try {
    const api = new KurohostApi({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
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
      zoneCount: result.zoneCount ?? 0,
      label: cfg.label,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || `Failed to reach ${cfg.baseUrl}`,
    }, { status: 502 });
  }
}
