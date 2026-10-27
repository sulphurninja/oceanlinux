'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import PageLoader from '@/components/dashboard/DashboardPageSkeleton';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    ArrowUpRight,
    ArrowDownRight,
    Lock,
    Activity,
    Store,
    Terminal,
    Zap,
    CheckCircle2,
    Clock,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { dashboardFetch } from '@/lib/dashboardFetch';
import { getResellerApiBaseUrl } from '@/lib/publicAppUrl';
import { readDashboardCache, writeDashboardCache, DASHBOARD_CACHE_KEYS } from '@/lib/dashboardCache';
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
    user?: {
        name?: string;
        email?: string;
    };
    reseller: {
        businessName?: string;
        email?: string;
        status?: 'active' | 'suspended' | 'pending';
        isVerified?: boolean;
        wallet: {
            balance: number;
            creditLimit: number;
            minBalance?: number;
            transactions: Transaction[];
        };
        stats: {
            totalSpent: number;
            totalOrders: number;
            totalRecharge?: number;
        };
        apiUsage?: {
            requestCount?: number;
            rateLimit?: number;
            lastRequest?: string;
        };
        apiKey: string;
        apiSecret?: string;
    };
    walletTransactions?: Transaction[];
    recentOrders?: ResellerOrderSummary[];
    transactionHistoryDays?: number;
}

const TXN_HISTORY_DAYS = 50;
const QUICK_RECHARGE_AMOUNTS = [500, 1000, 2000, 5000, 10000];

const RECHARGE_STATUS_STYLE: Record<
    string,
    { label: string; icon: React.ElementType; badge: string; iconBox: string }
> = {
    pending_payment: {
        label: 'Payment pending',
        icon: Clock,
        badge: 'border-amber-500/30 text-amber-700 bg-amber-500/10 dark:text-amber-200',
        iconBox: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
    },
    awaiting_approval: {
        label: 'Approval pending',
        icon: Clock,
        badge: 'border-sky-500/30 text-sky-700 bg-sky-500/10 dark:text-sky-200',
        iconBox: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
    },
    processing: {
        label: 'Processing',
        icon: Loader2,
        badge: 'border-sky-500/30 text-sky-700 bg-sky-500/10 dark:text-sky-200',
        iconBox: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
    },
    confirmed: {
        label: 'Credited',
        icon: CheckCircle2,
        badge: 'border-emerald-500/30 text-emerald-700 bg-emerald-500/10 dark:text-emerald-200',
        iconBox: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    },
    rejected: {
        label: 'Rejected',
        icon: XCircle,
        badge: 'border-red-500/30 text-red-700 bg-red-500/10 dark:text-red-300',
        iconBox: 'bg-red-500/15 text-red-600 dark:text-red-300',
    },
    failed: {
        label: 'Failed',
        icon: XCircle,
        badge: 'border-red-500/30 text-red-700 bg-red-500/10 dark:text-red-300',
        iconBox: 'bg-red-500/15 text-red-600 dark:text-red-300',
    },
    expired: {
        label: 'Expired',
        icon: XCircle,
        badge: 'border-gray-500/30 text-gray-600 bg-gray-500/10 dark:text-gray-300',
        iconBox: 'bg-gray-500/15 text-gray-500 dark:text-gray-300',
    },
};

interface RechargeConfig {
    provider: string;
    paytmConnected: boolean;
    kwikUpiConnected: boolean;
    vyaparConnected?: boolean;
    paytmDisplayName: string;
    kwikUpiDisplayName: string;
    vyaparDisplayName?: string;
    minAmount: number;
    maxAmount: number;
}

function isRechargeProviderConnected(config: RechargeConfig | null) {
    return !!(config?.vyaparConnected || config?.paytmConnected || config?.kwikUpiConnected);
}

interface ActiveRechargeRequest {
    _id: string;
    amount: number;
    clientTxnId: string;
    status: string;
    upiVpa?: string;
    payeeName?: string;
    qrImageUrl?: string;
    paymentUrl?: string;
    newBalance?: number;
}

