import mongoose from 'mongoose';
import Reseller from '@/models/resellerModel';
import Order from '@/models/orderModel';

class ResellerWalletService {
    /**
     * Deduct amount from reseller wallet for an order
     * @param {string} resellerId 
     * @param {number} amount 
     * @param {string} orderId 
     * @param {string} description 
     * @returns {Promise<{success: boolean, transactionId: string, newBalance: number, error?: string}>}
     */
    async hasSufficientBalance(resellerId, amount) {
        const reseller = await Reseller.findById(resellerId);
        if (!reseller) return false;

        const availableBalance = reseller.wallet.balance + (reseller.wallet.creditLimit || 0);
        return availableBalance >= amount;
    }

    /**
     * Deduct amount from reseller wallet for an order.
     *
     * Throws on failure — callers treat a rejection as "do not provision".
     * Returning a `{ success: false }` object here used to let callers fall
     * through and hand out a free server when the debit never landed.
     *
     * @param {string} resellerId
     * @param {number} amount
     * @param {string} orderId
     * @param {string} description
     * @returns {Promise<{success: true, transactionId: string, newBalance: number}>}
     */
    async deductForOrder(resellerId, amount, orderId, description = 'Order provisioning') {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const reseller = await Reseller.findById(resellerId).session(session);

            if (!reseller) {
                throw new Error('Reseller not found');
            }

            if (reseller.status !== 'active') {
                throw new Error('Reseller account is not active');
            }

            // Check available balance (including credit limit)
            const availableBalance = reseller.wallet.balance + (reseller.wallet.creditLimit || 0);

            if (availableBalance < amount) {
                throw new Error(`Insufficient wallet balance. Available: ₹${availableBalance}, Required: ₹${amount}`);
            }

            // Perform deduction
            const previousBalance = reseller.wallet.balance;
            reseller.wallet.balance -= amount;

            // Create transaction record
            const transaction = {
                type: 'deduction',
                amount: -amount,
                previousBalance,
                newBalance: reseller.wallet.balance,
                orderId: orderId,
                description: description,
                createdAt: new Date()
            };

            reseller.wallet.transactions.push(transaction);

            // Update stats
            reseller.stats.totalSpent += amount;
            reseller.stats.totalOrders += 1;

            await reseller.save({ session });

            const savedTxn = reseller.wallet.transactions[reseller.wallet.transactions.length - 1];

            // Update order to mark as deducted. Use the saved subdocument id —
            // the plain object pushed above often has no _id yet.
            if (orderId && savedTxn?._id) {
                await Order.findByIdAndUpdate(orderId, {
                    'walletDeduction.deducted': true,
                    'walletDeduction.amount': amount,
                    'walletDeduction.timestamp': new Date(),
                    'walletDeduction.transactionId': savedTxn._id
                }, { session });
            }

            await session.commitTransaction();

            // Check for low balance alert (outside transaction)
            if (reseller.wallet.balance < reseller.wallet.minBalance) {
                // TODO: Send low balance email/notification
                console.log(`[LOW BALANCE] Reseller ${reseller.businessName} is below minimum balance`);
            }

            return {
                success: true,
                newBalance: reseller.wallet.balance,
                transactionId: savedTxn?._id
            };

        } catch (error) {
            await session.abortTransaction();
            console.error('Wallet deduction failed:', error);
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Return an order's money to the wallet after the order could not be
     * fulfilled (upstream out of stock, provisioning error, etc.) and reverse
     * the stats the deduction had counted.
     */
    async refundOrder(resellerId, amount, orderId, description = 'Order refund') {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const reseller = await Reseller.findById(resellerId).session(session);
            if (!reseller) throw new Error('Reseller not found');

            const previousBalance = reseller.wallet.balance;
            reseller.wallet.balance += amount;

            reseller.wallet.transactions.push({
                type: 'refund',
                amount,
                previousBalance,
                newBalance: reseller.wallet.balance,
                orderId,
                description,
                createdAt: new Date(),
            });

            reseller.stats.totalSpent = Math.max(0, (reseller.stats.totalSpent || 0) - amount);
            reseller.stats.totalOrders = Math.max(0, (reseller.stats.totalOrders || 0) - 1);

            await reseller.save({ session });

            if (orderId) {
                await Order.findByIdAndUpdate(orderId, {
                    'walletDeduction.refunded': true,
                    'walletDeduction.refundedAmount': amount,
                    'walletDeduction.refundedAt': new Date(),
                }, { session });
            }

            await session.commitTransaction();
            return { success: true, newBalance: reseller.wallet.balance };
        } catch (error) {
            await session.abortTransaction();
            console.error('Wallet refund failed:', error);
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Recharge reseller wallet
     * @param {string} resellerId 
     * @param {number} amount 
     * @param {string} description 
     * @param {Object} metadata 
     * @returns {Promise<{success: boolean, newBalance: number}>}
     */
    async recharge(resellerId, amount, description, metadata = {}) {
        try {
            const reseller = await Reseller.findById(resellerId);
            if (!reseller) throw new Error('Reseller not found');

            const previousBalance = reseller.wallet.balance;
            reseller.wallet.balance += amount;

            reseller.wallet.transactions.push({
                type: 'recharge',
                amount: amount,
                previousBalance,
                newBalance: reseller.wallet.balance,
                description,
                metadata,
                createdAt: new Date()
            });

            reseller.stats.totalRecharge = (reseller.stats.totalRecharge || 0) + amount;
            await reseller.save();

            return {
                success: true,
                newBalance: reseller.wallet.balance
            };
        } catch (error) {
            console.error('Wallet recharge failed:', error);
            throw error;
        }
    }

    /**
     * Admin manual wallet debit (no order linked). Reason shows in transaction history.
     */
    async adminManualDeduct(resellerId, amount, description, metadata = {}) {
        try {
            const reseller = await Reseller.findById(resellerId);
            if (!reseller) throw new Error('Reseller not found');

            if (reseller.status !== 'active') {
                throw new Error('Reseller account is not active');
            }

            const availableBalance = reseller.wallet.balance + (reseller.wallet.creditLimit || 0);
            if (availableBalance < amount) {
                throw new Error(`Insufficient wallet balance. Available: ₹${availableBalance}, Required: ₹${amount}`);
            }

            const previousBalance = reseller.wallet.balance;
            reseller.wallet.balance -= amount;

            reseller.wallet.transactions.push({
                type: 'deduction',
                amount: -amount,
                previousBalance,
                newBalance: reseller.wallet.balance,
                description,
                metadata: { ...metadata, source: 'admin_panel', manual: true },
                createdAt: new Date(),
            });

            reseller.stats.totalSpent += amount;
            await reseller.save();

            return {
                success: true,
                newBalance: reseller.wallet.balance,
            };
        } catch (error) {
            console.error('Admin manual wallet deduct failed:', error);
            throw error;
        }
    }

    /**
     * Deduct for renewal (does not increment totalOrders)
     */
    async deductForRenewal(resellerId, amount, orderId, description = 'Order renewal') {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const reseller = await Reseller.findById(resellerId).session(session);
            if (!reseller) throw new Error('Reseller not found');
            if (reseller.status !== 'active') throw new Error('Reseller account is not active');

            const availableBalance = reseller.wallet.balance + (reseller.wallet.creditLimit || 0);
            if (availableBalance < amount) {
                throw new Error(`Insufficient wallet balance. Available: ₹${availableBalance}, Required: ₹${amount}`);
            }

            const previousBalance = reseller.wallet.balance;
            reseller.wallet.balance -= amount;
            reseller.wallet.transactions.push({
                type: 'deduction',
                amount: -amount,
                previousBalance,
                newBalance: reseller.wallet.balance,
                orderId,
                description,
                createdAt: new Date(),
            });
            reseller.stats.totalSpent += amount;

            await reseller.save({ session });
            await session.commitTransaction();

            return { success: true, newBalance: reseller.wallet.balance };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Get wallet balance and history
     * @param {string} resellerId 
     */
    async getWalletDetails(resellerId) {
        const reseller = await Reseller.findById(resellerId)
            .select('wallet stats businessName status');

        if (!reseller) throw new Error('Reseller not found');

        // Sort transactions by date desc
        const transactions = reseller.wallet.transactions.sort((a, b) => b.createdAt - a.createdAt);

        return {
            balance: reseller.wallet.balance,
            currency: reseller.wallet.currency,
            creditLimit: reseller.wallet.creditLimit,
            transactions: transactions,
            stats: reseller.stats
        };
    }
}

export default new ResellerWalletService();
