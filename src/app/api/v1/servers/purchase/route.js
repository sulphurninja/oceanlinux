import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { validateAPIKey } from '@/lib/api-utils';
import User from '@/models/userModel';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import userWalletService from '@/services/userWalletService';

export async function POST(request) {
    try {
        await connectDB();

        const authResult = await validateAPIKey(request);
        if (!authResult.success) {
            return NextResponse.json(
                { error: authResult.message },
                { status: 401 }
            );
        }

        const { user, permissions } = authResult;

        if (!permissions.includes('servers:write')) {
            return NextResponse.json(
                { error: 'Insufficient permissions for server purchase' },
                { status: 403 }
            );
        }

        const { serverId, duration, specifications } = await request.json();

        if (!serverId || !duration) {
            return NextResponse.json(
                { error: 'Server ID and duration are required' },
                { status: 400 }
            );
        }

        const server = await IPStock.findById(serverId);
        if (!server || !server.available) {
            return NextResponse.json(
                { error: 'Server not available' },
                { status: 404 }
            );
        }

        const pricePerMonth = server.price;
        const durationMonths = parseInt(duration);
        const totalCost = pricePerMonth * durationMonths;

        let discount = 0;
        if (durationMonths >= 12) {
            discount = totalCost * 0.15;
        } else if (durationMonths >= 6) {
            discount = totalCost * 0.10;
        } else if (durationMonths >= 3) {
            discount = totalCost * 0.05;
        }

        const finalAmount = Math.round(totalCost - discount);

        // Pre-flight balance check so we can return a clean 400 instead of
        // a 500 from the wallet service. Note this is best-effort — the
        // atomic guard inside `userWalletService.debit` is the source of
        // truth and will still race-protect us.
        const balance = await userWalletService.getBalance(user._id);
        if (balance < finalAmount) {
            return NextResponse.json(
                {
                    error: 'Insufficient wallet balance',
                    required: finalAmount,
                    available: balance,
                },
                { status: 400 }
            );
        }

        const order = new Order({
            user: user._id,
            productName: `${server.location} - ${server.specs.ram} RAM, ${server.specs.cpu} CPU`,
            price: finalAmount,
            originalPrice: totalCost,
            discount: discount,
            type: 'server',
            status: 'confirmed',
            paymentMethod: 'wallet',
            duration: durationMonths,
            serverId: server._id,
            serverDetails: {
                ip: server.ip,
                location: server.location,
                specs: server.specs,
                os: specifications?.os || 'Ubuntu 22.04'
            },
            metadata: {
                purchasedViaAPI: true,
                apiKey: request.headers.get('authorization')?.split(' ')[1]?.substring(0, 8) + '...',
                specifications
            }
        });

        await order.save();

        let debitResult;
        try {
            debitResult = await userWalletService.debit(user._id, finalAmount, {
                description: `Server purchase - ${server.location}`,
                reference: order._id.toString(),
                metadata: {
                    orderId: order._id,
                    serverId: server._id,
                    duration: durationMonths,
                },
            });
        } catch (err) {
            // Roll back the order so we don't leak a confirmed order with
            // no payment behind it.
            await Order.findByIdAndDelete(order._id).catch(() => {});
            return NextResponse.json(
                { error: 'Wallet debit failed', message: err.message },
                { status: 400 }
            );
        }

        server.available = false;
        server.assignedTo = user._id;
        await server.save();

        await User.findByIdAndUpdate(user._id, {
            $inc: { 'apiSettings.currentMonthUsage': 1 }
        });

        return NextResponse.json({
            success: true,
            message: 'Server purchased successfully',
            order: {
                id: order._id,
                productName: order.productName,
                amount: finalAmount,
                originalAmount: totalCost,
                discount: discount,
                duration: durationMonths,
                server: {
                    ip: server.ip,
                    location: server.location,
                    specs: server.specs
                },
                status: order.status,
                estimatedDeployment: '5-10 minutes'
            },
            wallet: {
                previousBalance: debitResult.balanceBefore,
                newBalance: debitResult.balanceAfter,
                transactionId: debitResult.walletTxnId,
            }
        });

    } catch (error) {
        console.error('Error purchasing server:', error);
        return NextResponse.json(
            { error: 'Internal server error', message: error.message },
            { status: 500 }
        );
    }
}
