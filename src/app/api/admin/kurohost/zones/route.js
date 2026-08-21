import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
const KurohostApi = require('@/services/kurohostApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');
const { normalizeZonesResponse } = require('@/lib/kurohostLiveStock');
import { enforceAdmin } from '@/lib/apiSecurity';

/** List KuroHost zones for admin IP stock config (zone picker). */
export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'companyId query param is required' }, { status: 400 });
  }

  const company = await Company.findById(companyId).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const cfg = getCompanyKurohostApiConfig(company);
  if (!cfg) {
    return NextResponse.json({
      error: 'KuroHost API is not configured for this company.',
    }, { status: 400 });
  }

  try {
    const api = new KurohostApi(cfg);
    const res = await api.listZones();
    const zones = normalizeZonesResponse(res).map((z) => ({
      id: z.id,
      code: z.code || '',
      name: z.name || z.code || z.id,
      accessMode: z.accessMode || 'PUBLIC',
      isDefault: !!z.isDefault,
      live: true,
    }));
    return NextResponse.json({ zones });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to fetch zones' }, { status: 502 });
  }
}
