import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import { requireAdmin } from '@/lib/adminAuth';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await connectDB();
  const companies = await Company.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json(companies);
}

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await connectDB();
  const { name, password } = await request.json();

  if (!name || !password) {
    return NextResponse.json({ error: 'Name and password are required' }, { status: 400 });
  }

  const slug = slugify(name);

  const existing = await Company.findOne({ $or: [{ name }, { slug }] });
  if (existing) {
    return NextResponse.json({ error: 'Company with this name already exists' }, { status: 409 });
  }

  const company = await Company.create({ name, slug, password });
  return NextResponse.json(company, { status: 201 });
}
