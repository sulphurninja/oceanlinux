'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
    ArrowLeft,
    Wallet,
    CreditCard,
    Activity,
    Save,
    Copy,
    Eye,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useParams } from 'next/navigation';
import {
    getCustomPriceForStockMemory,
    memoryKeysForGroup,
    ramBucket,
    resellerPlanGroup,
    stockCustomStatus,
} from '@/lib/resellerPlanGroups';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

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
    metadata?: Record<string, unknown> | null;
    order?: ResellerOrderSummary | null;
}

const TXN_HISTORY_DAYS = 50;

interface ResellerData {
    _id: string;
    businessName: string;
    email: string;
    phone: string;
    status: string;
    apiKey?: string;
    wallet: {
        balance: number;
        currency: string;
        transactions: Transaction[];
    };
    stats: {
        totalOrders: number;
        totalSpent: number;
        totalRecharge?: number;
    };
    pricing: {
        globalMarkup: {
            enabled: boolean;
            type: string;
            value: number;
        };
        customPrices?: Record<string, number>;
    };
}

type RecentOrder = ResellerOrderSummary;

interface ResellerOption {
    _id: string;
    businessName: string;
    email: string;
}

interface IPStock {
    _id: string;
    name: string;
    tags?: string[];
    company?: string | null;
    serverType?: string;
    memoryOptions: Record<string, { price: number }>;
    defaultConfigurations?: Record<string, unknown>;
    netbayUseLiveStockApi?: boolean;
}

