import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import Wallet from '@/models/walletModel';

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        let wallet = await Wallet.findOne({ userId }).lean();

        if (!wallet) {
            // Create wallet if doesn't exist
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();

            // Update user with wallet reference
            await User.findByIdAndUpdate(userId, { walletId: wallet._id });
        }

        // Get recent transactions (last 50)
        const recentTransactions = wallet.transactions
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 50);

        return NextResponse.json({
            balance: wallet.balance,
            currency: wallet.currency,
            totalCredits: wallet.totalCredits,
            totalDebits: wallet.totalDebits,
            transactions: recentTransactions,
            isActive: wallet.isActive
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        return NextResponse.json(
            { message: 'Failed to fetch wallet', error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { amount, type, description, reference, metadata, targetUserId } = await request.json();

        if (!amount || !type || !description) {
            return NextResponse.json(
                { message: 'Amount, type, and description are required' },
                { status: 400 }
            );
        }

        if (amount <= 0) {
            return NextResponse.json(
                { message: 'Amount must be positive' },
                { status: 400 }
            );
        }

        // SECURITY: Credit operations require admin role
        const creditOperations = ['credit', 'refund', 'bonus'];
        if (creditOperations.includes(type)) {
            // Check if requesting user is admin
            const requestingUser = await User.findById(userId);
            if (!requestingUser || requestingUser.role !== 'Admin') {
                console.error(`[Wallet] Unauthorized credit attempt by user ${userId}, type: ${type}`);
                return NextResponse.json(
                    { message: 'Admin access required for credit operations' },
                    { status: 403 }
                );
            }
            console.log(`[Wallet] Admin ${userId} performing ${type} operation`);
        }

        // For admin operations on other users, use targetUserId; otherwise use requesting user's ID
        const walletUserId = (targetUserId && creditOperations.includes(type)) ? targetUserId : userId;

        let wallet = await Wallet.findOne({ userId: walletUserId });

        if (!wallet) {
            wallet = new Wallet({ userId: walletUserId, balance: 0, transactions: [] });
        }

        const balanceBefore = wallet.balance;
        let balanceAfter = balanceBefore;

        // Calculate new balance based on transaction type
        switch (type) {
            case 'credit':
            case 'refund':
            case 'bonus':
                // Already verified admin above
                balanceAfter = balanceBefore + amount;
                wallet.totalCredits += amount;
                break;
            case 'debit':
                // Users can only debit their own wallet
                if (walletUserId !== userId) {
                    return NextResponse.json(
                        { message: 'Cannot debit another user\'s wallet' },
                        { status: 403 }
                    );
                }
                if (balanceBefore < amount) {
                    return NextResponse.json(
                        { message: 'Insufficient wallet balance' },
                        { status: 400 }
                    );
                }
                balanceAfter = balanceBefore - amount;
                wallet.totalDebits += amount;
                break;
            default:
                return NextResponse.json(
                    { message: 'Invalid transaction type' },
                    { status: 400 }
                );
        }

        // Create transaction record
        const transaction = {
            type,
            amount,
            description,
            reference,
            balanceBefore,
            balanceAfter,
            metadata,
            performedBy: userId // Track who performed the transaction
        };

        wallet.balance = balanceAfter;
        wallet.transactions.push(transaction);

        await wallet.save();

        console.log(`[Wallet] Transaction completed: ${type} ${amount} for user ${walletUserId} by ${userId}`);

        return NextResponse.json({
            message: 'Transaction successful',
            transaction,
            newBalance: balanceAfter
        });
    } catch (error) {
        console.error('Error processing wallet transaction:', error);
        return NextResponse.json(
            { message: 'Failed to process transaction', error: error.message },
            { status: 500 }
        );
    }
}
