import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
const IPStock = require('@/models/ipStockModel');

export async function GET(request, { params }) {
    console.log('[IPSTOCK-ID][GET] === REQUEST START ===');
    console.log('[IPSTOCK-ID][GET] Params:', params);

    try {
        await connectDB();
        console.log('[IPSTOCK-ID][GET] Database connected successfully');

        const ipStockId = params.id;
        console.log('[IPSTOCK-ID][GET] Fetching IPStock for ID:', ipStockId);

        if (!ipStockId) {
            console.log('[IPSTOCK-ID][GET] No IPStock ID provided');
            return NextResponse.json({ message: 'IPStock ID is required' }, { status: 400 });
        }

        const ipStock = await IPStock.findById(ipStockId).lean();
        console.log('[IPSTOCK-ID][GET] IPStock found:', ipStock ? {
            _id: ipStock._id,
            name: ipStock.name,
            tags: ipStock.tags,
            serverType: ipStock.serverType,
            available: ipStock.available
        } : 'null');

        if (!ipStock) {
            console.log('[IPSTOCK-ID][GET] IPStock not found');
            return NextResponse.json({ message: 'IP Stock not found' }, { status: 404 });
        }

        console.log('[IPSTOCK-ID][GET] Returning IPStock data');
        return NextResponse.json(ipStock);
    } catch (error) {
        console.error('[IPSTOCK-ID][GET] === ERROR ===');
        console.error('[IPSTOCK-ID][GET] Error type:', error.constructor.name);
        console.error('[IPSTOCK-ID][GET] Error message:', error.message);
        console.error('[IPSTOCK-ID][GET] Error stack:', error.stack);
        return NextResponse.json(
            { message: 'Failed to fetch IP Stock', error: error.message },
            { status: 500 }
        );
    }
}

export async function PUT(request, { params }) {
    console.log('[IPSTOCK-ID][PUT] === REQUEST START ===');
    console.log('[IPSTOCK-ID][PUT] Params:', params);

    try {
        await connectDB();
        console.log('[IPSTOCK-ID][PUT] Database connected successfully');

        const ipStockId = params.id;
        console.log('[IPSTOCK-ID][PUT] Updating IPStock for ID:', ipStockId);

        if (!ipStockId) {
            console.log('[IPSTOCK-ID][PUT] No IPStock ID provided');
            return NextResponse.json({ message: 'IPStock ID is required' }, { status: 400 });
        }

        const updateData = await request.json();
        console.log('[IPSTOCK-ID][PUT] Update data received:', {
            name: updateData.name,
            available: updateData.available,
            serverType: updateData.serverType,
            tags: updateData.tags,
            hasMemoryOptions: !!updateData.memoryOptions,
            hasPromoCodes: !!updateData.promoCodes,
            hasDefaultConfigurations: !!updateData.defaultConfigurations
        });

        const updatedIPStock = await IPStock.findByIdAndUpdate(
            ipStockId,
            updateData,
            { new: true, runValidators: true }
        ).lean();

        console.log('[IPSTOCK-ID][PUT] IPStock updated:', updatedIPStock ? {
            _id: updatedIPStock._id,
            name: updatedIPStock.name,
            tags: updatedIPStock.tags,
            serverType: updatedIPStock.serverType,
            available: updatedIPStock.available
        } : 'null');

        if (!updatedIPStock) {
            console.log('[IPSTOCK-ID][PUT] IPStock not found for update');
            return NextResponse.json({ message: 'IP Stock not found' }, { status: 404 });
        }

        console.log('[IPSTOCK-ID][PUT] Returning updated IPStock data');
        return NextResponse.json(updatedIPStock);
    } catch (error) {
        console.error('[IPSTOCK-ID][PUT] === ERROR ===');
        console.error('[IPSTOCK-ID][PUT] Error type:', error.constructor.name);
        console.error('[IPSTOCK-ID][PUT] Error message:', error.message);
        console.error('[IPSTOCK-ID][PUT] Error stack:', error.stack);
        return NextResponse.json(
            { message: 'Failed to update IP Stock', error: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(request, { params }) {
    console.log('[IPSTOCK-ID][DELETE] === REQUEST START ===');
    console.log('[IPSTOCK-ID][DELETE] Params:', params);

    try {
        await connectDB();
        console.log('[IPSTOCK-ID][DELETE] Database connected successfully');

        const ipStockId = params.id;
        console.log('[IPSTOCK-ID][DELETE] Deleting IPStock for ID:', ipStockId);

        if (!ipStockId) {
            console.log('[IPSTOCK-ID][DELETE] No IPStock ID provided');
            return NextResponse.json({ message: 'IPStock ID is required' }, { status: 400 });
        }

        const deletedIPStock = await IPStock.findByIdAndDelete(ipStockId).lean();
        console.log('[IPSTOCK-ID][DELETE] IPStock deleted:', deletedIPStock ? {
            _id: deletedIPStock._id,
            name: deletedIPStock.name
        } : 'null');

        if (!deletedIPStock) {
            console.log('[IPSTOCK-ID][DELETE] IPStock not found for deletion');
            return NextResponse.json({ message: 'IP Stock not found' }, { status: 404 });
        }

        console.log('[IPSTOCK-ID][DELETE] IPStock successfully deleted');
        return NextResponse.json({
            message: 'IP Stock deleted successfully',
            deletedIPStock: {
                _id: deletedIPStock._id,
                name: deletedIPStock.name
            }
        });
    } catch (error) {
        console.error('[IPSTOCK-ID][DELETE] === ERROR ===');
        console.error('[IPSTOCK-ID][DELETE] Error type:', error.constructor.name);
        console.error('[IPSTOCK-ID][DELETE] Error message:', error.message);
        console.error('[IPSTOCK-ID][DELETE] Error stack:', error.stack);
        return NextResponse.json(
            { message: 'Failed to delete IP Stock', error: error.message },
            { status: 500 }
        );
    }
}