interface RechargeHistoryItem {
    _id: string;
    amount: number;
    method: string;
    status: string;
    clientTxnId: string;
    transactionId?: string;
    payeeName?: string;
    failureReason?: string;
    rejectionReason?: string;
    creditedAt?: string;
    createdAt: string;
}
const softCard = 'premium-dashboard-card border-0';
const statIconBox = 'premium-dashboard-stat-icon';

export default function ResellerWalletPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<ResellerInfo | null>(null);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
    const [showSecret, setShowSecret] = useState(false);
    const [rechargeOpen, setRechargeOpen] = useState(false);
    const [rechargeConfig, setRechargeConfig] = useState<RechargeConfig | null>(null);
    const [rechargeAmount, setRechargeAmount] = useState('1000');
    const [rechargeSubmitting, setRechargeSubmitting] = useState(false);
    const [activeRecharge, setActiveRecharge] = useState<ActiveRechargeRequest | null>(null);
    const [paytmPolling, setPaytmPolling] = useState(false);
    const [rechargeHistory, setRechargeHistory] = useState<RechargeHistoryItem[]>([]);
    const resellerApiBaseUrl = getResellerApiBaseUrl();

    const formatINR = useMemo(
        () =>
            new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0,
            }).format,
        [],
    );

    useLayoutEffect(() => {
        const cached = readDashboardCache(DASHBOARD_CACHE_KEYS.resellerInfo) as ResellerInfo | null;
        if (cached) {
            setData(cached);
            setLoading(false);
            void fetchWalletData(true);
            void fetchRechargeHistory();
            return;
        }
        fetchWalletData();
        void fetchRechargeHistory();
    }, []);

    useEffect(() => {
        if (!rechargeOpen) return;
        void fetchRechargeConfig();
    }, [rechargeOpen]);

    useEffect(() => {
        if (!activeRecharge || activeRecharge.status === 'confirmed' || paytmPolling) return;

        let cancelled = false;
        let attempts = 0;
        setPaytmPolling(true);

        const poll = async () => {
            if (cancelled || attempts >= 45) {
                setPaytmPolling(false);
                return;
            }
            attempts += 1;
            try {
                const res = await dashboardFetch(`/api/reseller/wallet/recharge/${activeRecharge._id}`, {
                    method: 'POST',
                });
                const body = await res.json();
                if (body.success && body.status === 'confirmed') {
                    toast.success(`₹${activeRecharge.amount.toLocaleString('en-IN')} added to wallet!`);
                    setActiveRecharge({
                        ...activeRecharge,
                        status: 'confirmed',
                        newBalance: body.newBalance,
                    });
                    setPaytmPolling(false);
                    await fetchWalletData(true);
                    void fetchRechargeHistory();
                    return;
                }
            } catch {
                /* keep polling */
            }
            setTimeout(poll, 4000);
        };

        const timer = setTimeout(poll, 3000);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            setPaytmPolling(false);
        };
    }, [activeRecharge?._id]);

    // Show success popup, then auto-close and return to wallet dashboard
    useEffect(() => {
        if (!rechargeOpen || activeRecharge?.status !== 'confirmed') return;

        const timer = setTimeout(() => {
            setRechargeOpen(false);
            resetRechargeDialog();
        }, 2500);

        return () => clearTimeout(timer);
    }, [rechargeOpen, activeRecharge?.status]);

    const fetchRechargeConfig = async () => {
        try {
            const res = await dashboardFetch('/api/reseller/wallet/recharge/config');
            const body = await res.json();
            if (body.success) {
                setRechargeConfig(body.config);
            }
        } catch {
            toast.error('Could not load recharge options');
        }
    };

    const fetchRechargeHistory = async () => {
        try {
            const res = await dashboardFetch('/api/reseller/wallet/recharge/list?limit=50');
            const body = await res.json();
            if (body.success) {
                setRechargeHistory(body.items || []);
            }
        } catch {
            // silent — history optional hai
        }
    };

    const resetRechargeDialog = () => {
        setActiveRecharge(null);
        setRechargeAmount('1000');
        setPaytmPolling(false);
    };

    const startRecharge = async () => {
        const connected = isRechargeProviderConnected(rechargeConfig);
        if (!connected) {
            toast.error('Payment provider is not connected yet. Contact admin.');
            return;
        }

        const amount = Number(rechargeAmount);
        const min = rechargeConfig?.minAmount ?? 100;
        const max = rechargeConfig?.maxAmount ?? 100000;
        if (!Number.isFinite(amount) || amount < min || amount > max) {
            toast.error(`Amount must be between ₹${min} and ₹${max}`);
            return;
        }

        setRechargeSubmitting(true);
        try {
            const res = await dashboardFetch('/api/reseller/wallet/recharge/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount }),
            });
            const body = await res.json();
            if (!res.ok || !body.success) {
                throw new Error(body.message || 'Failed to start recharge');
            }

            setActiveRecharge(body.request as ActiveRechargeRequest);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Recharge failed');
        } finally {
            setRechargeSubmitting(false);
        }
    };

    const fetchWalletData = async (silent = false) => {
        try {
            if (!silent) {
                const liteRes = await dashboardFetch('/api/user/reseller-info?lite=1');
                const liteBody = await liteRes.json();
                if (liteBody.success) {
                    setData((current) => current || liteBody.data);
                    setLoading(false);
                }
            }

            const res = await dashboardFetch('/api/user/reseller-info');
            const responseData = await res.json();

            if (responseData.success) {
                writeDashboardCache(DASHBOARD_CACHE_KEYS.resellerInfo, responseData.data);
                setData(responseData.data);
            } else if (!silent) {
                toast.error('Failed to load wallet data');
            }
        } catch (error) {
            console.error('Error:', error);
            if (!silent) toast.error('Error loading data');
        } finally {
            if (!silent) setLoading(false);
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
        return <PageLoader />;
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
    const creditLimit = reseller.wallet.creditLimit || 0;
    const creditAvailable = reseller.wallet.balance + creditLimit;
    const minBalance = reseller.wallet.minBalance || 0;
    const lowBalance = minBalance > 0 && reseller.wallet.balance < minBalance;
    const status = reseller.status || 'active';
    const businessName = reseller.businessName || data.user?.name || 'Reseller Account';
    const apiRequests = reseller.apiUsage?.requestCount || 0;
    const rateLimit = reseller.apiUsage?.rateLimit || 100;
    const balancePercent = Math.min(
        100,
        creditAvailable > 0 ? (reseller.wallet.balance / creditAvailable) * 100 : 0,
    );

    const curlSnippet = `curl -X POST ${resellerApiBaseUrl}/orders \\
  -H "x-api-key: ${reseller.apiKey || 'YOUR_API_KEY'}" \\
  -H "x-api-secret: YOUR_API_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"productId":"<id>","memoryOption":"4GB","months":1}'`;

    return (
        <div className="premium-dashboard-page">
            <div className="premium-dashboard-page-inner space-y-5">
                <section className="premium-reseller-hero p-4 sm:p-6">
                    <div className="premium-reseller-hero-grid" />

                    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="premium-reseller-eyebrow">Reseller Console</span>
                                <span
                                    className={cn(
                                        'premium-reseller-chip',
                                        status === 'active' &&
                                            'border-emerald-500/30 bg-emerald-500/12',
                                        status === 'suspended' &&
                                            '!border-red-500/30 !bg-red-500/12 !text-red-700 dark:!text-red-300',
                                        status === 'pending' &&
                                            '!border-amber-500/30 !bg-amber-500/12 !text-amber-800 dark:!text-amber-200',
                                    )}
                                >
                                    {status === 'active' ? (
                                        <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                        <Clock className="h-3 w-3" />
                                    )}
                                    <span className="capitalize">{status}</span>
                                </span>
                                {reseller.isVerified && (
                                    <span className="premium-reseller-chip">
                                        <ShieldCheck className="h-3 w-3" />
                                        Verified
                                    </span>
                                )}
                            </div>

                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold premium-dashboard-title truncate">
                                    {businessName}
                                </h1>
                                <p className="text-sm premium-dashboard-subtitle mt-0.5 truncate">
                                    {reseller.email || data.user?.email || 'Wallet, API keys and order history'}
                                </p>
                            </div>

                            <div className="pt-1">
                                <p className="premium-reseller-eyebrow flex items-center gap-1.5">
                                    <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                                    Available balance
                                </p>
                                <div className="premium-wallet-balance-title flex items-center gap-1 text-3xl sm:text-4xl lg:text-5xl font-bold premium-dashboard-title mt-1">
                                    <IndianRupee className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-emerald-600 dark:text-emerald-300" />
                                    {reseller.wallet.balance.toLocaleString('en-IN')}
                                </div>
                                <div className="mt-3 max-w-sm">
                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 dark:from-emerald-500 dark:to-emerald-300 transition-all"
                                            style={{ width: `${balancePercent}%` }}
                                        />
                                    </div>
                                    <p className="text-[11px] premium-dashboard-subtitle mt-1.5">
                                        Total spendable{' '}
                                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                            {formatINR(creditAvailable)}
                                        </span>{' '}
                                        (includes {formatINR(creditLimit)} credit line)
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:flex-col lg:w-52 shrink-0">
                            <Button
                                size="sm"
                                className="premium-btn-primary border-0 flex-1 lg:flex-none lg:w-full"
                                onClick={() => {
                                    resetRechargeDialog();
                                    setRechargeOpen(true);
                                }}
                            >
                                <CreditCard className="h-4 w-4 mr-2" />
                                Add Funds
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="premium-btn-outline flex-1 lg:flex-none lg:w-full"
                            >
                                <Link href="/dashboard/ipStock">
                                    <Store className="h-4 w-4 mr-2" />
                                    Browse Plans
                                </Link>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="premium-btn-outline flex-1 lg:flex-none lg:w-full"
                            >
                                <Link href="/dashboard/reseller-api-docs">
                                    <BookOpen className="h-4 w-4 mr-2" />
                                    API Docs
                                </Link>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={refresh}
                                disabled={refreshing}
                                className="premium-btn-outline flex-1 lg:flex-none lg:w-full"
                            >
                                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </section>

                {lowBalance && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-100">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
                        <p>
                            Balance is below your recommended minimum of {formatINR(minBalance)}. Top up soon to
                            avoid failed API orders.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatTile
                        icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />}
                        label="Credit line"
                        value={formatINR(creditLimit)}
                        sub="Overdraft allowance"
                    />
                    <StatTile
                        icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                        label="Total spent"
                        value={formatINR(reseller.stats.totalSpent)}
                        sub="Lifetime purchases"
                    />
                    <StatTile
                        icon={<ShoppingBag className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />}
                        label="Orders"
                        value={reseller.stats.totalOrders.toLocaleString('en-IN')}
                        sub="All time"
                    />
                    <StatTile
                        icon={<Activity className="h-3.5 w-3.5 text-violet-500 dark:text-violet-300" />}
                        label="API calls"
                        value={apiRequests.toLocaleString('en-IN')}
                        sub={`${rateLimit} req/min limit`}
                    />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                    <Card className={cn(softCard, 'xl:col-span-3')}>
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <CardTitle className="text-base sm:text-lg flex items-center gap-2 premium-dashboard-title">
                                        <Key className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                        API Credentials
                                    </CardTitle>
                                    <CardDescription className="premium-dashboard-subtitle mt-1">
                                        Send these as headers on every reseller API request
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
                                label="Base URL"
                                value={resellerApiBaseUrl}
                                headerName="endpoint"
                                onCopy={() => copyText('Base URL', resellerApiBaseUrl)}
                            />
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
                                    Never share your API Secret publicly. Use the eye icon to reveal it, then copy.
                                    If compromised, contact support to regenerate.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={cn(softCard, 'xl:col-span-2')}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base sm:text-lg flex items-center gap-2 premium-dashboard-title">
                                <Terminal className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                Quick start
                            </CardTitle>
                            <CardDescription className="premium-dashboard-subtitle mt-1">
                                Place your first order in one request
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <pre className="premium-reseller-code whitespace-pre">{curlSnippet}</pre>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="premium-btn-outline"
                                    onClick={() => copyText('cURL snippet', curlSnippet)}
                                >
                                    <Copy className="h-3.5 w-3.5 mr-2" />
                                    Copy cURL
                                </Button>
                                <Button variant="outline" size="sm" asChild className="premium-btn-outline">
                                    <Link href="/dashboard/reseller-api-docs">
                                        <BookOpen className="h-3.5 w-3.5 mr-2" />
                                        All endpoints
                                    </Link>
                                </Button>
                            </div>
                            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-100">
                                <Zap className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-300" />
                                <p>
                                    Your custom reseller rates apply automatically on every API order — no promo
                                    codes needed.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>


                <Tabs defaultValue="transactions" className="space-y-4 premium-dashboard-tabs">
                    <TabsList className="grid w-full grid-cols-3 premium-profile-tabs-list">
                        <TabsTrigger value="transactions" className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Transactions
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                                {walletTransactions.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="recharges" className="flex items-center gap-2">
                            <Wallet className="h-4 w-4" />
                            Recharges
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                                {rechargeHistory.length}
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

                    <TabsContent value="recharges">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Recharge History
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    All recharge requests — pending, credited, and failed
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {rechargeHistory.length === 0 ? (
                                    <div className="py-10 text-center text-sm premium-dashboard-subtitle">
                                        No recharges yet. Use &quot;Add Funds&quot; above to get started.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {rechargeHistory.map((r) => {
                                            const statusConf = RECHARGE_STATUS_STYLE[r.status] || RECHARGE_STATUS_STYLE.pending_payment;
                                            return (
                                                <div
                                                    key={r._id}
                                                    className="premium-wallet-txn-row w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl border border-border bg-muted/20"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div
                                                            className={cn(
                                                                'h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0',
                                                                statusConf.iconBox,
                                                            )}
                                                        >
                                                            <statusConf.icon className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-medium premium-dashboard-title">
                                                                    Wallet Recharge
                                                                </p>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn('text-[10px] px-1.5 py-0', statusConf.badge)}
                                                                >
                                                                    {statusConf.label}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-[11px] premium-dashboard-subtitle mt-0.5">
                                                                {formatDateTime(r.createdAt)}
                                                                {' · Ref: '}
                                                                <span className="font-mono">{r.clientTxnId}</span>
                                                            </p>
                                                            {(r.failureReason || r.rejectionReason) && (
                                                                <p className="text-[11px] text-red-600 dark:text-red-300 mt-0.5">
                                                                    {r.failureReason || r.rejectionReason}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p
                                                            className={cn(
                                                                'text-sm font-semibold',
                                                                r.status === 'confirmed'
                                                                    ? 'text-emerald-700 dark:text-emerald-300'
                                                                    : 'text-foreground',
                                                            )}
                                                        >
                                                            {r.status === 'confirmed' ? '+' : ''}
                                                            {formatINR(r.amount)}
                                                        </p>
                                                        {r.status === 'confirmed' && r.creditedAt && (
                                                            <p className="text-[11px] premium-dashboard-subtitle">
                                                                Credited {formatDateTime(r.creditedAt)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
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
                                    <div className="py-10 text-center space-y-3">
                                        <Server className="h-8 w-8 mx-auto text-muted-foreground" />
                                        <p className="text-sm premium-dashboard-subtitle">
                                            No orders in the last {historyDays} days
                                        </p>
                                        <Button variant="outline" size="sm" asChild className="premium-btn-outline">
                                            <Link href="/dashboard/reseller-api-docs">
                                                <BookOpen className="h-3.5 w-3.5 mr-2" />
                                                Read the API guide
                                            </Link>
                                        </Button>
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

                <Dialog
                    open={rechargeOpen}
                    onOpenChange={(open) => {
                        setRechargeOpen(open);
                        if (!open) resetRechargeDialog();
                    }}
                >
                    <DialogContent className="max-w-md">
                        {activeRecharge?.status === 'confirmed' ? (
                            <div className="py-6 flex flex-col items-center text-center space-y-5">
                                <div className="relative flex items-center justify-center">
                                    <span className="absolute h-24 w-24 rounded-full bg-emerald-500/15 animate-ping" />
                                    <span className="absolute h-16 w-16 rounded-full bg-emerald-500/20 animate-pulse" />
                                    <div className="relative h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                                        <CheckCircle2 className="h-9 w-9 text-white" strokeWidth={2.5} />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-extrabold text-foreground">Payment Successful!</h2>
                                    <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-300">
                                        + ₹{activeRecharge.amount.toLocaleString('en-IN')}
                                    </p>
                                    {activeRecharge.newBalance != null && (
                                        <p className="text-sm text-muted-foreground">
                                            New balance: <span className="font-semibold text-foreground">₹{activeRecharge.newBalance.toLocaleString('en-IN')}</span>
                                        </p>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground animate-pulse">
                                    Returning to wallet dashboard…
                                </p>
                            </div>
                        ) : (
                            <>
                        <DialogHeader>
                            <DialogTitle>Add Funds to Wallet</DialogTitle>
                            <DialogDescription>
                                Scan the UPI QR code. Your wallet will update automatically once payment is confirmed.
                            </DialogDescription>
                        </DialogHeader>

                        {!activeRecharge ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Amount (₹)</Label>
                                    <Input
                                        type="number"
                                        value={rechargeAmount}
                                        onChange={(e) => setRechargeAmount(e.target.value)}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        {QUICK_RECHARGE_AMOUNTS.map((a) => (
                                            <Button
                                                key={a}
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setRechargeAmount(String(a))}
                                            >
                                                ₹{a.toLocaleString('en-IN')}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <Button
                                    className="w-full"
                                    disabled={rechargeSubmitting || !isRechargeProviderConnected(rechargeConfig)}
                                    onClick={startRecharge}
                                >
                                    {rechargeSubmitting ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <CreditCard className="h-4 w-4 mr-2" />
                                    )}
                                    Continue
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                                    <p className="font-semibold text-lg">
                                        ₹{activeRecharge.amount.toLocaleString('en-IN')}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                                        Ref: {activeRecharge.clientTxnId}
                                    </p>
                                </div>

                                {activeRecharge.qrImageUrl && (
                                    <div className="flex flex-col items-center gap-2">
                                        <img
                                            src={activeRecharge.qrImageUrl}
                                            alt="UPI QR"
                                            className="w-48 h-48 rounded-lg border bg-white p-2"
                                        />
                                        <p className="text-xs text-muted-foreground text-center">
                                            Scan with any UPI app (GPay, PhonePe, or Paytm) to pay
                                        </p>
                                    </div>
                                )}

                                {activeRecharge.status !== 'confirmed' && (
                                    <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-900 dark:text-sky-100">
                                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                        Verifying payment… your wallet will be credited automatically
                                    </div>
                                )}

                                <Button
                                    variant="ghost"
                                    className="w-full"
                                    onClick={() => {
                                        resetRechargeDialog();
                                        setRechargeOpen(false);
                                    }}
                                >
                                    Close
                                </Button>
                            </div>
                        )}
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

function StatTile({
    icon,
    label,
    value,
    sub,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <Card className={softCard}>
            <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                    <div className={statIconBox}>{icon}</div>
                    <p className="premium-dashboard-stat-label">{label}</p>
                </div>
                <p className="premium-dashboard-stat-value">{value}</p>
                {sub && <p className="premium-dashboard-stat-sub">{sub}</p>}
            </CardContent>
        </Card>
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
