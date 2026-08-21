import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { requireAdmin } from '@/lib/adminAuth';
import ResellerApi from '@/services/resellerApi';
import { getCompanyResellerApiConfig } from '@/lib/companyResellerApi';

export const dynamic = 'force-dynamic';

/** List PrimeVPS / panel zones for admin IP stock setup (Mumbai-103.20, etc.). */
export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
  }

  await connectDB();
  const company = await Company.findById(companyId).select('resellerApi name').lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    return NextResponse.json({ error: 'Reseller API not configured for this company' }, { status: 400 });
  }

  try {
    const api = new ResellerApi(cfg);
    const zones = await api.listZones();
    return NextResponse.json({
      company: { _id: String(company._id), name: company.name },
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        status: z.status,
        live: ResellerApi.isZoneStatusLive(z.status),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to fetch zones' }, { status: 502 });
  }
}