export default function ResellerDetailsPage() {
    const params = useParams();
    const [reseller, setReseller] = useState<ResellerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [rechargeAmount, setRechargeAmount] = useState('');

    // Pricing state
    const [pricing, setPricing] = useState({
        enabled: false,
        type: 'percentage',
        value: 0
    });
    const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
    const [slotStocks, setSlotStocks] = useState<IPStock[]>([]);
    const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
    const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
    const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
    const [planGroup, setPlanGroup] = useState('');
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [bulkRates, setBulkRates] = useState<Record<string, string>>({});
    const [tableGroupFilter, setTableGroupFilter] = useState('all');
    const [rateStatusFilter, setRateStatusFilter] = useState('all');
    const [bulkStatusFilter, setBulkStatusFilter] = useState('all');
    const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
    const [walletTransactions, setWalletTransactions] = useState<Transaction[]>([]);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
    const [allResellers, setAllResellers] = useState<ResellerOption[]>([]);
    const [copySourceId, setCopySourceId] = useState('');
    const [copyLoading, setCopyLoading] = useState(false);
    const [resetPwOpen, setResetPwOpen] = useState(false);
    const [resetPwValue, setResetPwValue] = useState('');
    const [resetPwLoading, setResetPwLoading] = useState(false);

    useEffect(() => {
        fetchResellerDetails();
        fetchIpStocks();
        fetchSlotPackages();
        fetchCompanyNames();
        fetchAllResellers();
    }, []);

    const fetchCompanyNames = async () => {
        try {
            const res = await fetch('/api/admin/companies');
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            const map: Record<string, string> = {};
            for (const c of list) {
                if (c?._id && c?.name) map[String(c._id)] = c.name;
            }
            setCompanyNames(map);
        } catch {
            /* grouping still works from product names */
        }
    };

    const fetchAllResellers = async () => {
        try {
            const res = await fetch('/api/admin/resellers');
            const data = await res.json();
            if (!data.success || !Array.isArray(data.resellers)) return;
            setAllResellers(
                data.resellers.map((r: ResellerOption) => ({
                    _id: String(r._id),
                    businessName: r.businessName,
                    email: r.email,
                }))
            );
        } catch {
            /* copy-from dropdown optional */
        }
    };

    const fetchIpStocks = async () => {
        try {
            const res = await fetch('/api/ipstock?includeHidden=1');
            const data = await res.json();
            // API can return array or object wrapped array, handle safely
            if (Array.isArray(data)) {
                setIpStocks(data);
            } else if (data.products) { // fallback
                setIpStocks(data.products);
            }
        } catch (error) {
            console.error('Failed to fetch stocks', error);
        }
    };

    const fetchSlotPackages = async () => {
        try {
            const res = await fetch('/api/slot-ips');
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            const asStock: IPStock[] = list.map((pkg: { _id: string; name: string; price?: number }) => ({
                _id: pkg._id,
                name: pkg.name,
                serverType: 'SlotIP',
                tags: ['slotip'],
                memoryOptions: {
                    slot: { price: Number(pkg.price) || 0 },
                },
            }));
            setSlotStocks(asStock);
        } catch (error) {
            console.error('Failed to fetch slot IP packages', error);
        }
    };

    const fetchResellerDetails = async () => {
        try {
            const res = await fetch(`/api/admin/resellers/${params.id}`);
            const data = await res.json();
            if (data.success) {
                setReseller(data.reseller);
                setRecentOrders(data.recentOrders || []);
                setWalletTransactions(data.walletTransactions || data.reseller.wallet?.transactions || []);
                if (data.reseller.pricing?.globalMarkup) {
                    setPricing(data.reseller.pricing.globalMarkup);
                }
                const savedCustom = data.reseller.pricing?.customPrices;
                if (savedCustom && typeof savedCustom === 'object') {
                    setCustomPrices(
                        savedCustom instanceof Map
                            ? Object.fromEntries(savedCustom)
                            : { ...savedCustom }
                    );
                    setPriceDrafts({});
                }
            }
        } catch (error) {
            toast.error('Failed to load reseller details');
        } finally {
            setLoading(false);
        }
    };

    const handleRecharge = async () => {
        if (!rechargeAmount) return;

        try {
            const res = await fetch(`/api/admin/resellers/${params.id}/wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'recharge',
                    amount: rechargeAmount,
                    description: 'Manual recharge by admin'
                })
            });

            const data = await res.json();
            if (data.success) {
                toast.success('Wallet recharged successfully');
                setRechargeAmount('');
                fetchResellerDetails();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error('Recharge failed');
        }
    };

    const commitAllPriceDrafts = (base: Record<string, number> = customPrices) => {
        const next = { ...base };
        for (const [priceKey, raw] of Object.entries(priceDrafts)) {
            const trimmed = String(raw).trim();
            if (!trimmed) delete next[priceKey];
            else {
                const val = Number(trimmed);
                if (val > 0) next[priceKey] = Math.ceil(val);
                else delete next[priceKey];
            }
        }
        return next;
    };

    const handlePricingUpdate = async (prices?: Record<string, number>) => {
        const merged = prices ?? commitAllPriceDrafts(customPrices);
        setCustomPrices(merged);
        setPriceDrafts({});
        try {
            const res = await fetch(`/api/admin/resellers/${params.id}/pricing`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    globalMarkup: pricing,
                    customPrices: merged,
                })
            });

            const data = await res.json();
            if (data.success) {
                const saved = data.pricing?.customPrices;
                if (saved && typeof saved === 'object') {
                    setCustomPrices({ ...saved });
                    setPriceDrafts({});
                } else {
                    setCustomPrices(merged);
                }
                toast.success('Pricing saved — API buy will use these custom rates');
                fetchResellerDetails();
            } else {
                toast.error(data.message || 'Failed to update pricing');
            }
        } catch (error) {
            toast.error('Error updating pricing');
        }
    };

    const handleCopyPricingFrom = async () => {
        if (!copySourceId) {
            toast.error('Select a reseller to copy rates from');
            return;
        }
        setCopyLoading(true);
        try {
            const res = await fetch(`/api/admin/resellers/${params.id}/pricing/copy-from`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceResellerId: copySourceId }),
            });
            const data = await res.json();
            if (data.success) {
                const saved = data.pricing?.customPrices;
                if (saved && typeof saved === 'object') {
                    setCustomPrices({ ...saved });
                    setPriceDrafts({});
                }
                toast.success(data.message || 'Custom rates copied');
                fetchResellerDetails();
            } else {
                toast.error(data.message || 'Failed to copy rates');
            }
        } catch {
            toast.error('Failed to copy rates');
        } finally {
            setCopyLoading(false);
        }
    };

    const copySourceOptions = useMemo(
        () => allResellers.filter((r) => r._id !== String(params.id)),
        [allResellers, params.id]
    );

    const stocksWithGroup = useMemo(
        () =>
            [...ipStocks, ...slotStocks].map((stock) => ({
                ...stock,
                planGroup: resellerPlanGroup(stock, companyNames),
            })),
        [ipStocks, slotStocks, companyNames]
    );

    const planGroups = useMemo(() => {
        const set = new Set(stocksWithGroup.map((s) => s.planGroup));
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [stocksWithGroup]);

    const groupProducts = useMemo(
        () => stocksWithGroup.filter((s) => s.planGroup === planGroup),
        [stocksWithGroup, planGroup]
    );

    const groupRamSizes = useMemo(() => memoryKeysForGroup(groupProducts), [groupProducts]);

    const overallCounts = useMemo(() => {
        let set = 0;
        let partial = 0;
        let missing = 0;
        for (const stock of stocksWithGroup) {
            const st = stockCustomStatus(stock, customPrices);
            if (st.status === 'set') set += 1;
            else if (st.status === 'partial') partial += 1;
            else if (st.status === 'missing') missing += 1;
        }
        return { set, partial, missing, total: stocksWithGroup.length };
    }, [stocksWithGroup, customPrices]);

    const visibleGroupProducts = useMemo(() => {
        if (bulkStatusFilter === 'all') return groupProducts;
        if (bulkStatusFilter === 'missing') {
            return groupProducts.filter((stock) => {
                const status = stockCustomStatus(stock, customPrices).status;
                return status === 'missing' || status === 'partial';
            });
        }
        return groupProducts.filter((stock) => stockCustomStatus(stock, customPrices).status === bulkStatusFilter);
    }, [groupProducts, customPrices, bulkStatusFilter]);

    const tablePricingRows = useMemo(() => {
        let stocks = tableGroupFilter === 'all'
            ? stocksWithGroup
            : stocksWithGroup.filter((s) => s.planGroup === tableGroupFilter);

        if (rateStatusFilter === 'partial') {
            stocks = stocks.filter((s) => stockCustomStatus(s, customPrices).status === 'partial');
        }

        const rows: Array<{ stock: (typeof stocksWithGroup)[number]; key: string; details: Record<string, unknown> }> = [];
        for (const stock of stocks) {
            for (const [key, details] of Object.entries(stock.memoryOptions || {})) {
                if ((Number((details as { price?: number })?.price) || 0) <= 0) continue;
                const resolvedCustom = getCustomPriceForStockMemory(stock._id, key, customPrices);
                const hasCustom = Number(resolvedCustom) > 0;
                if (rateStatusFilter === 'missing' && hasCustom) continue;
                if (rateStatusFilter === 'set' && !hasCustom) continue;
                rows.push({ stock, key, details: details as Record<string, unknown> });
            }
        }
        return rows;
    }, [stocksWithGroup, tableGroupFilter, rateStatusFilter, customPrices]);

    useEffect(() => {
        if (!planGroup && planGroups.length) {
            setPlanGroup(planGroups[0]);
        }
    }, [planGroup, planGroups]);

    useEffect(() => {
        setSelectedProductIds(groupProducts.map((s) => String(s._id)));
        setBulkRates({});
    }, [planGroup, groupProducts.map((s) => s._id).join(',')]);

    const applyBulkRates = async (saveAfter: boolean) => {
        const rates: Record<string, number> = {};
        for (const [size, raw] of Object.entries(bulkRates)) {
            const n = Number(raw);
            if (n > 0) rates[size] = Math.ceil(n);
        }
        if (!Object.keys(rates).length) {
            toast.error('Enter at least one RAM rate (e.g. 8GB = 1300)');
            return;
        }
        if (!selectedProductIds.length) {
            toast.error('Select at least one product');
            return;
        }

        const selected = new Set(selectedProductIds);
        const next = { ...customPrices };
        let applied = 0;
        for (const stock of groupProducts) {
            if (!selected.has(String(stock._id))) continue;
            for (const [mem, details] of Object.entries(stock.memoryOptions || {})) {
                if ((Number(details?.price) || 0) <= 0) continue;
                const bucket = ramBucket(mem);
                if (!bucket || !rates[bucket]) continue;
                next[`${stock._id}_${mem}`] = rates[bucket];
                applied += 1;
            }
        }
        if (!applied) {
            toast.error('No matching RAM sizes on the selected products');
            return;
        }
        setCustomPrices(next);
        toast.success(`Applied ${applied} custom rates on ${selectedProductIds.length} products`);
        if (saveAfter) await handlePricingUpdate(next);
    };

    const handleStatusChange = async (newStatus: string) => {
        try {
            const res = await fetch(`/api/admin/resellers/${params.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'updateStatus',
                    status: newStatus
                })
            });

            if (res.ok) {
                toast.success(`Reseller ${newStatus}`);
                fetchResellerDetails();
            }
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleResetPassword = async () => {
        const pwd = resetPwValue.trim();
        if (pwd.length < 6) {
            toast.error('Password kam se kam 6 characters ka hona chahiye');
            return;
        }
        setResetPwLoading(true);
        try {
            const res = await fetch(`/api/admin/resellers/${params.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resetPassword', newPassword: pwd })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Reset failed');
            toast.success(data.message || 'Password reset ho gaya');
            setResetPwOpen(false);
            setResetPwValue('');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Reset failed');
        } finally {
            setResetPwLoading(false);
        }
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
                return 'Purchase / Deduction';
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

    if (loading || !reseller) {
        return <div className="p-6">Loading details...</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/resellers">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{reseller.businessName}</h1>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <span>{reseller.email}</span>
                            <Badge variant={reseller.status === 'active' ? 'default' : 'destructive'}>
                                {reseller.status}
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setResetPwOpen(true)}>Reset Password</Button>
                    {reseller.status === 'active' ? (
                        <Button variant="destructive" onClick={() => handleStatusChange('suspended')}>Suspend Account</Button>
                    ) : (
                        <Button variant="default" onClick={() => handleStatusChange('active')}>Activate Account</Button>
                    )}
                </div>
            </div>

            <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reset Reseller Password</DialogTitle>
                        <DialogDescription>
                            {reseller.email} ka login password change hoga. Reseller ko naya password de dena.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <Label>New password (min 6 characters)</Label>
                            <Input
                                type="text"
                                placeholder="Naya password likho"
                                value={resetPwValue}
                                onChange={(e) => setResetPwValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleResetPassword();
                                    }
                                }}
                            />
                        </div>
                        <Button className="w-full" onClick={handleResetPassword} disabled={resetPwLoading}>
                            {resetPwLoading ? 'Resetting...' : 'Reset Password'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Wallet Overview Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₹{reseller.wallet?.balance?.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {reseller.wallet?.currency} currency
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Added</CardTitle>
                        <Wallet className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">₹{(reseller.stats?.totalRecharge ?? 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Admin recharges</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₹{reseller.stats?.totalSpent?.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Buy + renew via API</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reseller.stats?.totalOrders}</div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="wallet">Wallet Management</TabsTrigger>
                    <TabsTrigger value="pricing">Pricing & Markup</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent API Orders</CardTitle>
                            <CardDescription>Last {TXN_HISTORY_DAYS} days — product, IP, txn id, and status</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date &amp; Time</TableHead>
                                            <TableHead>Product</TableHead>
                                            <TableHead>Plan</TableHead>
                                            <TableHead>IP</TableHead>
                                            <TableHead>Txn ID</TableHead>
                                            <TableHead>Rate</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentOrders.map((order) => (
                                            <TableRow key={order._id}>
                                                <TableCell className="text-muted-foreground whitespace-nowrap">
                                                    {formatDateTime(order.createdAt)}
                                                </TableCell>
                                                <TableCell className="font-medium max-w-[220px] truncate" title={order.productName}>
                                                    {order.productName}
                                                </TableCell>
                                                <TableCell>{order.memory || '—'}</TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {order.ipAddress || 'Pending'}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs max-w-[160px] truncate" title={order.clientTxnId || order.transactionId}>
                                                    {order.clientTxnId || order.transactionId || '—'}
                                                </TableCell>
                                                <TableCell className="font-bold">₹{order.price?.toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{order.status}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {recentOrders.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                                                    No orders in the last {TXN_HISTORY_DAYS} days
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Transactions</CardTitle>
                            <CardDescription>
                                Last {TXN_HISTORY_DAYS} days — click a row for full txn, payment source, and IP details
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date &amp; Time</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Payment Source</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead className="text-right">Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {walletTransactions.map((txn) => (
                                            <TableRow
                                                key={txn.id}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() => setSelectedTxn(txn)}
                                            >
                                                <TableCell className="text-muted-foreground whitespace-nowrap">
                                                    {formatDateTime(txn.createdAt)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={txn.type === 'deduction' ? 'destructive' : 'secondary'}>
                                                        {formatTxnType(txn.type)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="max-w-[280px] truncate" title={txn.description}>
                                                    {txn.description || '—'}
                                                </TableCell>
                                                <TableCell>{txn.paymentSource || '—'}</TableCell>
                                                <TableCell className={`font-bold ${txn.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {txn.amount > 0 ? '+' : ''}₹{Math.abs(txn.amount).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedTxn(txn); }}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {walletTransactions.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                                                    No transactions in the last {TXN_HISTORY_DAYS} days
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <Dialog open={!!selectedTxn} onOpenChange={(open) => !open && setSelectedTxn(null)}>
                        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Transaction Details</DialogTitle>
                                <DialogDescription>
                                    Full wallet transaction and linked order information
                                </DialogDescription>
                            </DialogHeader>
                            {selectedTxn && (
                                <div className="space-y-6 text-sm">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <DetailField label="Transaction ID" value={selectedTxn.id} onCopy={() => copyText('Transaction ID', selectedTxn.id)} />
                                        <DetailField label="Date & Time" value={formatDateTime(selectedTxn.createdAt)} />
                                        <DetailField label="Type" value={formatTxnType(selectedTxn.type)} />
                                        <DetailField label="Payment Source" value={selectedTxn.paymentSource || '—'} />
                                        <DetailField label="Amount" value={`${selectedTxn.amount > 0 ? '+' : ''}₹${Math.abs(selectedTxn.amount).toLocaleString()}`} />
                                        <DetailField label="Balance After" value={selectedTxn.newBalance != null ? `₹${selectedTxn.newBalance.toLocaleString()}` : '—'} />
                                    </div>

                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                                        <p className="rounded-md border bg-muted/30 p-3">{selectedTxn.description || '—'}</p>
                                    </div>

                                    {selectedTxn.order ? (
                                        <div className="space-y-3 border-t pt-4">
                                            <h4 className="font-semibold">Linked Order</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <DetailField label="Order ID" value={selectedTxn.order._id} onCopy={() => copyText('Order ID', selectedTxn.order?._id)} />
                                                <DetailField label="Client Txn ID" value={selectedTxn.order.clientTxnId || '—'} onCopy={() => copyText('Client Txn ID', selectedTxn.order?.clientTxnId)} />
                                                <DetailField label="Transaction ID" value={selectedTxn.order.transactionId || '—'} onCopy={() => copyText('Transaction ID', selectedTxn.order?.transactionId)} />
                                                <DetailField label="Gateway Order ID" value={selectedTxn.order.gatewayOrderId || '—'} onCopy={() => copyText('Gateway Order ID', selectedTxn.order?.gatewayOrderId)} />
                                                <DetailField label="IP Address" value={selectedTxn.order.ipAddress || 'Pending'} onCopy={() => copyText('IP', selectedTxn.order?.ipAddress)} />
                                                <DetailField label="Product" value={selectedTxn.order.productName} />
                                                <DetailField label="Plan / Memory" value={selectedTxn.order.memory || '—'} />
                                                <DetailField label="OS" value={selectedTxn.order.os || '—'} />
                                                <DetailField label="Rate" value={`₹${selectedTxn.order.price?.toLocaleString()}`} />
                                                <DetailField label="Order Status" value={selectedTxn.order.status} />
                                                <DetailField label="Provisioning" value={selectedTxn.order.provisioningStatus || '—'} />
                                                <DetailField label="Provider" value={selectedTxn.order.provider || '—'} />
                                                <DetailField label="End User Email" value={selectedTxn.order.endUserEmail || '—'} />
                                                <DetailField label="Order Date" value={formatDateTime(selectedTxn.order.createdAt)} />
                                                <DetailField label="Expiry" value={selectedTxn.order.expiryDate ? formatDateTime(selectedTxn.order.expiryDate) : '—'} />
                                                <DetailField label="Username" value={selectedTxn.order.username || '—'} onCopy={() => copyText('Username', selectedTxn.order?.username)} />
                                                <DetailField label="Password" value={selectedTxn.order.password || '—'} onCopy={() => copyText('Password', selectedTxn.order?.password)} />
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-muted-foreground border-t pt-4">
                                            No order linked to this transaction (usually a wallet recharge or adjustment).
                                        </p>
                                    )}
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                <TabsContent value="wallet">
                    <Card>
                        <CardHeader>
                            <CardTitle>Add Funds</CardTitle>
                            <CardDescription>Manually recharge this reseller's wallet</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-4 items-end">
                                <div className="space-y-2 flex-1">
                                    <Label>Amount (₹)</Label>
                                    <Input
                                        type="number"
                                        value={rechargeAmount}
                                        onChange={(e) => setRechargeAmount(e.target.value)}
                                        placeholder="Enter amount"
                                    />
                                </div>
                                <Button onClick={handleRecharge}>
                                    <Wallet className="mr-2 h-4 w-4" />
                                    Recharge Wallet
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="pricing">
                    <Card>
                        <CardHeader>
                            <CardTitle>Global Pricing Markup</CardTitle>
                            <CardDescription>Set the base price increase for this reseller</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Enable Global Markup</Label>
                                    <p className="text-xs text-muted-foreground">Apply valid markup to all products</p>
                                </div>
                                <Switch
                                    checked={pricing.enabled}
                                    onCheckedChange={(c) => setPricing({ ...pricing, enabled: c })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Markup Type</Label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                        value={pricing.type}
                                        onChange={(e) => setPricing({ ...pricing, type: e.target.value })}
                                    >
                                        <option value="percentage">Percentage (%)</option>
                                        <option value="fixed">Fixed Amount (₹)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Markup Value</Label>
                                    <Input
                                        type="number"
                                        value={pricing.value}
                                        onChange={(e) => setPricing({ ...pricing, value: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={handlePricingUpdate}>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Pricing
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Copy custom rates from another reseller</CardTitle>
                            <CardDescription>
                                Apply the same Custom Price (₹) set from another seller in one click.
                                Useful when onboarding a new reseller with the same API rates.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                                <div className="space-y-2">
                                    <Label>Copy rates from</Label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={copySourceId}
                                        onChange={(e) => setCopySourceId(e.target.value)}
                                    >
                                        <option value="">Select reseller…</option>
                                        {copySourceOptions.map((r) => (
                                            <option key={r._id} value={r._id}>
                                                {r.businessName} ({r.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <Button
                                    variant="secondary"
                                    disabled={!copySourceId || copyLoading}
                                    onClick={handleCopyPricingFrom}
                                >
                                    <Copy className="mr-2 h-4 w-4" />
                                    {copyLoading ? 'Copying…' : 'Apply same rates'}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This replaces all custom prices on this reseller with the source seller&apos;s rates.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Bulk API rates by plan</CardTitle>
                            <CardDescription>
                                Pick a plan group, set RAM rates once, tick products, then apply.
                                Green = API custom rate set. Red = still using site / markup price.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800">
                                    Set {overallCounts.set}
                                </span>
                                <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">
                                    Partial {overallCounts.partial}
                                </span>
                                <span className="rounded-full bg-rose-100 px-3 py-1 font-medium text-rose-800">
                                    Not set {overallCounts.missing}
                                </span>
                                <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                                    {overallCounts.total} products
                                </span>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Plan group</Label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={planGroup}
                                        onChange={(e) => setPlanGroup(e.target.value)}
                                    >
                                        {planGroups.map((g) => {
                                            const items = stocksWithGroup.filter((s) => s.planGroup === g);
                                            const missing = items.filter((s) => stockCustomStatus(s, customPrices).status !== 'set').length;
                                            const set = items.length - missing;
                                            return (
                                                <option key={g} value={g}>
                                                    {g} — {set} set / {missing} pending ({items.length})
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>

                            {groupRamSizes.length > 0 && (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    {groupRamSizes.map((size) => (
                                        <div key={size} className="space-y-2">
                                            <Label>{size} API rate (₹)</Label>
                                            <Input
                                                type="number"
                                                placeholder="Leave empty = skip"
                                                value={bulkRates[size] || ''}
                                                onChange={(e) =>
                                                    setBulkRates((prev) => ({ ...prev, [size]: e.target.value }))
                                                }
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedProductIds(visibleGroupProducts.map((s) => String(s._id)))}
                                >
                                    Select all
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const missing = groupProducts.filter(
                                            (s) => stockCustomStatus(s, customPrices).status !== 'set'
                                        );
                                        setBulkStatusFilter('all');
                                        setSelectedProductIds(missing.map((s) => String(s._id)));
                                    }}
                                >
                                    Select not set
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedProductIds([])}
                                >
                                    Clear
                                </Button>
                                <select
                                    className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
                                    value={bulkStatusFilter}
                                    onChange={(e) => setBulkStatusFilter(e.target.value)}
                                >
                                    <option value="all">Show all</option>
                                    <option value="missing">Show not set</option>
                                    <option value="partial">Show partial</option>
                                    <option value="set">Show set</option>
                                </select>
                                <span className="text-xs text-muted-foreground">
                                    {selectedProductIds.length} selected
                                </span>
                            </div>

                            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                                {visibleGroupProducts.map((stock) => {
                                    const id = String(stock._id);
                                    const checked = selectedProductIds.includes(id);
                                    const st = stockCustomStatus(stock, customPrices);
                                    const rowClass =
                                        st.status === 'set'
                                            ? 'bg-emerald-50/80'
                                            : st.status === 'partial'
                                                ? 'bg-amber-50/80'
                                                : 'bg-rose-50/50';
                                    return (
                                        <label
                                            key={id}
                                            className={`flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50 ${rowClass}`}
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={(on) => {
                                                    setSelectedProductIds((prev) =>
                                                        on ? [...prev, id] : prev.filter((x) => x !== id)
                                                    );
                                                }}
                                                className="mt-0.5"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium">{stock.name}</span>
                                                    {st.status === 'set' && (
                                                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Set</Badge>
                                                    )}
                                                    {st.status === 'partial' && (
                                                        <Badge className="bg-amber-500 hover:bg-amber-500">Partial</Badge>
                                                    )}
                                                    {st.status === 'missing' && (
                                                        <Badge variant="destructive">Not set</Badge>
                                                    )}
                                                </span>
                                                <span className="mt-1 block text-xs text-muted-foreground">
                                                    {st.setRates.length
                                                        ? `API: ${st.setRates.join(' · ')}`
                                                        : 'No custom API rate'}
                                                    {st.missingKeys.length
                                                        ? ` · Missing: ${st.missingKeys.join(', ')}`
                                                        : ''}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                                {!visibleGroupProducts.length && (
                                    <p className="p-4 text-sm text-muted-foreground">No products in this filter.</p>
                                )}
                            </div>

                            <div className="flex flex-wrap justify-end gap-2">
                                <Button type="button" variant="outline" onClick={() => applyBulkRates(false)}>
                                    Apply to selected
                                </Button>
                                <Button type="button" onClick={() => applyBulkRates(true)}>
                                    <Save className="mr-2 h-4 w-4" />
                                    Apply and save
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Granular Pricing Table */}
                    <Card className="mt-6">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>Product Specific Pricing</CardTitle>
                                <CardDescription>
                                    Set custom prices for specific products. These override the global markup.
                                    Type the full amount, then click Save Pricing — rates are not saved while typing.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
                                    value={tableGroupFilter}
                                    onChange={(e) => setTableGroupFilter(e.target.value)}
                                >
                                    <option value="all">All groups</option>
                                    {planGroups.map((g) => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                                <select
                                    className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
                                    value={rateStatusFilter}
                                    onChange={(e) => setRateStatusFilter(e.target.value)}
                                >
                                    <option value="all">All rates</option>
                                    <option value="missing">Not set</option>
                                    <option value="partial">Partial</option>
                                    <option value="set">Set</option>
                                </select>
                                <Button type="button" onClick={() => handlePricingUpdate()}>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Pricing
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted text-muted-foreground">
                                        <tr>
                                            <th className="p-3 font-medium">Status</th>
                                            <th className="p-3 font-medium">Product Name</th>
                                            <th className="p-3 font-medium">Variant (RAM)</th>
                                            <th className="p-3 font-medium">Base Price</th>
                                            <th className="p-3 font-medium">Global Markup Price</th>
                                            <th className="p-3 font-medium">Custom Price (₹)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tablePricingRows.map(({ stock, key, details }) => {
                                                const priceKey = `${stock._id}_${key}`;
                                                const resolvedCustom = getCustomPriceForStockMemory(
                                                    stock._id,
                                                    key,
                                                    customPrices
                                                );
                                                const hasCustom = Number(resolvedCustom) > 0;
                                                const hasDraft = priceKey in priceDrafts;
                                                const basePrice = Number((details as { price?: number })?.price) || 0;

                                                // Calculate markup price for display reference
                                                let markupPrice = basePrice;
                                                if (pricing.enabled) {
                                                    if (pricing.type === 'percentage') {
                                                        markupPrice += (basePrice * (pricing.value / 100));
                                                    } else {
                                                        markupPrice += pricing.value;
                                                    }
                                                }

                                                return (
                                                    <tr
                                                        key={priceKey}
                                                        className={`border-t hover:bg-muted/50 ${
                                                            hasCustom
                                                                ? 'bg-emerald-50/70'
                                                                : 'bg-rose-50/40'
                                                        }`}
                                                    >
                                                        <td className="p-3">
                                                            {hasCustom ? (
                                                                <Badge className="bg-emerald-600 hover:bg-emerald-600">Set</Badge>
                                                            ) : (
                                                                <Badge variant="destructive">Not set</Badge>
                                                            )}
                                                        </td>
                                                        <td className="p-3 font-medium">{stock.name}</td>
                                                        <td className="p-3">{key}</td>
                                                        <td className="p-3">₹{basePrice}</td>
                                                        <td className="p-3 text-muted-foreground">
                                                            ₹{Math.ceil(markupPrice)}
                                                        </td>
                                                        <td className="p-3">
                                                            <Input
                                                                type="text"
                                                                inputMode="numeric"
                                                                placeholder="Not set"
                                                                className={`w-32 h-8 ${
                                                                    hasDraft
                                                                        ? 'border-amber-400 ring-1 ring-amber-200'
                                                                        : hasCustom
                                                                            ? 'border-emerald-400'
                                                                            : 'border-rose-300'
                                                                }`}
                                                                value={
                                                                    priceKey in priceDrafts
                                                                        ? priceDrafts[priceKey]
                                                                        : resolvedCustom
                                                                            ? String(resolvedCustom)
                                                                            : ''
                                                                }
                                                                onChange={(e) => {
                                                                    setPriceDrafts((prev) => ({
                                                                        ...prev,
                                                                        [priceKey]: e.target.value,
                                                                    }));
                                                                }}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                        })}
                                        {tablePricingRows.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                                    No products found to configure.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle>API Credentials</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>API Key</Label>
                                <Input value={reseller.apiKey || 'Not generated'} readOnly className="bg-muted font-mono" />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>
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
            <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
            <div className="flex items-center gap-2">
                <p className="font-mono text-xs break-all">{value}</p>
                {onCopy && value && value !== '—' && value !== 'Pending' && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onCopy}>
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}
