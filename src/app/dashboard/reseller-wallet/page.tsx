'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Wallet,
    CreditCard,
    Copy,
    RefreshCw,
    AlertCircle,
    Eye,
    EyeOff,
    IndianRupee,
    TrendingDown,
    Key,
    Server,
    ShoppingBag,
    ShieldCheck,
    Loader2,
    BookOpen,
    Mail,
    ArrowUpRight,
    ArrowDownRight,
    Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { dashboardFetch } from '@/lib/dashboardFetch';
import { cn } from '@/lib/utils';

interface ResellerOrderSummary {
    _id: string;
    productName: string;
    memory: string;
    price: number;
    status: string;
    ipAddress?: string;
    transactionId?: string;
    clientTxnId?: string;
    gatewayOrderId?: string;
    paymentMethod?: string;
    os?: string;
    username?: string;
    password?: string;
    provisioningStatus?: string;
    provider?: string;
    endUserEmail?: string;
    expiryDate?: string;
    createdAt: string;
}

interface Transaction {
    id: string;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
    previousBalance?: number;
    newBalance?: number;
    orderId?: string | null;
    paymentSource?: string;
    order?: ResellerOrderSummary | null;
}

interface ResellerInfo {
    reseller: {
        wallet: {
            balance: number;
            creditLimit: number;
            transactions: Transaction[];
        };
        stats: {
            totalSpent: number;
            totalOrders: number;
        };
        apiKey: string;
        apiSecret?: string;
    };
    walletTransactions?: Transaction[];
    recentOrders?: ResellerOrderSummary[];
    transactionHistoryDays?: number;
}

const TXN_HISTORY_DAYS = 50;
const softCard = 'premium-dashboard-card border-0';
const statIconBox = 'premium-dashboard-stat-icon';

