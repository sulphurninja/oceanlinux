import connectDB from "../../../../lib/db";
import User from '../../../../models/userModel'
import { getDataFromToken } from '../../../../helper/getDataFromToken'

export async function GET(request) {
    try {
        // Ensure DB is connected
        await connectDB();

        // Extract user ID from JWT in the Authorization header
        const userId = await getDataFromToken(request);

        // Find orders by user ID
        const user = await User.findOne({ _id: userId }).lean();

        // Return orders to client
        return new Response(JSON.stringify(user), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching user orders:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch orders', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
