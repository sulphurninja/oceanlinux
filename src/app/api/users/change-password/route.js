import connectDB from '../../../../lib/db';
import User from '../../../../models/userModel';
import { getDataFromToken } from '../../../../helper/getDataFromToken';
import { hashUserPassword, verifyUserPassword } from '@/lib/userPassword';

export async function POST(request) {
    await connectDB();

    try {
        const userId = getDataFromToken(request);
        const { oldPassword, newPassword } = await request.json();

        const user = await User.findById(userId);
        if (!user) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const isOldValid = await verifyUserPassword(oldPassword, user.password);
        if (!isOldValid) {
            return new Response(JSON.stringify({ message: 'Old password is incorrect' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!newPassword || String(newPassword).length < 8) {
            return new Response(JSON.stringify({ message: 'New password must be at least 8 characters' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        user.password = await hashUserPassword(newPassword);
        await user.save();

        return new Response(JSON.stringify({ message: 'Password updated successfully' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error changing password:', error);
        return new Response(JSON.stringify({ message: 'Failed to change password', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
