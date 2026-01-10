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
    TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useParams } from 'next/navigation';

interface Transaction {
    type: string;
    amount: number;
    description: string;
    createdAt: string;
}

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

    useEffect(() => {
        fetchResellerDetails();
        fetchIpStocks(); // Fetch products for pricing
    }, []);

    const fetchIpStocks = async () => {
        try {
            const res = await fetch('/api/ipstock');
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                        <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₹{reseller.stats?.totalSpent?.toLocaleString()}</div>
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
                            <CardTitle>Recent Transactions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {(reseller.wallet?.transactions || []).slice(0, 5).map((txn, i) => (
                                    <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${txn.type === 'deduction' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                {txn.type === 'deduction' ? <TrendingUp className="h-4 w-4 rotate-180" /> : <Wallet className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <p className="font-medium capitalize">{txn.type}</p>
                                                <p className="text-xs text-muted-foreground">{txn.description}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold ${txn.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {txn.amount > 0 ? '+' : ''}{txn.amount}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(txn.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {(!reseller.wallet?.transactions || reseller.wallet?.transactions.length === 0) && (
                                    <p className="text-center text-muted-foreground py-4">No transactions yet</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
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
