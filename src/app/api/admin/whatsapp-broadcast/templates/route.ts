import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import {
  BROADCAST_SLOTS,
  createZaptickClient,
  resolveSlotApiKey,
} from '@/lib/whatsappBroadcast';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const slot = Number(searchParams.get('slot'));
    if (!BROADCAST_SLOTS.includes(slot)) {
      return NextResponse.json({ message: 'slot must be 1-7' }, { status: 400, headers: NO_CACHE });
    }

    const { apiKey } = await resolveSlotApiKey(slot);
    if (!apiKey) {
      return NextResponse.json({ message: 'No API key configured for this slot' }, { status: 400, headers: NO_CACHE });
    }

    const client = createZaptickClient(apiKey);
    const result = await client.templates.list({ limit: 100 });

    const templates = (result.templates || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language || 'en',
    }));

    return NextResponse.json({ success: true, templates }, { headers: NO_CACHE });
  } catch (error: any) {
    console.error('[WA-BROADCAST][TEMPLATES][GET]', error);
    return NextResponse.json(
      { message: error.message || 'Failed to fetch templates from Zaptick' },
      { status: 502, headers: NO_CACHE },
    );
  }
}
