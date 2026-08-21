import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { COMPANY_FILTER_VERSION } from '@/lib/companyOrders';
import {
  signCompanySessionToken,
  companySessionCookieOptions,
  verifyCompanyPassword,
  upgradeCompanyPasswordHash,
  COMPANY_SESSION_COOKIE,
} from '@/lib/companySession';
import { enforceRateLimit } from '@/lib/rateLimit';
import { toQueryString } from '@/lib/queryIds';

export async function POST(request) {
  // A company session exposes that company's orders, customer emails and VPS
  // passwords, so this password must not be guessable at HTTP speed.
  const rateLimited = enforceRateLimit(request, {
    max: 10,
    windowMs: 10 * 60_000,
    scope: 'ip',
    message: 'Too many login attempts. Please wait a few minutes and try again.',
  });
  if (rateLimited) return rateLimited;

  await connectDB();
  const { slug, password } = await request.json();

  const safeSlug = toQueryString(slug);
  if (!safeSlug || !password) {
    return NextResponse.json({ error: 'Slug and password are required' }, { status: 400 });
  }

  const company = await Company.findOne({ slug: safeSlug, isActive: true });
  if (!company || !(await verifyCompanyPassword(company, password))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await upgradeCompanyPasswordHash(company, password);

  const token = signCompanySessionToken(company);
  const cookieStore = await cookies();
  cookieStore.set(COMPANY_SESSION_COOKIE, token, companySessionCookieOptions());

  return NextResponse.json({
    success: true,
    name: company.name,
    slug: company.slug,
    ordersFilter: COMPANY_FILTER_VERSION,
  });
}
