import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';
const { auditHostheavenVsOrders } = require('@/lib/hostheavenVmAudit');

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** GET — list Hostheaven panel VMs not linked to any OceanLinux order. */
export async function GET(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id } = await params;

  const company = await Company.findById(id).lean();
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  try {
    const report = await auditHostheavenVsOrders(company);
    return NextResponse.json({ success: true, ...report });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message || 'Audit failed' },
      { status: 502 }
    );
  }
}
