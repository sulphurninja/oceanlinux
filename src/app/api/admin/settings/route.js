import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Settings from '@/models/settingsModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { requireAdmin } from '@/lib/adminAuth';

// GET - Fetch all settings (admin only)
export async function GET(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const settings = await Settings.find({}).sort({ key: 1 });
    
    // Include defaults for any missing settings
    const allSettings = {};
    for (const [key, defaultValue] of Object.entries(Settings.DEFAULTS)) {
      const existing = settings.find(s => s.key === key);
      allSettings[key] = {
        value: existing ? existing.value : defaultValue,
        description: existing?.description || '',
        updatedAt: existing?.updatedAt || null,
        isDefault: !existing
      };
    }

    return NextResponse.json({ success: true, settings: allSettings });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST - Update a setting (admin only)
export async function POST(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const adminUser = await requireAdmin(request);

    const { key, value, description } = await request.json();

    if (!key) {
      return NextResponse.json(
        { success: false, message: 'Setting key is required' },
        { status: 400 }
      );
    }

    const setting = await Settings.setSetting(key, value, description, adminUser?._id);

    console.log(`[ADMIN] Setting updated: ${key} = ${value} by ${adminUser?.email || 'admin'}`);

    return NextResponse.json({
      success: true,
      message: 'Setting updated successfully',
      setting
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update setting' },
      { status: 500 }
    );
  }
}
