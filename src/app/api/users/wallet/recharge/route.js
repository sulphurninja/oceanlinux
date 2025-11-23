import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Wallet from '@/models/walletModel';
import Order from '@/models/orderModel';

export async function POST(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { amount, paymentMethod } = await request.json();

        if (!amount || amount < 100) {
            return NextResponse.json(
                { message: 'Minimum recharge amount is ₹100' },
                { status: 400 }
            );
        }

        if (amount > 100000) {
            return NextResponse.json(
                { message: 'Maximum recharge amount is ₹100,000' },
                { status: 400 }
            );
        }

        // Create a wallet recharge order
        const rechargeOrder = new Order({
            user: userId,
            productName: `Wallet Recharge - ₹${amount}`,
            price: amount,
            type: 'wallet_recharge',
            status: 'pending',
            paymentMethod: paymentMethod || 'cashfree',
            metadata: {
                walletRecharge: true,
                originalAmount: amount
            }
        });

        await rechargeOrder.save();

        // Here you would integrate with payment gateway (Cashfree)
        // For now, we'll simulate the payment process

        const paymentResponse = {
            orderId: rechargeOrder._id,
            amount: amount,
            currency: 'INR',
            // In real implementation, you'd get these from payment gateway
            cashfreeOrderId: `order_${Date.now()}`,
            appId: process.env.CASHFREE_APP_ID
        };

        return NextResponse.json({
            message: 'Recharge order created successfully',
            order: rechargeOrder,
            payment: paymentResponse
        });
    } catch (error) {
        console.error('Error creating recharge order:', error);
        return NextResponse.json(
            { message: 'Failed to create recharge order', error: error.message },
            { status: 500 }
        );
    }
}
