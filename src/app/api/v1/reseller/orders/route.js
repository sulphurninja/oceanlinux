import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import ResellerWalletService from '@/services/resellerWalletService';
import { authenticateReseller } from '@/lib/resellerAuth';

export async function GET(request) {
    await connectDB();
    const auth = await authenticateReseller(request);
    if (!auth.success) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    try {
        const orders = await Order.find({ resellerId: auth.reseller._id })
            .sort({ createdAt: -1 })
            .limit(50);

        return NextResponse.json({ success: true, orders });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    await connectDB();
    const auth = await authenticateReseller(request);
    if (!auth.success) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const { reseller } = auth;

    try {
        const body = await request.json();
        const { productId, memoryOption, userEmail } = body; // Simplified payload

        if (!productId || !memoryOption) {
            return NextResponse.json({ success: false, message: 'Missing product details' }, { status: 400 });
        }

        // 1. Fetch Product & Price
        const product = await IPStock.findOne({ _id: productId });
        if (!product || !product.available) {
            return NextResponse.json({ success: false, message: 'Product unavailable' }, { status: 404 });
        }

        const option = product.memoryOptions.get(memoryOption);
        if (!option) {
            return NextResponse.json({ success: false, message: 'Invalid memory option' }, { status: 400 });
        }

        // 2. Calculate Price
        let finalPrice = option.price;
        if (reseller.pricing?.globalMarkup?.enabled) {
            const { type, value } = reseller.pricing.globalMarkup;
            if (type === 'percentage') {
                finalPrice += (option.price * (value / 100));
            } else if (type === 'fixed') {
                finalPrice += value;
            }
        }
        finalPrice = Math.ceil(finalPrice);

        // 3. Check Wallet Balance & Deduct
        const hasFunds = await ResellerWalletService.hasSufficientBalance(reseller._id, finalPrice);
        if (!hasFunds) {
            return NextResponse.json({ success: false, message: 'Insufficient wallet balance' }, { status: 402 });
        }

        // 4. Create Order (Pending Status)
        const newOrder = await Order.create({
            user: reseller.userId, // Link to the reseller's main user account for now, or we need a way to track "end users" if this was B2B2C completely. 
            // Ideally, we might want to store end-customer info in metadata or a separate customer model.
            // For now, assigning to reseller's user account is safest to avoid breaking schema references.
            resellerId: reseller._id,
            productName: product.name,
            memory: memoryOption,
            price: finalPrice,
            originalPrice: option.price,
            ipStockId: product._id,
            status: 'pending', // Will be active after provisioning
            pricing: {
                basePrice: option.price,
                resellerPrice: finalPrice,
                markup: finalPrice - option.price
            },
            apiMetadata: {
                endUserEmail: userEmail || ''
            }
        });

        // 5. Deduct Wallet
        await ResellerWalletService.deduct(
            reseller._id,
            finalPrice,
            newOrder._id,
            `Order ${newOrder._id} for ${product.name} (${memoryOption})`
        );

        // 6. Provision Service (Mock for now, or trigger real provisioning if simple)
        // In a real flow, this would trigger an async job or call Hostycare API.
        // We'll mark it as active for demonstration of the instant fulfillment promise.
        newOrder.status = 'active';
        await newOrder.save();

        return NextResponse.json({
            success: true,
            message: 'Order created successfully',
            order: newOrder,
            walletBalance: (reseller.wallet.balance - finalPrice)
        });

    } catch (error) {
        console.error('Order creation error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
