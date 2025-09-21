import connectDB from '@/lib/db';
import User from '@/models/userModel';
import PasswordReset from '@/models/passwordResetModel';
import EmailService from '@/lib/sendgrid';
import crypto from 'crypto';

export async function POST(request) {
  try {
    await connectDB();

    const { email } = await request.json();

    if (!email) {
      return new Response(JSON.stringify({ message: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal whether the email exists or not for security
      return new Response(JSON.stringify({
        message: 'If an account with that email exists, we have sent a password reset link.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Delete any existing reset tokens for this user
    await PasswordReset.deleteMany({ userId: user._id });

    // Create new reset token
    await PasswordReset.create({
      userId: user._id,
      email: user.email,
      resetToken: hashedToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    });

    // Send reset email
    const emailService = new EmailService();
    const emailResult = await emailService.sendForgotPasswordEmail(
      user.email,
      user.name,
      resetToken // Send the unhashed token in the email
    );

    if (!emailResult.success) {
      console.error('Failed to send reset email:', emailResult.error);
      return new Response(JSON.stringify({
        message: 'Failed to send reset email. Please try again later.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      message: 'If an account with that email exists, we have sent a password reset link.',
      success: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return new Response(JSON.stringify({
      message: 'Internal server error. Please try again later.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
