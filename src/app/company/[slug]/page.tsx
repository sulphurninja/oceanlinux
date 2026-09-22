'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2, Server, Package, Loader2, LogOut, Lock, Save, Eye, EyeOff,
  Globe, KeyRound, Search, ArrowUpDown, CalendarDays, ClipboardList,
  Play, Square, RotateCcw, HardDriveIcon, CheckCircle, XCircle, Clock,
  MessageSquare, RefreshCw, IndianRupee, Terminal, MemoryStick, AlertTriangle, User,
  ChevronDown, ChevronUp, Copy, Cloud, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { customerServiceErrorMessage } from '@/lib/customerFacingErrors';
import { COMPANY_FILTER_VERSION, isCompanyVisibleOrder } from '@/lib/companyOrders';
import {
  buildCompanyInventoryActivity,
  buildCompanyValidityMismatchReport,
  splitValidityMismatchesByRisk,
  groupValidityMismatchesByGapDays,
  getValidityMismatchRisk,
  type ValidityMismatchRow,
} from '@/lib/companyValidityMismatch';
import { getCompanyValidityDays } from '@/lib/expiryHelper';
import { OsIcon, humanizeOsLabel } from '@/components/os/OsIcon';
import CompanyPanelZonesTab from '@/components/company/CompanyPanelZonesTab';
import CompanyBulkPromoTab from '@/components/company/CompanyBulkPromoTab';

