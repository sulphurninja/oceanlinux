import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { validateAPIKey } from '@/lib/api-utils';
import Wallet from '@/models/walletModel';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';

export async function POST(request) {
    try {
        await connectDB();

        // Validate API key and get user
        const authResult = await validateAPIKey(request);
        if (!authResult.success) {
            return NextResponse.json(
                { error: authResult.message },
                { status: 401 }
            );
        }

        const { user, permissions } = authResult;

        // Check if user has server purchase permissions
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

        // Get server from IP stock
        const server = await IPStock.findById(serverId);
        if (!server || !server.available) {
            return NextResponse.json(
                { error: 'Server not available' },
                { status: 404 }
            );
        }

        // Calculate total cost based on duration
        const pricePerMonth = server.price;
        const durationMonths = parseInt(duration);
        const totalCost = pricePerMonth * durationMonths;

        // Apply any discounts for longer durations
        let discount = 0;
        if (durationMonths >= 12) {
            discount = totalCost * 0.15; // 15% discount for yearly
        } else if (durationMonths >= 6) {
            discount = totalCost * 0.10; // 10% discount for 6+ months
        } else if (durationMonths >= 3) {
            discount = totalCost * 0.05; // 5% discount for 3+ months
        }

        const finalAmount = totalCost - discount;

        // Check wallet balance
        const wallet = await Wallet.findOne({ userId: user._id });
        if (!wallet || wallet.balance < finalAmount) {
            return NextResponse.json(
                {
                    error: 'Insufficient wallet balance',
                    required: finalAmount,
                    available: wallet?.balance || 0
                },
                { status: 400 }
            );
        }

        // Create order
        const order = new Order({
            user: user._id,
            productName: `${server.location} - ${server.specs.ram} RAM, ${server.specs.cpu} CPU`,
            price: finalAmount,
            originalPrice: totalCost,
            discount: discount,
            type: 'server',
            status: 'confirmed', // Auto-confirm for wallet payments
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

        // Deduct amount from wallet
        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore - finalAmount;

        wallet.balance = balanceAfter;
        wallet.totalDebits += finalAmount;
        wallet.transactions.push({
            type: 'debit',
            amount: finalAmount,
            description: `Server purchase - ${server.location}`,
            reference: order._id.toString(),
            balanceBefore,
            balanceAfter,
            metadata: {
                orderId: order._id,
                serverId: server._id,
                duration: durationMonths
            }
        });

        await wallet.save();

        // Mark server as unavailable
        server.available = false;
        server.assignedTo = user._id;
        await server.save();

        // Update user's API usage
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
                previousBalance: balanceBefore,
                newBalance: balanceAfter,
                transactionId: wallet.transactions[wallet.transactions.length - 1]._id
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
