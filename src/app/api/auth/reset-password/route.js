import connectDB from '@/lib/db';
import User from '@/models/userModel';
import PasswordReset from '@/models/passwordResetModel';
import crypto from 'crypto';
import { hashUserPassword } from '@/lib/userPassword';
import { enforceRateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  const rateLimited = enforceRateLimit(request, {
    max: 10,
    windowMs: 15 * 60_000,
    scope: 'ip',
    message: 'Too many attempts. Please wait a few minutes and try again.',
  });
  if (rateLimited) return rateLimited;

  try {
    await connectDB();

    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return new Response(JSON.stringify({ message: 'Token and new password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ message: 'Password must be at least 8 characters long' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash the token to match stored version
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid reset token
    const resetRecord = await PasswordReset.findOne({
      resetToken: hashedToken,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!resetRecord) {
      return new Response(JSON.stringify({
        message: 'Invalid or expired reset token'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find the user
    const user = await User.findById(resetRecord.userId);
    if (!user) {
      return new Response(JSON.stringify({ message: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    user.password = await hashUserPassword(newPassword);
    await user.save();

    // Mark reset token as used
    resetRecord.used = true;
    await resetRecord.save();

    // Delete all reset tokens for this user
    await PasswordReset.deleteMany({ userId: user._id });

    return new Response(JSON.stringify({
      message: 'Password reset successfully',
      success: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return new Response(JSON.stringify({
      message: 'Internal server error. Please try again later.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
