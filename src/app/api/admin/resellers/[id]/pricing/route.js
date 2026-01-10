import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';

export async function PUT(request, { params }) {
    await connectDB();
    const { id } = params;
    const body = await request.json();

    try {
        const { globalMarkup, customPrices } = body;

        const update = {};
        if (globalMarkup) {
            update['pricing.globalMarkup'] = globalMarkup;
        }

        if (customPrices) {
            update['pricing.customPrices'] = customPrices;
        }

        const reseller = await Reseller.findByIdAndUpdate(
            id,
            { $set: update },
            { new: true }
        ).select('pricing');

        return NextResponse.json({
            success: true,
            pricing: reseller.pricing,
            message: 'Pricing updated successfully'
        });

    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
