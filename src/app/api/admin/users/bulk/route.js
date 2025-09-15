import connectDB from "@/lib/db";
import User from "@/models/userModel";
import { getDataFromToken } from "@/helper/getDataFromToken";

export async function POST(request) {
    try {
        await connectDB();

        // Check if user is admin
        const userId = getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { userIds, action, data } = await request.json();

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return new Response(JSON.stringify({ message: 'User IDs array is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let updateData = {};
        let successMessage = '';

        switch (action) {
            case 'verify':
                updateData = { isVerified: true, verifiedAt: new Date() };
                successMessage = 'Users verified successfully';
                break;
            case 'unverify':
                updateData = { isVerified: false, verifiedAt: null };
                successMessage = 'Users unverified successfully';
                break;
            case 'delete':
                const deleteResult = await User.deleteMany({
                    _id: { $in: userIds },
                    role: { $ne: 'Admin' } // Prevent admin deletion
                });
                return new Response(JSON.stringify({
                    message: `${deleteResult.deletedCount} users deleted successfully`
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            default:
                return new Response(JSON.stringify({ message: 'Invalid action' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
        }

        const result = await User.updateMany(
            {
                _id: { $in: userIds },
                role: { $ne: 'Admin' } // Prevent admin modification
            },
            { $set: updateData }
        );

        return new Response(JSON.stringify({
            message: successMessage,
            modifiedCount: result.modifiedCount
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error performing bulk action:', error);
        return new Response(JSON.stringify({ message: 'Failed to perform bulk action', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
