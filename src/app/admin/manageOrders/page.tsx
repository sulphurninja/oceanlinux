'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogHeader,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
    Eye, Settings, Play, RotateCcw, Loader2, AlertCircle, CheckCircle, 
    Wrench, Search, Filter, Calendar, X, ChevronLeft, ChevronRight, 
    ChevronsLeft, ChevronsRight, Edit2, Save, XCircle, Download, RefreshCw, KeyRound, ArrowRightLeft, Wallet, CreditCard, Clock
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';

const ADMIN_ORDER_STATUSES = ['pending', 'confirmed', 'active'] as const;

function normalizeAdminOrderStatus(status?: string): (typeof ADMIN_ORDER_STATUSES)[number] {
    const value = String(status ?? '').trim().toLowerCase();
    if (value === 'paid' || value === 'completed') return 'confirmed';
    if ((ADMIN_ORDER_STATUSES as readonly string[]).includes(value)) {
        return value as (typeof ADMIN_ORDER_STATUSES)[number];
    }
    return 'pending';
}

interface Order {
    _id: string;
    user: {
        _id?: string;
        name?: string;
        email?: string;
    };
    productName: string;
    memory: string;
    price: number;
    status: string;
    provisioningStatus?: string;
    provisioningError?: string;
    hostycareServiceId?: string;
    smartvpsServiceId?: string;
    advpsServiceId?: string;
    advpsOrderId?: string;
    provider?: string;
    autoProvisioned?: boolean;
    ipAddress?: string;
    username?: string;
    password?: string;
    os: string;
    transactionId: string;
    clientTxnId?: string;
    gatewayOrderId?: string;
    paymentMethod?: string;
    paymentDetails?: {
        gatewayAmount?: number;
        walletAmount?: number;
        walletOnly?: boolean;
        confirmedAt?: string;
        [key: string]: unknown;
    };
    walletDeduction?: {
        deducted?: boolean;
        amount?: number;
        transactionId?: string;
        timestamp?: string;
    };
    createdAt: string;
    expiryDate?: string;
    lastAction?: string;
    lastActionTime?: string;
}

function formatPaymentGatewayName(method: string): string {
    const value = method.toLowerCase();
    if (value === 'razorpay') return 'Razorpay';
    if (value === 'cashfree') return 'Cashfree';
    if (value === 'upi') return 'UPI';
    if (value === 'wallet') return 'Wallet';
    return method;
}

type OrderPaymentBreakdown =
    | { type: 'pending'; label: string }
    | { type: 'wallet'; label: string; walletAmt?: number }
    | { type: 'gateway'; label: string; gatewayAmt?: number; gatewayName: string }
    | { type: 'mixed'; label: string; walletAmt?: number; gatewayAmt?: number; gatewayName: string }
    | { type: 'unknown'; label: string };

function isOrderPaid(order: Order): boolean {
    const rawStatus = String(order.status || '').toLowerCase();
    return ['confirmed', 'active', 'paid', 'completed'].includes(rawStatus);
}

function getOrderPaymentBreakdown(order: Order): OrderPaymentBreakdown {
    if (!isOrderPaid(order)) {
        return { type: 'pending', label: 'Unpaid' };
    }

    const method = String(order.paymentMethod || '').toLowerCase();
    const walletAmt =
        Number(order.paymentDetails?.walletAmount) ||
        (order.walletDeduction?.deducted ? Number(order.walletDeduction.amount) : 0) ||
        0;
    let gatewayAmt = Number(order.paymentDetails?.gatewayAmount) || 0;
    const mixedMatch = method.match(/^wallet\+(.+)$/);
    const gatewayFromMethod = mixedMatch?.[1] || '';

    const walletOnly =
        order.paymentDetails?.walletOnly === true ||
        method === 'wallet' ||
        (walletAmt > 0 && gatewayAmt === 0 && !order.gatewayOrderId && !mixedMatch);

    if (walletOnly || (walletAmt > 0 && !gatewayAmt && !gatewayFromMethod && !order.gatewayOrderId)) {
        return {
            type: 'wallet',
            label: 'Wallet',
            walletAmt: walletAmt || order.price,
        };
    }

    if (mixedMatch || (walletAmt > 0 && (gatewayAmt > 0 || gatewayFromMethod))) {
        const gatewayName = formatPaymentGatewayName(gatewayFromMethod || method.replace('wallet+', '') || 'gateway');
        if (!gatewayAmt && walletAmt > 0) {
            gatewayAmt = Math.max(0, order.price - walletAmt);
        }
        return {
            type: 'mixed',
            label: `Wallet + ${gatewayName}`,
            walletAmt,
            gatewayAmt,
            gatewayName,
        };
    }

    if (walletAmt > 0 && gatewayAmt > 0) {
        return {
            type: 'mixed',
            label: `Wallet + ${formatPaymentGatewayName(method)}`,
            walletAmt,
            gatewayAmt,
            gatewayName: formatPaymentGatewayName(method),
        };
    }

    if (method) {
        return {
            type: 'gateway',
            label: formatPaymentGatewayName(method),
            gatewayAmt: gatewayAmt || order.price,
            gatewayName: formatPaymentGatewayName(method),
        };
    }

    if (order.walletDeduction?.deducted) {
        return {
            type: 'wallet',
            label: 'Wallet',
            walletAmt: order.walletDeduction.amount || order.price,
        };
    }

    return { type: 'unknown', label: '—' };
}

interface WalletRecharge {
    _id: string;
    entryType?: 'recharge' | 'admin_credit';
    user: {
        _id?: string;
        name?: string;
        email?: string;
        phone?: string;
    };
    amount: number;
    currency?: string;
    clientTxnId: string;
    paymentMethod: string;
    gatewayOrderId?: string;
    transactionId?: string;
    walletTxnId?: string;
    status: 'pending' | 'confirmed' | 'failed' | 'refunded';
    failureReason?: string;
    creditedAt?: string;
    description?: string;
    performedByEmail?: string;
    paymentDetails?: Record<string, unknown>;
    createdAt: string;
}

interface FilterState {
    status: string;
    provisioningStatus: string;
    autoProvisioned: string;
    provider: string;
    os: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
}

interface PaginationState {
    page: number;
    limit: number;
    total: number;
}

