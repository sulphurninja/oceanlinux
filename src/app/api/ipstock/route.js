// pages/api/ipstock.js
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';  // Ensure correct import path

export async function POST(request) {
    await connectDB();

    console.log('Received body:', request.body); // Log the raw body to see what is received

    try {
        const reqBody = await request.json();

        // Next.js should automatically parse JSON body, thus req.body should be directly usable.
        const { name, available, memoryOptions } = reqBody;

        const newIPStock = new IPStock({
            name,
            available,
            memoryOptions
        });

        await newIPStock.save();

        return new Response(JSON.stringify(newIPStock), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error parsing JSON or saving to DB:', error); // More detailed error logging
        return new Response(JSON.stringify({ error: 'Failed to create IP Stock', details: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

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
