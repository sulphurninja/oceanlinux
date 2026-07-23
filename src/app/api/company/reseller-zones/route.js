import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import ResellerApi from '@/services/resellerApi';
import { getCompanyResellerApiConfig } from '@/lib/companyResellerApi';

export const dynamic = 'force-dynamic';

async function getCompanySession() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const session = cookieStore.get('company_session')?.value;
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

/** List panel regions for the logged-in company (no admin required). */
export async function GET() {
  const session = await getCompanySession();
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const company = await Company.findOne({ _id: session.id, slug: session.slug, isActive: true })
    .select('resellerApi name slug')
    .lean();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    return NextResponse.json(
      { error: 'Reseller API is not enabled for your company. Ask admin to enable it.' },
      { status: 403 }
    );
  }

  try {
    const api = new ResellerApi(cfg);
    const zones = await api.listZones();
    return NextResponse.json({
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
