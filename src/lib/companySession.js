import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const COMPANY_SESSION_COOKIE = 'company_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function sessionSecret() {
  return process.env.COMPANY_SESSION_SECRET || process.env.TOKEN_SECRET || '';
}

export function signCompanySessionToken(company) {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error('COMPANY_SESSION_SECRET or TOKEN_SECRET must be configured');
  }
  return jwt.sign(
    {
      id: String(company._id),
      slug: company.slug,
      name: company.name,
    },
    secret,
    { expiresIn: `${SESSION_MAX_AGE_SEC}s` }
  );
}

export function companySessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SEC,
    path: '/',
  };
}

export async function verifyCompanyPassword(company, password) {
  if (!company?.password || !password) return false;
  const stored = String(company.password);
  if (stored.startsWith('$2')) {
    return bcrypt.compare(String(password), stored);
  }
  // Legacy plaintext rows (upgraded to bcrypt on first successful login by
  // upgradeCompanyPasswordHash) — compare in constant time so a wrong password
  // leaks no length/prefix timing signal.
  const a = Buffer.from(stored);
  const b = Buffer.from(String(password));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function upgradeCompanyPasswordHash(company, plainPassword) {
  if (!company || String(company.password || '').startsWith('$2')) return;
  company.password = await bcrypt.hash(String(plainPassword), 10);
  await company.save();
}

/**
 * Validates signed company cookie and re-checks company exists + is active.
 */
export async function resolveCompanySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COMPANY_SESSION_COOKIE)?.value;
  if (!token) return null;

  const secret = sessionSecret();
  if (!secret) return null;

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    return null;
  }

  if (!decoded?.id || !decoded?.slug) return null;

  await connectDB();
  const company = await Company.findOne({
    _id: decoded.id,
    slug: decoded.slug,
    isActive: true,
  })
    .select('_id slug name')
    .lean();

  if (!company) return null;

  return {
    id: String(company._id),
    slug: company.slug,
    name: company.name,
  };
}
