import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import User from '@/models/userModel';
const NetbayApi = require('@/services/netbayApi');
const { getCompanyNetbayApiConfig } = require('@/lib/companyNetbayApi');

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
 * Combined catalog endpoint — returns Netbay's Plans + OS Templates for the
 * given company so the admin UI can render a side-by-side reference table
 * when configuring IP stocks (planId / OS name fields).
 *
 * Response: { plans: [...], os: [...], baseUrl }
 */
export async function GET(request, { params }) {
  await verifyAdmin();
  await connectDB();
  const { id } = await params;

  const company = await Company.findById(id).lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const cfg = getCompanyNetbayApiConfig(company);
  if (!cfg) {
    return NextResponse.json({
      error: 'Netbay API is not configured for this company. Enable it from /admin/companies first.',
    }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || undefined;

  try {
    const api = new NetbayApi(cfg);
    const [plansRes, osRes] = await Promise.all([
      api.listPlans({ category }).catch(err => ({ _error: err.message })),
      api.listOs({ category }).catch(err => ({ _error: err.message })),
    ]);

    const plans = (plansRes && !plansRes._error) ? (plansRes?.data?.plans || []) : [];
    const os = (osRes && !osRes._error) ? (osRes?.data?.os || []) : [];

    return NextResponse.json({
      success: true,
      baseUrl: cfg.baseUrl,
      label: cfg.label || '',
      plans,
      os,
      plansError: plansRes?._error || null,
      osError: osRes?._error || null,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch Netbay catalog',
    }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
  }
}
