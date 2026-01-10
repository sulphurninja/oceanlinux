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
     * Deduct amount from reseller wallet for an order
     * @param {string} resellerId 
     * @param {number} amount 
     * @param {string} orderId 
     * @param {string} description 
     * @returns {Promise<{success: boolean, transactionId: string, newBalance: number, error?: string}>}
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

            // Update order to mark as deducted
            if (orderId) {
                await Order.findByIdAndUpdate(orderId, {
                    'walletDeduction.deducted': true,
                    'walletDeduction.amount': amount,
                    'walletDeduction.timestamp': new Date(),
                    'walletDeduction.transactionId': transaction._id
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
                transactionId: reseller.wallet.transactions[reseller.wallet.transactions.length - 1]._id
            };

        } catch (error) {
            await session.abortTransaction();
            console.error('Wallet deduction failed:', error);
            return {
                success: false,
                error: error.message
            };
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

            reseller.stats.totalRecharge += amount;
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
