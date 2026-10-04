import connectDB from '@/lib/db';
import User from '@/models/userModel';
import { findUserByEmail } from '@/lib/userEmail';
import { verifyGoogleIdToken, isGoogleAuthConfigured } from '@/lib/googleAuth';
import { sanitizeAuthUser, setAuthCookie } from '@/lib/authSession';
import EmailService from '@/lib/sendgrid';
import { NextResponse } from 'next/server';
import { plainDisplayName } from '@/lib/plainUserText';

export async function POST(request) {
  try {
    if (!isGoogleAuthConfigured()) {
      return NextResponse.json(
        { message: 'Google Sign-In is not configured on the server.' },
        { status: 503 }
      );
    }

    const { credential } = await request.json();
    if (!credential) {
      return NextResponse.json({ message: 'Missing Google credential' }, { status: 400 });
    }

    const profile = await verifyGoogleIdToken(credential);
    await connectDB();

    let user = await User.findOne({ googleId: profile.googleId });
    let isNewUser = false;

    if (!user) {
      user = await findUserByEmail(User, profile.email);

      if (user) {
        if (user.googleId && user.googleId !== profile.googleId) {
          return NextResponse.json(
            { message: 'This email is linked to a different Google account.' },
            { status: 409 }
          );
        }

        user.googleId = profile.googleId;
        if (!user.authProvider || user.authProvider === 'local') {
          user.authProvider = user.password ? 'local' : 'google';
        }
        if (!user.avatar && profile.avatar) user.avatar = profile.avatar;
        if (!user.name && profile.name) user.name = plainDisplayName(profile.name);
        user.lastLogin = new Date();
        await user.save();
      } else {
        user = await User.create({
          name: plainDisplayName(profile.name),
          email: profile.email,
          googleId: profile.googleId,
          authProvider: 'google',
          avatar: profile.avatar,
          password: '',
          lastLogin: new Date(),
        });
        isNewUser = true;
      }
    } else {
      if (profile.avatar && !user.avatar) user.avatar = profile.avatar;
      user.lastLogin = new Date();
      await user.save();
    }

    if (isNewUser) {
      try {
        const emailService = new EmailService();
        await emailService.sendWelcomeEmail(user.email, user.name);
      } catch (emailError) {
        console.error('[google-auth] Welcome email failed:', emailError);
      }
    }

    const response = NextResponse.json({
      result: sanitizeAuthUser(user),
      isNewUser,
    });

    return setAuthCookie(response, user);
  } catch (error) {
    console.error('[google-auth]', error);
    const message =
      error instanceof Error ? error.message : 'Google Sign-In failed. Please try again.';
    return NextResponse.json({ message }, { status: 401 });
  }
}
