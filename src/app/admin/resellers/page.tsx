'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Search,
    Plus,
    MoreVertical,
    Wallet,
    CheckCircle,
    XCircle,
    Clock,
    ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function ResellersPage() {
    const [resellers, setResellers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchResellers();
    }, []);

    const fetchResellers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/resellers');
            const data = await res.json();
            if (data.success) {
                setResellers(data.resellers);
            } else {
                toast.error('Failed to fetch resellers');
            }
        } catch (error) {
            console.error('Error fetching resellers:', error);
            toast.error('Error loading resellers');
        } finally {
            setLoading(false);
        }
    };

    const filteredResellers = resellers.filter(reseller =>
        reseller.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        reseller.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getStatusBadge = (status) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>;
            case 'suspended':
                return <Badge variant="destructive">Suspended</Badge>;
            case 'pending':
                return <Badge variant="secondary">Pending</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Resellers</h1>
                    <p className="text-muted-foreground">Manage reseller accounts and partners</p>
                </div>
                <Link href="/admin/resellers/create">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Reseller
                    </Button>
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>All Resellers</CardTitle>
                        <div className="relative w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search resellers..."
                                className="pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-10">Loading resellers...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Business Name</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead>Wallet Balance</TableHead>
                                    <TableHead>Orders</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredResellers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                            No resellers found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredResellers.map((reseller) => (
                                        <TableRow key={reseller._id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    {reseller.businessName}
                                                    {reseller.isVerified && <CheckCircle className="h-3 w-3 text-blue-500" />}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{reseller.email}</span>
                                                    <span className="text-xs text-muted-foreground">{reseller.phone}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 font-medium">
                                                    <span>₹{reseller.wallet?.balance?.toLocaleString()}</span>
                                                    {reseller.wallet?.balance < 1000 && (
                                                        <span className="h-2 w-2 rounded-full bg-red-500" title="Low Balance" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{reseller.stats?.totalOrders || 0}</TableCell>
                                            <TableCell>{getStatusBadge(reseller.status)}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(reseller.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Link href={`/admin/resellers/${reseller._id}`}>
                                                    <Button variant="ghost" size="sm">
                                                        Manage <ExternalLink className="ml-2 h-3 w-3" />
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
