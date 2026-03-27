import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import User from '@/models/userModel';

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

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function GET() {
  const admin = await verifyAdmin();
  // if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const companies = await Company.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json(companies);
}

export async function POST(request) {
  const admin = await verifyAdmin();
  // if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
