import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Settings from '@/models/settingsModel';

// Admins can store any key here, so this public route must never serve an
// arbitrary `?key=` — only the keys the storefront is meant to expose.
const PUBLIC_KEYS = ['WHATSAPP_NUMBER', 'WHATSAPP_MESSAGE', 'SUPPORT_EMAIL'];

// GET - Fetch settings (public endpoint for WhatsApp number etc.)
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      if (!PUBLIC_KEYS.includes(key)) {
        return NextResponse.json(
          { success: false, message: 'Unknown setting' },
          { status: 404 }
        );
      }
      const value = await Settings.getSetting(key, Settings.DEFAULTS[key]);
      return NextResponse.json({ success: true, key, value });
    }

    // Get all public settings
    const publicKeys = PUBLIC_KEYS;
    const settings = {};

    for (const k of publicKeys) {
      settings[k] = await Settings.getSetting(k, Settings.DEFAULTS[k]);
    }

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
