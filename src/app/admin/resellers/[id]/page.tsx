'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

interface IPStock {
    _id: string;
    name: string;
    memoryOptions: Record<string, { price: number }>;
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
    const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
    const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
    const [walletTransactions, setWalletTransactions] = useState<Transaction[]>([]);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

    useEffect(() => {
        fetchResellerDetails();
        fetchIpStocks(); // Fetch products for pricing
    }, []);

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
                if (data.reseller.pricing?.customPrices) {
                    setCustomPrices(data.reseller.pricing.customPrices);
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
                fetchResellerDetails(); // Refresh
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error('Recharge failed');
        }
    };

    const handlePricingUpdate = async () => {
        try {
            const res = await fetch(`/api/admin/resellers/${params.id}/pricing`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    globalMarkup: pricing,
                    customPrices: customPrices // Send updated custom prices
                })
            });

            const data = await res.json();
            if (data.success) {
                toast.success('Pricing updated successfully');
            } else {
                toast.error('Failed to update pricing');
            }
        } catch (error) {
            toast.error('Error updating pricing');
        }
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
                    {reseller.status === 'active' ? (
                        <Button variant="destructive" onClick={() => handleStatusChange('suspended')}>Suspend Account</Button>
                    ) : (
                        <Button variant="default" onClick={() => handleStatusChange('active')}>Activate Account</Button>
                    )}
                </div>
            </div>

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

                    {/* Granular Pricing Table */}
                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Product Specific Pricing</CardTitle>
                            <CardDescription>
                                Set custom prices for specific products. These override the global markup.
                                Leave empty to use global markup or base price.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted text-muted-foreground">
                                        <tr>
                                            <th className="p-3 font-medium">Product Name</th>
                                            <th className="p-3 font-medium">Variant (RAM)</th>
                                            <th className="p-3 font-medium">Base Price</th>
                                            <th className="p-3 font-medium">Global Markup Price</th>
                                            <th className="p-3 font-medium">Custom Price (₹)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ipStocks.map(stock => (
                                            Object.entries(stock.memoryOptions || {}).map(([key, details]: [string, any]) => {
                                                const priceKey = `${stock._id}_${key}`;

                                                // Calculate markup price for display reference
                                                let markupPrice = details.price;
                                                if (pricing.enabled) {
                                                    if (pricing.type === 'percentage') {
                                                        markupPrice += (details.price * (pricing.value / 100));
                                                    } else {
                                                        markupPrice += pricing.value;
                                                    }
                                                }

                                                return (
                                                    <tr key={priceKey} className="border-t hover:bg-muted/50">
                                                        <td className="p-3 font-medium">{stock.name}</td>
                                                        <td className="p-3">{key}</td>
                                                        <td className="p-3">₹{details.price}</td>
                                                        <td className="p-3 text-muted-foreground">
                                                            ₹{Math.ceil(markupPrice)}
                                                        </td>
                                                        <td className="p-3">
                                                            <Input
                                                                type="number"
                                                                placeholder="Override"
                                                                className="w-32 h-8"
                                                                value={customPrices[priceKey] || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value ? parseFloat(e.target.value) : 0;
                                                                    setCustomPrices(prev => {
                                                                        const next = { ...prev };
                                                                        if (val > 0) next[priceKey] = val;
                                                                        else delete next[priceKey]; // Remove if empty/0
                                                                        return next;
                                                                    });
                                                                }}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ))}
                                        {ipStocks.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-6 text-center text-muted-foreground">
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
