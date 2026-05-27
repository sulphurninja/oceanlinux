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

function normalizeVirtualizorEntry(v) {
  return {
    enabled: typeof v?.enabled === 'boolean' ? v.enabled : true,
    label: typeof v?.label === 'string' ? v.label.trim() : '',
    host: typeof v?.host === 'string' ? v.host.trim() : '',
    port: Number.isFinite(Number(v?.port)) ? Number(v.port) : 4083,
    apiKey: typeof v?.apiKey === 'string' ? v.apiKey.trim() : '',
    apiPassword: typeof v?.apiPassword === 'string' ? v.apiPassword : '',
    protocol: v?.protocol === 'http' ? 'http' : 'https',
  };
}

function normalizeResellerApiEntry(v) {
  if (v === null) return null;
  return {
    enabled: typeof v?.enabled === 'boolean' ? v.enabled : false,
    label: typeof v?.label === 'string' ? v.label.trim() : '',
    baseUrl: typeof v?.baseUrl === 'string'
      ? v.baseUrl.trim().replace(/\/+$/, '')
      : '',
    resellerDomain: typeof v?.resellerDomain === 'string' ? v.resellerDomain.trim() : '',
    email: typeof v?.email === 'string' ? v.email.trim() : '',
    password: typeof v?.password === 'string' ? v.password : '',
  };
}

function normalizeNetbayApiEntry(v) {
  if (v === null) return null;
  return {
    enabled: typeof v?.enabled === 'boolean' ? v.enabled : false,
    label: typeof v?.label === 'string' ? v.label.trim() : '',
    baseUrl: typeof v?.baseUrl === 'string'
      ? v.baseUrl.trim().replace(/\/+$/, '')
      : '',
    apiKey: typeof v?.apiKey === 'string' ? v.apiKey.trim() : '',
    apiSecret: typeof v?.apiSecret === 'string' ? v.apiSecret : '',
  };
}

function pickAllowedUpdates(body) {
  const out = {};
  if (typeof body?.name === 'string') out.name = body.name;
  if (typeof body?.password === 'string') out.password = body.password;
  if (typeof body?.isActive === 'boolean') out.isActive = body.isActive;

  if (Array.isArray(body?.virtualizors)) {
    out.virtualizors = body.virtualizors.map(normalizeVirtualizorEntry);
  }

  // Back-compat: still accept the legacy single object, but it gets converted
  // into a single-entry `virtualizors` array so we don't have two sources of
  // truth going forward.
  if (out.virtualizors === undefined && body?.virtualizor && typeof body.virtualizor === 'object') {
    out.virtualizors = [normalizeVirtualizorEntry(body.virtualizor)];
  }

  // External reseller-panel API automation (Hostheaven / SomaniOne style).
  // Sending `null` explicitly clears the config; sending an object replaces
  // it. Omitting the key leaves the saved config untouched.
  if (Object.prototype.hasOwnProperty.call(body || {}, 'resellerApi')) {
    out.resellerApi = body.resellerApi === null
      ? null
      : normalizeResellerApiEntry(body.resellerApi);
  }

  // Netbay reseller API automation (https://api.netbayhosts.in style).
  // Same null/object/omit semantics as `resellerApi` above.
  if (Object.prototype.hasOwnProperty.call(body || {}, 'netbayApi')) {
    out.netbayApi = body.netbayApi === null
      ? null
      : normalizeNetbayApiEntry(body.netbayApi);
  }

  return out;
}

export async function PUT(request, { params }) {
  const admin = await verifyAdmin();


  await connectDB();
  const { id } = await params;
  const body = await request.json();
  const updates = pickAllowedUpdates(body);

  const company = await Company.findByIdAndUpdate(id, updates, { new: true });
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  return NextResponse.json(company);
}

export async function DELETE(request, { params }) {
  const admin = await verifyAdmin();


  await connectDB();
  const { id } = await params;

  const company = await Company.findByIdAndDelete(id);
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  return NextResponse.json({ message: 'Company deleted' });
}
