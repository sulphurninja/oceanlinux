import connectDB from '@/lib/db';
import User from '@/models/userModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { hashUserPassword, isBcryptHash } from '@/lib/userPassword';

export async function GET(request, { params }) {
  try {
    await connectDB();

    const adminId = getDataFromToken(request);
    if (!adminId) {
      return new Response(JSON.stringify({ message: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = await User.findById(params.userId).select('password email name').lean();
    if (!user) {
      return new Response(JSON.stringify({ message: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hasPassword = !!(user.password && String(user.password).trim());

    return new Response(
      JSON.stringify({
        hasPassword,
        isEncrypted: hasPassword ? isBcryptHash(user.password) || true : false,
        message:
          'Passwords are encrypted. Admin cannot view them — enter a new password below to change it.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching user password status:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to load password info', error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    await connectDB();

    const adminId = getDataFromToken(request);
    if (!adminId) {
      return new Response(JSON.stringify({ message: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { password } = await request.json();
    if (!password || String(password).trim().length < 6) {
      return new Response(
        JSON.stringify({ message: 'Password must be at least 6 characters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = await User.findById(params.userId);
    if (!user) {
      return new Response(JSON.stringify({ message: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    user.password = await hashUserPassword(String(password).trim());
    await user.save();

    return new Response(
      JSON.stringify({ message: 'Password updated successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error updating user password:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to update user password', error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
