// src/app/api/ipstock/update.js
import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import IPStock from '../../../../models/ipStockModel';

export async function PUT(req, res) {
    const reqBody = await req.json();
    const { _id, name, available, memoryOptions, promoCodes } = reqBody;
    
    await connectDB();

    try {
        const updatedStock = await IPStock.findByIdAndUpdate(_id, {
            name,
            available,
            memoryOptions,
            promoCodes
        }, { new: true });

        if (!updatedStock) {
            return NextResponse.json({ message: 'IP Stock not found' });
        }
        return new Response(JSON.stringify(updatedStock), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return NextResponse.json({ message: 'Failed to update IP Stock', error: error.message });
    }
}

// ... existing DELETE method remains the same ...
export async function DELETE(req, res) {
    const reqBody = await req.json();
    const { _id } = reqBody;

    await connectDB();

    try {
        const deletedStock = await IPStock.findByIdAndDelete(_id);
        if (!deletedStock) {
            return NextResponse.json({ message: 'IP Stock not found' });
        }
        return NextResponse.json({ message: 'IP Stock deleted successfully' });
    } catch (error) {
        return NextResponse.json({ message: 'Failed to delete IP Stock', error: error.message });
    }
}