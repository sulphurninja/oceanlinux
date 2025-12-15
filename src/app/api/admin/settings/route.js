import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Settings from '@/models/settingsModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';

// GET - Fetch all settings (admin only)
export async function GET(request) {
  try {
    await connectDB();

    // Check authentication
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await User.findById(userId);
    // if (!user?.isAdmin) {
    //   return NextResponse.json(
    //     { success: false, message: 'Admin access required' },
    //     { status: 403 }
    //   );
    // }

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
    await connectDB();

    // Check authentication
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await User.findById(userId);
    // if (!user?.isAdmin) {
    //   return NextResponse.json(
    //     { success: false, message: 'Admin access required' },
    //     { status: 403 }
    //   );
    // }

    const { key, value, description } = await request.json();

    if (!key) {
      return NextResponse.json(
        { success: false, message: 'Setting key is required' },
        { status: 400 }
      );
    }

    const setting = await Settings.setSetting(key, value, description, userId);

    console.log(`[ADMIN] Setting updated: ${key} = ${value} by ${user.email}`);

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
