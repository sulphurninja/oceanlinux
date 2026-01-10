'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Wallet,
    CreditCard,
    Copy,
    RefreshCw,
    ArrowUpRight,
    TrendingDown,
    TrendingUp,
    AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface Transaction {
    type: string;
    amount: number;
    description: string;
    createdAt: string;
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
    };
}

export default function ResellerWalletPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ResellerInfo | null>(null);

    useEffect(() => {
        fetchWalletData();
    }, []);

    const fetchWalletData = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/user/reseller-info');
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-6 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p className="text-muted-foreground">You are not a registered reseller.</p>
            </div>
        );
    }

    const { reseller } = data;

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Reseller Wallet</h1>
                    <p className="text-muted-foreground">Manage your funds and API credentials</p>
                </div>
                <Button onClick={fetchWalletData} variant="outline" size="sm">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Balance Card */}
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
                        <Wallet className="h-4 w-4 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">₹{reseller.wallet.balance.toLocaleString()}</div>
                        <p className="text-xs opacity-70 mt-1">
                            Credit Limit: ₹{reseller.wallet.creditLimit.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>

                {/* Stats Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">₹{reseller.stats.totalSpent.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            On {reseller.stats.totalOrders} total orders
                        </p>
                    </CardContent>
                </Card>

                {/* Action Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Add Funds</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Button className="w-full" asChild>
                            <a href="mailto:support@oceanlinux.com?subject=Wallet Recharge Request">
                                Request Recharge
                            </a>
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                            Contact support to add funds
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* API Credentials */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>API Credentials</CardTitle>
                        <CardDescription>Use these keys to authenticate API requests</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">API Key</label>
                            <div className="flex gap-2">
                                <Input value={reseller.apiKey} readOnly className="font-mono bg-muted" />
                                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(reseller.apiKey)}>
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-xs rounded-md border border-yellow-200 dark:border-yellow-900">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            Keep your API Secret safe. It is only shown once during creation. If you lost it, contact support to regenerate.
                        </div>
                    </CardContent>
                </Card>

                {/* Transaction History */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Recent Transactions</CardTitle>
                        <CardDescription>History of wallet usage and recharges</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {(reseller.wallet.transactions || []).length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    No transactions found
                                </div>
                            ) : (
                                (reseller.wallet.transactions || []).slice(0, 10).map((txn, i) => (
                                    <div key={i} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${txn.type === 'deduction' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                {txn.type === 'deduction' ? <ArrowUpRight className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm capitalize">{txn.type}</p>
                                                <p className="text-xs text-muted-foreground">{txn.description}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold text-sm ${txn.amount > 0 ? (txn.type === 'deduction' ? 'text-red-600' : 'text-green-600') : ''}`}>
                                                {txn.type === 'deduction' ? '-' : '+'}₹{txn.amount}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(txn.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