function orderStatusBadgeProps(status: string): {
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  className?: string;
  label?: string;
} {
  if (status === 'active') {
    return {
      variant: 'outline',
      label: 'active',
      className:
        'text-[10px] h-4 capitalize text-emerald-700 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    };
  }
  if (status === 'confirmed' || status === 'paid') {
    return {
      variant: 'outline',
      label: 'needs delivery',
      className:
        'text-[10px] h-4 capitalize text-red-700 border-red-200 bg-red-50 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
    };
  }
  if (status === 'completed') return { variant: 'secondary', className: 'text-[10px] h-4 capitalize' };
  return { variant: 'outline', className: 'text-[10px] h-4 capitalize' };
}

function formatOrderDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getDaysUntilExpiry(expiryDate?: string) {
  if (!expiryDate) return null;
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getValidityDays(createdAt?: string, expiryDate?: string) {
  if (!createdAt || !expiryDate) return null;
  return Math.max(
    0,
    Math.ceil((new Date(expiryDate).getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
  );
}

function styleProductName(content: string) {
  const regex = /(\([^)]*\)|[a-zA-Z]+)/g;
  return content.split(regex).map((part, index) => {
    if (part.match(/\([^)]*\)/) || part.match(/[a-zA-Z]/)) {
      return (
        <span key={index} className="text-emerald-700 dark:text-emerald-300 font-semibold">
          {part}
        </span>
      );
    }
    return part;
  });
}

interface InventoryItem {
  _id: string;
  ipAddress: string;
  username: string;
  password: string;
  os: string;
  expiryDate?: string | null;
  addedAt?: string | null;
  allocatedAt?: string | null;
  allocated: boolean;
  orderId?: string | null;
}

interface Stock {
  _id: string;
  name: string;
  available: boolean;
  stockCount: number;
  usesStockCount?: boolean;
  fulfillmentMode?: 'units' | 'inventory' | 'auto';
  liveStock?: {
    enabled: boolean;
    manualOverride?: boolean;
    zoneLive?: boolean;
    zoneName?: string | null;
    zoneStatus?: string | null;
    message?: string | null;
    lastSync?: string | null;
  };
  usesPreconfiguredInventory?: boolean;
  inventoryTotal?: number;
  inventoryAvailable?: number;
  inventoryItems?: InventoryItem[];
  serverType: string;
  tags: string[];
  promoCodes?: Array<{
    code: string;
    discount: number;
    discountType?: 'percentage' | 'fixed';
    isActive?: boolean;
  }>;
  resellerZones?: {
    configured?: boolean;
    zoneId?: number | null;
    zoneIds?: number[];
    zoneName?: string | null;
  };
}

const LINUX_OS_OPTIONS = ['Ubuntu 22', 'CentOS 7'] as const;
const VPS_OS_OPTIONS = ['Windows 2022 64'] as const;

function defaultOsForStock(serverType: string): string {
  return serverType === 'VPS' ? 'Windows 2022 64' : 'Ubuntu 22';
}

function osOptionsForStock(serverType: string): readonly string[] {
  return serverType === 'VPS' ? VPS_OS_OPTIONS : LINUX_OS_OPTIONS;
}

function defaultUsernameForOs(os: string): string {
  if (os === 'Windows 2022 64') return 'Administrator';
  return 'root';
}

function defaultInventoryFormForStock(stock: Pick<Stock, 'serverType'>) {
  const os = defaultOsForStock(stock.serverType);
  return {
    ipAddress: '',
    username: defaultUsernameForOs(os),
    password: '',
    os,
    expiryDate: '',
  };
}

function formatInventoryExpiry(value?: string | Date | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatExtendLine(ipAddress: string, gapDays: number) {
  const unit = gapDays === 1 ? 'day' : 'days';
  return `${ipAddress} extend ${gapDays} ${unit}`;
}

function formatExtendLines(rows: ValidityMismatchRow[]) {
  return rows.map((row) => formatExtendLine(row.ipAddress, row.gapDays)).join('\n');
}

function gapDayGroupLabel(gapDays: number, count: number) {
  const unit = gapDays === 1 ? 'day' : 'days';
  return `${gapDays} ${unit} extend (${count})`;
}

function toDateInputValue(value?: string | Date | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function normalizeInventoryFormForStock(
  form: { ipAddress: string; username: string; password: string; os: string; expiryDate?: string },
  stock: Pick<Stock, 'serverType'>
) {
  const allowed = osOptionsForStock(stock.serverType);
  const os = allowed.includes(form.os) ? form.os : defaultOsForStock(stock.serverType);
  return {
    ...form,
    os,
    username: defaultUsernameForOs(os),
  };
}

interface Order {
  _id: string;
  productName: string;
  memory: string;
  ipAddress: string;
  username: string;
  password: string;
  os?: string;
  status: string;
  provisioningStatus?: string;
  customerName?: string;
  customerEmail?: string;
  createdAt: string;
  expiryDate?: string;
  stockName: string;
  serverType?: string;
  ipStockId?: string;
  inventoryItemId?: string;
}

interface ActionRequest {
  _id: string;
  orderId: string;
  userId: { _id: string; name: string; email: string };
  action: string;
  status: string;
  requestedAt: string;
  processedAt?: string;
  adminNotes?: string;
  orderSnapshot: {
    productName: string;
    ipAddress: string;
    customerEmail: string;
    customerName: string;
    os: string;
    memory: string;
  };
}

interface RenewalRequestDoc {
  _id: string;
  orderId: string;
  renewalTxnId: string;
  amount: number;
  paymentMethod: 'cashfree' | 'razorpay' | 'upi';
  paymentId?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  processedAt?: string;
  adminNotes?: string;
  orderSnapshot: {
    productName: string;
    ipAddress?: string;
    customerEmail?: string;
    customerName?: string;
    memory?: string;
    stockName?: string;
  };
  renewalSnapshot: {
    previousExpiry?: string;
    proposedNewExpiry?: string;
  };
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  start: <Play className="h-3.5 w-3.5" />,
  stop: <Square className="h-3.5 w-3.5" />,
  restart: <RotateCcw className="h-3.5 w-3.5" />,
  format: <HardDriveIcon className="h-3.5 w-3.5" />,
};

function isToday(d: Date) { const t = new Date(); return d.toDateString() === t.toDateString(); }
function isYesterday(d: Date) { const t = new Date(); t.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString(); }
function isThisWeek(d: Date) { const now = new Date(); const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7); return d >= weekAgo; }
function isThisMonth(d: Date) { const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }

function parseDateInput(value: string, endOfDay = false): Date | null {
  if (!value) return null;
  const [y, m, day] = value.split('-').map(Number);
  if (!y || !m || !day) return null;
  const date = new Date(y, m - 1, day);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

function isInCustomDateRange(d: Date, from: string, to: string) {
  const start = parseDateInput(from, false);
  const end = parseDateInput(to, true);
  if (!start && !end) return true;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function formatCustomDateLabel(from: string, to: string) {
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return 'Custom range';
}

const COMPANY_TABS = ['stocks', 'panelZones', 'bulkPromos', 'orders', 'requests', 'renewals'] as const;
type CompanyTab = (typeof COMPANY_TABS)[number];

function isCompanyTab(value: string | null): value is CompanyTab {
  return Boolean(value && (COMPANY_TABS as readonly string[]).includes(value));
}

export default function CompanyDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [actionRequests, setActionRequests] = useState<ActionRequest[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequestDoc[]>([]);
  const [pendingRenewalCount, setPendingRenewalCount] = useState(0);
  const [tab, setTab] = useState<CompanyTab>('stocks');

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (isCompanyTab(requestedTab)) {
      setTab(requestedTab);
    }
  }, [searchParams]);
  const [savingStockId, setSavingStockId] = useState<string | null>(null);
  const [stockCountDrafts, setStockCountDrafts] = useState<Record<string, string>>({});
  const [inventoryBulkDrafts, setInventoryBulkDrafts] = useState<Record<string, string>>({});
  const [inventoryFormDrafts, setInventoryFormDrafts] = useState<
    Record<string, { ipAddress: string; username: string; password: string; os: string; expiryDate?: string }>
  >({});
  const [expandedStockId, setExpandedStockId] = useState<string | null>(null);
  const [hasResellerSync, setHasResellerSync] = useState(false);
  const [hasPortalBulkPromos, setHasPortalBulkPromos] = useState(false);
  const [hasLiveStockSync, setHasLiveStockSync] = useState(false);
  const [resellerLabel, setResellerLabel] = useState('Hostheaven');
  const [syncingStockId, setSyncingStockId] = useState<string | null>(null);
  const [syncingAllExpiries, setSyncingAllExpiries] = useState(false);
  const [syncingVpsAudit, setSyncingVpsAudit] = useState(false);
  const [vpsAudit, setVpsAudit] = useState<{
    panelTotal: number;
    onPanelNotInOrdersCount: number;
    onPanelNotInOrders: Array<{
      ip: string;
      vmId: string;
      serverName: string;
      expiryDate: string | null;
      panelStatus: string;
      inInventory: boolean;
    }>;
  } | null>(null);
  const [syncingLiveStock, setSyncingLiveStock] = useState(false);
  const [lastSyncFailed, setLastSyncFailed] = useState<Array<{ ipAddress: string; error: string }>>([]);
  const [panelExpiryByIp, setPanelExpiryByIp] = useState<Record<string, string>>({});

  // Order filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [deployOutdated, setDeployOutdated] = useState(false);

  const visibleOrders = useMemo(
    () => orders.filter(isCompanyVisibleOrder),
    [orders]
  );
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editIp, setEditIp] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editOs, setEditOs] = useState('');
  const [saving, setSaving] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Action request processing
  const [processingRequest, setProcessingRequest] = useState<ActionRequest | null>(null);
  const [processAction, setProcessAction] = useState<'approve' | 'reject'>('approve');
  const [processNotes, setProcessNotes] = useState('');
  const [processNewPassword, setProcessNewPassword] = useState('');
  const [processingLoading, setProcessingLoading] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState('pending');

  // Renewal request processing
  const [processingRenewal, setProcessingRenewal] = useState<RenewalRequestDoc | null>(null);
  const [renewalAction, setRenewalAction] = useState<'approve' | 'reject'>('approve');
  const [renewalNotes, setRenewalNotes] = useState('');
  const [renewalProcessingLoading, setRenewalProcessingLoading] = useState(false);
  const [renewOnHostheavenPanel, setRenewOnHostheavenPanel] = useState(true);
  const [renewalStatusFilter, setRenewalStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const friendlyCompanyError = (raw: unknown, action?: string) =>
    customerServiceErrorMessage(typeof raw === 'string' ? raw : String(raw || ''), { action });

  useEffect(() => { checkSession(); }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/company/me');
      if (res.ok) {
        const data = await res.json();
        if (data.slug === slug) {
          setAuthed(true);
          setCompanyName(data.name);
          loadData();
        }
      }
    } catch {} finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoginLoading(true);
    try {
      const res = await fetch('/api/company/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setAuthed(true);
        setCompanyName(data.name);
        setDeployOutdated(data.ordersFilter !== COMPANY_FILTER_VERSION);
        toast.success(`Welcome, ${data.name}`);
        loadData();
      } else {
        toast.error(friendlyCompanyError(data.error, 'login') || 'Invalid credentials');
      }
    } catch { toast.error('Login failed'); }
    finally { setLoginLoading(false); }
  };

  const loadData = async () => {
    const [stockRes, orderRes] = await Promise.all([
      fetch('/api/company/stocks', { cache: 'no-store' }),
      fetch(`/api/company/orders?_=${Date.now()}`, { cache: 'no-store' }),
    ]);
    if (stockRes.ok) {
      const payload = await stockRes.json();
      const rows: Stock[] = Array.isArray(payload) ? payload : (payload.stocks ?? []);
      setStocks(rows);
      setStockCountDrafts(Object.fromEntries(rows.map(s => [s._id, String(s.stockCount ?? 0)])));
      if (!Array.isArray(payload)) {
        setHasResellerSync(!!payload.hasResellerSync);
        setHasPortalBulkPromos(!!payload.hasPortalBulkPromos);
        setHasLiveStockSync(!!payload.hasLiveStockSync);
        setResellerLabel(payload.resellerLabel || 'Hostheaven');
      }
    } else {
      const errPayload = await stockRes.json().catch(() => ({}));
      toast.error(friendlyCompanyError(errPayload.error, 'sync'));
    }
    if (orderRes.ok) {
      const data = await orderRes.json();
      const rows: Order[] = Array.isArray(data) ? data : (data.orders ?? []);
      setOrders(rows.filter(isCompanyVisibleOrder));
      if (data?.filterVersion) {
        setDeployOutdated(data.filterVersion !== COMPANY_FILTER_VERSION);
      }
    }
    loadActionRequests('pending');
    loadRenewalRequests('pending');
  };

  const loadActionRequests = async (status: string) => {
    try {
      const res = await fetch(`/api/company/action-requests?status=${status}`);
      if (res.ok) setActionRequests(await res.json());
    } catch {}
  };

  const loadRenewalRequests = async (status: 'pending' | 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/company/renewal-requests?status=${status}`);
      if (res.ok) {
        const list = await res.json();
        setRenewalRequests(list);
        if (status === 'pending') setPendingRenewalCount(list.length);
      }
    } catch {}
  };

  useEffect(() => {
    if (authed) loadActionRequests(requestStatusFilter);
  }, [requestStatusFilter]);

  useEffect(() => {
    if (authed) loadRenewalRequests(renewalStatusFilter);
  }, [renewalStatusFilter]);

  const updateStockCount = async (stockId: string) => {
    const raw = stockCountDrafts[stockId];
    const stockCount = Math.max(0, Math.floor(Number(raw) || 0));
    setSavingStockId(stockId);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, stockCount, action: 'setStockCount' }),
      });
      const data = await res.json();
      if (res.ok) {
        setStocks(prev => prev.map(s => s._id === stockId ? { ...s, ...data.stock } : s));
        setStockCountDrafts(prev => ({ ...prev, [stockId]: String(data.stock.stockCount) }));
        toast.success(stockCount > 0 ? `Stock set to ${stockCount}` : 'Marked out of stock');
      } else {
        toast.error(friendlyCompanyError(data.error));
      }
    } catch {
      toast.error('Failed to update stock');
    } finally {
      setSavingStockId(null);
    }
  };

  const syncLiveStock = async () => {
    setSyncingLiveStock(true);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'syncLiveStock' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Live stock sync failed');
      }
      if (Array.isArray(data.stocks)) {
        setStocks(data.stocks);
        setStockCountDrafts(Object.fromEntries(data.stocks.map((s: Stock) => [s._id, String(s.stockCount ?? 0)])));
      }
      if (data.failed?.length) {
        toast.warning(`${data.inStock}/${data.synced} in stock · ${data.failed.length} failed`);
      } else {
        toast.success(`Live stock synced — ${data.inStock}/${data.synced} in stock on panel`);
      }
    } catch (err: unknown) {
      toast.error(friendlyCompanyError(err instanceof Error ? err.message : err, 'sync'));
    } finally {
      setSyncingLiveStock(false);
    }
  };

  const syncAllExpiries = async () => {
    setSyncingAllExpiries(true);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'syncAllResellerExpiries' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sync all failed');
      }

      if (Array.isArray(data.stocks)) {
        setStocks(data.stocks);
        setStockCountDrafts(Object.fromEntries(data.stocks.map((s: Stock) => [s._id, String(s.stockCount ?? 0)])));
      }

      const orderRes = await fetch(`/api/company/orders?_=${Date.now()}`, { cache: 'no-store' });
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        const orderRows: Order[] = Array.isArray(orderData) ? orderData : (orderData.orders ?? []);
        setOrders(orderRows.filter(isCompanyVisibleOrder));
      }

      setLastSyncFailed(
        Array.isArray(data.failed)
          ? data.failed.map((f: { ipAddress: string; error?: string }) => ({
              ipAddress: f.ipAddress,
              error: f.error || 'Sync failed',
            }))
          : []
      );

      if (data.panelExpiriesByIp && typeof data.panelExpiriesByIp === 'object') {
        const normalized: Record<string, string> = {};
        for (const [ip, exp] of Object.entries(data.panelExpiriesByIp)) {
          if (exp) normalized[String(ip).split(':')[0].trim()] = String(exp);
        }
        setPanelExpiryByIp((prev) => ({ ...prev, ...normalized }));
      }

      const mismatchIps: string[] = data.mismatchIps || [];
      const urgentCount = Array.isArray(data.mismatches)
        ? data.mismatches.filter((m: { panelDaysLeft?: number }) => (m.panelDaysLeft ?? 99) <= 10).length
        : 0;
      if (data.failedCount > 0 || data.ordersFailedCount > 0) {
        toast.warning(
          `${data.updatedCount} inventory + ${data.ordersUpdatedCount || 0} orders synced` +
            ` — ${(data.failedCount || 0) + (data.ordersFailedCount || 0)} failed (panel par nahi mile)`
        );
      } else {
        toast.success(
          `${data.updatedCount} inventory + ${data.ordersUpdatedCount || 0} customer orders — Hostheaven expiry sync ho gayi`
        );
      }

      if (mismatchIps.length > 0) {
        toast.error(
          urgentCount > 0
            ? `${urgentCount} urgent (≤10d panel) + ${mismatchIps.length - urgentCount} extend needed — lists updated`
            : `${mismatchIps.length} IP par panel expiry kam hai — extend karo`,
          { duration: 8000 }
        );
      } else if (data.updatedCount > 0) {
        toast.success('Sab VPS OK — panel expiry customer validity se match hai');
      }
    } catch (err: any) {
      toast.error(friendlyCompanyError(err.message, 'sync'));
    } finally {
      setSyncingAllExpiries(false);
    }
  };

  const syncAllVpsAudit = async () => {
    setSyncingVpsAudit(true);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auditVpsReconciliation' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'VPS compare failed');
      }
      setVpsAudit({
        panelTotal: data.panelTotal,
        onPanelNotInOrdersCount: data.onPanelNotInOrdersCount,
        onPanelNotInOrders: data.onPanelNotInOrders || [],
      });
      if (data.onPanelNotInOrdersCount === 0) {
        toast.success(`Koi extra VPS nahi — Hostheaven ki har VM kisi order se linked hai`);
      } else {
        toast.warning(`${data.onPanelNotInOrdersCount} VPS Hostheaven par hain lekin kisi order mein nahi`);
      }
    } catch (err: unknown) {
      toast.error(friendlyCompanyError(err instanceof Error ? err.message : err, 'sync'));
    } finally {
      setSyncingVpsAudit(false);
    }
  };

  const syncResellerCredentials = async (stockId: string, stock: Stock, addToInventory: boolean) => {
    const form = normalizeInventoryFormForStock(
      inventoryFormDrafts[stockId] || defaultInventoryFormForStock(stock),
      stock
    );
    if (!form.ipAddress.trim()) {
      toast.error('Enter IP address first');
      return;
    }

    setSyncingStockId(stockId);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId,
          action: 'syncResellerCredentials',
          ipAddress: form.ipAddress.trim(),
          addToInventory,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sync failed');
      }

      if (addToInventory && data.stock) {
        setStocks(prev => prev.map(s => s._id === stockId ? data.stock : s));
        setStockCountDrafts(prev => ({ ...prev, [stockId]: String(data.stock.stockCount) }));
        setInventoryFormDrafts(prev => ({
          ...prev,
          [stockId]: defaultInventoryFormForStock(stock),
        }));
        toast.success(`${data.credentials?.ipAddress || form.ipAddress} added via ${resellerLabel} sync${data.credentials?.expiryDate ? ` · expires ${formatInventoryExpiry(data.credentials.expiryDate)}` : ''}`);
      } else if (data.credentials) {
        setInventoryFormDrafts(prev => ({
          ...prev,
          [stockId]: {
            ipAddress: data.credentials.ipAddress,
            username: data.credentials.username,
            password: data.credentials.password,
            os: data.credentials.os,
            expiryDate: toDateInputValue(data.credentials.expiryDate),
          },
        }));
        const expiryHint = data.credentials.expiryDate
          ? ` · expiry ${formatInventoryExpiry(data.credentials.expiryDate)}`
          : '';
        toast.success(`Password synced from ${resellerLabel}${expiryHint}`);
      }
    } catch (err: any) {
      toast.error(friendlyCompanyError(err.message, 'sync'));
    } finally {
      setSyncingStockId(null);
    }
  };

  const addInventory = async (stockId: string, mode: 'bulk' | 'single', stock: Stock) => {
    setSavingStockId(stockId);
    try {
      const payload: Record<string, unknown> = { stockId, action: 'addInventory' };
      if (mode === 'bulk') {
        payload.bulkLines = inventoryBulkDrafts[stockId] || '';
      } else {
        const form = normalizeInventoryFormForStock(
          inventoryFormDrafts[stockId] || defaultInventoryFormForStock(stock),
          stock
        );
        if (!form.ipAddress || !form.password) {
          toast.error('IP address and password are required');
          return;
        }
        payload.items = [{
          ...form,
          expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : undefined,
        }];
      }
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.stock) {
        setStocks(prev => prev.map(s => s._id === stockId ? data.stock : s));
        setStockCountDrafts(prev => ({ ...prev, [stockId]: String(data.stock.stockCount) }));
        if (mode === 'bulk') setInventoryBulkDrafts(prev => ({ ...prev, [stockId]: '' }));
        else {
          setInventoryFormDrafts(prev => ({
            ...prev,
            [stockId]: defaultInventoryFormForStock(stock),
          }));
        }
        toast.success(`Added ${data.added} server(s) — auto-deliver on payment`);
      } else {
        toast.error(friendlyCompanyError(data.error));
      }
    } catch {
      toast.error('Failed to add inventory');
    } finally {
      setSavingStockId(null);
    }
  };

  const releaseInventoryAllocation = async (stockId: string, removeItemId: string) => {
    if (!confirm('Return this sold IP to Available pool? Only do this if the customer order is closed.')) return;
    setSavingStockId(stockId);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, action: 'releaseInventoryAllocation', removeItemId }),
      });
      const data = await res.json();
      if (res.ok && data.stock) {
        setStocks(prev => prev.map(s => s._id === stockId ? data.stock : s));
        setStockCountDrafts(prev => ({ ...prev, [stockId]: String(data.stock.stockCount) }));
        toast.success(data.released ? 'IP returned to Available pool' : 'Already available');
      } else {
        toast.error(friendlyCompanyError(data.error));
      }
    } catch {
      toast.error('Failed to release IP');
    } finally {
      setSavingStockId(null);
    }
  };

  const removeInventoryItem = async (stockId: string, removeItemId: string) => {
    setSavingStockId(stockId);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, action: 'removeInventory', removeItemId }),
      });
      const data = await res.json();
      if (res.ok && data.stock) {
        setStocks(prev => prev.map(s => s._id === stockId ? data.stock : s));
        setStockCountDrafts(prev => ({ ...prev, [stockId]: String(data.stock.stockCount) }));
        toast.success('Removed unused server from stock');
      } else {
        toast.error(friendlyCompanyError(data.error));
      }
    } catch {
      toast.error('Failed to remove item');
    } finally {
      setSavingStockId(null);
    }
  };

  const getInventoryForm = (stock: Stock) =>
    normalizeInventoryFormForStock(
      inventoryFormDrafts[stock._id] || defaultInventoryFormForStock(stock),
      stock
    );

  const openEditOrder = (order: Order) => {
    const serverType = order.serverType || 'Linux';
    const allowed = osOptionsForStock(serverType);
    const os = order.os && allowed.includes(order.os)
      ? order.os
      : defaultOsForStock(serverType);
    setEditOrder(order);
    setEditIp(order.ipAddress || '');
    setEditUsername(order.username || defaultUsernameForOs(os));
    setEditPassword(order.password || '');
    setEditOs(os);
  };

  const saveOrderCreds = async () => {
    if (!editOrder) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/company/orders?_=${Date.now()}`, {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: editOrder._id, ipAddress: editIp, username: editUsername, password: editPassword, os: editOs }),
      });
      if (res.ok) {
        toast.success('Credentials updated');
        setOrders(prev => prev.map(o =>
          o._id === editOrder._id ? { ...o, ipAddress: editIp, username: editUsername, password: editPassword, os: editOs, status: 'active', provisioningStatus: 'active' } : o
        ));
        const stockRes = await fetch('/api/company/stocks', { cache: 'no-store' });
        if (stockRes.ok) {
          const payload = await stockRes.json();
          const rows: Stock[] = Array.isArray(payload) ? payload : (payload.stocks ?? []);
          setStocks(rows);
        }
        setEditOrder(null);
      } else {
        const data = await res.json();
        toast.error(friendlyCompanyError(data.error));
      }
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  };

  const handleProcessRequest = async () => {
    if (!processingRequest) return;
    setProcessingLoading(true);
    try {
      const res = await fetch('/api/company/action-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: processingRequest._id,
          action: processAction,
          adminNotes: processNotes,
          newPassword: (processingRequest.action === 'format' && processAction === 'approve' && processNewPassword) ? processNewPassword : undefined,
        }),
      });
      if (res.ok) {
        toast.success(`Request ${processAction === 'approve' ? 'approved' : 'rejected'}`);
        setProcessingRequest(null);
        setProcessNotes('');
        loadActionRequests(requestStatusFilter);
      } else {
        const data = await res.json();
        toast.error(friendlyCompanyError(data.error));
      }
    } catch { toast.error('Failed to process'); }
    finally { setProcessingLoading(false); }
  };

  const handleProcessRenewal = async () => {
    if (!processingRenewal) return;
    setRenewalProcessingLoading(true);
    try {
      const res = await fetch('/api/company/renewal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: processingRenewal._id,
          action: renewalAction,
          adminNotes: renewalNotes,
          renewOnHostheavenPanel:
            renewalAction === 'approve' && hasResellerSync && !!processingRenewal.orderSnapshot?.ipAddress
              ? renewOnHostheavenPanel
              : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const panelFailed =
          renewalAction === 'approve' &&
          data.hostheavenPanelRenew?.attempted &&
          data.hostheavenPanelRenew?.success === false;
        if (panelFailed) {
          toast.warning(
            data.message ||
              'OceanLinux expiry extended, but Hostheaven panel renew failed — extend manually on Hostheaven.',
            { duration: 12000 }
          );
        } else {
          toast.success(data.message || `Renewal ${renewalAction === 'approve' ? 'approved — order extended' : 'rejected'}`);
        }
        setProcessingRenewal(null);
        setRenewalNotes('');
        setRenewOnHostheavenPanel(true);
        loadRenewalRequests(renewalStatusFilter);
        if (renewalStatusFilter !== 'pending') {
          // Refresh the pending count badge.
          fetch('/api/company/renewal-requests?status=pending')
            .then(r => r.ok ? r.json() : [])
            .then((list: RenewalRequestDoc[]) => setPendingRenewalCount(list.length))
            .catch(() => {});
        }
      } else {
        const data = await res.json();
        toast.error(friendlyCompanyError(data.error));
      }
    } catch { toast.error('Failed to process'); }
    finally { setRenewalProcessingLoading(false); }
  };

  const handleLogout = () => {
    document.cookie = 'company_session=; path=/; max-age=0';
    setAuthed(false);
    setPassword('');
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleOrderDetails = (id: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered and sorted orders
  const filteredOrders = useMemo(() => {
    let result = visibleOrders;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(o =>
        o.productName.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerEmail?.toLowerCase().includes(q) ||
        o.ipAddress?.toLowerCase().includes(q) ||
        o.stockName?.toLowerCase().includes(q) ||
        o.memory?.toLowerCase().includes(q)
      );
    }

    if (dateFilter !== 'all') {
      result = result.filter(o => {
        const d = new Date(o.createdAt);
        switch (dateFilter) {
          case 'today': return isToday(d);
          case 'yesterday': return isYesterday(d);
          case 'week': return isThisWeek(d);
          case 'month': return isThisMonth(d);
          case 'custom':
            return isInCustomDateRange(d, customDateFrom, customDateTo);
          default: return true;
        }
      });
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name': return a.productName.localeCompare(b.productName);
        case 'status': return a.status.localeCompare(b.status);
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [visibleOrders, searchTerm, dateFilter, customDateFrom, customDateTo, sortBy]);

  const hasCustomDateRange = dateFilter === 'custom' && Boolean(customDateFrom || customDateTo);
  const hasActiveOrderFilters =
    Boolean(searchTerm) ||
    dateFilter !== 'all' ||
    sortBy !== 'newest';

  const clearOrderFilters = () => {
    setSearchTerm('');
    setDateFilter('all');
    setCustomDateFrom('');
    setCustomDateTo('');
    setSortBy('newest');
  };

  const pendingRequestCount = useMemo(() => {
    if (requestStatusFilter === 'pending') return actionRequests.length;
    return 0;
  }, [actionRequests, requestStatusFilter]);

  const validityMismatches = useMemo(
    () => buildCompanyValidityMismatchReport(stocks, visibleOrders, new Date(), panelExpiryByIp),
    [stocks, visibleOrders, panelExpiryByIp]
  );

  const { urgent: urgentValidityMismatches, standard: standardValidityMismatches } = useMemo(
    () => splitValidityMismatchesByRisk(validityMismatches),
    [validityMismatches]
  );

  const urgentGapGroups = useMemo(
    () => groupValidityMismatchesByGapDays(urgentValidityMismatches),
    [urgentValidityMismatches]
  );

  const standardGapGroups = useMemo(
    () => groupValidityMismatchesByGapDays(standardValidityMismatches),
    [standardValidityMismatches]
  );

  const extendLinesText = useMemo(
    () => formatExtendLines(validityMismatches),
    [validityMismatches]
  );

  const urgentExtendLinesText = useMemo(
    () => formatExtendLines(urgentValidityMismatches),
    [urgentValidityMismatches]
  );

  const standardExtendLinesText = useMemo(
    () => formatExtendLines(standardValidityMismatches),
    [standardValidityMismatches]
  );

  const copyText = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('Copy failed');
    }
  };

  const inventoryActivity = useMemo(
    () => buildCompanyInventoryActivity(stocks, validityMismatches.length),
    [stocks, validityMismatches.length]
  );

  const customerValidityDays = useMemo(() => getCompanyValidityDays(new Date()), []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Company Portal</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your password to access the <span className="font-medium text-foreground">{slug}</span> dashboard.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Password</Label>
              <Input type="password" placeholder="Enter company password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="mt-1.5" />
            </div>
            <Button className="w-full gap-2" onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">{companyName}</h1>
                <p className="text-xs text-muted-foreground">Company Dashboard</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Stocks</p><p className="text-2xl font-bold">{stocks.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Units</p><p className="text-2xl font-bold">{stocks.reduce((sum, s) => sum + (s.stockCount ?? 0), 0)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Out of Stock</p><p className="text-2xl font-bold text-red-500">{stocks.filter(s => (s.stockCount ?? 0) === 0).length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Paid Orders</p><p className="text-2xl font-bold">{visibleOrders.length}</p></CardContent></Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { id: 'stocks' as const, icon: <Server className="h-4 w-4" />, label: 'IP Stocks', count: stocks.length, badgeColor: '' },
            ...(hasResellerSync ? [{
              id: 'panelZones' as const,
              icon: <Cloud className="h-4 w-4" />,
              label: 'Panel Zones',
              count: stocks.filter((s) => s.resellerZones?.configured).length,
              badgeColor: '',
            }] : []),
            ...(hasPortalBulkPromos ? [{
              id: 'bulkPromos' as const,
              icon: <Tag className="h-4 w-4" />,
              label: 'Bulk Promos',
              count: stocks.filter((s) => (s.promoCodes?.length ?? 0) > 0).length,
              badgeColor: '',
            }] : []),
            { id: 'orders' as const, icon: <Package className="h-4 w-4" />, label: 'Orders', count: visibleOrders.length, badgeColor: '' },
            { id: 'requests' as const, icon: <ClipboardList className="h-4 w-4" />, label: 'Action Requests', count: null, badgeColor: '' },
            { id: 'renewals' as const, icon: <RefreshCw className="h-4 w-4" />, label: 'Renewals', count: pendingRenewalCount, badgeColor: pendingRenewalCount > 0 ? 'bg-amber-500 text-white' : '' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all shrink-0',
                tab === t.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}>
              {t.icon}
              {t.label}
              {t.count !== null && (
                <Badge
                  variant={t.badgeColor ? 'default' : 'secondary'}
                  className={cn('text-[10px] h-4 px-1.5', t.badgeColor)}
                >
                  {t.count}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* ── Stocks Tab ── */}
        {tab === 'stocks' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            {hasLiveStockSync && (
              <div className="xl:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">PrimeVPS live stock</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Panel zone ACTIVE/INACTIVE se auto in/out of stock (har 5 min sync). Manual Units mat dabao — zone hi control karega.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
                  onClick={syncLiveStock}
                  disabled={syncingLiveStock}
                >
                  {syncingLiveStock ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                      Sync live stock
                    </>
                  )}
                </Button>
              </div>
            )}
            {hasResellerSync && (
              <Card className="xl:col-span-2 border-2 border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10">
                <CardHeader className="pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-100">
                        <AlertTriangle className="h-5 w-5" />
                        Hostheaven par hai · order mein NAHI
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Hostheaven website par VM hai lekin OceanLinux ke <strong>kisi bhi order</strong> mein IP nahi (inventory mein ho to bhi dikhega).
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      className="shrink-0 bg-amber-600 hover:bg-amber-700"
                      onClick={syncAllVpsAudit}
                      disabled={syncingVpsAudit}
                    >
                      {syncingVpsAudit ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1.5" />
                          Check Hostheaven extra VPS
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!vpsAudit ? (
                    <p className="text-sm text-muted-foreground">
                      Button dabao — list aayegi jin VPS ka Hostheaven par bill chal raha hai par OceanLinux par record nahi.
                    </p>
                  ) : vpsAudit.onPanelNotInOrdersCount === 0 ? (
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                      ✓ Koi extra VPS nahi — Hostheaven ki har VM kisi order se linked hai ({vpsAudit.panelTotal} panel VMs checked).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          {vpsAudit.onPanelNotInOrdersCount} VPS — Hostheaven par hai, order mein nahi
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyText(
                              vpsAudit.onPanelNotInOrders.map((r) => r.ip).join('\n'),
                              'IP list copy ho gayi'
                            )
                          }
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy all IPs
                        </Button>
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-md border bg-background divide-y">
                        {vpsAudit.onPanelNotInOrders.map((row) => (
                          <div key={row.ip} className="px-3 py-2 text-sm">
                            <p className="font-mono font-semibold">{row.ip}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.serverName || 'VM'}
                              {row.expiryDate ? ` · expiry ${new Date(row.expiryDate).toLocaleDateString()}` : ''}
                              {row.inInventory ? ' · inventory mein hai, order nahi' : ' · order bhi nahi, inventory bhi nahi'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <div className="space-y-2 min-w-0">
            {stocks.length === 0 ? (
              <Card><CardContent className="py-12 text-center"><Server className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No IP stocks assigned to your company yet.</p></CardContent></Card>
            ) : stocks.map((stock) => {
              const count = stock.stockCount ?? 0;
              const live = stock.liveStock;
              const usesLivePanel = live?.enabled && !live.manualOverride;
              const invFree = stock.inventoryAvailable ?? 0;
              const inStock = usesLivePanel ? (!!live?.zoneLive || invFree > 0) : (invFree > 0 || count > 0);
              const hasPreconfig = stock.usesPreconfiguredInventory;
              const form = getInventoryForm(stock);
              const osOptions = osOptionsForStock(stock.serverType);
              const bulkPlaceholder = stock.serverType === 'VPS'
                ? 'Bulk add (one per line):\n103.151.44.189,Administrator,password123,Windows 2022 64'
                : 'Bulk add (one per line):\n103.151.44.190,root,pass456,Ubuntu 22\n103.151.44.191,root,pass789,CentOS 7';
              const expanded = expandedStockId === stock._id;
              return (
              <Card key={stock._id}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', inStock ? 'bg-green-500/10' : 'bg-red-500/10')}>
                        <Server className={cn('h-4 w-4', inStock ? 'text-green-600' : 'text-red-500')} />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">{stock.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] h-4">{stock.serverType}</Badge>
                          {stock.tags?.map(t => <Badge key={t} variant="secondary" className="text-[10px] h-4">{t}</Badge>)}
                          {inStock ? (
                            <Badge className="text-[10px] h-4 bg-emerald-500/10 text-emerald-700">
                              {invFree > 0
                                ? `${invFree} saved VPS · then panel`
                                : usesLivePanel
                                  ? 'Live on panel'
                                  : `${count} in stock`}
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] h-4 bg-red-500/10 text-red-600">Out of stock</Badge>
                          )}
                          {usesLivePanel && live?.zoneName && (
                            <Badge variant="outline" className="text-[10px] h-4">{live.zoneName}</Badge>
                          )}
                          {live?.manualOverride && (
                            <Badge variant="secondary" className="text-[10px] h-4">Manual units</Badge>
                          )}
                          {hasPreconfig && (
                            <Badge className="text-[10px] h-4 bg-blue-500/10 text-blue-700">
                              {stock.inventoryAvailable}/{stock.inventoryTotal} servers saved
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedStockId(expanded ? null : stock._id)}
                      >
                        {expanded ? 'Hide' : 'Manage servers'}
                      </Button>
                      {usesLivePanel ? (
                        <div className="text-xs text-muted-foreground max-w-[220px] text-right">
                          Panel zone controls stock
                          {live?.zoneName ? ` · ${live.zoneName}` : ''}
                        </div>
                      ) : (
                        <>
                          <Label htmlFor={`stock-${stock._id}`} className="text-xs text-muted-foreground whitespace-nowrap">Units</Label>
                          <Input
                            id={`stock-${stock._id}`}
                            type="number"
                            min={0}
                            step={1}
                            value={stockCountDrafts[stock._id] ?? String(count)}
                            onChange={(e) => setStockCountDrafts(prev => ({ ...prev, [stock._id]: e.target.value }))}
                            className="w-24 h-9"
                          />
                          <Button
                            size="sm"
                            onClick={() => updateStockCount(stock._id)}
                            disabled={savingStockId === stock._id}
                          >
                            {savingStockId === stock._id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t pt-4 space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Pre-configured servers</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Add IP + credentials in advance. When a customer pays, the next available server is assigned instantly (like Slot IP).
                        </p>

                        {hasResellerSync && (
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 mb-3 space-y-2">
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                              <RefreshCw className="h-3.5 w-3.5" />
                              {resellerLabel} sync — enter IP only, password fetched automatically
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <Input
                                placeholder="IP Address (e.g. 192.168.1.10)"
                                value={form.ipAddress}
                                onChange={(e) => setInventoryFormDrafts(prev => ({
                                  ...prev,
                                  [stock._id]: { ...form, ipAddress: e.target.value },
                                }))}
                                className="sm:flex-1 font-mono"
                              />
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => syncResellerCredentials(stock._id, stock, false)}
                                  disabled={syncingStockId === stock._id || savingStockId === stock._id}
                                >
                                  {syncingStockId === stock._id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                      Sync
                                    </>
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => syncResellerCredentials(stock._id, stock, true)}
                                  disabled={syncingStockId === stock._id || savingStockId === stock._id}
                                >
                                  {syncingStockId === stock._id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    'Sync & Add'
                                  )}
                                </Button>
                              </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Sync fills username, password, OS, and expiry from the panel. Sync &amp; Add saves the server in one step.
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
                          <Input
                            placeholder="IP Address"
                            value={form.ipAddress}
                            onChange={(e) => setInventoryFormDrafts(prev => ({
                              ...prev,
                              [stock._id]: { ...form, ipAddress: e.target.value },
                            }))}
                          />
                          <Input
                            placeholder="Username"
                            value={form.username}
                            onChange={(e) => setInventoryFormDrafts(prev => ({
                              ...prev,
                              [stock._id]: { ...form, username: e.target.value },
                            }))}
                          />
                          <div className="relative">
                            <Input
                              placeholder="Password"
                              type={visiblePasswords.has(`form-${stock._id}`) ? 'text' : 'password'}
                              value={form.password}
                              onChange={(e) => setInventoryFormDrafts(prev => ({
                                ...prev,
                                [stock._id]: { ...form, password: e.target.value },
                              }))}
                              className="pr-9 font-mono"
                            />
                            <button
                              type="button"
                              title={visiblePasswords.has(`form-${stock._id}`) ? 'Hide password' : 'Show password'}
                              onClick={() => togglePasswordVisibility(`form-${stock._id}`)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {visiblePasswords.has(`form-${stock._id}`) ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <Select
                            value={form.os}
                            disabled={stock.serverType === 'VPS'}
                            onValueChange={(v) => setInventoryFormDrafts(prev => ({
                              ...prev,
                              [stock._id]: normalizeInventoryFormForStock({ ...form, os: v }, stock),
                            }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {osOptions.map((os) => (
                                <SelectItem key={os} value={os}>{os}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="date"
                            title="Expiry date (auto-filled on Hostheaven sync)"
                            value={form.expiryDate || ''}
                            onChange={(e) => setInventoryFormDrafts(prev => ({
                              ...prev,
                              [stock._id]: { ...form, expiryDate: e.target.value },
                            }))}
                            className="text-sm"
                          />
                        </div>
                        <Button
                          size="sm"
                          className="mb-3"
                          onClick={() => addInventory(stock._id, 'single', stock)}
                          disabled={savingStockId === stock._id}
                        >
                          Add 1 server
                        </Button>
                        <Textarea
                          placeholder={bulkPlaceholder}
                          value={inventoryBulkDrafts[stock._id] || ''}
                          onChange={(e) => setInventoryBulkDrafts(prev => ({ ...prev, [stock._id]: e.target.value }))}
                          rows={4}
                          className="text-xs font-mono mb-2"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => addInventory(stock._id, 'bulk', stock)}
                          disabled={savingStockId === stock._id}
                        >
                          Add from bulk paste
                        </Button>

                      {(stock.inventoryItems?.length ?? 0) > 0 && (
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-2">IP</th>
                                <th className="text-left p-2">User</th>
                                <th className="text-left p-2">Password</th>
                                <th className="text-left p-2">OS</th>
                                <th className="text-left p-2">Expiry</th>
                                <th className="text-left p-2">Status</th>
                                <th className="p-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {stock.inventoryItems!.map((item) => (
                                <tr key={item._id} className="border-t">
                                  <td className="p-2 font-mono">{item.ipAddress}</td>
                                  <td className="p-2">{item.username}</td>
                                  <td className="p-2">
                                    {item.allocated ? (
                                      <span className="text-muted-foreground">••••••</span>
                                    ) : item.password ? (
                                      <span className="font-mono flex items-center gap-1">
                                        {visiblePasswords.has(`inv-${item._id}`) ? item.password : '••••••'}
                                        <button
                                          type="button"
                                          title={visiblePasswords.has(`inv-${item._id}`) ? 'Hide password' : 'Show password'}
                                          onClick={() => togglePasswordVisibility(`inv-${item._id}`)}
                                          className="text-muted-foreground hover:text-foreground"
                                        >
                                          {visiblePasswords.has(`inv-${item._id}`) ? (
                                            <EyeOff className="h-3.5 w-3.5" />
                                          ) : (
                                            <Eye className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="p-2">{item.os}</td>
                                  <td className="p-2 whitespace-nowrap">
                                    {item.expiryDate ? (
                                      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                        <CalendarDays className="h-3 w-3 shrink-0" />
                                        {formatInventoryExpiry(item.expiryDate)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    {item.allocated ? (
                                      <Badge className="text-[10px] bg-muted">Sold</Badge>
                                    ) : (
                                      <Badge className="text-[10px] bg-emerald-500/10 text-emerald-700">Available</Badge>
                                    )}
                                  </td>
                                  <td className="p-2 text-right space-x-1">
                                    {item.allocated ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7"
                                        disabled={savingStockId === stock._id}
                                        onClick={() => releaseInventoryAllocation(stock._id, item._id)}
                                      >
                                        Return to pool
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-destructive"
                                        onClick={() => removeInventoryItem(stock._id, item._id)}
                                      >
                                        Remove
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );})}
            </div>

            <aside className="space-y-3 xl:sticky xl:top-4">
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Inventory activity
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Adds &amp; sales from your pre-configured server pool.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Added today</p>
                      <p className="text-xl font-bold text-emerald-600">{inventoryActivity.addedToday}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sold today</p>
                      <p className="text-xl font-bold">{inventoryActivity.soldToday}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ready</p>
                      <p className="text-xl font-bold">{inventoryActivity.readyCount}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sold total</p>
                      <p className="text-xl font-bold">{inventoryActivity.soldCount}</p>
                    </div>
                  </div>
                  {inventoryActivity.recentSoldByDay.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1.5">Recent sales by day</p>
                      <div className="space-y-1">
                        {inventoryActivity.recentSoldByDay.map((row) => (
                          <div key={row.label} className="flex items-center justify-between text-xs rounded-md border px-2 py-1.5">
                            <span className="text-muted-foreground">{row.label}</span>
                            <Badge variant="secondary" className="text-[10px] h-5">{row.count} sold</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={cn(
                'border-amber-500/40',
                validityMismatches.length > 0 ? 'bg-amber-50/80 dark:bg-amber-950/20' : ''
              )}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className={cn(
                          'h-4 w-4 shrink-0',
                          validityMismatches.length > 0 ? 'text-amber-600' : 'text-muted-foreground'
                        )} />
                        Panel vs customer validity
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Hostheaven par kitne din extend karna hai — copy karke bhejo.
                      </CardDescription>
                    </div>
                    {hasResellerSync && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs h-8"
                        onClick={syncAllExpiries}
                        disabled={syncingAllExpiries}
                      >
                        {syncingAllExpiries ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Sync all expiry
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {hasResellerSync && (
                    <p className="text-[11px] text-muted-foreground rounded-md border border-dashed px-2 py-1.5">
                      Purane VPS jin par expiry nahi hai? <strong>Sync all expiry</strong> dabao — saari IP Hostheaven se update hongi, error wali IPs neeche dikhengi.
                    </p>
                  )}
                  {validityMismatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      {hasResellerSync
                        ? 'Koi panel vs customer mismatch nahi. Purane sold orders ke liye Sync all expiry dabao — sold order IP bhi check hoti hai.'
                        : 'Hostheaven sync enable karo, phir expiry sync kar sakte ho.'}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                          {validityMismatches.length} VPS — panel expiry customer se kam hai
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => copyText(extendLinesText, 'Saari list copy ho gayi')}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy all
                        </Button>
                      </div>

                      {urgentValidityMismatches.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                High risk — urgent extend ({urgentValidityMismatches.length})
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Panel par ≤10 din bache (≤5 = critical). Pehle inko Hostheaven par extend karo.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs shrink-0 border-red-500/40 text-red-700 dark:text-red-300"
                              onClick={() => copyText(urgentExtendLinesText, 'Urgent list copy ho gayi')}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy urgent
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {urgentGapGroups.map((group) => {
                              const groupText = formatExtendLines(group.rows);
                              return (
                                <div key={`urgent-gap-${group.gapDays}`} className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2 px-0.5">
                                    <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">
                                      {gapDayGroupLabel(group.gapDays, group.rows.length)}
                                    </p>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[10px] shrink-0 border-red-500/40 text-red-700 dark:text-red-300"
                                      onClick={() => copyText(groupText, `${group.gapDays} day list copy ho gayi`)}
                                    >
                                      <Copy className="h-3 w-3 mr-1" />
                                      Copy
                                    </Button>
                                  </div>
                                  <div className="rounded-md border border-red-500/40 bg-red-500/5 max-h-[220px] overflow-y-auto">
                                    {group.rows.map((row) => {
                                      const risk = getValidityMismatchRisk(row.panelDaysLeft);
                                      const line = formatExtendLine(row.ipAddress, row.gapDays);
                                      return (
                                        <div
                                          key={row.id}
                                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-red-500/10 last:border-0 hover:bg-red-500/5"
                                        >
                                          <button
                                            type="button"
                                            className="text-left flex-1 min-w-0"
                                            onClick={() => copyText(line, 'Copied')}
                                            title="Click to copy"
                                          >
                                            <span className="font-mono text-xs block truncate">{line}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                              {row.status === 'sold' ? 'Sold' : 'Ready'} · panel {row.panelDaysLeft}d left
                                              {risk === 'critical' ? ' · CRITICAL' : ''}
                                            </span>
                                          </button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 shrink-0"
                                            onClick={() => copyText(line, 'Copied')}
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {standardValidityMismatches.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                                Extend needed — panel &gt;10 din ({standardValidityMismatches.length})
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Abhi urgent nahi, lekin customer validity se pehle panel extend karna hoga.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs shrink-0 border-amber-500/40 text-amber-800 dark:text-amber-200"
                              onClick={() => copyText(standardExtendLinesText, 'Standard list copy ho gayi')}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy list
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {standardGapGroups.map((group) => {
                              const groupText = formatExtendLines(group.rows);
                              return (
                                <div key={`standard-gap-${group.gapDays}`} className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2 px-0.5">
                                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                                      {gapDayGroupLabel(group.gapDays, group.rows.length)}
                                    </p>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[10px] shrink-0 border-amber-500/40 text-amber-800 dark:text-amber-200"
                                      onClick={() => copyText(groupText, `${group.gapDays} day list copy ho gayi`)}
                                    >
                                      <Copy className="h-3 w-3 mr-1" />
                                      Copy
                                    </Button>
                                  </div>
                                  <div className="rounded-md border border-amber-500/30 bg-background/80 max-h-[220px] overflow-y-auto">
                                    {group.rows.map((row) => {
                                      const line = formatExtendLine(row.ipAddress, row.gapDays);
                                      return (
                                        <div
                                          key={row.id}
                                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-amber-500/10 last:border-0 hover:bg-amber-500/5"
                                        >
                                          <button
                                            type="button"
                                            className="text-left flex-1 min-w-0"
                                            onClick={() => copyText(line, 'Copied')}
                                            title="Click to copy"
                                          >
                                            <span className="font-mono text-xs block truncate">{line}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                              {row.status === 'sold' ? 'Sold' : 'Ready'} · panel {row.panelDaysLeft}d left
                                            </span>
                                          </button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 shrink-0"
                                            onClick={() => copyText(line, 'Copied')}
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {lastSyncFailed.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-dashed">
                      <p className="text-xs font-medium text-muted-foreground">
                        Alag issue — ye IP Hostheaven list mein nahi mili (validity compare nahi ho sakta):
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {lastSyncFailed.map((row) => (
                          <div
                            key={row.ipAddress}
                            className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1 text-[11px]"
                          >
                            <p className="font-mono font-medium">{row.ipAddress}</p>
                            <p className="text-muted-foreground truncate">{row.error}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </aside>
          </div>
        )}

        {/* ── Panel Zones Tab ── */}
        {tab === 'panelZones' && hasResellerSync && (
          <CompanyPanelZonesTab
            stocks={stocks}
            resellerLabel={resellerLabel}
            hasLiveStockSync={hasLiveStockSync}
            onStockUpdated={(updated) => {
              setStocks((prev) => prev.map((s) => (s._id === updated._id ? { ...s, ...updated } : s)));
            }}
          />
        )}

        {/* ── Bulk Promos Tab ── */}
        {tab === 'bulkPromos' && hasPortalBulkPromos && (
          <CompanyBulkPromoTab
            stocks={stocks}
            onStocksUpdated={(updatedStocks) => {
              setStocks((prev) => {
                const byId = new Map(updatedStocks.map((s) => [s._id, s]));
                return prev.map((s) => (byId.has(s._id) ? { ...s, ...byId.get(s._id)! } : s));
              });
            }}
          />
        )}

        {/* ── Orders Tab ── */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {deployOutdated && (
              <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-300">
                  Production is running an old build. SSH to server and run:
                  <code className="block mt-2 rounded bg-black/5 dark:bg-white/10 px-2 py-1 text-xs">
                    cd /home/ec2-user/oceanlinux &amp;&amp; git pull &amp;&amp; rm -rf .next &amp;&amp; bun run build &amp;&amp; pm2 delete oceanlinux &amp;&amp; pm2 start ecosystem.config.cjs
                  </code>
                  Then verify: <strong>/api/company/version</strong> must return <strong>paid-orders-v6</strong>
                </CardContent>
              </Card>
            )}
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 mr-3">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Red = paid, needs delivery (confirmed)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Green = delivered (active)
              </span>
            </p>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 max-w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search orders..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select
                  value={dateFilter}
                  onValueChange={(value) => {
                    setDateFilter(value);
                    if (value !== 'custom') {
                      setCustomDateFrom('');
                      setCustomDateTo('');
                    }
                  }}
                >
                  <SelectTrigger className="w-[7.5rem] h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="custom">Custom Date</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-28 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
                {hasActiveOrderFilters && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearOrderFilters}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {dateFilter === 'custom' && (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1 max-w-[11rem]">
                  <Label htmlFor="order-date-from" className="text-[10px] text-muted-foreground mb-1 block">
                    From date
                  </Label>
                  <Input
                    id="order-date-from"
                    type="date"
                    value={customDateFrom}
                    max={customDateTo || undefined}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex-1 max-w-[11rem]">
                  <Label htmlFor="order-date-to" className="text-[10px] text-muted-foreground mb-1 block">
                    To date
                  </Label>
                  <Input
                    id="order-date-to"
                    type="date"
                    value={customDateTo}
                    min={customDateFrom || undefined}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                {hasCustomDateRange && (
                  <p className="text-[10px] text-muted-foreground pb-2 sm:pb-2.5">
                    Showing orders: {formatCustomDateLabel(customDateFrom, customDateTo)}
                  </p>
                )}
              </div>
            )}

            {/* Results count */}
            <p className="text-xs text-muted-foreground">
              {filteredOrders.length} of {visibleOrders.length} orders
              {dateFilter === 'custom' && hasCustomDateRange ? ` (${formatCustomDateLabel(customDateFrom, customDateTo)})` : ''}
            </p>

            {/* Order cards */}
            <div className="space-y-2">
              {filteredOrders.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">{visibleOrders.length === 0 ? 'No orders yet.' : 'No orders match your filters.'}</p></CardContent></Card>
              ) : filteredOrders.filter(isCompanyVisibleOrder).map((order) => {
                const { label, ...statusBadge } = orderStatusBadgeProps(order.status);
                const daysLeft = getDaysUntilExpiry(order.expiryDate);
                const validityDays = getValidityDays(order.createdAt, order.expiryDate);
                const isExpired = daysLeft !== null && daysLeft < 0;
                const isExpanded = expandedOrderIds.has(order._id);

                return (
                <Card key={order._id} className="overflow-hidden">
                  <CardContent className="p-2.5 sm:p-3">
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <OsIcon os={order.os} productName={order.productName} className="h-8 w-8 sm:h-9 sm:w-9" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-xs sm:text-sm leading-snug break-words">
                              {styleProductName(order.productName)}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                <MemoryStick className="h-2.5 w-2.5 mr-0.5" />
                                {order.memory}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                {order.stockName}
                              </Badge>
                              {order.os && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  <Terminal className="h-2.5 w-2.5 mr-0.5" />
                                  {humanizeOsLabel(order.os, order.productName)}
                                </Badge>
                              )}
                              <Badge {...statusBadge}>{label || order.status}</Badge>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 shrink-0 h-7 text-xs px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditOrder(order);
                            }}
                          >
                            <Save className="h-3 w-3" />
                            <span className="hidden sm:inline">Update</span>
                          </Button>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleOrderDetails(order._id)}
                          className="mt-2 w-full text-left rounded-md border border-dashed border-border/80 bg-muted/20 px-2.5 py-1.5 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 text-[11px] sm:text-xs text-muted-foreground truncate">
                              {order.customerName && (
                                <span className="font-medium text-foreground">{order.customerName}</span>
                              )}
                              {order.customerName && order.ipAddress && <span className="mx-1">·</span>}
                              {order.ipAddress && (
                                <span className="font-mono">{order.ipAddress}</span>
                              )}
                              {(order.customerName || order.ipAddress) && (order.createdAt || order.expiryDate) && (
                                <span className="mx-1">·</span>
                              )}
                              <span>
                                {formatOrderDate(order.createdAt)}
                                {order.expiryDate && ` → ${formatOrderDate(order.expiryDate)}`}
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-0.5 shrink-0 text-[11px] font-medium text-primary">
                              {isExpanded ? (
                                <>
                                  Hide
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </>
                              ) : (
                                <>
                                  Details
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </>
                              )}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                            <div className="rounded-lg border bg-muted/30 px-2.5 py-2 space-y-1.5 text-xs">
                              {order.customerName && (
                                <div className="flex items-center gap-2 min-w-0">
                                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="font-medium truncate">{order.customerName}</span>
                                  {order.customerEmail && (
                                    <span className="text-muted-foreground truncate hidden sm:inline">
                                      ({order.customerEmail})
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className={cn('font-mono', order.ipAddress ? 'text-foreground' : 'text-amber-600')}>
                                    {order.ipAddress || 'IP not set'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  {order.password ? (
                                    <span className="font-mono flex items-center gap-1">
                                      {visiblePasswords.has(order._id) ? order.password : '••••••'}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          togglePasswordVisibility(order._id);
                                        }}
                                        className="hover:text-foreground"
                                      >
                                        {visiblePasswords.has(order._id) ? (
                                          <EyeOff className="h-3.5 w-3.5" />
                                        ) : (
                                          <Eye className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="text-amber-600">Password not set</span>
                                  )}
                                </div>

                                {order.username && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <span>User:</span>
                                    <span className="font-mono text-foreground">{order.username}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 text-xs">
                              <div className="rounded-md border px-2 py-1.5 bg-background">
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Buy date</p>
                                <p className="mt-0.5 font-medium flex items-center gap-1 text-[11px] sm:text-xs">
                                  <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />
                                  {formatOrderDate(order.createdAt)}
                                </p>
                              </div>

                              <div className="rounded-md border px-2 py-1.5 bg-background">
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Expire date</p>
                                <p className={cn(
                                  'mt-0.5 font-medium flex items-center gap-1 text-[11px] sm:text-xs',
                                  isExpired && 'text-red-600'
                                )}>
                                  <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                  {formatOrderDate(order.expiryDate)}
                                </p>
                              </div>

                              <div className="rounded-md border px-2 py-1.5 bg-background">
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Validity</p>
                                <p className="mt-0.5 font-medium text-[11px] sm:text-xs">
                                  {validityDays !== null ? `${validityDays} days` : '—'}
                                  {daysLeft !== null && !isExpired && (
                                    <span className="text-muted-foreground font-normal block sm:inline">
                                      {' '}· {daysLeft}d left
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            {order.expiryDate && (
                              <div>
                                {isExpired ? (
                                  <Badge variant="destructive" className="text-[10px] h-5">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Expired {Math.abs(daysLeft!)} days ago
                                  </Badge>
                                ) : daysLeft !== null && daysLeft <= 7 ? (
                                  <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-700 bg-amber-50">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Expires in {daysLeft} days
                                  </Badge>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              })}
            </div>
          </div>
        )}

        {/* ── Action Requests Tab ── */}
        {tab === 'requests' && (
          <div className="space-y-4">
            {/* Status filter pills */}
            <div className="flex gap-2">
              {(['pending', 'approved', 'rejected'] as const).map(s => (
                <button key={s} onClick={() => setRequestStatusFilter(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-xs font-medium transition-all capitalize',
                    requestStatusFilter === s
                      ? s === 'pending' ? 'border-amber-500 bg-amber-500/10 text-amber-700' :
                        s === 'approved' ? 'border-green-500 bg-green-500/10 text-green-700' :
                        'border-red-500 bg-red-500/10 text-red-700'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}>
                  {s === 'pending' && <Clock className="h-3 w-3 inline mr-1" />}
                  {s === 'approved' && <CheckCircle className="h-3 w-3 inline mr-1" />}
                  {s === 'rejected' && <XCircle className="h-3 w-3 inline mr-1" />}
                  {s}
                  {s === 'pending' && actionRequests.length > 0 && requestStatusFilter === 'pending' && (
                    <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{actionRequests.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Request cards */}
            <div className="space-y-2">
              {actionRequests.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No {requestStatusFilter} action requests.</p></CardContent></Card>
              ) : actionRequests.map((req) => (
                <Card key={req._id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                            {ACTION_ICONS[req.action] || <ClipboardList className="h-3.5 w-3.5" />}
                          </div>
                          <h3 className="font-medium text-sm capitalize">{req.action}</h3>
                          <Badge variant={req.status === 'pending' ? 'secondary' : req.status === 'approved' ? 'default' : 'destructive'} className="text-[10px] h-4 capitalize">{req.status}</Badge>
                        </div>
                        <div className="mt-2 p-2.5 rounded-md bg-muted/50 text-xs space-y-0.5">
                          <p className="font-medium">{req.orderSnapshot.productName} — {req.orderSnapshot.memory}</p>
                          <p className="text-muted-foreground">{req.orderSnapshot.customerName} ({req.orderSnapshot.customerEmail})</p>
                          {req.orderSnapshot.ipAddress && <p className="font-mono text-muted-foreground">{req.orderSnapshot.ipAddress}</p>}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>By {req.userId?.name || 'Unknown'}</span>
                          <span>{new Date(req.requestedAt).toLocaleString()}</span>
                        </div>
                        {req.adminNotes && (
                          <div className="mt-2 p-2 rounded-md bg-muted/30 border text-xs">
                            <span className="font-medium">Notes:</span> {req.adminNotes}
                          </div>
                        )}
                      </div>
                      {req.status === 'pending' && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="gap-1 h-8 text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => { setProcessingRequest(req); setProcessAction('approve'); setProcessNotes(''); setProcessNewPassword(''); }}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 h-8 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => { setProcessingRequest(req); setProcessAction('reject'); setProcessNotes(''); setProcessNewPassword(''); }}>
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Renewals Tab ── */}
        {tab === 'renewals' && (
          <div className="space-y-4">
            {/* Status filter pills */}
            <div className="flex gap-2">
              {(['pending', 'approved', 'rejected'] as const).map(s => (
                <button key={s} onClick={() => setRenewalStatusFilter(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-xs font-medium transition-all capitalize',
                    renewalStatusFilter === s
                      ? s === 'pending' ? 'border-amber-500 bg-amber-500/10 text-amber-700' :
                        s === 'approved' ? 'border-green-500 bg-green-500/10 text-green-700' :
                          'border-red-500 bg-red-500/10 text-red-700'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}>
                  {s === 'pending' && <Clock className="h-3 w-3 inline mr-1" />}
                  {s === 'approved' && <CheckCircle className="h-3 w-3 inline mr-1" />}
                  {s === 'rejected' && <XCircle className="h-3 w-3 inline mr-1" />}
                  {s}
                  {s === 'pending' && pendingRenewalCount > 0 && (
                    <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{pendingRenewalCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Renewal cards */}
            <div className="space-y-2">
              {renewalRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No {renewalStatusFilter} renewal requests.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {resellerLabel === 'Hostheaven' || resellerLabel?.toLowerCase().includes('host')
                        ? 'Hostheaven VPS renewals are automatic — customers pay on OceanLinux and expiry extends on the panel without your approval. Only manual / non-Hostheaven renewals appear here.'
                        : 'Customers\' renewal payments appear here for your approval before order expiry is extended.'}
                    </p>
                  </CardContent>
                </Card>
              ) : renewalRequests.map((req) => {
                const prev = req.renewalSnapshot?.previousExpiry ? new Date(req.renewalSnapshot.previousExpiry) : null;
                const next = req.renewalSnapshot?.proposedNewExpiry ? new Date(req.renewalSnapshot.proposedNewExpiry) : null;
                return (
                  <Card key={req._id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                              <RefreshCw className="h-3.5 w-3.5" />
                            </div>
                            <h3 className="font-medium text-sm">Renewal payment</h3>
                            <Badge
                              variant={req.status === 'pending' ? 'secondary' : req.status === 'approved' ? 'default' : 'destructive'}
                              className="text-[10px] h-4 capitalize"
                            >
                              {req.status}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] h-4 gap-1">
                              <IndianRupee className="h-2.5 w-2.5" />
                              {req.amount}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] h-4 capitalize">
                              {req.paymentMethod}
                            </Badge>
                          </div>

                          <div className="mt-2 p-2.5 rounded-md bg-muted/50 text-xs space-y-1">
                            <p className="font-medium">{req.orderSnapshot?.productName} — {req.orderSnapshot?.memory}</p>
                            <p className="text-muted-foreground">
                              {req.orderSnapshot?.customerName || 'Customer'} ({req.orderSnapshot?.customerEmail || '—'})
                            </p>
                            {req.orderSnapshot?.ipAddress && (
                              <p className="font-mono text-muted-foreground">{req.orderSnapshot.ipAddress}</p>
                            )}
                            {(prev || next) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                                <CalendarDays className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Current:</span>
                                <span className="font-medium">{prev ? prev.toLocaleDateString() : '—'}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-muted-foreground">After approval:</span>
                                <span className="font-medium text-green-600">{next ? next.toLocaleDateString() : '—'}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span>Txn: <span className="font-mono">{req.renewalTxnId}</span></span>
                            {req.paymentId && <span>Payment ID: <span className="font-mono">{req.paymentId}</span></span>}
                            <span>{new Date(req.requestedAt).toLocaleString()}</span>
                          </div>

                          {req.adminNotes && (
                            <div className="mt-2 p-2 rounded-md bg-muted/30 border text-xs">
                              <span className="font-medium">Notes:</span> {req.adminNotes}
                            </div>
                          )}
                        </div>

                        {req.status === 'pending' && (
                          <div className="flex gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" className="gap-1 h-8 text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => {
                                setProcessingRenewal(req);
                                setRenewalAction('approve');
                                setRenewalNotes('');
                                setRenewOnHostheavenPanel(!!(hasResellerSync && req.orderSnapshot?.ipAddress));
                              }}>
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1 h-8 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => { setProcessingRenewal(req); setRenewalAction('reject'); setRenewalNotes(''); }}>
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit Order Dialog */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Order Credentials</DialogTitle></DialogHeader>
          {editOrder && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium">{editOrder.productName} — {editOrder.memory}</p>
                {editOrder.customerName && <p className="text-xs text-muted-foreground mt-0.5">{editOrder.customerName} ({editOrder.customerEmail})</p>}
              </div>
              <div><Label>IP Address</Label><Input value={editIp} onChange={(e) => setEditIp(e.target.value)} placeholder="e.g. 103.87.204.100" className="mt-1.5" /></div>
              <div><Label>Username</Label><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="e.g. root" className="mt-1.5" /></div>
              <div><Label>Password</Label><Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Server password" className="mt-1.5" /></div>
              <div>
                <Label>Operating System</Label>
                <Select
                  value={editOs}
                  disabled={editOrder?.serverType === 'VPS'}
                  onValueChange={(v) => {
                    setEditOs(v);
                    setEditUsername(defaultUsernameForOs(v));
                  }}
                >
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select OS" /></SelectTrigger>
                  <SelectContent>
                    {osOptionsForStock(editOrder?.serverType || 'Linux').map((os) => (
                      <SelectItem key={os} value={os}>{os}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
            <Button onClick={saveOrderCreds} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Action Request Dialog */}
      <Dialog open={!!processingRequest} onOpenChange={(open) => !open && setProcessingRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{processAction} Request</DialogTitle>
          </DialogHeader>
          {processingRequest && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{processingRequest.action}</span>
                  <span className="text-muted-foreground">—</span>
                  <span>{processingRequest.orderSnapshot.productName}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {processingRequest.orderSnapshot.customerName} ({processingRequest.orderSnapshot.customerEmail})
                </p>
                <p className="text-xs font-mono text-muted-foreground">{processingRequest.orderSnapshot.ipAddress}</p>
              </div>
              {processingRequest?.action === 'format' && processAction === 'approve' && (
                <div>
                  <Label>New Server Password</Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Enter the new password after formatting. This will update the order&apos;s server password.
                  </p>
                  <Input value={processNewPassword} onChange={(e) => setProcessNewPassword(e.target.value)} placeholder="Enter new server password" />
                </div>
              )}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={processNotes} onChange={(e) => setProcessNotes(e.target.value)} placeholder="Add a note for the customer..." className="mt-1.5" rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessingRequest(null)}>Cancel</Button>
            <Button onClick={handleProcessRequest} disabled={processingLoading}
              className={cn('gap-2', processAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}>
              {processingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : processAction === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {processAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renewal Approval Dialog */}
      <Dialog open={!!processingRenewal} onOpenChange={(open) => !open && setProcessingRenewal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{renewalAction} Renewal</DialogTitle>
          </DialogHeader>
          {processingRenewal && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <span className="font-medium">{processingRenewal.orderSnapshot?.productName}</span>
                  <Badge variant="outline" className="text-[10px] h-4">{processingRenewal.orderSnapshot?.memory}</Badge>
                  <Badge variant="outline" className="text-[10px] h-4 gap-1">
                    <IndianRupee className="h-2.5 w-2.5" />
                    {processingRenewal.amount}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {processingRenewal.orderSnapshot?.customerName} ({processingRenewal.orderSnapshot?.customerEmail})
                </p>
                {processingRenewal.orderSnapshot?.ipAddress && (
                  <p className="text-xs font-mono text-muted-foreground">{processingRenewal.orderSnapshot.ipAddress}</p>
                )}
                {processingRenewal.renewalSnapshot?.proposedNewExpiry && (
                  <p className="text-xs flex items-center gap-1.5 mt-1">
                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">After approval, expiry:</span>
                    <span className="font-medium text-green-600">
                      {new Date(processingRenewal.renewalSnapshot.proposedNewExpiry).toLocaleDateString()}
                    </span>
                  </p>
                )}
              </div>
              {renewalAction === 'reject' && (
                <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-200 text-xs text-amber-700 dark:text-amber-400">
                  Rejecting will <span className="font-medium">not</span> automatically refund the customer. Process the refund from your gateway dashboard separately.
                </div>
              )}
              {renewalAction === 'approve' && hasResellerSync && processingRenewal.orderSnapshot?.ipAddress && (
                <div className="flex items-start gap-2.5 p-3 rounded-md border bg-primary/5">
                  <Checkbox
                    id="renew-on-panel"
                    checked={renewOnHostheavenPanel}
                    onCheckedChange={(checked) => setRenewOnHostheavenPanel(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="renew-on-panel" className="text-sm font-medium cursor-pointer">
                      Also renew on {resellerLabel} panel
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Wallet se panel par auto extend — pehle wale manual renewal requests ke liye bhi. Sirf OceanLinux expiry badhani ho to unchecked rakho.
                    </p>
                  </div>
                </div>
              )}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={renewalNotes} onChange={(e) => setRenewalNotes(e.target.value)} placeholder="Add a note for the customer..." className="mt-1.5" rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessingRenewal(null)}>Cancel</Button>
            <Button onClick={handleProcessRenewal} disabled={renewalProcessingLoading}
              className={cn('gap-2', renewalAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}>
              {renewalProcessingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : renewalAction === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {renewalAction === 'approve' ? (renewOnHostheavenPanel && hasResellerSync && processingRenewal?.orderSnapshot?.ipAddress ? 'Approve & Panel Renew' : 'Approve & Extend') : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
