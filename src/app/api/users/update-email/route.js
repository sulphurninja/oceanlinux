import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/userModel';
import EmailVerification from '@/models/emailVerificationModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import EmailService from '@/lib/sendgrid';
import crypto from 'crypto';

// Generate 6-digit verification code
function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// POST: Request email change (sends verification code to NEW email)
export async function POST(request) {
  try {
    await connectDB();
    
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { newEmail } = await request.json();

    if (!newEmail) {
      return NextResponse.json(
        { success: false, message: 'New email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { success: false, message: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Check if email is same as current
    if (user.email.toLowerCase() === newEmail.toLowerCase()) {
      return NextResponse.json(
        { success: false, message: 'New email must be different from current email' },
        { status: 400 }
      );
    }

    // Check if email is already used by another user
    const existingUser = await User.findOne({ 
      email: newEmail.toLowerCase(),
      _id: { $ne: userId }
    });
    
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'This email is already registered to another account' },
        { status: 400 }
      );
    }

    // Rate limit: Check if user has requested too many times recently
    const recentRequests = await EmailVerification.countDocuments({
      userId,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    if (recentRequests >= 5) {
      return NextResponse.json(
        { success: false, message: 'Too many email change requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Delete any existing pending verifications for this user
    await EmailVerification.deleteMany({ userId });

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Create verification record
    await EmailVerification.create({
      userId,
      currentEmail: user.email,
      newEmail: newEmail.toLowerCase(),
      verificationCode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    });

    // Send verification email to NEW email address
    const emailService = new EmailService();
    const emailResult = await emailService.sendEmail({
      to: newEmail,
      subject: '🔐 Verify Your New Email Address - OceanLinux',
      html: getEmailVerificationTemplate(user.name, verificationCode, newEmail)
    });

    if (!emailResult.success) {
      console.error('[EMAIL-UPDATE] Failed to send verification email:', emailResult.error);
      return NextResponse.json(
        { success: false, message: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    console.log(`[EMAIL-UPDATE] Verification code sent to ${newEmail} for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${newEmail}. Please check your inbox.`,
      email: newEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email for security
    });

  } catch (error) {
    console.error('[EMAIL-UPDATE] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process email update request' },
      { status: 500 }
    );
  }
}

// PUT: Verify code and complete email change
export async function PUT(request) {
  try {
    await connectDB();
    
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { verificationCode } = await request.json();

    if (!verificationCode) {
      return NextResponse.json(
        { success: false, message: 'Verification code is required' },
        { status: 400 }
      );
    }

    // Find pending verification
    const verification = await EmailVerification.findOne({
      userId,
      verified: false
    });

    if (!verification) {
      return NextResponse.json(
        { success: false, message: 'No pending email verification found. Please request a new code.' },
        { status: 404 }
      );
    }

    // Check if expired
    if (verification.expiresAt < new Date()) {
      await EmailVerification.deleteOne({ _id: verification._id });
      return NextResponse.json(
        { success: false, message: 'Verification code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Increment attempts
    verification.attempts += 1;
    
    // Check max attempts
    if (verification.attempts > 5) {
      await EmailVerification.deleteOne({ _id: verification._id });
      return NextResponse.json(
        { success: false, message: 'Too many failed attempts. Please request a new code.' },
        { status: 400 }
      );
    }

    // Verify code
    if (verification.verificationCode !== verificationCode.toString()) {
      await verification.save();
      return NextResponse.json(
        { success: false, message: `Invalid verification code. ${5 - verification.attempts} attempts remaining.` },
        { status: 400 }
      );
    }

    // Double-check new email isn't taken (in case someone registered while waiting)
    const emailTaken = await User.findOne({
      email: verification.newEmail,
      _id: { $ne: userId }
    });

    if (emailTaken) {
      await EmailVerification.deleteOne({ _id: verification._id });
      return NextResponse.json(
        { success: false, message: 'This email has been registered by another user. Please try a different email.' },
        { status: 400 }
      );
    }

    // Update user's email
    const oldEmail = verification.currentEmail;
    const newEmail = verification.newEmail;

    await User.findByIdAndUpdate(userId, {
      email: newEmail
    });

    // Mark verification as complete and delete
    await EmailVerification.deleteOne({ _id: verification._id });

    console.log(`[EMAIL-UPDATE] ✅ Email changed for user ${userId}: ${oldEmail} → ${newEmail}`);

    // Send confirmation email to OLD email address
    try {
      const emailService = new EmailService();
      await emailService.sendEmail({
        to: oldEmail,
        subject: '✅ Your Email Address Has Been Changed - OceanLinux',
        html: getEmailChangedNotificationTemplate(newEmail)
      });
    } catch (notifyError) {
      console.error('[EMAIL-UPDATE] Failed to send notification to old email:', notifyError);
      // Don't fail the request - email change was successful
    }

    return NextResponse.json({
      success: true,
      message: 'Email address updated successfully!',
      newEmail
    });

  } catch (error) {
    console.error('[EMAIL-UPDATE] Verification error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to verify email' },
      { status: 500 }
    );
  }
}

// Email templates
function getEmailVerificationTemplate(name, code, newEmail) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
      .container { max-width: 600px; margin: 0 auto; background: white; }
      .header { background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; }
      .header h1 { color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
      .header p { color: rgba(255,255,255,0.9); font-size: 16px; }
      .content { padding: 40px 30px; }
      .greeting { font-size: 20px; font-weight: 600; margin-bottom: 20px; color: #1f2937; }
      .message { font-size: 16px; color: #4b5563; margin-bottom: 20px; line-height: 1.7; }
      .code-box { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); padding: 30px; border-radius: 16px; text-align: center; margin: 30px 0; }
      .code { font-size: 42px; font-weight: 700; letter-spacing: 8px; color: #1f2937; font-family: monospace; }
      .expiry { font-size: 14px; color: #6b7280; margin-top: 12px; }
      .warning { background: #fef3c7; padding: 16px; border-radius: 12px; border-left: 4px solid #f59e0b; margin: 20px 0; }
      .warning p { color: #92400e; font-size: 14px; margin: 0; }
      .footer { background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🔐 Email Verification</h1>
        <p>Verify your new email address</p>
      </div>

      <div class="content">
        <div class="greeting">Hi ${name},</div>

        <div class="message">
          You requested to change your email address to <strong>${newEmail}</strong>. 
          Please enter the verification code below to confirm this change.
        </div>

        <div class="code-box">
          <div class="code">${code}</div>
          <div class="expiry">⏱️ This code expires in 15 minutes</div>
        </div>

        <div class="warning">
          <p><strong>⚠️ Didn't request this?</strong><br>
          If you didn't request to change your email, please ignore this email. Your account email will remain unchanged.</p>
        </div>

        <div class="message" style="font-size: 14px; color: #6b7280;">
          For security reasons, this code can only be used once and will expire in 15 minutes.
        </div>
      </div>

      <div class="footer">
        <div style="margin-bottom: 20px;">
          <strong>🌊 OceanLinux</strong><br>
          The Ocean Of Linux
        </div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
          © ${new Date().getFullYear()} OceanLinux. All rights reserved.
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

function getEmailChangedNotificationTemplate(newEmail) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Changed</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8fafc; }
      .container { max-width: 600px; margin: 0 auto; background: white; }
      .header { background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; }
      .header h1 { color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
      .content { padding: 40px 30px; }
      .message { font-size: 16px; color: #4b5563; margin-bottom: 20px; line-height: 1.7; }
      .info-box { background: #f0f9ff; padding: 20px; border-radius: 12px; border-left: 4px solid #3b82f6; margin: 20px 0; }
      .warning { background: #fef2f2; padding: 16px; border-radius: 12px; border-left: 4px solid #ef4444; margin: 20px 0; }
      .footer { background: #1f2937; color: #9ca3af; padding: 30px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>✅ Email Changed Successfully</h1>
      </div>

      <div class="content">
        <div class="message">
          This is a confirmation that your OceanLinux account email has been changed.
        </div>

        <div class="info-box">
          <p><strong>📧 New Email Address:</strong><br>
          ${newEmail}</p>
          <p style="margin-top: 12px;"><strong>📅 Changed:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div class="warning">
          <p><strong>🚨 Didn't make this change?</strong><br>
          If you did not change your email address, your account may be compromised. 
          Please contact our support team immediately at <a href="mailto:hello@oceanlinux.com">hello@oceanlinux.com</a></p>
        </div>

        <div class="message">
          From now on, you'll receive all OceanLinux communications at your new email address.
        </div>
      </div>

      <div class="footer">
        <div style="margin-bottom: 20px;">
          <strong>🌊 OceanLinux</strong><br>
          The Ocean Of Linux
        </div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
          © ${new Date().getFullYear()} OceanLinux. All rights reserved.
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

