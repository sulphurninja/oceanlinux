'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
    ChevronsLeft, ChevronsRight, Edit2, Save, XCircle, Download, RefreshCw, KeyRound, ArrowRightLeft, Wallet, CreditCard, Clock, TrendingUp, Ban, ShieldOff, Trash2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { PaymentDashboard } from '@/components/admin/PaymentDashboard';
import { getAdminProviderDisplayNameFromOrder } from '@/lib/customerProviderDisplay';
import {
    ADMIN_PROVIDER_EDIT_OPTIONS,
    buildAdminProviderFilterOptions,
    type AdminProviderOption,
} from '@/lib/adminProviderOptions';

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
        phone?: string;
        billingAddress?: {
            line?: string;
            city?: string;
            state?: string;
            pincode?: string;
            country?: string;
        };
    };
    invoiceNumber?: string;
    customerName?: string;
    customerEmail?: string;
    productName: string;
    memory: string;
    price: number;
    originalPrice?: number;
    promoDiscount?: number;
    status: string;
    provisioningStatus?: string;
    provisioningError?: string;
    hostycareServiceId?: string;
    smartvpsServiceId?: string;
    advpsServiceId?: string;
    advpsOrderId?: string;
    provider?: string;
    trialManageCompanyId?: string;
    resellerVmId?: string;
    netbayGroupTag?: string;
    netbayProductKind?: string;
    slotIpPackageId?: string;
    slotIpId?: string;
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
    adminSuspended?: boolean;
    adminSuspendMessage?: string;
    adminSuspendedAt?: string;
}

function formatPaymentGatewayName(method: string): string {
    const value = method.toLowerCase();
    if (value.includes('razorpay')) return value.includes('wallet') ? 'Wallet + Razorpay' : 'Razorpay';
    if (value.includes('upi') || value.includes('kwikupi')) return value.includes('wallet') ? 'Wallet + UPI' : 'UPI';
    if (value === 'cashfree') return 'Cashfree (legacy)';
    if (value === 'wallet') return 'Wallet';
    return method;
}

function getDaysUntilExpiry(expiryDate?: string | null): number | null {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) return null;
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpiryTone(daysLeft: number | null): string {
    if (daysLeft === null) return 'text-muted-foreground';
    if (daysLeft < 0) return 'text-red-600 dark:text-red-400';
    if (daysLeft <= 7) return 'text-amber-600 dark:text-amber-400';
    return 'text-foreground';
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
    paymentStatus: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
}

interface PaginationState {
    page: number;
    limit: number;
    total: number;
}

