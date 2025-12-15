import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Settings from '@/models/settingsModel';

// GET - Fetch settings (public endpoint for WhatsApp number etc.)
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // Get single setting
      const value = await Settings.getSetting(key, Settings.DEFAULTS[key]);
      return NextResponse.json({ success: true, key, value });
    }

    // Get all public settings
    const publicKeys = ['WHATSAPP_NUMBER', 'WHATSAPP_MESSAGE', 'SUPPORT_EMAIL'];
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
