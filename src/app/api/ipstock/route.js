// pages/api/ipstock.js
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

export async function POST(request) {
    await connectDB();

    try {
        const reqBody = await request.json();
        const { name, available, serverType, tags, memoryOptions, promoCodes, defaultConfigurations } = reqBody;

        const newIPStock = new IPStock({
            name,
            available,
            serverType,
            tags: tags || [],
            memoryOptions,
            promoCodes: promoCodes || [],
            defaultConfigurations: defaultConfigurations || {},
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
// GET method - fetch all IP stocks
export async function GET(request) {
    console.log('[IPSTOCK-API] GET request received');

    try {
        await connectDB();
        console.log('[IPSTOCK-API] Database connected');

        // Use lean() for faster query - returns plain JS objects instead of Mongoose documents
        const ipStocks = await IPStock.find({}).lean().maxTimeMS(10000);
        console.log(`[IPSTOCK-API] Found ${ipStocks?.length || 0} IP stocks`);

        if (!ipStocks) {
            console.log('[IPSTOCK-API] No IP stocks found (null result)');
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const jsonResponse = JSON.stringify(ipStocks);
        console.log(`[IPSTOCK-API] Response size: ${jsonResponse.length} bytes`);

        return new Response(jsonResponse, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
    } catch (error) {
        console.error('[IPSTOCK-API] Error fetching IP stocks:', error.message);
        console.error('[IPSTOCK-API] Error stack:', error.stack);
        return new Response(JSON.stringify({ error: 'Failed to fetch IP Stocks', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
