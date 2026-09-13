import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';

const HostdzireApi = require('@/services/hostdzireApi');
const { getCompanyHostdzireApiConfig } = require('@/lib/companyHostdzireApi');
const { parseAvailableCloudVpsData } = require('@/lib/hostdzireStockConfig');

/** GET — fetch available_cloud_vps_data for manageIpStock inventory picker */
export async function GET(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const company = await Company.findById(id).lean();
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const cfg = getCompanyHostdzireApiConfig(company);
  if (!cfg) {
    return NextResponse.json({
      error: 'HostDzire API is not enabled for this company. Configure it under /admin/companies.',
    }, { status: 400 });
  }

  try {
    const api = new HostdzireApi(cfg);
    const res = await api.getAvailableCloudVpsData();
    const items = parseAvailableCloudVpsData(res);
    const availableCount = items.filter((i) => i.available).length;

    return NextResponse.json({
      success: true,
      companyId: id,
      companyName: company.name || '',
      items,
      total: items.length,
      availableCount,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const hint = err.message?.includes('not authorized')
      ? ' Whitelist OceanLinux server IP on your HostDzire API key.'
      : '';
    return NextResponse.json({
      success: false,
      error: (err.message || 'Failed to fetch HostDzire inventory') + hint,
    }, { status: typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
