// pages/api/ipstock.js
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

export async function POST(request) {
    await connectDB();

    try {
        const reqBody = await request.json();
        const { name, available, serverType, tags, memoryOptions, promoCodes } = reqBody; // Add tags

        const newIPStock = new IPStock({
            name,
            available,
            serverType,
            tags: tags || [], // Include tags
            memoryOptions,
            promoCodes: promoCodes || []
        });

        await newIPStock.save();

        return new Response(JSON.stringify(newIPStock), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error parsing JSON or saving to DB:', error);
        return new Response(JSON.stringify({ error: 'Failed to create IP Stock', details: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
// GET method remains the same
// ... existing GET method remains the same ...
export async function GET(request) {
    await connectDB();

    try {
        const ipStocks = await IPStock.find({});
        return new Response(JSON.stringify(ipStocks), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch IP Stocks', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}