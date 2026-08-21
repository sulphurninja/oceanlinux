import Order from '@/models/orderModel';

export const RESELLER_TXN_HISTORY_DAYS = 50;

const ORDER_SELECT =
    'productName memory price status ipAddress transactionId clientTxnId gatewayOrderId paymentMethod paymentDetails os username password provisioningStatus expiryDate createdAt provider apiMetadata';

export function paymentSourceLabel(txn, order) {
    if (order?.paymentMethod) {
        if (order.paymentMethod === 'reseller_wallet') return 'Reseller Wallet';
        if (order.paymentMethod === 'wallet') return 'Customer Wallet';
        return String(order.paymentMethod);
    }
    if (txn?.metadata?.source === 'admin_panel') return 'Admin Panel (manual recharge)';
    if (txn?.type === 'recharge') return 'Wallet Recharge';
    if (txn?.type === 'deduction') return 'Reseller Wallet';
    if (txn?.type === 'refund') return 'Refund';
    if (txn?.type === 'adjustment') return 'Adjustment';
    return '—';
}

export function mapOrderForTxnDetail(order) {
    if (!order) return null;
    return {
        _id: String(order._id),
        productName: order.productName,
        memory: order.memory,
        price: order.price,
        status: order.status,
        ipAddress: order.ipAddress || '',
        transactionId: order.transactionId || '',
        clientTxnId: order.clientTxnId || '',
        gatewayOrderId: order.gatewayOrderId || '',
        paymentMethod: order.paymentMethod || '',
        os: order.os || '',
        username: order.username || '',
        password: order.password || '',
        provisioningStatus: order.provisioningStatus || '',
        expiryDate: order.expiryDate || null,
        createdAt: order.createdAt,
        provider: order.provider || '',
        endUserEmail: order.apiMetadata?.endUserEmail || '',
    };
}

export function serializeWalletTransactions(reseller, orderById, days = RESELLER_TXN_HISTORY_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return (reseller.wallet?.transactions || [])
        .filter((t) => new Date(t.createdAt) >= cutoff)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((t) => {
            const plain = typeof t.toObject === 'function' ? t.toObject() : t;
            const order = plain.orderId ? orderById.get(String(plain.orderId)) : null;

            return {
                id: String(plain._id),
                type: plain.type,
                amount: plain.amount,
                previousBalance: plain.previousBalance,
                newBalance: plain.newBalance,
                description: plain.description || '',
                metadata: plain.metadata || null,
                createdAt: plain.createdAt,
                orderId: plain.orderId ? String(plain.orderId) : null,
                paymentSource: paymentSourceLabel(plain, order),
                order: mapOrderForTxnDetail(order),
            };
        });
}

export async function fetchEnrichedWalletTransactions(reseller, days = RESELLER_TXN_HISTORY_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const orderIds = (reseller.wallet?.transactions || [])
        .filter((t) => t.orderId && new Date(t.createdAt) >= cutoff)
        .map((t) => t.orderId);

    const linkedOrders = orderIds.length
        ? await Order.find({ _id: { $in: orderIds } }).select(ORDER_SELECT).lean()
        : [];

    const orderById = new Map(linkedOrders.map((o) => [String(o._id), o]));
    return serializeWalletTransactions(reseller, orderById, days);
}
