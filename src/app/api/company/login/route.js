import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';

export async function POST(request) {
  await connectDB();
  const { slug, password } = await request.json();

  if (!slug || !password) {
    return NextResponse.json({ error: 'Slug and password are required' }, { status: 400 });
  }

  const company = await Company.findOne({ slug, isActive: true });
  if (!company || company.password !== password) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set('company_session', JSON.stringify({ id: company._id, slug: company.slug, name: company.name }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return NextResponse.json({ success: true, name: company.name, slug: company.slug });
}
