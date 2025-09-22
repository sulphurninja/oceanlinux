import connectDB from '../../../../lib/db';
import User from '../../../../models/userModel';
import { getDataFromToken } from '../../../../helper/getDataFromToken';

export async function POST(request) {
    try {
        await connectDB();

        // Extract user ID from JWT
        const userId = await getDataFromToken(request);

        // Parse request body
        const updateData = await request.json();

        // Remove sensitive fields that shouldn't be updated this way
        const { password, _id, createdAt, updatedAt, stats, ...safeUpdateData } = updateData;

        // Update user with all the new fields
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                ...safeUpdateData,
                lastLogin: new Date() // Update last activity
            },
            {
                new: true,
                runValidators: true,
                lean: true
            }
        );

        if (!updatedUser) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            message: 'Profile updated successfully',
            user: updatedUser
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error updating user profile:', error);
        return new Response(JSON.stringify({
            message: 'Failed to update profile',
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