const ManageOrders = () => {
    const [activeTab, setActiveTab] = useState<'orders' | 'wallet' | 'payments' | 'delete'>('orders');
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
        paymentStatus: '',
        dateFrom: undefined,
        dateTo: undefined,
    });
    const [showFilters, setShowFilters] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [exportPreset, setExportPreset] = useState<'thisMonth' | 'lastMonth' | 'last30' | 'thisYear' | 'all' | 'custom'>('thisMonth');
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    /** Scale all CSV amounts to this % of actual paid sales (default 100 = full). */
    const [exportSalesPercent, setExportSalesPercent] = useState('100');
    const [exportGateway, setExportGateway] = useState<'razorpay' | 'upi'>('razorpay');
    const [exportingGst, setExportingGst] = useState(false);
    const [batchProvisioning, setBatchProvisioning] = useState(false);
    const [generatingCreds, setGeneratingCreds] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [transferOrder, setTransferOrder] = useState<Order | null>(null);
    const [transferEmail, setTransferEmail] = useState('');
    const [transferring, setTransferring] = useState(false);
    const [suspendOrder, setSuspendOrder] = useState<Order | null>(null);
    const [suspendMessage, setSuspendMessage] = useState('');
    const [suspending, setSuspending] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [walletLoaded, setWalletLoaded] = useState(false);
    const [deleteQuery, setDeleteQuery] = useState('');
    const [deleteResults, setDeleteResults] = useState<Order[]>([]);
    const [deleteSearching, setDeleteSearching] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [deleteAuthCode, setDeleteAuthCode] = useState('');
    const [deleteBusy, setDeleteBusy] = useState(false);
    const filterKeyRef = useRef('');
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        confirmed: 0,
        active: 0,
        failed: 0,
        provisioning: 0,
        totalRevenue: 0,
    });
    const [adminCompanies, setAdminCompanies] = useState<Array<{ _id: string; name?: string; slug?: string }>>([]);

    const providerFilterOptions = useMemo(
        () => buildAdminProviderFilterOptions(adminCompanies),
        [adminCompanies]
    );

    // Pagination state
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        limit: 50,
        total: 0
    });

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/admin/companies', { credentials: 'include', cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled || !Array.isArray(data)) return;
                setAdminCompanies(
                    data.map((c: { _id: string; name?: string; slug?: string }) => ({
                        _id: String(c._id),
                        name: c.name,
                        slug: c.slug,
                    }))
                );
            } catch {
                /* optional — filter still has upstream providers */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const filterKey = JSON.stringify({
            debouncedSearch,
            filters: {
                ...filters,
                dateFrom: filters.dateFrom?.toISOString() ?? null,
                dateTo: filters.dateTo?.toISOString() ?? null,
            },
        });
        if (filterKeyRef.current && filterKeyRef.current !== filterKey) {
            setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
        }
        filterKeyRef.current = filterKey;
    }, [debouncedSearch, filters]);

    const fetchWalletRecharges = useCallback(async () => {
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
    }, []);

    const searchOrdersToDelete = async () => {
        const q = deleteQuery.trim();
        if (q.length < 2) {
            toast.error('Type an IP, email, or order id');
            return;
        }
        setDeleteSearching(true);
        try {
            const params = new URLSearchParams({
                search: q,
                page: '1',
                limit: '30',
                t: String(Date.now()),
            });
            const response = await fetch(`/api/admin/orders?${params}`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Search failed');
            }
            setDeleteResults(Array.isArray(data?.orders) ? data.orders : []);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setDeleteSearching(false);
        }
    };

    const confirmDeleteOrder = async () => {
        if (!deleteTarget) return;
        const expected = (deleteTarget.ipAddress || '').trim() || deleteTarget._id;
        if (deleteConfirm.trim() !== expected) {
            toast.error(deleteTarget.ipAddress ? 'Type the IP exactly' : 'Type the order id exactly');
            return;
        }
        if (!/^\d{6}$/.test(deleteAuthCode.trim())) {
            toast.error('Enter the 6-digit authenticator code');
            return;
        }
        setDeleteBusy(true);
        try {
            const response = await fetch('/api/admin/orders/delete', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: deleteTarget._id,
                    confirm: deleteConfirm.trim(),
                    authCode: deleteAuthCode.trim(),
                }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success) {
                throw new Error(data?.message || 'Delete failed');
            }
            setDeleteResults((prev) => prev.filter((order) => order._id !== deleteTarget._id));
            setOrders((prev) => prev.filter((order) => order._id !== deleteTarget._id));
            toast.success('Order deleted');
            setDeleteTarget(null);
            setDeleteConfirm('');
            setDeleteAuthCode('');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setDeleteBusy(false);
        }
    };

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', String(pagination.page));
            params.set('limit', String(pagination.limit));
            params.set('t', String(Date.now()));
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (filters.status) params.set('status', filters.status);
            if (filters.provisioningStatus) params.set('provisioningStatus', filters.provisioningStatus);
            if (filters.autoProvisioned) params.set('autoProvisioned', filters.autoProvisioned);
            if (filters.provider) params.set('provider', filters.provider);
            if (filters.os) params.set('os', filters.os);
            if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
            if (filters.dateFrom) params.set('dateFrom', format(filters.dateFrom, 'yyyy-MM-dd'));
            if (filters.dateTo) params.set('dateTo', format(filters.dateTo, 'yyyy-MM-dd'));

            const response = await fetch(`/api/admin/orders?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'include',
                headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.message || 'Failed to fetch orders');
            }
            const data = await response.json();
            setOrders(Array.isArray(data.orders) ? data.orders : []);
            if (data.stats) setStats(data.stats);
            if (data.pagination) {
                setPagination((prev) => ({
                    ...prev,
                    total: data.pagination.total ?? prev.total,
                }));
            }
        } catch {
            toast.error('Failed to fetch orders');
        } finally {
            setLoading(false);
        }
    }, [
        pagination.page,
        pagination.limit,
        debouncedSearch,
        filters.status,
        filters.provisioningStatus,
        filters.autoProvisioned,
        filters.provider,
        filters.os,
        filters.paymentStatus,
        filters.dateFrom,
        filters.dateTo,
    ]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    useEffect(() => {
        if (activeTab === 'wallet' && !walletLoaded) {
            fetchWalletRecharges().then(() => setWalletLoaded(true));
        }
    }, [activeTab, walletLoaded, fetchWalletRecharges]);

    const refreshAll = async () => {
        await fetchOrders();
        if (activeTab === 'wallet' || walletLoaded) {
            await fetchWalletRecharges();
        }
    };

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

    const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

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
                    trialManageCompanyId: editingOrder.trialManageCompanyId ?? '',
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
                credentials: 'include',
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

            await fetchOrders();

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

    const renderOrderSelectionTag = (order: Order, compact = false) => {
        if (order.netbayGroupTag) {
            return (
                <div className={compact ? 'mt-1' : ''}>
                    <Badge variant="outline" className="font-mono text-[11px] border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200">
                        {order.netbayGroupTag}
                    </Badge>
                    {order.netbayProductKind === 'proxy' && !compact ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">Netbay proxy range</p>
                    ) : null}
                </div>
            );
        }
        if (order.slotIpPackageId) {
            return (
                <Badge variant="outline" className="font-mono text-[11px]">
                    Slot IP
                </Badge>
            );
        }
        return <span className="text-xs text-muted-foreground">—</span>;
    };

    const renderOrderExpiryCell = (order: Order) => {
        if (!order.expiryDate) {
            return <span className="text-xs text-muted-foreground">—</span>;
        }

        const expiry = new Date(order.expiryDate);
        if (Number.isNaN(expiry.getTime())) {
            return <span className="text-xs text-muted-foreground">—</span>;
        }

        const daysLeft = getDaysUntilExpiry(order.expiryDate);
        const tone = getExpiryTone(daysLeft);

        return (
            <div className="space-y-0.5">
                <div className={`text-xs whitespace-nowrap font-medium ${tone}`}>
                    {format(expiry, 'MMM dd, yyyy')}
                </div>
                {daysLeft !== null && (
                    <div className={`text-[10px] ${tone}`}>
                        {daysLeft < 0
                            ? `Expired ${Math.abs(daysLeft)}d ago`
                            : daysLeft === 0
                              ? 'Expires today'
                              : `${daysLeft}d left`}
                    </div>
                )}
            </div>
        );
    };

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

    const handleSuspendOrder = useCallback(async (order: Order, message: string, suspended: boolean) => {
        setSuspending(true);
        try {
            const response = await fetch('/api/admin/orders/suspend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: order._id, suspended, message }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to update suspend status');
            }
            setOrders((prev) =>
                prev.map((o) =>
                    o._id === order._id
                        ? {
                              ...o,
                              adminSuspended: data.order?.adminSuspended ?? suspended,
                              adminSuspendMessage: data.order?.adminSuspendMessage ?? (suspended ? message : ''),
                              adminSuspendedAt: data.order?.adminSuspendedAt,
                          }
                        : o
                )
            );
            toast.success(suspended ? 'Order suspended for customer' : 'Order unsuspended');
            setSuspendOrder(null);
            setSuspendMessage('');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Suspend update failed');
        } finally {
            setSuspending(false);
        }
    }, []);

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
                variant={order.adminSuspended ? 'secondary' : 'outline'}
                onClick={() => {
                    setSuspendOrder(order);
                    setSuspendMessage(order.adminSuspendMessage || '');
                }}
                className={`gap-1 h-8 ${order.adminSuspended ? 'border-orange-500/40 text-orange-700 dark:text-orange-300' : ''}`}
                title={order.adminSuspended ? 'Edit suspend message or unsuspend' : 'Suspend customer access to this order'}
            >
                {order.adminSuspended ? <ShieldOff className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                {order.adminSuspended ? 'Suspended' : 'Suspend'}
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
            paymentStatus: '',
            dateFrom: undefined,
            dateTo: undefined,
        });
        setSearchTerm('');
    };

    const hasActiveFilters = searchTerm || Object.values(filters).some(v => v);

    // ── GST report export (CSV for Excel) ──────────────────────────────────
    const resolveExportRange = (): { from: Date; to: Date } | null => {
        const now = new Date();
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        switch (exportPreset) {
            case 'thisMonth':
                return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
            case 'lastMonth': {
                const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                return { from, to };
            }
            case 'last30':
                return { from: startOfDay(new Date(now.getTime() - 29 * 86400000)), to: endOfDay(now) };
            case 'thisYear':
                return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
            case 'all':
                return { from: new Date(0), to: endOfDay(now) };
            case 'custom':
                if (!exportFrom || !exportTo) return null;
                return { from: new Date(`${exportFrom}T00:00:00`), to: new Date(`${exportTo}T23:59:59.999`) };
            default:
                return null;
        }
    };

    const exportGstReport = async (gateway: 'razorpay' | 'upi' = exportGateway) => {
        const range = resolveExportRange();
        if (!range) {
            toast.error('Please select a valid date range');
            return;
        }

        const salesPct = Math.min(100, Math.max(1, Number(exportSalesPercent) || 100));

        setExportingGst(true);
        setExportGateway(gateway);
        try {
            const params = new URLSearchParams({
                export: 'gst',
                from: format(range.from, 'yyyy-MM-dd'),
                to: format(range.to, 'yyyy-MM-dd'),
                gateway,
                salesPercent: String(salesPct),
            });
            const response = await fetch(`/api/admin/orders?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.message || 'Export failed');
            }
            const data = await response.json();
            const rows: Record<string, unknown>[] = Array.isArray(data.rows) ? data.rows : [];

            if (rows.length === 0) {
                toast.error(`No ${gateway === 'razorpay' ? 'Razorpay' : 'UPI'} sales found in the selected period`);
                return;
            }

            const headers = Object.keys(rows[0]);
            const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const csvContent =
                '\ufeff' +
                [
                    headers.map(esc).join(','),
                    ...rows.map((row) => headers.map((h) => esc(row[h])).join(',')),
                ].join('\r\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const pctSuffix = salesPct !== 100 ? `_${salesPct}pct` : '';
            const gwLabel = gateway === 'razorpay' ? 'razorpay' : 'upi';
            link.download = `gst-${gwLabel}-sales${pctSuffix}_${format(range.from, 'yyyy-MM-dd')}_to_${format(range.to, 'yyyy-MM-dd')}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);

            setExportOpen(false);
            const gwName = gateway === 'razorpay' ? 'Razorpay' : 'UPI (KwikUPI)';
            toast.success(
                salesPct === 100
                    ? `Exported ${rows.length} line${rows.length > 1 ? 's' : ''} to ${gwName} GST report`
                    : `Exported ${rows.length} line${rows.length > 1 ? 's' : ''} (${gwName}) at ${salesPct}% of actual sales`
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to export GST report');
        } finally {
            setExportingGst(false);
        }
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
                                onClick={() => setExportOpen(true)}
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

                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'orders' | 'wallet' | 'payments' | 'delete')}>
                        <TabsList>
                            <TabsTrigger value="orders">VPS Orders</TabsTrigger>
                            <TabsTrigger value="payments" className="gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Daily Payments
                            </TabsTrigger>
                            <TabsTrigger value="wallet" className="gap-2">
                                <Wallet className="w-4 h-4" />
                                Wallet Top-ups
                                {walletStats.confirmed > 0 && (
                                    <Badge variant="secondary" className="ml-1">{walletStats.confirmed}</Badge>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="delete" className="gap-2">
                                <Trash2 className="w-4 h-4" />
                                Delete Order
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="orders" className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-7">
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
                        <Card
                            role="button"
                            tabIndex={0}
                            title="Auto-provision failed on panel"
                            onClick={() => {
                                setFilters((prev) => ({
                                    ...prev,
                                    provisioningStatus: prev.provisioningStatus === 'failed' ? '' : 'failed',
                                }));
                                setPagination((prev) => ({ ...prev, page: 1 }));
                            }}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                setFilters((prev) => ({
                                    ...prev,
                                    provisioningStatus: prev.provisioningStatus === 'failed' ? '' : 'failed',
                                }));
                                setPagination((prev) => ({ ...prev, page: 1 }));
                            }}
                            className={`cursor-pointer ${filters.provisioningStatus === 'failed' ? 'ring-2 ring-red-500' : ''}`}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Failed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
                            </CardContent>
                        </Card>
                        <Card
                            role="button"
                            tabIndex={0}
                            title="Paid, IP not assigned yet — pending queue or actively provisioning"
                            onClick={() => {
                                setFilters((prev) => ({
                                    ...prev,
                                    provisioningStatus: prev.provisioningStatus === 'no_ip' ? '' : 'no_ip',
                                }));
                                setPagination((prev) => ({ ...prev, page: 1 }));
                            }}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                setFilters((prev) => ({
                                    ...prev,
                                    provisioningStatus: prev.provisioningStatus === 'no_ip' ? '' : 'no_ip',
                                }));
                                setPagination((prev) => ({ ...prev, page: 1 }));
                            }}
                            className={`cursor-pointer ${filters.provisioningStatus === 'no_ip' ? 'ring-2 ring-amber-500' : ''}`}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Provisioning</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.provisioning}</div>
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
                                                    <SelectItem value="no_ip">Provisioning queue (paid, no IP)</SelectItem>
                                                    <SelectItem value="failed">Auto-Failed</SelectItem>
                                                    <SelectItem value="manual_setup">Manual Setup</SelectItem>
                                                    <SelectItem value="not_provisioned">Not Provisioned</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provider</Label>
                                            <Select
                                                value={filters.provider || 'All'}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, provider: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All providers" />
                                                </SelectTrigger>
                                                <SelectContent className="max-h-[min(420px,70vh)]">
                                                    <SelectItem value="All">All providers</SelectItem>
                                                    {providerFilterOptions.map((opt: AdminProviderOption) => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            {opt.group === 'Companies' ? `🏢 ${opt.label}` : opt.label}
                                                        </SelectItem>
                                                    ))}
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
                                            <Label>Payment</Label>
                                            <Select
                                                value={filters.paymentStatus}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, paymentStatus: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All payments" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All payments</SelectItem>
                                                    <SelectItem value="no_txn">No Transaction ID (unpaid)</SelectItem>
                                                    <SelectItem value="no_txn_delivered">No Txn but Delivered ⚠️</SelectItem>
                                                    <SelectItem value="has_txn">Has Transaction ID</SelectItem>
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
                                Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}-
                                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} orders
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
                            ) : orders.length === 0 ? (
                                <Card>
                                    <CardContent className="flex h-32 items-center justify-center py-8 text-muted-foreground">
                                        {hasActiveFilters ? 'No orders match your search criteria.' : 'No orders found.'}
                                    </CardContent>
                                </Card>
                            ) : (
                                orders.map((order) => (
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
                                                <Badge variant="secondary" className="text-xs">
                                                    {getAdminProviderDisplayNameFromOrder(order)}
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
                                                    <p className="text-[10px] text-muted-foreground">Tag / Range</p>
                                                    <div className="mt-1">{renderOrderSelectionTag(order, true)}</div>
                                                </div>
                                                <div className="rounded-lg bg-muted/40 px-2.5 py-2 sm:col-span-2">
                                                    <p className="text-[10px] text-muted-foreground">IP Address</p>
                                                    <code className="mt-1 block break-all text-[11px] font-medium">
                                                        {order.ipAddress || 'Pending'}
                                                    </code>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                                                    <p className="text-[10px] text-muted-foreground">Created</p>
                                                    <p className="mt-1 font-medium">
                                                        {format(new Date(order.createdAt), 'MMM dd, yyyy')}
                                                    </p>
                                                </div>
                                                <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                                                    <p className="text-[10px] text-muted-foreground">Expiry</p>
                                                    {order.expiryDate ? (
                                                        <div className="mt-1">
                                                            <p className={`font-medium ${getExpiryTone(getDaysUntilExpiry(order.expiryDate))}`}>
                                                                {format(new Date(order.expiryDate), 'MMM dd, yyyy')}
                                                            </p>
                                                            {(() => {
                                                                const daysLeft = getDaysUntilExpiry(order.expiryDate);
                                                                if (daysLeft === null) return null;
                                                                return (
                                                                    <p className={`text-[10px] ${getExpiryTone(daysLeft)}`}>
                                                                        {daysLeft < 0
                                                                            ? `Expired ${Math.abs(daysLeft)}d ago`
                                                                            : daysLeft === 0
                                                                              ? 'Expires today'
                                                                              : `${daysLeft}d left`}
                                                                    </p>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-1 text-muted-foreground">—</p>
                                                    )}
                                                </div>
                                            </div>

                                            {renderOrderActions(order)}
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>

                        {/* Desktop table — only when sidebar + table fit */}
                        <div className="hidden xl:block w-full min-w-0 overflow-x-auto rounded-xl border bg-card shadow-sm">
                            <Table className="min-w-[1220px]">
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
                                        <TableHead className="font-semibold">Tag / Range</TableHead>
                                        <TableHead className="font-semibold">IP Address</TableHead>
                                        <TableHead className="font-semibold">Created</TableHead>
                                        <TableHead className="font-semibold">Expiry</TableHead>
                                        <TableHead className="font-semibold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={13} className="h-32 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                    <span>Loading orders...</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : orders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={13} className="h-32 text-center text-muted-foreground">
                                                {hasActiveFilters ? 'No orders match your search criteria.' : 'No orders found.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        orders.map(order => (
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
                                                    <Badge variant="secondary" className="text-xs">
                                                        {getAdminProviderDisplayNameFromOrder(order)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{renderOrderSelectionTag(order)}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                                            {order.ipAddress || 'Pending'}
                                                        </code>
                                                        {order.adminSuspended ? (
                                                            <Badge variant="outline" className="w-fit border-orange-500/40 text-orange-700 dark:text-orange-300 text-[10px]">
                                                                Suspended
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs whitespace-nowrap">
                                                        {format(new Date(order.createdAt), 'MMM dd, yyyy')}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{renderOrderExpiryCell(order)}</TableCell>
                                                <TableCell>{renderOrderActions(order)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                        </TabsContent>

                        <TabsContent value="payments" className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
                            <PaymentDashboard />
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

                        <TabsContent value="delete" className="mt-4 space-y-4 sm:mt-6">
                            <Card className="border-red-900/40">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Trash2 className="h-5 w-5 text-red-500" />
                                        Delete any order
                                    </CardTitle>
                                    <CardDescription>
                                        Search by IP, email, product, or order id. Deleting removes the order from the database. It does not shut the VPS down at the provider.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <form
                                        className="flex flex-col gap-2 sm:flex-row"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            searchOrdersToDelete();
                                        }}
                                    >
                                        <Input
                                            value={deleteQuery}
                                            onChange={(e) => setDeleteQuery(e.target.value)}
                                            placeholder="IP, email, or order id"
                                        />
                                        <Button type="submit" disabled={deleteSearching}>
                                            {deleteSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                            Search
                                        </Button>
                                    </form>

                                    {deleteResults.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Search to list orders you can delete.</p>
                                    ) : (
                                        <ul className="divide-y rounded-lg border">
                                            {deleteResults.map((order) => (
                                                <li key={order._id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-sm font-semibold">
                                                                {order.ipAddress || 'no IP'}
                                                            </span>
                                                            <Badge variant="outline">{order.status}</Badge>
                                                            <span className="text-sm tabular-nums">₹{Number(order.price || 0).toLocaleString('en-IN')}</span>
                                                        </div>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {order.user?.email || order.customerEmail || '—'} · {order.productName}
                                                        </p>
                                                        <p className="font-mono text-[11px] text-muted-foreground">{order._id}</p>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => {
                                                            setDeleteTarget(order);
                                                            setDeleteConfirm('');
                                                            setDeleteAuthCode('');
                                                        }}
                                                    >
                                                        <Trash2 className="mr-1 h-4 w-4" />
                                                        Delete
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                    </div>
            </div>

            <Dialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open && !deleteBusy) {
                        setDeleteTarget(null);
                        setDeleteConfirm('');
                        setDeleteAuthCode('');
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this order?</DialogTitle>
                        <DialogDescription>
                            {deleteTarget?.user?.email || deleteTarget?.customerEmail || 'This customer'} · {deleteTarget?.productName}. This only removes the order record.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label>
                            Type {deleteTarget?.ipAddress ? 'the IP' : 'the order id'} to confirm
                        </Label>
                        <Input
                            value={deleteConfirm}
                            onChange={(e) => setDeleteConfirm(e.target.value)}
                            placeholder={deleteTarget?.ipAddress || deleteTarget?._id || ''}
                            autoComplete="off"
                        />
                        <p className="font-mono text-xs text-muted-foreground">
                            {deleteTarget?.ipAddress || deleteTarget?._id}
                        </p>
                        <Label>Google Authenticator code</Label>
                        <Input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="6-digit code"
                            value={deleteAuthCode}
                            onChange={(e) => setDeleteAuthCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={deleteBusy}
                            onClick={() => {
                                setDeleteTarget(null);
                                setDeleteConfirm('');
                                setDeleteAuthCode('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={
                                deleteBusy ||
                                deleteAuthCode.length !== 6 ||
                                deleteConfirm.trim() !== ((deleteTarget?.ipAddress || '').trim() || deleteTarget?._id || '')
                            }
                            onClick={confirmDeleteOrder}
                        >
                            {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Delete order
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                                            value={editingOrder.provider || undefined}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, provider: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Provider" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[min(420px,70vh)]">
                                                {ADMIN_PROVIDER_EDIT_OPTIONS.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label>Manage panel (company)</Label>
                                        <Select
                                            value={
                                                editingOrder.trialManageCompanyId
                                                    ? editingOrder.trialManageCompanyId
                                                    : '__none__'
                                            }
                                            onValueChange={(value) =>
                                                setEditingOrder({
                                                    ...editingOrder,
                                                    trialManageCompanyId:
                                                        value === '__none__' ? '' : value,
                                                })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Default (from IP stock)" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[min(420px,70vh)]">
                                                <SelectItem value="__none__">
                                                    Default — use IP stock company
                                                </SelectItem>
                                                {adminCompanies.map((co) => (
                                                    <SelectItem key={co._id} value={co._id}>
                                                        {co.name || co.slug || co._id}
                                                        {co.slug ? ` (${co.slug})` : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Customer Start/Stop/Sync uses this company&apos;s panel (e.g. Oceanlinux-P → dash.primevm.in, Oceanlinux-C → cloud.primevm.in). Set provider to reseller-api for PrimeVPS panels; netbay/advps use that company&apos;s API when configured.
                                        </p>
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

                            {/* Netbay / Slot selection (read-only) */}
                            {(editingOrder.netbayGroupTag || editingOrder.slotIpPackageId) && (
                                <div className="space-y-3">
                                    <h3 className="text-lg font-semibold border-b pb-2">Customer Selection</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {editingOrder.netbayGroupTag ? (
                                            <div className="space-y-2">
                                                <Label>Netbay IP range (tag)</Label>
                                                <Input
                                                    value={editingOrder.netbayGroupTag}
                                                    readOnly
                                                    className="bg-muted font-mono"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Range customer chose at checkout — tell company if this tag has stock issues.
                                                </p>
                                            </div>
                                        ) : null}
                                        {editingOrder.slotIpPackageId ? (
                                            <div className="space-y-2">
                                                <Label>Slot IP package</Label>
                                                <Input
                                                    value={editingOrder.slotIpPackageId}
                                                    readOnly
                                                    className="bg-muted font-mono text-xs"
                                                />
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )}

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

            {/* GST Report Export Dialog */}
            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                <DialogContent className="flex max-h-[min(90dvh,720px)] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
                    <div className="shrink-0 space-y-1.5 border-b px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
                        <DialogHeader className="space-y-2 text-left">
                            <DialogTitle className="flex items-start gap-2 text-base leading-snug sm:text-lg">
                                <Download className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>Export GST Report</span>
                            </DialogTitle>
                            <DialogDescription className="text-left text-xs leading-relaxed sm:text-sm">
                                Separate Razorpay and UPI (KwikUPI) GST CSVs. Renewals use the gateway that was paid.
                                Wallet top-ups use the same gateway. Wallet purchases and wallet renewals follow the user&apos;s latest top-up before that payment.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Report type</Label>
                            <div
                                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                                role="radiogroup"
                                aria-label="GST report type"
                            >
                                {(
                                    [
                                        {
                                            id: 'razorpay' as const,
                                            title: 'Razorpay Sales',
                                            hint: 'Razorpay pay, Razorpay renewal, Razorpay wallet top-up, wallet buy or renew after Razorpay top-up',
                                            icon: CreditCard,
                                        },
                                        {
                                            id: 'upi' as const,
                                            title: 'UPI (KwikUPI)',
                                            hint: 'UPI pay, UPI renewal, UPI wallet top-up, wallet buy or renew after UPI top-up',
                                            icon: Wallet,
                                        },
                                    ] as const
                                ).map(({ id, title, hint, icon: Icon }) => {
                                    const selected = exportGateway === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => setExportGateway(id)}
                                            className={[
                                                'flex w-full min-w-0 flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                                selected
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-border bg-background hover:bg-muted/40',
                                            ].join(' ')}
                                        >
                                            <span className="flex w-full items-center gap-2 font-semibold text-sm">
                                                <Icon className="h-4 w-4 shrink-0" />
                                                <span className="min-w-0 break-words">{title}</span>
                                            </span>
                                            <span className="text-xs font-normal leading-relaxed text-muted-foreground">
                                                {hint}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="export-duration" className="text-sm font-medium">
                                Duration
                            </Label>
                            <Select value={exportPreset} onValueChange={(v) => setExportPreset(v as typeof exportPreset)}>
                                <SelectTrigger id="export-duration" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper" className="max-h-[min(280px,50vh)]">
                                    <SelectItem value="thisMonth">This Month</SelectItem>
                                    <SelectItem value="lastMonth">Last Month</SelectItem>
                                    <SelectItem value="last30">Last 30 Days</SelectItem>
                                    <SelectItem value="thisYear">This Year</SelectItem>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="custom">Custom Range</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {exportPreset === 'custom' && (
                            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                                <div className="min-w-0 space-y-1.5">
                                    <Label htmlFor="export-from" className="text-sm">
                                        From
                                    </Label>
                                    <Input
                                        id="export-from"
                                        type="date"
                                        value={exportFrom}
                                        onChange={(e) => setExportFrom(e.target.value)}
                                        className="w-full min-w-0"
                                    />
                                </div>
                                <div className="min-w-0 space-y-1.5">
                                    <Label htmlFor="export-to" className="text-sm">
                                        To
                                    </Label>
                                    <Input
                                        id="export-to"
                                        type="date"
                                        value={exportTo}
                                        onChange={(e) => setExportTo(e.target.value)}
                                        className="w-full min-w-0"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
                            <div className="space-y-1">
                                <Label htmlFor="export-sales-pct" className="text-sm font-medium">
                                    Reportable sales %
                                </Label>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Scale CSV amounts to this % of actual paid sales. Example: 80% → ₹1,000 sale
                                    shows as ₹800 taxable + GST on ₹800 only.
                                </p>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {[100, 80, 70, 50].map((pct) => (
                                    <Button
                                        key={pct}
                                        type="button"
                                        size="sm"
                                        variant={exportSalesPercent === String(pct) ? 'default' : 'outline'}
                                        className="h-9 w-full px-0"
                                        onClick={() => setExportSalesPercent(String(pct))}
                                    >
                                        {pct}%
                                    </Button>
                                ))}
                            </div>
                            <Input
                                id="export-sales-pct"
                                type="number"
                                min={1}
                                max={100}
                                step={1}
                                value={exportSalesPercent}
                                onChange={(e) => setExportSalesPercent(e.target.value)}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-muted/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <DialogClose asChild>
                            <Button variant="outline" className="w-full sm:w-auto sm:min-w-[7rem]">
                                Cancel
                            </Button>
                        </DialogClose>
                        <div className="grid w-full grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:w-auto sm:min-w-[20rem]">
                            <Button
                                variant={exportGateway === 'razorpay' ? 'default' : 'outline'}
                                disabled={exportingGst}
                                className="h-10 w-full gap-2"
                                onClick={() => void exportGstReport('razorpay')}
                            >
                                {exportingGst && exportGateway === 'razorpay' ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                ) : (
                                    <Download className="h-4 w-4 shrink-0" />
                                )}
                                <span className="truncate">
                                    <span className="sm:hidden">Razorpay</span>
                                    <span className="hidden sm:inline">Razorpay Report</span>
                                </span>
                            </Button>
                            <Button
                                variant={exportGateway === 'upi' ? 'default' : 'outline'}
                                disabled={exportingGst}
                                className="h-10 w-full gap-2"
                                onClick={() => void exportGstReport('upi')}
                            >
                                {exportingGst && exportGateway === 'upi' ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                ) : (
                                    <Download className="h-4 w-4 shrink-0" />
                                )}
                                <span className="truncate">
                                    <span className="sm:hidden">UPI</span>
                                    <span className="hidden sm:inline">UPI Report</span>
                                </span>
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Transfer VPS Dialog */}
            {suspendOrder && (
                <Dialog
                    open={!!suspendOrder}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSuspendOrder(null);
                            setSuspendMessage('');
                        }
                    }}
                >
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {suspendOrder.adminSuspended ? 'Manage Order Suspension' : 'Suspend Order for Customer'}
                            </DialogTitle>
                            <DialogDescription>
                                Customer will not be able to manage this server (start/stop, reinstall, renew, etc.). Your message will be shown on their order page.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                                <p className="font-medium">{suspendOrder.productName}</p>
                                <p className="text-muted-foreground">
                                    IP: <span className="font-mono">{suspendOrder.ipAddress || 'Pending'}</span>
                                </p>
                                <p className="text-muted-foreground">
                                    Customer: {suspendOrder.user?.name || 'N/A'} ({suspendOrder.user?.email || 'N/A'})
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="suspend-message">Message for customer</Label>
                                <Textarea
                                    id="suspend-message"
                                    value={suspendMessage}
                                    onChange={(e) => setSuspendMessage(e.target.value)}
                                    placeholder="e.g. Payment pending — please contact support on WhatsApp."
                                    rows={4}
                                    maxLength={2000}
                                />
                                <p className="text-xs text-muted-foreground">
                                    This message is shown to the user when they open this order.
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 flex-wrap">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSuspendOrder(null);
                                    setSuspendMessage('');
                                }}
                                disabled={suspending}
                            >
                                Cancel
                            </Button>
                            {suspendOrder.adminSuspended ? (
                                <>
                                    <Button
                                        variant="secondary"
                                        onClick={() => handleSuspendOrder(suspendOrder, suspendMessage, true)}
                                        disabled={suspending || !suspendMessage.trim()}
                                        className="gap-2"
                                    >
                                        {suspending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Update Message
                                    </Button>
                                    <Button
                                        variant="default"
                                        onClick={() => handleSuspendOrder(suspendOrder, '', false)}
                                        disabled={suspending}
                                        className="gap-2"
                                    >
                                        {suspending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                                        Unsuspend
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="destructive"
                                    onClick={() => handleSuspendOrder(suspendOrder, suspendMessage, true)}
                                    disabled={suspending || !suspendMessage.trim()}
                                    className="gap-2"
                                >
                                    {suspending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                    Suspend Order
                                </Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

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
                                    {!transferOrder.ipAddress?.trim() ? (
                                        <> Servers without an IP yet appear under <strong>Dashboard → Orders</strong> on the new account (not My Servers).</>
                                    ) : null}
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
