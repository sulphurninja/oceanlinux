import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
const KurohostApi = require('@/services/kurohostApi');
const { getCompanyKurohostApiConfig } = require('@/lib/companyKurohostApi');
import { enforceAdmin } from '@/lib/apiSecurity';

/**
 * Combined catalog — zones, flavors, OS templates for KuroHost Cloud.
 */
export async function GET(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const cfg = getCompanyKurohostApiConfig(company);
  if (!cfg) {
    return NextResponse.json({
      error: 'KuroHost API is not configured for this company. Enable it from /admin/companies first.',
    }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const cloudZoneId = searchParams.get('cloudZoneId') || undefined;

  try {
    const api = new KurohostApi(cfg);
    const [zonesRes, flavorsRes, osRes] = await Promise.all([
      api.listZones().catch(err => ({ _error: err.message })),
      api.listFlavors().catch(err => ({ _error: err.message })),
      api.listOsTemplates(cloudZoneId ? { cloudZoneId } : undefined).catch(err => ({ _error: err.message })),
    ]);

    const zones = (zonesRes && !zonesRes._error) ? (zonesRes?.items || []) : [];
    const flavors = (flavorsRes && !flavorsRes._error) ? (flavorsRes?.items || []) : [];
    const osTemplates = (osRes && !osRes._error) ? (osRes?.items || []) : [];

    return NextResponse.json({
      success: true,
      baseUrl: cfg.baseUrl,
      label: cfg.label || '',
      zones,
      flavors,
      osTemplates,
      zonesError: zonesRes?._error || null,
      flavorsError: flavorsRes?._error || null,
      osError: osRes?._error || null,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch KuroHost catalog',
    }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
