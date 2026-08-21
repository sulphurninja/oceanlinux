import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import { enforceAdmin } from '@/lib/apiSecurity';

function toCustomPriceMap(input) {
    const map = {};
    if (!input) return map;
    const entries =
        input instanceof Map
            ? input.entries()
            : Object.entries(typeof input.toObject === 'function' ? input.toObject() : input);
    for (const [key, value] of entries) {
        const n = Number(value);
        if (key && n > 0) map[String(key)] = Math.ceil(n);
    }
    return map;
}

export async function PUT(request, { params }) {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();
    const { id } = await params;
    const body = await request.json();

    try {
        const { globalMarkup, customPrices } = body;

        const reseller = await Reseller.findById(id);
        if (!reseller) {
            return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
        }

        if (!reseller.pricing) reseller.pricing = {};

        if (globalMarkup && typeof globalMarkup === 'object') {
            reseller.pricing.globalMarkup = {
                enabled: !!globalMarkup.enabled,
                type: globalMarkup.type === 'fixed' ? 'fixed' : 'percentage',
                value: Number(globalMarkup.value) || 0,
            };
        }

        if (customPrices !== undefined) {
            reseller.pricing.customPrices = toCustomPriceMap(customPrices);
            reseller.markModified('pricing.customPrices');
        }

        reseller.markModified('pricing');
        await reseller.save();

        const fresh = await Reseller.findById(id).select('pricing');
        const pricing = fresh.toObject({ flattenMaps: true }).pricing;

        return NextResponse.json({
            success: true,
            pricing,
            message: 'Pricing updated successfully',
        });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
