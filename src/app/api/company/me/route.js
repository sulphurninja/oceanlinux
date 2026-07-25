import { NextResponse } from 'next/server';
import { resolveCompanySession } from '@/lib/companySession';

export async function GET() {
  const company = await resolveCompanySession();

  if (!company) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json(company);
}
