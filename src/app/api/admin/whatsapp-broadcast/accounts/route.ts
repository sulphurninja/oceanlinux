import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import User from '@/models/userModel';
import Order from '@/models/orderModel';
import {
  WhatsappBroadcastAccount,
  WhatsappBroadcastJob,
} from '@/models/whatsappBroadcastModel';
import {
  BROADCAST_SLOTS,
  getDefaultApiKey,
  maskApiKey,
  normalizePhone,
  PURCHASED_STATUSES,
} from '@/lib/whatsappBroadcast';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

async function computeAudienceCounts() {
  const [users, buyerIds] = await Promise.all([
    User.find({ phone: { $nin: [null, ''] } }).select('phone').lean(),
    Order.distinct('user', { status: { $in: PURCHASED_STATUSES } }),
  ]);

  const buyerSet = new Set(buyerIds.map((id: any) => String(id)));
  const allPhones = new Set<string>();
  const purchaserPhones = new Set<string>();

  for (const u of users as any[]) {
    const phone = normalizePhone(u.phone);
    if (!phone) continue;
    allPhones.add(phone);
    if (buyerSet.has(String(u._id))) purchaserPhones.add(phone);
  }

  return { allCustomers: allPhones.size, purchasers: purchaserPhones.size };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const [docs, audienceCounts, runningJobs] = await Promise.all([
      WhatsappBroadcastAccount.find({}).lean(),
      computeAudienceCounts(),
      WhatsappBroadcastJob.find({ status: 'running' })
        .select('slot templateName audience totalRecipients cursor sentCount failedCount skippedCount createdAt')
        .lean(),
    ]);

    const bySlot = new Map((docs as any[]).map((d) => [d.slot, d]));
    const defaultKey = getDefaultApiKey();

    const slots = BROADCAST_SLOTS.map((slot) => {
      const doc: any = bySlot.get(slot);
      const hasCustomKey = Boolean(doc?.apiKey);
      const usingDefault = !hasCustomKey && slot === 1 && Boolean(defaultKey);
      const effectiveKey = hasCustomKey ? doc.apiKey : usingDefault ? defaultKey : '';
      return {
        slot,
        label: doc?.label || (slot === 1 ? 'Default (platform)' : ''),
        configured: Boolean(effectiveKey),
        usingDefault,
        maskedKey: maskApiKey(effectiveKey),
        updatedAt: doc?.updatedAt || null,
      };
    });

    return NextResponse.json(
      {
        slots,
        defaultKeyMasked: maskApiKey(defaultKey),
        defaultKeyConfigured: Boolean(defaultKey),
        audienceCounts,
        runningJobs,
      },
      { headers: NO_CACHE },
    );
  } catch (error: any) {
    console.error('[WA-BROADCAST][ACCOUNTS][GET]', error);
    return NextResponse.json({ message: error.message || 'Failed to load accounts' }, { status: 500, headers: NO_CACHE });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const body = await request.json();
    const slot = Number(body.slot);
    if (!BROADCAST_SLOTS.includes(slot)) {
      return NextResponse.json({ message: 'slot must be 1-7' }, { status: 400, headers: NO_CACHE });
    }

    const update: Record<string, unknown> = { updatedBy: (admin as any)._id };
    if (typeof body.label === 'string') update.label = body.label.trim().slice(0, 60);
    if (typeof body.apiKey === 'string') update.apiKey = body.apiKey.trim();
    if (body.clearKey === true) update.apiKey = '';

    const doc = await WhatsappBroadcastAccount.findOneAndUpdate(
      { slot },
      { $set: update, $setOnInsert: { slot } },
      { upsert: true, new: true },
    ).lean();

    return NextResponse.json(
      {
        success: true,
        slot: {
          slot,
          label: (doc as any).label || '',
          configured: Boolean((doc as any).apiKey) || (slot === 1 && Boolean(getDefaultApiKey())),
          usingDefault: !(doc as any).apiKey && slot === 1 && Boolean(getDefaultApiKey()),
          maskedKey: maskApiKey((doc as any).apiKey || (slot === 1 ? getDefaultApiKey() : '')),
        },
      },
      { headers: NO_CACHE },
    );
  } catch (error: any) {
    console.error('[WA-BROADCAST][ACCOUNTS][PUT]', error);
    return NextResponse.json({ message: error.message || 'Failed to save account' }, { status: 500, headers: NO_CACHE });
  }
}
