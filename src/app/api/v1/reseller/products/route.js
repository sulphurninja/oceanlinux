import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import { authenticateReseller } from '@/lib/resellerAuth';

export async function GET(request) {
    await connectDB();

    // 1. Authenticate
    const auth = await authenticateReseller(request);
    if (!auth.success) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const { reseller } = auth;

    try {
        // 2. Fetch Products
        // Only fetch available stocks
        const products = await IPStock.find({ available: true });

        // 3. Apply Pricing Logic
        const pricedProducts = products.map(product => {
            const productObj = product.toObject();
            const newMemoryOptions = {};

            if (product.memoryOptions.size > 0) {
                // Iterate over Map (converted to object in .toObject() or manual iteration)
                // Mongoose Maps in toObject become objects usually, but let's be safe
                const options = product.memoryOptions instanceof Map ? Object.fromEntries(product.memoryOptions) : product.memoryOptions;

                for (const [key, details] of Object.entries(options || {})) {
                    // Calculate Reseller Price
                    let resellerPrice = details.price;

                    // 1. Check for Custom Price Override (Granular: productId_memoryKey)
                    // The Map in Mongoose might be a Map or a POJO depending on lean()/toObject()
                    // safe check:
                    let customPrice = null;
                    if (reseller.pricing?.customPrices) {
                        const priceKey = `${product._id}_${key}`;
                        // Handle Map or Object
                        if (reseller.pricing.customPrices instanceof Map) {
                            customPrice = reseller.pricing.customPrices.get(priceKey);
                        } else if (typeof reseller.pricing.customPrices === 'object') {
                            customPrice = reseller.pricing.customPrices[priceKey];
                        }
                    }

                    if (customPrice && Number(customPrice) > 0) {
                        // Use the explicit custom price
                        resellerPrice = Number(customPrice);
                    } else if (reseller.pricing?.globalMarkup?.enabled) {
                        // 2. Fallback to Global Markup
                        const { type, value } = reseller.pricing.globalMarkup;
                        if (type === 'percentage') {
                            resellerPrice = details.price + (details.price * (value / 100));
                        } else if (type === 'fixed') {
                            resellerPrice = details.price + value;
                        }
                    }

                    newMemoryOptions[key] = {
                        ...details,
                        price: Math.ceil(resellerPrice) // Round up to nearest integer
                    };
                }
                productObj.memoryOptions = newMemoryOptions;
            }
            return productObj;
        });

        return NextResponse.json({
            success: true,
            products: pricedProducts,
            currency: reseller.wallet.currency
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}
