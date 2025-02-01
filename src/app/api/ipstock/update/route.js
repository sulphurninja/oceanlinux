// src/app/api/ipstock/update.js
import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';  // Adjust the path as necessary
import IPStock from '../../../../models/ipStockModel';  // Adjust the path as necessary

export async function PUT(req, res) {
    const reqBody = await req.json();
    const { _id, name, available, memoryOptions } = reqBody;
    // console.log(reqBody, 'body')
    await connectDB();

    try {
        const updatedStock = await IPStock.findByIdAndUpdate(_id, {
            name,
            available,
            memoryOptions
        }, { new: true });

        if (!updatedStock) {
            return NextResponse.json({ message: 'IP Stock not found' });
        }
        return new Response(JSON.stringify(updatedStock), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        NextResponse.json({ message: 'Failed to update IP Stock', error: error.message });
    }
}

export async function DELETE(req, res) {
    const { _id } = req.body;

    await connectDB();

    try {
        const deletedStock = await IPStock.findByIdAndDelete(_id);
        if (!deletedStock) {
            return NextResponse.json({ message: 'IP Stock not found' });
        }
        NextResponse.json({ message: 'IP Stock deleted successfully' });
    } catch (error) {
        NextResponse.json({ message: 'Failed to delete IP Stock', error: error.message });
    }
}
