import connectDB from '../../../../lib/db';
import User from '../../../../models/userModel';
import { getDataFromToken } from '../../../../helper/getDataFromToken';

export async function POST(request) {
    await connectDB();

    try {
        const userId = getDataFromToken(request);
        const { name, email } = await request.json();

        const updatedUser = await User.findByIdAndUpdate(userId, { name, email }, { new: true }).lean();

        if (!updatedUser) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify(updatedUser), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating user:', error);
        return new Response(JSON.stringify({ message: 'Failed to update user', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
