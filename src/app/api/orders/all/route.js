import { MongoClient } from 'mongodb';
import connectDB from '../../../../lib/db';

export async function GET() {
    await connectDB();
    try {
        const client = new MongoClient(process.env.MONGOOSE_URL);
        await client.connect();
        const db = client.db();  // Get the default database

        const orders = await db.collection('orders').find({}).toArray();
        await client.close();

        return new Response(JSON.stringify(orders), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Failed to fetch orders', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
