import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { sanitizeSlotPackage } from '@/lib/apiSecurity';
const SlotIPPackage = require('@/models/slotIpPackageModel');

export async function GET(request, { params }) {
  await connectDB();

  try {
    const admin = await requireAdmin(request);
    const { id } = await params;
    const pkg = await SlotIPPackage.findById(id).lean();
    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }
    return NextResponse.json(sanitizeSlotPackage(pkg, { includeIps: !!admin }));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  await connectDB();

  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.addIps) {
      const lines = body.addIps.split('\n').filter(l => l.trim());
      const newIps = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(':');
        if (parts.length < 4) continue;
        newIps.push({
          proxy: trimmed,
          ip: parts[0],
          port: parseInt(parts[1], 10),
          username: parts[2],
          password: parts.slice(3).join(':'),
          allocated: false,
          orderId: null,
          allocatedAt: null,
        });
      }

      if (newIps.length > 0) {
        const pkg = await SlotIPPackage.findByIdAndUpdate(
          id,
          {
            $push: { ips: { $each: newIps } },
            $set: { available: true },
          },
          { new: true }
        );

        let slotRetry = { retried: 0, allocated: 0 };
        try {
          const { retryPendingSlotIpOrdersForPackage } = require('@/lib/retryPendingSlotIpOrders');
          slotRetry = await retryPendingSlotIpOrdersForPackage(id);
        } catch (retryErr) {
          console.error('[slot-ips] Auto-assign pending orders failed:', retryErr.message);
        }

        return NextResponse.json({
          success: true,
          package: pkg,
          added: newIps.length,
          autoAssignedOrders: slotRetry.allocated,
          pendingRetried: slotRetry.retried,
        });
      }
      return NextResponse.json({ error: 'No valid IPs to add' }, { status: 400 });
    }

    const updateFields = {};
    if (body.name !== undefined) updateFields.name = body.name;
    if (body.description !== undefined) updateFields.description = body.description;
    if (body.price !== undefined) updateFields.price = body.price;
    if (body.available !== undefined) updateFields.available = body.available;
    if (body.promoCodes !== undefined) updateFields.promoCodes = body.promoCodes;

    const pkg = await SlotIPPackage.findByIdAndUpdate(id, updateFields, { new: true });
    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, package: pkg });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  await connectDB();

  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const pkg = await SlotIPPackage.findById(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const allocatedCount = pkg.ips.filter(ip => ip.allocated).length;
    if (allocatedCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${allocatedCount} IPs are allocated to customers` },
        { status: 400 }
      );
    }

    await SlotIPPackage.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