const ManageOrders = () => {
    const [activeTab, setActiveTab] = useState<'orders' | 'wallet'>('orders');
    const [orders, setOrders] = useState<Order[]>([]);
    const [walletRecharges, setWalletRecharges] = useState<WalletRecharge[]>([]);
    const [loading, setLoading] = useState(true);
    const [walletLoading, setWalletLoading] = useState(false);
    const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isProvisioningDialogOpen, setIsProvisioningDialogOpen] = useState(false);
    const [provisioning, setProvisioning] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<FilterState>({
        status: '',
        provisioningStatus: '',
        autoProvisioned: '',
        provider: '',
        os: '',
        dateFrom: undefined,
        dateTo: undefined,
    });
    const [showFilters, setShowFilters] = useState(false);
    const [batchProvisioning, setBatchProvisioning] = useState(false);
    const [generatingCreds, setGeneratingCreds] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [transferOrder, setTransferOrder] = useState<Order | null>(null);
    const [transferEmail, setTransferEmail] = useState('');
    const [transferring, setTransferring] = useState(false);
    
    // Pagination state
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        limit: 50,
        total: 0
    });

    useEffect(() => {
        fetchOrders();
        fetchWalletRecharges();
    }, []);

    const fetchWalletRecharges = async () => {
        setWalletLoading(true);
        try {
            const response = await fetch(`/api/admin/wallet-recharges?t=${Date.now()}`, {
                cache: 'no-store',
                credentials: 'include',
                headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.message || 'Failed to load wallet recharges');
            }
            const data = await response.json();
            setWalletRecharges(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to fetch wallet top-up transactions');
        } finally {
            setWalletLoading(false);
        }
    };

    const refreshAll = async () => {
        await Promise.all([fetchOrders(), fetchWalletRecharges()]);
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/orders?t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            });
            const data = await response.json();
            setOrders(data);
            setPagination(prev => ({ ...prev, total: data.length }));
        } catch {
            toast.error('Failed to fetch orders');
        } finally {
            setLoading(false);
        }
    };

    // Memoized filtered orders for performance
    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            // Text search
            const displayStatus = normalizeAdminOrderStatus(order.status);
            const matchesSearch = !searchTerm ||
                order.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                displayStatus.includes(searchTerm.toLowerCase()) ||
                order.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.transactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (order.ipAddress && order.ipAddress.toLowerCase().includes(searchTerm.toLowerCase()));

            // Status filter (cancelled/failed legacy rows count as pending)
            const matchesStatus = !filters.status || displayStatus === filters.status;

            // Provider filter
            const matchesProvider = !filters.provider || 
                (order.provider || 'hostycare') === filters.provider;

            // OS filter
            const matchesOS = !filters.os || 
                order.os?.toLowerCase().includes(filters.os.toLowerCase());

            // Provisioning status filter
            let matchesProvisioningStatus = true;
            if (filters.provisioningStatus) {
                if (filters.provisioningStatus === 'not_provisioned') {
                    matchesProvisioningStatus = !order.autoProvisioned && (!order.ipAddress || !order.username);
                } else if (filters.provisioningStatus === 'manual_setup') {
                    matchesProvisioningStatus = !order.autoProvisioned && Boolean(order.ipAddress) && Boolean(order.username);
                } else {
                    matchesProvisioningStatus = order.provisioningStatus === filters.provisioningStatus;
                }
            }

            // Auto-provisioned filter
            let matchesAutoProvisioned = true;
            if (filters.autoProvisioned) {
                if (filters.autoProvisioned === 'auto') {
                    matchesAutoProvisioned = order.autoProvisioned === true;
                } else if (filters.autoProvisioned === 'manual') {
                    matchesAutoProvisioned = !order.autoProvisioned;
                }
            }

            // Date filters
            const orderDate = new Date(order.createdAt);
            const matchesDateFrom = !filters.dateFrom || orderDate >= filters.dateFrom;
            const matchesDateTo = !filters.dateTo || orderDate <= new Date(filters.dateTo.getTime() + 24 * 60 * 60 * 1000);

            return matchesSearch && matchesStatus && matchesProvider && matchesOS && 
                   matchesProvisioningStatus && matchesAutoProvisioned && matchesDateFrom && matchesDateTo;
        });
    }, [orders, searchTerm, filters]);

    const filteredWalletRecharges = useMemo(() => {
        return walletRecharges.filter((recharge) => {
            if (!searchTerm) return true;
            const q = searchTerm.toLowerCase();
            return (
                recharge.user?.name?.toLowerCase().includes(q) ||
                recharge.user?.email?.toLowerCase().includes(q) ||
                recharge.clientTxnId?.toLowerCase().includes(q) ||
                recharge.transactionId?.toLowerCase().includes(q) ||
                recharge.gatewayOrderId?.toLowerCase().includes(q) ||
                recharge.walletTxnId?.toLowerCase().includes(q) ||
                recharge.paymentMethod?.toLowerCase().includes(q) ||
                recharge.status?.toLowerCase().includes(q) ||
                String(recharge.amount).includes(q)
            );
        });
    }, [walletRecharges, searchTerm]);

    // Paginated orders
    const paginatedOrders = useMemo(() => {
        const startIndex = (pagination.page - 1) * pagination.limit;
        const endIndex = startIndex + pagination.limit;
        return filteredOrders.slice(startIndex, endIndex);
    }, [filteredOrders, pagination.page, pagination.limit]);

    const totalPages = Math.ceil(filteredOrders.length / pagination.limit);

    // Update total when filtered orders change
    useEffect(() => {
        setPagination(prev => ({ ...prev, total: filteredOrders.length, page: 1 }));
    }, [filteredOrders.length]);

    const handleEdit = useCallback((order: Order) => {
        const normalized = { ...order, status: normalizeAdminOrderStatus(order.status) };
        setCurrentOrder(normalized);
        setEditingOrder(normalized);
        setIsDialogOpen(true);
    }, []);

    const handleProvision = useCallback((order: Order) => {
        setCurrentOrder(order);
        setIsProvisioningDialogOpen(true);
    }, []);

    const handleAutoProvision = async (orderId: string) => {
        setProvisioning(orderId);
        try {
            const response = await fetch('/api/orders/provision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId })
            });

            const result = await response.json();

            if (result.success) {
                toast.success('Server provisioned successfully!');
                fetchOrders();
            } else {
                toast.error(result.message || 'Provisioning failed');
            }
        } catch (error) {
            toast.error('Failed to start provisioning');
        } finally {
            setProvisioning(null);
            setIsProvisioningDialogOpen(false);
        }
    };

    const handleBatchAutoProvision = async () => {
        setBatchProvisioning(true);
        try {
            const response = await fetch('/api/admin/batch-provision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success && result.data.success) {
                const summary = result.data.summary;
                toast.success(
                    `Batch provisioning completed! ${summary.successful} successful, ${summary.failed} failed${summary.retries > 0 ? `, ${summary.retries} retries` : ''}`
                );
                fetchOrders();
            } else {
                toast.error(result.data.message || 'Batch provisioning failed');
            }
        } catch (error) {
            toast.error('Failed to start batch provisioning');
        } finally {
            setBatchProvisioning(false);
        }
    };

    const handleGeneratePanelCreds = async () => {
        setGeneratingCreds(true);
        try {
            const response = await fetch('/api/admin/orders/generate-panel-creds', {
                method: 'POST',
            });
            const result = await response.json();
            if (result.success) {
                toast.success(result.message);
                if (result.generated > 0) fetchOrders();
            } else {
                toast.error(result.error || 'Failed to generate credentials');
            }
        } catch {
            toast.error('Failed to generate panel credentials');
        } finally {
            setGeneratingCreds(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingOrder) return;
        
        setUpdating(true);
        try {
            const response = await fetch(`/api/orders/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: editingOrder._id,
                    ipAddress: editingOrder.ipAddress,
                    username: editingOrder.username,
                    password: editingOrder.password,
                    os: editingOrder.os,
                    status: editingOrder.status,
                    provider: editingOrder.provider,
                    provisioningStatus: editingOrder.provisioningStatus,
                    advpsServiceId: editingOrder.advpsServiceId || undefined,
                    advpsOrderId: editingOrder.advpsOrderId || undefined,
                })
            });

            if (response.ok) {
                const data = await response.json();
                const updatedOrder = data.order || editingOrder;
                setOrders(prev => prev.map(order =>
                    order._id === editingOrder._id ? { ...editingOrder, ...updatedOrder } : order
                ));
                toast.success('Order updated successfully!');
                if (data.advpsNotes && data.advpsNotes.length > 0) {
                    data.advpsNotes.forEach((note: string) => {
                        if (note.includes('Failed') || note.includes('manually')) {
                            toast.warning(`ADVPS: ${note}`, { duration: 8000 });
                        } else {
                            toast.info(`ADVPS: ${note}`, { duration: 5000 });
                        }
                    });
                }
                setIsDialogOpen(false);
                setCurrentOrder(null);
                setEditingOrder(null);
            } else {
                throw new Error('Failed to update order');
            }
        } catch (error) {
            toast.error('Failed to update order');
        } finally {
            setUpdating(false);
        }
    };

    const handleTransfer = async () => {
        if (!transferOrder) return;

        const email = transferEmail.trim().toLowerCase();
        if (!email) {
            toast.error('Enter the target user email');
            return;
        }

        if (transferOrder.user?.email?.toLowerCase() === email) {
            toast.error('Service is already on this account');
            return;
        }

        setTransferring(true);
        try {
            const response = await fetch('/api/admin/orders/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: transferOrder._id,
                    targetUserEmail: email,
                }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                toast.error(data.message || 'Failed to transfer service');
                return;
            }

            setOrders((prev) =>
                prev.map((order) =>
                    order._id === transferOrder._id
                        ? { ...order, user: data.order?.user || order.user }
                        : order
                )
            );

            toast.success(data.message || 'Service transferred successfully');
            setTransferOrder(null);
            setTransferEmail('');
        } catch (error) {
            console.error('Transfer failed:', error);
            toast.error('Failed to transfer service');
        } finally {
            setTransferring(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const displayStatus = normalizeAdminOrderStatus(status);
        const variants: Record<string, string> = {
            active: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
            confirmed: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
            pending: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
        };
        
        return (
            <Badge className={`${variants[displayStatus]} font-medium`}>
                {displayStatus}
            </Badge>
        );
    };

    const getProvisioningStatusBadge = (order: Order) => {
        if (order.autoProvisioned) {
            switch (order.provisioningStatus) {
                case 'provisioning':
                    return (
                        <Badge variant="outline" className="gap-1 border-blue-500/20 bg-blue-500/10">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Auto-Provisioning
                        </Badge>
                    );
                case 'active':
                    return (
                        <Badge className="gap-1 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                            <CheckCircle className="w-3 h-3" />
                            Auto-Provisioned
                        </Badge>
                    );
                case 'failed':
                    return (
                        <Badge className="gap-1 bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20">
                            <AlertCircle className="w-3 h-3" />
                            Auto-Failed
                        </Badge>
                    );
                default:
                    return (
                        <Badge variant="outline">
                            Pending Auto
                        </Badge>
                    );
            }
        } else if (order.ipAddress && order.username) {
            return (
                <Badge className="gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20">
                    <Wrench className="w-3 h-3" />
                    Manual Setup
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-muted-foreground">
                Not Provisioned
            </Badge>
        );
    };

    const formatInr = (amount?: number) =>
        amount != null ? `₹${amount.toLocaleString('en-IN')}` : '';

    const renderOrderPaymentCell = (order: Order, compact = false) => {
        const info = getOrderPaymentBreakdown(order);

        if (info.type === 'pending') {
            return (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                        <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </span>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Unpaid</span>
                </div>
            );
        }

        if (info.type === 'wallet') {
            return (
                <div className={`flex ${compact ? 'flex-row items-center gap-2' : 'flex-col gap-1'} min-w-0`}>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 px-2.5 py-1 shadow-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                            <Wallet className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Wallet</span>
                    </div>
                    {info.walletAmt ? (
                        <span className="text-[11px] font-semibold tabular-nums text-foreground/80">
                            {formatInr(info.walletAmt)}
                        </span>
                    ) : null}
                </div>
            );
        }

        if (info.type === 'mixed') {
            const total = (info.walletAmt || 0) + (info.gatewayAmt || 0) || order.price;
            const walletPct = total > 0 ? Math.round(((info.walletAmt || 0) / total) * 100) : 50;
            const gatewayPct = 100 - walletPct;

            return (
                <div className={`flex flex-col gap-1.5 min-w-0 w-full ${compact ? '' : ''}`}>
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/50">
                        <div
                            className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                            style={{ width: `${walletPct}%` }}
                            title={`Wallet ${walletPct}%`}
                        />
                        <div
                            className="bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                            style={{ width: `${gatewayPct}%` }}
                            title={`Gateway ${gatewayPct}%`}
                        />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {info.walletAmt ? (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                <Wallet className="h-2.5 w-2.5 shrink-0" />
                                {formatInr(info.walletAmt)}
                            </span>
                        ) : null}
                        {info.gatewayAmt ? (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                <CreditCard className="h-2.5 w-2.5 shrink-0" />
                                {formatInr(info.gatewayAmt)}
                            </span>
                        ) : null}
                    </div>
                    <span className="truncate text-[10px] font-medium text-muted-foreground">
                        via {info.gatewayName}
                    </span>
                </div>
            );
        }

        if (info.type === 'gateway') {
            return (
                <div className={`flex ${compact ? 'flex-row items-center gap-2' : 'flex-col gap-1'} min-w-0`}>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-gradient-to-r from-blue-500/15 to-indigo-500/10 px-2.5 py-1 shadow-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                            <CreditCard className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        </span>
                        <span className="truncate text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                            {info.label}
                        </span>
                    </div>
                    {info.gatewayAmt ? (
                        <span className="text-[11px] font-semibold tabular-nums text-foreground/80">
                            {formatInr(info.gatewayAmt)}
                        </span>
                    ) : null}
                </div>
            );
        }

        return <span className="text-xs text-muted-foreground">—</span>;
    };

    const renderOrderActions = (order: Order) => (
        <div className="flex flex-wrap items-center gap-2">
            <Button
                size="sm"
                variant="outline"
                onClick={() => handleEdit(order)}
                className="gap-1 h-8"
            >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
            </Button>
            <Button
                size="sm"
                variant="outline"
                onClick={() => {
                    setTransferOrder(order);
                    setTransferEmail('');
                }}
                className="gap-1 h-8"
                title="Transfer VPS to another account"
            >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Transfer
            </Button>
            {(
                ((order.status === 'paid' || order.status === 'confirmed') && !order.autoProvisioned) ||
                (order.provisioningStatus === 'failed') ||
                ((order.provider === 'hostycare' || order.provider === 'smartvps') && order.status === 'confirmed' && !order.ipAddress)
            ) && (
                <Button
                    size="sm"
                    onClick={() => handleProvision(order)}
                    disabled={provisioning === order._id}
                    className="gap-1 h-8"
                    variant={order.provisioningStatus === 'failed' ? 'destructive' : 'default'}
                >
                    {provisioning === order._id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Play className="w-3.5 h-3.5" />
                    )}
                    {order.provisioningStatus === 'failed' ? 'Retry' : 'Provision'}
                </Button>
            )}
        </div>
    );

    // Stats calculations
    const stats = useMemo(() => ({
        total: orders.length,
        pending: orders.filter(o => normalizeAdminOrderStatus(o.status) === 'pending').length,
        confirmed: orders.filter(o => normalizeAdminOrderStatus(o.status) === 'confirmed').length,
        active: orders.filter(o => normalizeAdminOrderStatus(o.status) === 'active').length,
        failed: orders.filter(o => o.provisioningStatus === 'failed').length,
        totalRevenue: orders.filter(o => ['active', 'confirmed'].includes(normalizeAdminOrderStatus(o.status))).reduce((sum, o) => sum + o.price, 0),
    }), [orders]);

    const walletStats = useMemo(() => ({
        total: walletRecharges.length,
        confirmed: walletRecharges.filter((r) => r.status === 'confirmed').length,
        pending: walletRecharges.filter((r) => r.status === 'pending').length,
        failed: walletRecharges.filter((r) => r.status === 'failed').length,
        totalCredited: walletRecharges
            .filter((r) => r.status === 'confirmed')
            .reduce((sum, r) => sum + (r.amount || 0), 0),
    }), [walletRecharges]);

    const getWalletStatusBadge = (status: WalletRecharge['status']) => {
        switch (status) {
            case 'confirmed':
                return <Badge className="bg-green-600">Confirmed</Badge>;
            case 'pending':
                return <Badge variant="secondary">Pending</Badge>;
            case 'failed':
                return <Badge variant="destructive">Failed</Badge>;
            case 'refunded':
                return <Badge variant="outline">Refunded</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const clearFilters = () => {
        setFilters({
            status: '',
            provisioningStatus: '',
            autoProvisioned: '',
            provider: '',
            os: '',
            dateFrom: undefined,
            dateTo: undefined,
        });
        setSearchTerm('');
    };

    const hasActiveFilters = searchTerm || Object.values(filters).some(v => v);

    const exportToCSV = () => {
        const csvData = filteredOrders.map(order => ({
            'Order ID': order._id,
            'Customer Name': order.user?.name || 'N/A',
            'Customer Email': order.user?.email || 'N/A',
            'Product': order.productName,
            'Memory': order.memory,
            'Price': order.price,
            'Status': normalizeAdminOrderStatus(order.status),
            'Provisioning Status': order.provisioningStatus || 'N/A',
            'Provider': order.provider || 'hostycare',
            'IP Address': order.ipAddress || 'N/A',
            'Username': order.username || 'N/A',
            'OS': order.os || 'N/A',
            'Transaction ID': order.transactionId || 'N/A',
            'Created At': format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm:ss'),
            'Expiry Date': order.expiryDate ? format(new Date(order.expiryDate), 'yyyy-MM-dd') : 'N/A',
        }));

        const headers = Object.keys(csvData[0] || {});
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `orders_export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`;
        link.click();
        
        toast.success(`Exported ${csvData.length} orders to CSV`);
    };

    return (
        <div className="w-full min-w-0">
            {/* Page Header */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Manage Orders</h1>
                            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                                VPS orders and customer wallet top-up transactions
                            </p>
                        </div>
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                            <Button
                                variant="outline"
                                onClick={exportToCSV}
                                disabled={filteredOrders.length === 0}
                                className="gap-2"
                                size="sm"
                            >
                                <Download className="w-4 h-4" />
                                Export CSV
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleGeneratePanelCreds}
                                disabled={generatingCreds}
                                className="gap-2"
                                size="sm"
                            >
                                {generatingCreds ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <KeyRound className="w-4 h-4" />
                                        Generate Panel Creds
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="default"
                                onClick={handleBatchAutoProvision}
                                disabled={batchProvisioning}
                                className="gap-2"
                                size="sm"
                            >
                                {batchProvisioning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Batch Provisioning...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4" />
                                        Auto-Provision All
                                    </>
                                )}
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={refreshAll} 
                                disabled={loading || walletLoading}
                                className="gap-2"
                                size="sm"
                            >
                                {(loading || walletLoading) ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="w-4 h-4" />
                                )}
                                Refresh
                            </Button>
                        </div>
                    </div>

                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'orders' | 'wallet')}>
                        <TabsList>
                            <TabsTrigger value="orders">VPS Orders</TabsTrigger>
                            <TabsTrigger value="wallet" className="gap-2">
                                <Wallet className="w-4 h-4" />
                                Wallet Top-ups
                                {walletStats.confirmed > 0 && (
                                    <Badge variant="secondary" className="ml-1">{walletStats.confirmed}</Badge>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="orders" className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.total}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.confirmed}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Active</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Failed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Search and Filters */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, email, product, transaction ID, IP..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={() => setShowFilters(!showFilters)}
                                >
                                    <Filter className="w-4 h-4" />
                                    Advanced Filters
                                    {hasActiveFilters && (
                                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                                            {[searchTerm, ...Object.values(filters)].filter(Boolean).length}
                                        </Badge>
                                    )}
                                </Button>
                                {hasActiveFilters && (
                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                                        <X className="w-4 h-4" />
                                        Clear All
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Advanced Filter Panel */}
                        {showFilters && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Advanced Filters</CardTitle>
                                    <CardDescription>Filter orders by multiple criteria</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-2">
                                            <Label>Order Status</Label>
                                            <Select
                                                value={filters.status}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All statuses" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All statuses</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
                                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                                    <SelectItem value="active">Active</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provisioning Status</Label>
                                            <Select
                                                value={filters.provisioningStatus}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, provisioningStatus: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All provisioning" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All provisioning</SelectItem>
                                                    <SelectItem value="active">Auto-Active</SelectItem>
                                                    <SelectItem value="provisioning">Auto-Provisioning</SelectItem>
                                                    <SelectItem value="failed">Auto-Failed</SelectItem>
                                                    <SelectItem value="manual_setup">Manual Setup</SelectItem>
                                                    <SelectItem value="not_provisioned">Not Provisioned</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provider</Label>
                                            <Select
                                                value={filters.provider}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, provider: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All providers" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All providers</SelectItem>
                                                    <SelectItem value="hostycare">Hostycare</SelectItem>
                                                    <SelectItem value="smartvps">SmartVPS</SelectItem>
                                                    <SelectItem value="advps">ADVPS</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Operating System</Label>
                                            <Select
                                                value={filters.os}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, os: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All OS" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All OS</SelectItem>
                                                    <SelectItem value="windows">Windows</SelectItem>
                                                    <SelectItem value="ubuntu">Ubuntu</SelectItem>
                                                    <SelectItem value="centos">CentOS</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provisioning Type</Label>
                                            <Select
                                                value={filters.autoProvisioned}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, autoProvisioned: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All types" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All types</SelectItem>
                                                    <SelectItem value="auto">Auto-Provisioned</SelectItem>
                                                    <SelectItem value="manual">Manual</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Date Range</Label>
                                            <div className="flex gap-2">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {filters.dateFrom ? format(filters.dateFrom, "MMM dd, yyyy") : "From date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <CalendarComponent
                                                            mode="single"
                                                            selected={filters.dateFrom}
                                                            onSelect={(date) => setFilters(prev => ({ ...prev, dateFrom: date }))}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>

                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {filters.dateTo ? format(filters.dateTo, "MMM dd, yyyy") : "To date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <CalendarComponent
                                                            mode="single"
                                                            selected={filters.dateTo}
                                                            onSelect={(date) => setFilters(prev => ({ ...prev, dateTo: date }))}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Results summary and Pagination Controls */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
                            <span className="text-muted-foreground">
                                Showing {Math.min((pagination.page - 1) * pagination.limit + 1, filteredOrders.length)}-
                                {Math.min(pagination.page * pagination.limit, filteredOrders.length)} of {filteredOrders.length} orders
                                {hasActiveFilters && " (filtered)"}
                            </span>
                            
                            {totalPages > 1 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select
                                        value={pagination.limit.toString()}
                                        onValueChange={(value) => setPagination(prev => ({ ...prev, limit: parseInt(value), page: 1 }))}
                                    >
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="25">25</SelectItem>
                                            <SelectItem value="50">50</SelectItem>
                                            <SelectItem value="100">100</SelectItem>
                                            <SelectItem value="200">200</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-muted-foreground">per page</span>
                                    
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                                            disabled={pagination.page === 1}
                                        >
                                            <ChevronsLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                            disabled={pagination.page === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium px-2">
                                            Page {pagination.page} of {totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                            disabled={pagination.page === totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: totalPages }))}
                                            disabled={pagination.page === totalPages}
                                        >
                                            <ChevronsRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Orders list */}
                    <div className="w-full min-w-0">
                        {/* Mobile & tablet cards */}
                        <div className="space-y-3 xl:hidden">
                            {loading ? (
                                <Card>
                                    <CardContent className="flex h-32 items-center justify-center gap-2 py-8">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                        <span>Loading orders...</span>
                                    </CardContent>
                                </Card>
                            ) : paginatedOrders.length === 0 ? (
                                <Card>
                                    <CardContent className="flex h-32 items-center justify-center py-8 text-muted-foreground">
                                        {hasActiveFilters ? 'No orders match your search criteria.' : 'No orders found.'}
                                    </CardContent>
                                </Card>
                            ) : (
                                paginatedOrders.map((order) => (
                                    <Card key={order._id} className="overflow-hidden border-border/60 shadow-sm">
                                        <CardContent className="space-y-3 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold">{order.user?.name || 'N/A'}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{order.user?.email}</p>
                                                </div>
                                                <div className="shrink-0">{getStatusBadge(order.status)}</div>
                                            </div>

                                            <p className="text-sm font-medium leading-snug break-words">{order.productName}</p>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="outline" className="text-xs">{order.memory}</Badge>
                                                <span className="text-sm font-bold tabular-nums">₹{order.price.toLocaleString('en-IN')}</span>
                                                <Badge variant="secondary" className="text-xs capitalize">
                                                    {order.provider || 'hostycare'}
                                                </Badge>
                                            </div>

                                            <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 p-3">
                                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                    Payment
                                                </p>
                                                {renderOrderPaymentCell(order, true)}
                                            </div>

                                            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                                <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                                                    <p className="text-[10px] text-muted-foreground">Provisioning</p>
                                                    <div className="mt-1">{getProvisioningStatusBadge(order)}</div>
                                                </div>
                                                <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                                                    <p className="text-[10px] text-muted-foreground">IP Address</p>
                                                    <code className="mt-1 block break-all text-[11px] font-medium">
                                                        {order.ipAddress || 'Pending'}
                                                    </code>
                                                </div>
                                            </div>

                                            <p className="text-[11px] text-muted-foreground">
                                                {format(new Date(order.createdAt), 'MMM dd, yyyy')}
                                            </p>

                                            {renderOrderActions(order)}
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>

                        {/* Desktop table — only when sidebar + table fit */}
                        <div className="hidden xl:block w-full min-w-0 overflow-x-auto rounded-xl border bg-card shadow-sm">
                            <Table className="min-w-[1100px]">
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableHead className="font-semibold">Customer</TableHead>
                                        <TableHead className="font-semibold">Product</TableHead>
                                        <TableHead className="font-semibold">Memory</TableHead>
                                        <TableHead className="font-semibold">Price</TableHead>
                                        <TableHead className="font-semibold">Payment</TableHead>
                                        <TableHead className="font-semibold">Status</TableHead>
                                        <TableHead className="font-semibold">Provisioning</TableHead>
                                        <TableHead className="font-semibold">Provider</TableHead>
                                        <TableHead className="font-semibold">IP Address</TableHead>
                                        <TableHead className="font-semibold">Date</TableHead>
                                        <TableHead className="font-semibold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={11} className="h-32 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                    <span>Loading orders...</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : paginatedOrders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                                                {hasActiveFilters ? 'No orders match your search criteria.' : 'No orders found.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedOrders.map(order => (
                                            <TableRow key={order._id} className="transition-colors hover:bg-muted/30">
                                                <TableCell>
                                                    <div className="space-y-0.5">
                                                        <div className="text-sm font-medium">{order.user?.name || 'N/A'}</div>
                                                        <div className="max-w-[160px] truncate text-xs text-muted-foreground">
                                                            {order.user?.email}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="line-clamp-2 text-sm font-medium">{order.productName}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{order.memory}</Badge>
                                                </TableCell>
                                                <TableCell className="font-semibold tabular-nums">₹{order.price.toLocaleString('en-IN')}</TableCell>
                                                <TableCell className="align-top py-3">{renderOrderPaymentCell(order)}</TableCell>
                                                <TableCell>{getStatusBadge(order.status)}</TableCell>
                                                <TableCell>{getProvisioningStatusBadge(order)}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="text-xs capitalize">
                                                        {order.provider || 'hostycare'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                                        {order.ipAddress || 'Pending'}
                                                    </code>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs whitespace-nowrap">
                                                        {format(new Date(order.createdAt), 'MMM dd, yyyy')}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{renderOrderActions(order)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                        </TabsContent>

                        <TabsContent value="wallet" className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
                            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Total Top-ups</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{walletStats.total}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-green-600">{walletStats.confirmed}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Pending</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-yellow-600">{walletStats.pending}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Failed</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-red-600">{walletStats.failed}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">Credited</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">₹{walletStats.totalCredited.toLocaleString('en-IN')}</div>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="relative w-full max-w-xl">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search customer, txn ID, gateway ID, amount..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            {/* Mobile wallet cards */}
                            <div className="space-y-3 xl:hidden">
                                {walletLoading ? (
                                    <Card>
                                        <CardContent className="flex h-32 items-center justify-center py-8">
                                            <Loader2 className="h-6 w-6 animate-spin" />
                                        </CardContent>
                                    </Card>
                                ) : filteredWalletRecharges.length === 0 ? (
                                    <Card>
                                        <CardContent className="py-8 text-center text-muted-foreground">
                                            No wallet top-up transactions found
                                        </CardContent>
                                    </Card>
                                ) : (
                                    filteredWalletRecharges.map((recharge) => (
                                        <Card key={recharge._id}>
                                            <CardContent className="space-y-3 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold">{recharge.user?.name || 'Unknown'}</p>
                                                        <p className="truncate text-xs text-muted-foreground">{recharge.user?.email || '—'}</p>
                                                    </div>
                                                    {getWalletStatusBadge(recharge.status)}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-lg font-bold tabular-nums">₹{recharge.amount.toLocaleString('en-IN')}</span>
                                                    {recharge.entryType === 'admin_credit' ? (
                                                        <Badge variant="secondary">Admin panel</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="capitalize">{recharge.paymentMethod}</Badge>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs">
                                                    <div className="break-all"><span className="text-muted-foreground">Payment Txn: </span>{recharge.transactionId || '—'}</div>
                                                    <div className="break-all"><span className="text-muted-foreground">Client Txn: </span>{recharge.clientTxnId}</div>
                                                    <div className="break-all"><span className="text-muted-foreground">Wallet Txn: </span>{recharge.walletTxnId || '—'}</div>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {format(new Date(recharge.creditedAt || recharge.createdAt), 'MMM dd, yyyy HH:mm')}
                                                </p>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>

                            <div className="hidden xl:block w-full min-w-0 overflow-x-auto rounded-lg border">
                                <Table className="min-w-[900px]">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Customer</TableHead>
                                                <TableHead>Amount</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Gateway</TableHead>
                                                <TableHead>Payment Txn ID</TableHead>
                                                <TableHead>Client Txn ID</TableHead>
                                                <TableHead>Wallet Txn ID</TableHead>
                                                <TableHead>Date</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {walletLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="text-center py-8">
                                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : filteredWalletRecharges.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                        No wallet top-up transactions found
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredWalletRecharges.map((recharge) => (
                                                    <TableRow key={recharge._id}>
                                                        <TableCell>
                                                            <div className="text-sm font-medium">{recharge.user?.name || 'Unknown'}</div>
                                                            <div className="text-xs text-muted-foreground">{recharge.user?.email || '—'}</div>
                                                        </TableCell>
                                                        <TableCell className="font-semibold">₹{recharge.amount.toLocaleString('en-IN')}</TableCell>
                                                        <TableCell>{getWalletStatusBadge(recharge.status)}</TableCell>
                                                        <TableCell>
                                                            {recharge.entryType === 'admin_credit' ? (
                                                                <Badge variant="secondary">Admin panel</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="capitalize">{recharge.paymentMethod}</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <code className="text-xs">{recharge.transactionId || '—'}</code>
                                                        </TableCell>
                                                        <TableCell>
                                                            <code className="text-xs">{recharge.clientTxnId}</code>
                                                        </TableCell>
                                                        <TableCell>
                                                            <code className="text-xs">{recharge.walletTxnId || '—'}</code>
                                                        </TableCell>
                                                        <TableCell className="text-xs whitespace-nowrap">
                                                            {format(new Date(recharge.creditedAt || recharge.createdAt), 'MMM dd, yyyy HH:mm')}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Edit Dialog - FULLY EDITABLE */}
            {isDialogOpen && editingOrder && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                Edit Order Details
                            </DialogTitle>
                            <DialogDescription>
                                Update all order information. Changes will be saved to the database.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Basic Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Order Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Order ID</Label>
                                        <Input value={editingOrder._id} readOnly className="bg-muted font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Transaction ID</Label>
                                        <Input value={editingOrder.transactionId || 'N/A'} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Product Name</Label>
                                        <Input value={editingOrder.productName} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Memory</Label>
                                        <Input value={editingOrder.memory} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Order Status *</Label>
                                        <Select
                                            value={editingOrder.status}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, status: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="confirmed">Confirmed</SelectItem>
                                                <SelectItem value="active">Active</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Provisioning Status *</Label>
                                        <Select
                                            value={editingOrder.provisioningStatus || 'pending'}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, provisioningStatus: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="provisioning">Provisioning</SelectItem>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="failed">Failed</SelectItem>
                                                <SelectItem value="suspended">Suspended</SelectItem>
                                                <SelectItem value="terminated">Terminated</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Payment & Transaction Details */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Payment & Transaction Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Payment Method</Label>
                                        <Input value={editingOrder.paymentMethod || 'N/A'} readOnly className="bg-muted capitalize" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Client Transaction ID</Label>
                                        <Input value={editingOrder.clientTxnId || 'N/A'} readOnly className="bg-muted font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Gateway Order ID</Label>
                                        <Input value={editingOrder.gatewayOrderId || 'N/A'} readOnly className="bg-muted font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Payment Transaction ID</Label>
                                        <Input value={editingOrder.transactionId || 'N/A'} readOnly className="bg-muted font-mono text-xs" />
                                    </div>
                                    {(editingOrder.paymentDetails?.walletAmount ?? 0) > 0 && (
                                        <div className="space-y-2">
                                            <Label>Wallet Used</Label>
                                            <Input
                                                value={`₹${Number(editingOrder.paymentDetails?.walletAmount || 0).toLocaleString('en-IN')}`}
                                                readOnly
                                                className="bg-muted"
                                            />
                                        </div>
                                    )}
                                    {(editingOrder.paymentDetails?.gatewayAmount ?? 0) > 0 && (
                                        <div className="space-y-2">
                                            <Label>Gateway Paid</Label>
                                            <Input
                                                value={`₹${Number(editingOrder.paymentDetails?.gatewayAmount || 0).toLocaleString('en-IN')}`}
                                                readOnly
                                                className="bg-muted"
                                            />
                                        </div>
                                    )}
                                    {editingOrder.walletDeduction?.amount ? (
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Wallet Debit Txn ID</Label>
                                            <Input
                                                value={editingOrder.walletDeduction.transactionId || 'N/A'}
                                                readOnly
                                                className="bg-muted font-mono text-xs"
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Server Configuration */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Server Configuration</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Provider *</Label>
                                        <Select
                                            value={editingOrder.provider || 'hostycare'}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, provider: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="hostycare">Hostycare</SelectItem>
                                                <SelectItem value="smartvps">SmartVPS</SelectItem>
                                                <SelectItem value="advps">ADVPS</SelectItem>
                                                <SelectItem value="slotip">Slot IP</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Operating System *</Label>
                                        <Select
                                            value={editingOrder.os || 'Ubuntu 22'}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, os: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Ubuntu 22">Ubuntu 22</SelectItem>
                                                <SelectItem value="Ubuntu 20">Ubuntu 20</SelectItem>
                                                <SelectItem value="CentOS 7">CentOS 7</SelectItem>
                                                <SelectItem value="CentOS 8">CentOS 8</SelectItem>
                                                <SelectItem value="Windows 2022 64">Windows 2022 64</SelectItem>
                                                <SelectItem value="Windows 2019 64">Windows 2019 64</SelectItem>
                                                <SelectItem value="Windows 2016 64">Windows 2016 64</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Server Credentials */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Server Credentials</h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>IP Address *</Label>
                                        <Input
                                            value={editingOrder.ipAddress || ''}
                                            onChange={(e) => setEditingOrder({ ...editingOrder, ipAddress: e.target.value })}
                                            placeholder="Enter IP address (e.g., 103.177.114.195 or 103.177.114.195:49965)"
                                            className="font-mono"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            For Windows Hostycare orders, include port :49965
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Username *</Label>
                                            <Input
                                                value={editingOrder.username || ''}
                                                onChange={(e) => setEditingOrder({ ...editingOrder, username: e.target.value })}
                                                placeholder="Enter username (e.g., root or Administrator)"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Password *</Label>
                                            <Input
                                                type="text"
                                                value={editingOrder.password || ''}
                                                onChange={(e) => setEditingOrder({ ...editingOrder, password: e.target.value })}
                                                placeholder="Enter password"
                                                className="font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Service IDs */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Service Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {editingOrder.hostycareServiceId && (
                                        <div className="space-y-2">
                                            <Label>Hostycare Service ID</Label>
                                            <Input
                                                value={editingOrder.hostycareServiceId}
                                                readOnly
                                                className="bg-muted font-mono text-sm"
                                            />
                                        </div>
                                    )}
                                    {editingOrder.smartvpsServiceId && (
                                        <div className="space-y-2">
                                            <Label>SmartVPS Service ID</Label>
                                            <Input
                                                value={editingOrder.smartvpsServiceId}
                                                readOnly
                                                className="bg-muted font-mono text-sm"
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label>ADVPS Service ID</Label>
                                        <Input
                                            value={editingOrder.advpsServiceId || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const updates: any = { advpsServiceId: val };
                                                if (val && editingOrder.provider !== 'advps') updates.provider = 'advps';
                                                setEditingOrder({ ...editingOrder, ...updates });
                                            }}
                                            placeholder="Enter ADVPS service ID (e.g. vps_service_1)"
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Set this to enable ADVPS server actions for this order
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>ADVPS Purchase Order ID</Label>
                                        <Input
                                            value={editingOrder.advpsOrderId || ''}
                                            onChange={(e) => setEditingOrder({ ...editingOrder, advpsOrderId: e.target.value })}
                                            placeholder="e.g. VPS040426-0008"
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Required for renewals. Users can fix password issues from their order page via Generate New Password; edit here only if that flow cannot recover it.
                                        </p>
                                    </div>
                                    {editingOrder.expiryDate && (
                                        <div className="space-y-2">
                                            <Label>Expiry Date</Label>
                                            <Input
                                                value={format(new Date(editingOrder.expiryDate), 'PPP')}
                                                readOnly
                                                className="bg-muted"
                                            />
                                        </div>
                                    )}
                                    {editingOrder.autoProvisioned && (
                                        <div className="space-y-2">
                                            <Label>Provisioning Type</Label>
                                            <Badge variant="outline" className="w-full justify-center py-2">
                                                Auto-Provisioned
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Error Display */}
                            {editingOrder.provisioningError && (
                                <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <h4 className="font-medium text-destructive mb-1">Provisioning Error</h4>
                                            <p className="text-sm text-destructive/90">
                                                {editingOrder.provisioningError}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Customer Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Customer Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Customer Name</Label>
                                        <Input value={editingOrder.user?.name || 'N/A'} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Customer Email</Label>
                                        <Input value={editingOrder.user?.email || 'N/A'} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Created At</Label>
                                        <Input
                                            value={format(new Date(editingOrder.createdAt), 'PPP p')}
                                            readOnly
                                            className="bg-muted"
                                        />
                                    </div>
                                    {editingOrder.lastActionTime && (
                                        <div className="space-y-2">
                                            <Label>Last Action</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={editingOrder.lastAction || 'N/A'}
                                                    readOnly
                                                    className="bg-muted flex-1"
                                                />
                                                <Input
                                                    value={format(new Date(editingOrder.lastActionTime), 'PPP')}
                                                    readOnly
                                                    className="bg-muted flex-1"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 mt-6">
                            <DialogClose asChild>
                                <Button variant="outline" disabled={updating}>
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button onClick={handleUpdate} disabled={updating} className="gap-2">
                                {updating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Transfer VPS Dialog */}
            {transferOrder && (
                <Dialog
                    open={!!transferOrder}
                    onOpenChange={(open) => {
                        if (!open) {
                            setTransferOrder(null);
                            setTransferEmail('');
                        }
                    }}
                >
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Transfer VPS to Another Account</DialogTitle>
                            <DialogDescription>
                                Move this service from one customer account to another. The VPS, IP, and credentials stay the same — only the owner changes.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                                <p className="font-medium">{transferOrder.productName}</p>
                                <p className="text-muted-foreground">
                                    IP: <span className="font-mono">{transferOrder.ipAddress || 'Pending'}</span>
                                </p>
                                <p className="text-muted-foreground">
                                    From: {transferOrder.user?.name || 'N/A'} ({transferOrder.user?.email || 'N/A'})
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="transfer-email">Transfer to user email</Label>
                                <Input
                                    id="transfer-email"
                                    type="email"
                                    value={transferEmail}
                                    onChange={(e) => setTransferEmail(e.target.value)}
                                    placeholder="user5@example.com"
                                    autoComplete="off"
                                />
                                <p className="text-xs text-muted-foreground">
                                    The target user must already have an OceanLinux account.
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setTransferOrder(null);
                                    setTransferEmail('');
                                }}
                                disabled={transferring}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleTransfer} disabled={transferring} className="gap-2">
                                {transferring ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <ArrowRightLeft className="w-4 h-4" />
                                )}
                                Transfer Service
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Auto-Provisioning Confirmation Dialog */}
            {isProvisioningDialogOpen && currentOrder && (
                <Dialog open={isProvisioningDialogOpen} onOpenChange={setIsProvisioningDialogOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Auto-Provision Server</DialogTitle>
                            <DialogDescription>
                                Start automatic server provisioning for this order?
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="border rounded-lg p-4 bg-muted/50">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-full bg-primary/10">
                                        <Play className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium mb-2">Auto-Provisioning will:</h4>
                                        <ul className="text-sm space-y-1 text-muted-foreground">
                                            <li>• Create server automatically via API</li>
                                            <li>• Generate secure credentials</li>
                                            <li>• Configure hostname and settings</li>
                                            <li>• Update order status to active</li>
                                            <li>• Set expiry date (30 days)</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <Label className="text-muted-foreground">Product:</Label>
                                    <p className="font-medium">{currentOrder.productName}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Memory:</Label>
                                    <p className="font-medium">{currentOrder.memory}</p>
                                </div>
                            </div>

                            {currentOrder.provisioningError && (
                                <div className="border border-destructive/50 rounded-lg p-3 bg-destructive/5">
                                    <Label className="text-destructive font-medium">Previous Error:</Label>
                                    <p className="text-sm text-destructive/80 mt-1">
                                        {currentOrder.provisioningError}
                                    </p>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="gap-2">
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button
                                onClick={() => handleAutoProvision(currentOrder._id)}
                                disabled={provisioning === currentOrder._id}
                                className="gap-2"
                            >
                                {provisioning === currentOrder._id ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Provisioning...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4" />
                                        Start Auto-Provision
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default ManageOrders;
