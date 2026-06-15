import { NextRequest, NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import connectDB from '@/lib/db';
import User from '@/models/userModel';
import { hashUserPassword, verifyUserPassword } from '@/lib/userPassword';
import { findOtherUserByEmail, normalizeEmail } from '@/lib/userEmail';

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    // Check authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userId;
    try {
      userId = getDataFromToken(request);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { name, email, currentPassword, newPassword } = await request.json();

    const trimmedName = String(name || '').trim();
    const normalizedEmail = normalizeEmail(email);

    if (!trimmedName || !normalizedEmail) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if email is being changed and if it's already in use (case-insensitive)
    if (normalizeEmail(user.email) !== normalizedEmail) {
      const existingUser = await findOtherUserByEmail(User, normalizedEmail, userId);
      if (existingUser) {
        return NextResponse.json({ error: 'Email is already in use' }, { status: 400 });
      }
    }

    // Prepare update data
    const updateData: any = {
      name: trimmedName,
      email: normalizedEmail,
    };

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }

      const isCurrentValid = await verifyUserPassword(currentPassword, user.password);
      if (!isCurrentValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      }

      // Validate new password strength
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters long' }, { status: 400 });
      }

      updateData.password = await hashUserPassword(newPassword);
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, select: '-password' }
    );

    return NextResponse.json({
      message: 'Account settings updated successfully',
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
      }
    });

  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
