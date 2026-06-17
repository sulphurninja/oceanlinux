import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { sanitizeSlotPackage } from '@/lib/apiSecurity';
const SlotIPPackage = require('@/models/slotIpPackageModel');

function parseProxyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length < 4) return null;
  return {
    proxy: trimmed,
    ip: parts[0],
    port: parseInt(parts[1], 10),
    username: parts[2],
    password: parts.slice(3).join(':'),
    allocated: false,
    orderId: null,
    allocatedAt: null,
  };
}

export async function POST(request) {
  await connectDB();

  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { name, description, price, available, bulkIps, promoCodes } = await request.json();

    if (!name || !price || !bulkIps) {
      return NextResponse.json(
        { error: 'Name, price, and bulk IPs are required' },
        { status: 400 }
      );
    }

    const lines = bulkIps.split('\n').filter(l => l.trim());
    const ips = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseProxyLine(lines[i]);
      if (parsed) {
        ips.push(parsed);
      } else {
        errors.push({ line: i + 1, content: lines[i].trim() });
      }
    }

    if (ips.length === 0) {
      return NextResponse.json(
        { error: 'No valid IP entries found. Format: ip:port:username:password' },
        { status: 400 }
      );
    }

    const newPackage = new SlotIPPackage({
      name,
      description: description || '',
      price,
      available: available !== false,
      ips,
      promoCodes: promoCodes || [],
    });

    await newPackage.save();

    return NextResponse.json({
      success: true,
      package: newPackage,
      parsed: ips.length,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: 201 });

  } catch (error) {
    console.error('[SLOT-IPS] Create error:', error);
    return NextResponse.json(
      { error: 'Failed to create slot IP package', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  await connectDB();

  try {
    const admin = await requireAdmin(request);
    const packages = await SlotIPPackage.find({}).lean();

    const result = packages.map((pkg) =>
      sanitizeSlotPackage(pkg, { includeIps: !!admin })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[SLOT-IPS] Fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch slot IP packages', details: error.message },
      { status: 500 }
    );
  }
}