export default function ResellerWalletPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<ResellerInfo | null>(null);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
    const [showSecret, setShowSecret] = useState(false);

    const formatINR = useMemo(
        () =>
            new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0,
            }).format,
        [],
    );

    useEffect(() => {
        fetchWalletData();
    }, []);

    const fetchWalletData = async () => {
        try {
            setLoading(true);
            const res = await dashboardFetch('/api/user/reseller-info');
            const responseData = await res.json();

            if (responseData.success) {
                setData(responseData.data);
            } else {
                toast.error('Failed to load wallet data');
            }
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error loading data');
        } finally {
            setLoading(false);
        }
    };

    const refresh = async () => {
        setRefreshing(true);
        await fetchWalletData();
        setRefreshing(false);
    };

    const copyText = (label: string, value?: string | null) => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
    };

    const formatTxnType = (type: string) => {
        switch (type) {
            case 'recharge':
                return 'Funds Added';
            case 'deduction':
                return 'Purchase';
            case 'refund':
                return 'Refund';
            case 'adjustment':
                return 'Adjustment';
            default:
                return type;
        }
    };

    const formatDateTime = (value?: string | null) => {
        if (!value) return '—';
        return new Date(value).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
    };

    const getOrderStatusBadge = (status: string) => {
        const s = status?.toLowerCase() || '';
        if (s === 'active' || s === 'completed' || s === 'provisioned') {
            return 'border-emerald-500/30 text-emerald-700 bg-emerald-500/10 dark:text-emerald-200';
        }
        if (s === 'pending' || s === 'processing') {
            return 'border-amber-500/30 text-amber-700 bg-amber-500/10 dark:text-amber-200';
        }
        if (s === 'failed' || s === 'cancelled' || s === 'expired') {
            return 'border-red-500/30 text-red-700 bg-red-500/10 dark:text-red-300';
        }
        return 'border-border text-muted-foreground bg-muted/40';
    };

    if (loading) {
        return (
            <div className="premium-dashboard-page">
                <div className="flex h-[60vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" />
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="premium-dashboard-page">
                <div className="premium-dashboard-page-inner">
                    <Card className={softCard}>
                        <CardContent className="py-12 text-center">
                            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                            <h2 className="text-xl font-bold premium-dashboard-title">Access Denied</h2>
                            <p className="premium-dashboard-subtitle mt-2">You are not a registered reseller.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    const { reseller } = data;
    const historyDays = data.transactionHistoryDays || TXN_HISTORY_DAYS;
    const walletTransactions = data.walletTransactions || reseller.wallet.transactions || [];
    const recentOrders = data.recentOrders || [];
    const creditAvailable = reseller.wallet.balance + reseller.wallet.creditLimit;

    return (
        <div className="premium-dashboard-page">
            <div className="premium-dashboard-page-inner space-y-5">
                <div className="premium-dashboard-page-header">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold premium-dashboard-title">Reseller Wallet</h1>
                        <p className="text-sm premium-dashboard-subtitle mt-0.5">
                            Balance, API credentials, and transaction history
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={refresh}
                            disabled={refreshing}
                            className="premium-btn-outline"
                        >
                            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" asChild className="premium-btn-outline">
                            <Link href="/dashboard/reseller-api-docs">
                                <BookOpen className="h-4 w-4 mr-2" />
                                API Docs
                            </Link>
                        </Button>
                        <Button size="sm" asChild className="premium-btn-primary border-0">
                            <a href="mailto:support@oceanlinux.com?subject=Reseller Wallet Recharge Request">
                                <Mail className="h-4 w-4 mr-2" />
                                Request Recharge
                            </a>
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                    <Card className={cn('md:col-span-2 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent', softCard)}>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-2 premium-dashboard-subtitle">
                                <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                Available Balance
                            </CardDescription>
                            <CardTitle className="premium-wallet-balance-title text-3xl sm:text-4xl font-bold flex items-center gap-1 premium-dashboard-title">
                                <IndianRupee className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600 dark:text-emerald-300" />
                                {reseller.wallet.balance.toLocaleString('en-IN')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-center gap-3 text-xs premium-dashboard-subtitle">
                                <Badge
                                    variant="outline"
                                    className="gap-1 border-emerald-500/30 text-emerald-700 bg-emerald-500/10 dark:text-emerald-200"
                                >
                                    <ShieldCheck className="h-3 w-3" />
                                    Credit limit {formatINR(reseller.wallet.creditLimit)}
                                </Badge>
                                <span>
                                    Total spendable:{' '}
                                    <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                                        {formatINR(creditAvailable)}
                                    </span>
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 dark:from-emerald-500 dark:to-emerald-300 transition-all"
                                    style={{
                                        width: `${Math.min(100, creditAvailable > 0 ? (reseller.wallet.balance / creditAvailable) * 100 : 0)}%`,
                                    }}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-3">
                        <Card className={softCard}>
                            <CardContent className="p-3.5 sm:p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={statIconBox}>
                                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                                    </div>
                                    <p className="premium-dashboard-stat-label">Spent</p>
                                </div>
                                <p className="premium-dashboard-stat-value">{formatINR(reseller.stats.totalSpent)}</p>
                            </CardContent>
                        </Card>
                        <Card className={softCard}>
                            <CardContent className="p-3.5 sm:p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={statIconBox}>
                                        <ShoppingBag className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
                                    </div>
                                    <p className="premium-dashboard-stat-label">Orders</p>
                                </div>
                                <p className="premium-dashboard-stat-value">
                                    {reseller.stats.totalOrders.toLocaleString('en-IN')}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <Card className={softCard}>
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <CardTitle className="text-base sm:text-lg flex items-center gap-2 premium-dashboard-title">
                                    <Key className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                    API Credentials
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle mt-1">
                                    Use these in your API request headers
                                </CardDescription>
                            </div>
                            <Button variant="outline" size="sm" asChild className="premium-btn-outline shrink-0">
                                <Link href="/dashboard/reseller-api-docs">
                                    View docs
                                    <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <CredentialRow
                            label="API Key"
                            value={reseller.apiKey}
                            headerName="x-api-key"
                            onCopy={() => copyText('API Key', reseller.apiKey)}
                        />
                        <CredentialRow
                            label="API Secret"
                            value={
                                reseller.apiSecret
                                    ? showSecret
                                        ? reseller.apiSecret
                                        : '•'.repeat(Math.min(reseller.apiSecret.length, 28))
                                    : 'Not available — contact support to regenerate'
                            }
                            headerName="x-api-secret"
                            masked={!showSecret || !reseller.apiSecret}
                            hint={
                                reseller.apiSecret
                                    ? 'Keep this private — anyone with this can use your reseller API'
                                    : 'Secret not found on account. Ask admin to regenerate credentials.'
                            }
                            onCopy={
                                reseller.apiSecret
                                    ? () => copyText('API Secret', reseller.apiSecret)
                                    : undefined
                            }
                            onToggleVisibility={
                                reseller.apiSecret
                                    ? () => setShowSecret((prev) => !prev)
                                    : undefined
                            }
                            secretVisible={showSecret}
                        />

                        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-100">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
                            <p>
                                Never share your API Secret publicly. Use the eye icon to reveal it, then copy. If
                                compromised, contact support to regenerate.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Tabs defaultValue="transactions" className="space-y-4 premium-dashboard-tabs">
                    <TabsList className="grid w-full grid-cols-2 premium-profile-tabs-list">
                        <TabsTrigger value="transactions" className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Transactions
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                                {walletTransactions.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="orders" className="flex items-center gap-2">
                            <Server className="h-4 w-4" />
                            API Orders
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                                {recentOrders.length}
                            </Badge>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="transactions">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Recent Transactions
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Last {historyDays} days — tap a row for txn id, IP, and order details
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {walletTransactions.length === 0 ? (
                                    <div className="py-10 text-center text-sm premium-dashboard-subtitle">
                                        No transactions in the last {historyDays} days
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {walletTransactions.map((txn) => {
                                            const credit = txn.amount > 0;
                                            return (
                                                <button
                                                    key={txn.id}
                                                    type="button"
                                                    onClick={() => setSelectedTxn(txn)}
                                                    className="premium-wallet-txn-row w-full text-left flex items-center justify-between gap-3 px-3 py-3 rounded-xl border border-border hover:border-emerald-500/30 transition bg-muted/20 group"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div
                                                            className={cn(
                                                                'h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0',
                                                                credit
                                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                                                    : 'bg-red-500/15 text-red-600 dark:text-red-300',
                                                            )}
                                                        >
                                                            {credit ? (
                                                                <ArrowUpRight className="h-4 w-4" />
                                                            ) : (
                                                                <ArrowDownRight className="h-4 w-4" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-medium truncate premium-dashboard-title">
                                                                    {txn.description || formatTxnType(txn.type)}
                                                                </p>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn(
                                                                        'text-[10px] px-1.5 py-0',
                                                                        credit
                                                                            ? 'border-emerald-500/30 text-emerald-700 bg-emerald-500/10 dark:text-emerald-200'
                                                                            : 'border-red-500/30 text-red-700 bg-red-500/10 dark:text-red-300',
                                                                    )}
                                                                >
                                                                    {formatTxnType(txn.type)}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-[11px] premium-dashboard-subtitle mt-0.5">
                                                                {formatDateTime(txn.createdAt)}
                                                                {txn.paymentSource && <> &middot; {txn.paymentSource}</>}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right premium-wallet-txn-amount shrink-0">
                                                        <p
                                                            className={cn(
                                                                'text-sm font-semibold',
                                                                credit
                                                                    ? 'text-emerald-700 dark:text-emerald-300'
                                                                    : 'text-red-600 dark:text-red-300',
                                                            )}
                                                        >
                                                            {credit ? '+' : '−'}
                                                            {formatINR(Math.abs(txn.amount))}
                                                        </p>
                                                        {txn.newBalance != null && (
                                                            <p className="text-[11px] premium-dashboard-subtitle">
                                                                Bal: {formatINR(txn.newBalance)}
                                                            </p>
                                                        )}
                                                        <Eye className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-300 mt-1 ml-auto transition-colors" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="orders">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Recent API Orders
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Last {historyDays} days — IP and transaction id for each order
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {recentOrders.length === 0 ? (
                                    <div className="py-10 text-center text-sm premium-dashboard-subtitle">
                                        No orders in the last {historyDays} days
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {recentOrders.map((order) => (
                                            <div
                                                key={order._id}
                                                className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl border border-border hover:border-emerald-500/20 transition bg-muted/20"
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 bg-sky-500/15 text-sky-600 dark:text-sky-300">
                                                        <Server className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p
                                                            className="text-sm font-medium truncate premium-dashboard-title"
                                                            title={order.productName}
                                                        >
                                                            {order.productName}
                                                        </p>
                                                        <p className="text-[11px] premium-dashboard-subtitle mt-0.5">
                                                            {formatDateTime(order.createdAt)}
                                                            {order.memory && <> &middot; {order.memory}</>}
                                                        </p>
                                                        <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                                                            {order.clientTxnId || order.transactionId || '—'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 space-y-1">
                                                    <p className="text-sm font-semibold premium-dashboard-title">
                                                        {formatINR(order.price)}
                                                    </p>
                                                    <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                                                        {order.ipAddress || 'Pending'}
                                                    </p>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn('capitalize text-[10px]', getOrderStatusBadge(order.status))}
                                                    >
                                                        {order.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                <Dialog open={!!selectedTxn} onOpenChange={(open) => !open && setSelectedTxn(null)}>
                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto premium-dashboard-dialog premium-dialog-mobile-sheet">
                        <DialogHeader>
                            <DialogTitle className="premium-dashboard-title">Transaction Details</DialogTitle>
                            <DialogDescription className="premium-dashboard-subtitle">
                                Full wallet and order information
                            </DialogDescription>
                        </DialogHeader>
                        {selectedTxn && (
                            <div className="space-y-6 text-sm">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <DetailField
                                        label="Transaction ID"
                                        value={selectedTxn.id}
                                        onCopy={() => copyText('Transaction ID', selectedTxn.id)}
                                    />
                                    <DetailField
                                        label="Date & Time"
                                        value={formatDateTime(selectedTxn.createdAt)}
                                    />
                                    <DetailField label="Type" value={formatTxnType(selectedTxn.type)} />
                                    <DetailField
                                        label="Payment Source"
                                        value={selectedTxn.paymentSource || '—'}
                                    />
                                    <DetailField
                                        label="Amount"
                                        value={`${selectedTxn.amount > 0 ? '+' : ''}${formatINR(Math.abs(selectedTxn.amount))}`}
                                    />
                                    <DetailField
                                        label="Balance After"
                                        value={
                                            selectedTxn.newBalance != null
                                                ? formatINR(selectedTxn.newBalance)
                                                : '—'
                                        }
                                    />
                                </div>

                                <div>
                                    <p className="text-xs font-medium premium-dashboard-stat-label mb-1.5">
                                        Description
                                    </p>
                                    <p className="rounded-xl border border-border bg-muted/30 p-3 premium-dashboard-title">
                                        {selectedTxn.description || '—'}
                                    </p>
                                </div>

                                {selectedTxn.order ? (
                                    <div className="space-y-3 border-t border-border pt-4">
                                        <h4 className="font-semibold premium-dashboard-title flex items-center gap-2">
                                            <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                            Order Details
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <DetailField
                                                label="Order ID"
                                                value={selectedTxn.order._id}
                                                onCopy={() => copyText('Order ID', selectedTxn.order?._id)}
                                            />
                                            <DetailField
                                                label="Client Txn ID"
                                                value={selectedTxn.order.clientTxnId || '—'}
                                                onCopy={() =>
                                                    copyText('Client Txn ID', selectedTxn.order?.clientTxnId)
                                                }
                                            />
                                            <DetailField
                                                label="Transaction ID"
                                                value={selectedTxn.order.transactionId || '—'}
                                                onCopy={() =>
                                                    copyText('Transaction ID', selectedTxn.order?.transactionId)
                                                }
                                            />
                                            <DetailField
                                                label="IP Address"
                                                value={selectedTxn.order.ipAddress || 'Pending'}
                                                onCopy={() => copyText('IP', selectedTxn.order?.ipAddress)}
                                            />
                                            <DetailField label="Product" value={selectedTxn.order.productName} />
                                            <DetailField label="Plan" value={selectedTxn.order.memory || '—'} />
                                            <DetailField label="OS" value={selectedTxn.order.os || '—'} />
                                            <DetailField
                                                label="Rate"
                                                value={formatINR(selectedTxn.order.price)}
                                            />
                                            <DetailField label="Status" value={selectedTxn.order.status} />
                                            <DetailField
                                                label="Provisioning"
                                                value={selectedTxn.order.provisioningStatus || '—'}
                                            />
                                            <DetailField
                                                label="Expiry"
                                                value={
                                                    selectedTxn.order.expiryDate
                                                        ? formatDateTime(selectedTxn.order.expiryDate)
                                                        : '—'
                                                }
                                            />
                                            <DetailField
                                                label="Username"
                                                value={selectedTxn.order.username || '—'}
                                                onCopy={() =>
                                                    copyText('Username', selectedTxn.order?.username)
                                                }
                                            />
                                            <DetailField
                                                label="Password"
                                                value={selectedTxn.order.password || '—'}
                                                onCopy={() =>
                                                    copyText('Password', selectedTxn.order?.password)
                                                }
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <p className="premium-dashboard-subtitle border-t border-border pt-4">
                                        No order linked (wallet recharge or adjustment).
                                    </p>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

function CredentialRow({
    label,
    value,
    headerName,
    onCopy,
    onToggleVisibility,
    secretVisible,
    masked,
    hint,
}: {
    label: string;
    value: string;
    headerName: string;
    onCopy?: () => void;
    onToggleVisibility?: () => void;
    secretVisible?: boolean;
    masked?: boolean;
    hint?: string;
}) {
    return (
        <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-wider premium-dashboard-stat-label">
                    {label}
                </p>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                    {headerName}
                </Badge>
            </div>

            <div className="flex items-center gap-2">
                <p
                    className={cn(
                        'font-mono text-xs sm:text-sm break-all premium-dashboard-title flex-1 min-w-0',
                        masked && 'tracking-widest text-muted-foreground select-none',
                    )}
                >
                    {value}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                    {onToggleVisibility && (
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-lg border-border text-muted-foreground hover:text-foreground"
                            onClick={onToggleVisibility}
                            title={secretVisible ? 'Hide secret' : 'Show secret'}
                            aria-label={secretVisible ? 'Hide secret' : 'Show secret'}
                        >
                            {secretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    )}
                    {onCopy && (
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-lg border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                            onClick={onCopy}
                            title={`Copy ${label}`}
                            aria-label={`Copy ${label}`}
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {hint && (
                <p className="text-[11px] premium-dashboard-subtitle mt-1.5 flex items-center gap-1">
                    {masked && onToggleVisibility && <Lock className="h-3 w-3 shrink-0" />}
                    {hint}
                </p>
            )}
        </div>
    );
}

function DetailField({
    label,
    value,
    onCopy,
}: {
    label: string;
    value: string;
    onCopy?: () => void;
}) {
    return (
        <div>
            <p className="text-xs font-medium premium-dashboard-stat-label mb-1">{label}</p>
            <div className="flex items-center gap-2">
                <p className="font-mono text-xs break-all premium-dashboard-title">{value}</p>
                {onCopy && value && value !== '—' && value !== 'Pending' && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={onCopy}
                    >
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}
