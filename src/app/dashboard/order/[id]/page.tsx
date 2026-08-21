"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  Check,
  Play,
  Square,
  RotateCcw,
  KeyRound,
  HardDriveIcon,
  RefreshCw,
  Loader2,
  Globe,
  User,
  Lock,
  Terminal,
  Server,
  Network,
  Activity,
  Calendar,
  Clock,
  CreditCard,
  AlertTriangle,
  MemoryStick,
  Database,
  Shield,
  XCircle,
  Settings2,
  Info,
  Wallet,
  LifeBuoy,
  Download,
  Hash,
  Building2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { fetchWalletSummary } from '@/lib/walletClient';
import { toast } from 'sonner';
import { dashboardFetch } from '@/lib/dashboardFetch';
import { cn } from '@/lib/utils';
import { OsIcon } from '@/components/os/OsIcon';
import { premiumBtnOutline, premiumBadge } from '@/lib/premium-badges';
import { ADVPS_REBUILD_LIMIT, getAdvpsRebuildUsage } from '@/lib/advpsRebuildLimit';
import { isWithinRenewalWindow } from '@/lib/expiryHelper';
import { getOrderRenewalPrice, getOrderRenewalPriceNote, getCurrentListPriceFromStock } from '@/lib/orderRenewalPricing';
import { getCustomerProviderDisplayName } from '@/lib/customerProviderDisplay';
import { customerServiceErrorMessage, customerProvisioningErrorMessage, customerSuccessMessage } from '@/lib/customerFacingErrors';
import { useSessionAlert } from '@/components/session-alert';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import {
  usePaymentConfig,
  getGatewayTryOrder,
  fallbackToastMessage,
  sortGatewaysByPrimary,
  type PaymentGateway,
} from '@/hooks/usePaymentConfig';
import {
  UpiQrPaymentDialog,
  launchUpiInlineOrRedirect,
  type UpiQrSession,
} from '@/components/payments/UpiQrPaymentDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

declare global {
  interface Window {
    Cashfree: any;
  }
}

interface IPStock {
  _id: string;
  name: string;
  tags: string[];
  serverType?: 'VPS' | 'Linux';
  /**
   * Set by /api/ipstock/[id] when the linked company has automation enabled.
   * The flag intentionally carries no credentials — it just lets this
   * page render direct server controls instead of the manual approval flow.
   *
   * Two providers are supported:
   *  - 'virtualizor'   → company has Virtualizor enduser panel(s) configured
   *  - 'reseller-api'  → company is wired to an external reseller HTTP API
   *                      (Hostheaven / SomaniOne pattern)
   */
  companyAutomation?: {
    provider: 'virtualizor' | 'reseller-api' | 'netbay' | 'kurohost' | 'joy';
    enabled: boolean;
    companyName?: string;
    label?: string;
  } | null;
  company?: string | null;
  memoryOptions?: Record<string, { price?: number }>;
  // ... other ipStock fields
}

type SlotIpConnection = {
  ip: string;
  port: string;
  username: string;
  password: string;
};

import { isSlotIpOrder } from '@/lib/slotIpOrder';
import { isNetbayProxyManageAvailable, isNetbayProxyOrder } from '@/lib/netbayProxyOrder';
import { isOrderAwaitingDelivery, isOrderPaid, hasOrderBeenDelivered, shouldPollOrderForDelivery } from '@/lib/orderDeliveryStatus';
import { openRazorpayModal } from '@/lib/razorpayCheckout';
import { triggerRenewalSuccessBird } from '@/lib/oceanBirdFly';

function parseSlotIpConnection(order: Order): SlotIpConnection | null {
  const raw = (order.ipAddress || '').trim();
  if (!raw) return null;

  // Normal storage: ipAddress = "ip:port", username/password on order
  const storedMatch = raw.match(/^([^:]+):(\d+)$/);
  if (storedMatch) {
    return {
      ip: storedMatch[1],
      port: storedMatch[2],
      username: order.username || '',
      password: order.password || '',
    };
  }

  // Fallback: full proxy string "ip:port:user:pass" in one field
  const parts = raw.split(':');
  if (parts.length >= 4) {
    return {
      ip: parts[0],
      port: parts[1],
      username: parts[2],
      password: parts.slice(3).join(':'),
    };
  }

  return {
    ip: raw,
    port: '',
    username: order.username || '',
    password: order.password || '',
  };
}

interface Order {
  _id: string;
  productName: string;
  os: string;
  memory: string;
  status: string;
  price: number;
  originalPrice?: number;
  promoCode?: string;
  promoDiscount?: number;
  ipAddress?: string;
  username?: string;
  password?: string;
  expiryDate?: Date;
  createdAt?: Date;
  provider?: 'hostycare' | 'smartvps' | 'oceanlinux' | 'slotip' | 'advps' | 'netbay' | 'kurohost';
  hostycareServiceId?: string;
  smartvpsServiceId?: string;
  advpsServiceId?: string;
  advpsOrderId?: string;
  netbayServiceId?: string;
  netbayProductKind?: string;
  kurohostInstanceId?: string;
  netbayPlanId?: string;
  netbayTaskId?: string;
  advpsRebuildCount?: number;
  advpsRebuildCountMonth?: string;
  slotIpPackageId?: string;
  slotIpId?: string;
  provisioningStatus?: string;
  provisioningError?: string;
  serverDetails?: {
    pendingFormatTarget?: {
      osType?: string;
      osLabel?: string;
      startedAt?: string;
    };
  };
  lastAction?: string;
  lastActionTime?: Date;
  lastSyncTime?: Date;
  ipStockId?: string;
  customerEmail?: string;
  customerName?: string;
  renewalPayments?: Array<{
    paymentId: string;
    amount: number;
    paidAt: Date;
    previousExpiry: Date;
    newExpiry: Date;
    renewalTxnId: string;
  }>;
  // Set when a renewal payment was confirmed but the order is linked to a
  // company that has to approve the renewal. Comes from `pendingRenewal`.
  pendingRenewal?: {
    renewalTxnId?: string;
    initiatedAt?: Date;
    paymentMethod?: string;
    amount?: number;
    gatewayOrderId?: string;
    awaitingCompanyApproval?: boolean;
    paymentConfirmedAt?: Date;
    renewalRequestId?: string;
  };
}

function humanizeOsTemplateName(name: unknown, id: string): string {
  const raw =
    (typeof name === 'string'
      ? name
      : name && typeof name === 'object'
      ? (name as { label?: string; name?: string; os?: string }).label ||
        (name as { name?: string }).name ||
        (name as { os?: string }).os ||
        ''
      : String(id)
    )
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, '-');

  const known: Record<string, string> = {
    'win-22': 'Windows Server 2022',
    win22: 'Windows Server 2022',
    window2022: 'Windows Server 2022',
    window2025: 'Windows Server 2025',
    'win-25': 'Windows Server 2025',
    ubuntu22: 'Ubuntu 22.04',
    ubuntu24: 'Ubuntu 24.04',
    'ubuntu-22': 'Ubuntu 22.04',
    'ubuntu-24': 'Ubuntu 24.04',
  };
  if (known[raw]) return known[raw];

  const winYear = raw.match(/^win-?(\d{2})$/);
  if (winYear) return `Windows Server 20${winYear[1]}`;

  if (typeof name === 'string' && name.trim()) return name.trim();
  if (name && typeof name === 'object') {
    const template = name as { name?: string; label?: string; os?: string; distro?: string };
    return template.label || template.name || template.os || template.distro || `Template ${id}`;
  }
  return `Template ${id}`;
}

function styleText(content: string) {
  const regex = /(\([^)]*\)|[a-zA-Z]+)/g;
  return content.split(regex).map((part, index) => {
    if (part.match(/\([^)]*\)/) || part.match(/[a-zA-Z]/)) {
      return <span key={index} className="text- font-semibold">{part}</span>;
    } else {
      return part;
    }
  });
}

function getOsTemplateLabel(name: unknown, id: string): string {
  return humanizeOsTemplateName(name, id);
}

/** Netbay rebuild expects the catalog template name, not the internal id. */
function getOsTemplateRebuildName(entry: unknown, id: string): string {
  if (entry && typeof entry === 'object') {
    const t = entry as { name?: string; label?: string };
    if (t.name) return t.name;
    if (t.label) return t.label;
  }
  if (typeof entry === 'string') return entry;
  return id;
}

function orderOsMatchesTemplate(orderOs: string | undefined, templateId: string): boolean {
  const os = (orderOs || '').toLowerCase();
  switch (templateId) {
    case 'ubuntu':
      return os.includes('ubuntu');
    case 'centos':
      return os.includes('centos');
    case '2012':
      return os.includes('2012');
    case '2016':
      return os.includes('2016');
    case '2019':
      return os.includes('2019');
    case '2022':
      return os.includes('2022');
    case '11':
      return os.includes('windows 11') || /\bwin\s*11\b/.test(os);
    case '2025':
      return os.includes('2025');
    default:
      return os.includes(templateId.toLowerCase());
  }
}

const OrderDetails = () => {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.id as string;
  const returnTo = (() => {
    const rt = searchParams.get('returnTo');
    return rt && rt.startsWith('/') ? rt : '/dashboard/viewLinux';
  })();
  const isAdminView = returnTo.startsWith('/admin');
  const goBack = () => router.push(returnTo);
  const { showAlert } = useSessionAlert();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [serviceErrorPopup, setServiceErrorPopup] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: '', message: '' });

  const showServiceError = (
    raw: unknown,
    opts?: { action?: string; code?: string; title?: string }
  ) => {
    const rawMessage =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'message' in (raw as object)
          ? String((raw as { message?: string }).message || '')
          : raw && typeof raw === 'object' && 'error' in (raw as object)
            ? String((raw as { error?: string }).error || '')
            : '';
    setServiceErrorPopup({
      open: true,
      title: opts?.title || 'Could not complete action',
      message: customerServiceErrorMessage(rawMessage, {
        action: opts?.action,
        code: opts?.code,
      }),
    });
  };

  const [order, setOrder] = useState<Order | null>(null);
  const [ipStock, setIpStock] = useState<IPStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Service management states
  const [serviceDetails, setServiceDetails] = useState<any | null>(null);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [serverPowerState, setServerPowerState] = useState<'running' | 'stopped' | 'suspended' | 'busy' | 'unknown'>('unknown');
  const POWER_ACTIONS = new Set(['start', 'stop', 'restart', 'resetmac']);
  const isPowerActionBusy = (busy: string | null) => !!busy && POWER_ACTIONS.has(busy);
  const [powerStateLoading, setPowerStateLoading] = useState(false);
  const powerFetchInFlight = useRef(false);

  // Payment method for renewals
  const paymentConfig = usePaymentConfig();
  const [renewalPaymentMethod, setRenewalPaymentMethod] = useState<PaymentGateway>('upi');
  const [renewalGatewayUserPicked, setRenewalGatewayUserPicked] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWalletRenewal, setUseWalletRenewal] = useState(true);
  const [upiQrSession, setUpiQrSession] = useState<UpiQrSession | null>(null);

  useEffect(() => {
    if (paymentConfig.loaded) {
      setRenewalPaymentMethod(paymentConfig.primaryGateway);
      setRenewalGatewayUserPicked(false);
    }
  }, [paymentConfig.loaded, paymentConfig.primaryGateway]);

  // Format dialog state
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [formatLoading, setFormatLoading] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<any>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [formatProgress, setFormatProgress] = useState<string>('');

  // With:
  const [osDialogOpen, setOsDialogOpen] = useState(false);
  const [osLoading, setOsLoading] = useState(false);
  const [osTemplates, setOsTemplates] = useState<any>({});
  const [selectedOs, setSelectedOs] = useState<string>('');
  const [osProgress, setOsProgress] = useState<string>('');
  const [osMode, setOsMode] = useState<'reinstall' | 'format'>('reinstall'); // label + behavior

  const [reinstallConfirmOpen, setReinstallConfirmOpen] = useState(false);
  const [pendingReinstallAction, setPendingReinstallAction] = useState<'reinstall' | 'format' | null>(null);
  const [renewConfirmOpen, setRenewConfirmOpen] = useState(false);

  const [legacyActionOpen, setLegacyActionOpen] = useState(false);
  const [legacyAction, setLegacyAction] = useState<'reinstall' | 'format'>('reinstall');
  const [legacyActionLabel, setLegacyActionLabel] = useState('');
  const [legacyTemplates, setLegacyTemplates] = useState<Record<string, string>>({});
  const [legacySelectedTemplate, setLegacySelectedTemplate] = useState('');
  const [legacyPassword, setLegacyPassword] = useState('');
  const [legacyTemplateWarning, setLegacyTemplateWarning] = useState<string | null>(null);

  // Manual server action request states
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [advpsPasswordIssue, setAdvpsPasswordIssue] = useState(false);


  useEffect(() => {
    if (orderId) {
      fetchOrderAndIPStock();
    }
  }, [orderId]);

  useEffect(() => {
    fetchWalletSummary().then((wallet) => {
      if (wallet) setWalletBalance(wallet.balance);
    });
  }, []);

  // Fetch server power state when order is loaded (for managed orders).
  // OceanLinux orders only get status polling when the linked company has
  // Virtualizor automation enabled; otherwise we just fetch the manual
  // server-action request status to populate the request UI.
  useEffect(() => {
    if (order && !loading && !isSlotIpOrder(order) && order.netbayProductKind !== 'proxy') {
      const provider = getProviderFromOrder(order, ipStock);
      const hasNativeServiceId = (provider === 'hostycare' && order.hostycareServiceId) ||
        (provider === 'smartvps' && (order.smartvpsServiceId || order.ipAddress)) ||
        (provider === 'advps' && order.advpsServiceId) ||
        (provider === 'netbay' && order.netbayServiceId) ||
        (provider === 'kurohost' && order.kurohostInstanceId);
      const isCompanyAutomated = hasCompanyAnyAutomation(ipStock) &&
        (provider === 'oceanlinux' || !hasNativeServiceId);

      if (hasNativeServiceId || isCompanyAutomated) {
        fetchServerPowerState({ force: true });
      }
      // Manual request fallback only applies to oceanlinux orders that
      // don't have any automation configured at the company level.
      if (provider === 'oceanlinux' && !isCompanyAutomated) {
        fetchPendingRequest();
      }
    }
  }, [order?.hostycareServiceId, order?.smartvpsServiceId, order?.advpsServiceId, order?.netbayServiceId, order?.kurohostInstanceId, order?.ipAddress, ipStock, loading]);

  // Auto-refresh while ADVPS or SmartVPS is provisioning (poll every 15s)
  useEffect(() => {
    if (!order) return;
    const providerNow = getProviderFromOrder(order, ipStock);
    const isProvisioning = order.provisioningStatus === 'provisioning' &&
      (providerNow === 'advps' || providerNow === 'smartvps');
    if (!isProvisioning) return;

    const interval = setInterval(async () => {
      try {
        if (providerNow === 'smartvps') {
          await dashboardFetch(`/api/orders/smartvps-action?orderId=${orderId}`, { cache: 'no-store', credentials: 'include' });
        }
        const res = await dashboardFetch(`/api/orders/${orderId}`, { cache: 'no-store', credentials: 'include' });
        if (res.ok) {
          const updated = await res.json();
          setOrder(updated);
          if (updated.provisioningStatus !== 'provisioning') {
            clearInterval(interval);
            if (updated.provisioningStatus === 'active' && updated.password) {
              const targetOs = updated.serverDetails?.pendingFormatTarget?.osLabel;
              toast.success(targetOs
                ? `Server is ready on ${updated.os || targetOs}!`
                : 'Server is ready! Credentials are now available.');
            } else if (updated.provisioningStatus === 'failed') {
              const paidUndelivered =
                isOrderPaid(updated) && !hasOrderBeenDelivered(updated);
              if (!paidUndelivered) {
                toast.error(customerProvisioningErrorMessage(updated.provisioningError));
              }
            }
          }
        }
      } catch (e) {
        console.error('[ORDER-DETAILS] Auto-refresh failed:', e);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [order?.provisioningStatus, order?._id, orderId, ipStock]);

  // After payment: poll until IP/credentials appear (no logout needed).
  useEffect(() => {
    if (!order || loading) return;
    if (!shouldPollOrderForDelivery(order)) return;

    const interval = setInterval(async () => {
      try {
        const res = await dashboardFetch(`/api/orders/${orderId}`, { cache: 'no-store', credentials: 'include' });
        if (!res.ok) return;
        const updated = await res.json();
        setOrder(updated);
        if (!shouldPollOrderForDelivery(updated)) {
          clearInterval(interval);
          if (hasOrderBeenDelivered(updated)) {
            toast.success('Your server is ready!');
          }
        }
      } catch (e) {
        console.error('[ORDER-DETAILS] Post-payment poll failed:', e);
      }
    }, 12000);

    const timeout = setTimeout(() => clearInterval(interval), 3 * 60 * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [order?._id, order?.status, order?.provisioningStatus, order?.ipAddress, order?.password, loading, orderId]);

  const fetchOrderAndIPStock = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      console.log('[ORDER-DETAILS] Fetching order:', orderId);
      const response = await dashboardFetch(`/api/orders/${orderId}`, { cache: 'no-store', credentials: 'include' });
      if (response.status === 401) {
        showAlert('session_expired', 'Your session expired. Please log in again to view this server.');
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch order');
      const orderData = await response.json();
      console.log('[ORDER-DETAILS] Order data received:', {
        _id: orderData._id,
        ipStockId: orderData.ipStockId,
        hostycareServiceId: orderData.hostycareServiceId,
        smartvpsServiceId: orderData.smartvpsServiceId,
        advpsServiceId: orderData.advpsServiceId,
        provider: orderData.provider
      });
      setOrder(orderData);

      // Fetch IPStock data if ipStockId exists
      if (orderData.ipStockId) {
        console.log('[ORDER-DETAILS] Fetching IPStock for ID:', orderData.ipStockId);
        try {
          const ipStockResponse = await dashboardFetch(`/api/ipstock/${orderData.ipStockId}`);
          if (ipStockResponse.ok) {
            const ipStockData = await ipStockResponse.json();
            console.log('[ORDER-DETAILS] IPStock data received:', {
              _id: ipStockData._id,
              name: ipStockData.name,
              tags: ipStockData.tags
            });
            setIpStock(ipStockData);
          } else {
            console.warn('[ORDER-DETAILS] Failed to fetch IPStock data');
          }
        } catch (ipStockError) {
          console.warn('[ORDER-DETAILS] Error fetching IPStock:', ipStockError);
        }
      } else if (orderData.companyAutomation?.enabled) {
        setIpStock({
          companyAutomation: orderData.companyAutomation,
        } as IPStock);
      } else {
        console.log('[ORDER-DETAILS] No ipStockId found in order');
      }
    } catch (error) {
      console.error('Failed to fetch order:', error);
      toast.error('Failed to load order details');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  const fetchOrder = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const response = await dashboardFetch(`/api/orders/${orderId}`, { cache: 'no-store', credentials: 'include' });
      if (response.status === 401) {
        showAlert('session_expired', 'Your session expired. Please log in again to view this server.');
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch order');
      const data = await response.json();
      setOrder(data);
      if (data.companyAutomation?.enabled && !data.ipStockId) {
        setIpStock({ companyAutomation: data.companyAutomation } as IPStock);
      }
    } catch (error) {
      console.error('Failed to fetch order:', error);
      toast.error('Failed to load order details');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  // Determine provider based on order data and ipStock
  const getProviderFromOrder = (order: Order, ipStock: IPStock | null): 'hostycare' | 'smartvps' | 'oceanlinux' | 'advps' | 'netbay' | 'kurohost' => {
    console.log('[ORDER-DETAILS] Determining provider for order:', {
      explicitProvider: order.provider,
      hostycareServiceId: order.hostycareServiceId,
      smartvpsServiceId: order.smartvpsServiceId,
      advpsServiceId: order.advpsServiceId,
      netbayServiceId: order.netbayServiceId,
      ipStockId: order.ipStockId,
      slotIpPackageId: order.slotIpPackageId,
      ipStockTags: ipStock?.tags || 'No IPStock data',
      productName: order.productName
    });

    // Slot IP proxies are OceanLinux-managed inventory
    if (isSlotIpOrder(order)) return 'oceanlinux';

    if (String(order.netbayProductKind || '').toLowerCase() === 'proxy') return 'netbay';

    if (order.provider === 'netbay') return 'netbay';
    if (order.provider === 'kurohost') return 'kurohost';
    if (order.provider === 'advps') return 'advps';
    if (order.provider === 'smartvps') return 'smartvps';

    if (order.netbayServiceId) return 'netbay';
    if (order.kurohostInstanceId) return 'kurohost';
    if (order.advpsServiceId) return 'advps';
    if (order.hostycareServiceId) return 'hostycare';
    if (order.smartvpsServiceId) return 'smartvps';

    if (ipStock && ipStock.tags) {
      const tagsLower = ipStock.tags.map((t: string) => t.toLowerCase());
      if (tagsLower.includes('netbay')) return 'netbay';
      if (tagsLower.includes('kurohost')) return 'kurohost';
      if (tagsLower.includes('advps') || tagsLower.includes('flex')) return 'advps';
      if (tagsLower.includes('smartvps') || tagsLower.includes('ocean linux')) return 'smartvps';
    }

    if (order.productName?.includes('⚡')) return 'advps';
    if (order.productName?.includes('🌊') ||
      order.productName?.includes('103.195') ||
      order.ipAddress?.startsWith('103.195') ||
      order.productName?.includes('🏅')) {
      return 'smartvps';
    }

    return 'oceanlinux';
  };

  // Get provider display name (customer-facing — Netbay-backed orders show as OceanLinux)
  const getProviderDisplayName = (provider: string): string =>
    getCustomerProviderDisplayName(provider);

  const OS_DIALOG_AUTO_CLOSE_MS = 600_000; // 10 minutes — cross-OS SmartVPS changes are slow
  const osAutoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startOsAutoCloseTimer = () => {
    if (osAutoCloseTimer.current) clearTimeout(osAutoCloseTimer.current);
    osAutoCloseTimer.current = setTimeout(() => {
      // Close and reset dialog state
      setOsDialogOpen(false);
      setOsLoading(false);
      setOsProgress('');
      setSelectedOs('');
    }, OS_DIALOG_AUTO_CLOSE_MS);
  };

  // Clear timer on dialog close/unmount to avoid leaks
  useEffect(() => {
    if (!osDialogOpen && osAutoCloseTimer.current) {
      clearTimeout(osAutoCloseTimer.current);
      osAutoCloseTimer.current = null;
    }
  }, [osDialogOpen]);

  useEffect(() => {
    return () => {
      if (osAutoCloseTimer.current) clearTimeout(osAutoCloseTimer.current);
    };
  }, []);

  const renewalPaymentTotals = useMemo(() => {
    if (!order) {
      return { total: 0, walletApplied: 0, gatewayCharge: 0 };
    }
    const currentListPrice = getCurrentListPriceFromStock(ipStock, order.memory);
    const total = getOrderRenewalPrice(order, currentListPrice);
    const walletApplied = useWalletRenewal ? Math.min(walletBalance, total) : 0;
    const gatewayCharge = Math.max(0, total - walletApplied);
    return { total, walletApplied, gatewayCharge };
  }, [order, ipStock, walletBalance, useWalletRenewal]);

  const openOsDialog = async (provider: 'hostycare' | 'smartvps' | 'advps' | 'oceanlinux' | 'netbay' | 'kurohost') => {
    if (osAutoCloseTimer.current) {
      clearTimeout(osAutoCloseTimer.current);
      osAutoCloseTimer.current = null;
    }
    setOsMode((provider === 'smartvps' || provider === 'advps') ? 'format' : 'reinstall');
    setOsProgress('Loading available operating systems...');
    setOsDialogOpen(true);
    setOsLoading(true);
    setSelectedOs('');

    try {
      const isWindowsStock =
        order!.os?.includes('Windows') ||
        ipStock?.serverType === 'VPS';
      const osCategory = provider === 'netbay'
        ? (isWindowsStock ? 'Windows' : 'Linux')
        : undefined;

      const endpoint = provider === 'smartvps' ? 'smartvps-action' : provider === 'advps' ? 'advps-action' : 'service-action';
      const templatesRes = await dashboardFetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order!._id,
          action: 'templates',
          ...(osCategory ? { payload: { category: osCategory } } : {}),
        })
      });
      const templatesData = await templatesRes.json();

      if (templatesData.success && templatesData.result) {
        setOsTemplates(templatesData.result); // expects { [id]: name }
        setOsProgress('');
        setOsLoading(false);
      } else {
        throw new Error(templatesData.error || 'Failed to load templates');
      }
    } catch (err: any) {
      setOsProgress(customerServiceErrorMessage(err.message, { action: 'templates' }));
      setOsLoading(false);
    }
  };


  const executeOsAction = async () => {
    if (!selectedOs) {
      toast.error('Please select an operating system');
      return;
    }
    const provider = getProviderFromOrder(order!, ipStock);
    setActionBusy(osMode === 'format' ? 'format' : 'reinstall');
    setOsLoading(true);
    setOsProgress(osMode === 'format' ? 'Initiating server format...' : 'Submitting reinstall...');

    try {
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : provider === 'advps' ? 'advps-action' : 'service-action';
      const action = (provider === 'smartvps' || provider === 'advps') ? 'format' : 'reinstall';

      const res = await dashboardFetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order!._id,
          action,
          payload: {
            templateId: selectedOs,
            osName: getOsTemplateRebuildName(osTemplates[selectedOs], selectedOs),
            ...(provider === 'kurohost' && osTemplates[selectedOs] && typeof osTemplates[selectedOs] === 'object'
              ? { isWindows: !!(osTemplates[selectedOs] as { isWindows?: boolean }).isWindows }
              : {}),
          },
        })
      });
      const data = await res.json();

      if (!data.success) {
        const msg = customerServiceErrorMessage(data.message || data.error, {
          action: osMode === 'format' ? 'format' : 'reinstall',
          code: data.code,
        });
        showServiceError(msg, {
          action: osMode === 'format' ? 'format' : 'reinstall',
          code: data.code,
          title: osMode === 'format' ? 'Format failed' : 'Reinstall failed',
        });
        setOsProgress(msg);
        setActionBusy(null);
        setOsLoading(false);
        return;
      }

      startOsAutoCloseTimer();
      setOsProgress(osMode === 'format'
        ? 'OS change started. This can take 5–10 minutes — please keep this dialog open.'
        : 'Reinstall submitted. Waiting for server to update...'
      );

      if (provider === 'kurohost') {
        setOrder((prev) => prev ? {
          ...prev,
          provisioningStatus: 'provisioning',
          lastAction: 'reinstall',
        } : prev);
      }

      // re-use your existing poller
      await pollForServerUpdates({
        expectedTemplateId: selectedOs,
        useOsDialog: true,
        kurohostReinstall: provider === 'kurohost',
      });

    } catch (err: any) {
      setActionBusy(null);
      const msg = customerServiceErrorMessage(err.message, {
        action: osMode === 'format' ? 'format' : 'reinstall',
      });
      showServiceError(msg, {
        action: osMode === 'format' ? 'format' : 'reinstall',
        title: osMode === 'format' ? 'Format failed' : 'Reinstall failed',
      });
      setOsProgress(msg);
      setTimeout(() => {
        setOsDialogOpen(false);
        setOsLoading(false);
        setOsProgress('');
      }, 3000);
    }
  };


  // Fetch pending server action request for manual products
  const fetchPendingRequest = async () => {
    if (!order) return;

    try {
      const res = await dashboardFetch(`/api/server-actions/status?orderId=${order._id}`);
      const data = await res.json();

      if (data.success && data.hasRequest) {
        setPendingRequest(data.request);
      } else {
        setPendingRequest(null);
      }
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to fetch pending request:', error);
    }
  };

  // Request server action for manual products
  const requestServerAction = async (action: string) => {
    if (!order) return;

    const confirmed = await confirm({
      title: `Request ${action}`,
      description: `Submit a ${action} request? An admin will review and perform the action for you.`,
      confirmLabel: 'Submit Request',
    });
    if (!confirmed) return;

    setRequestLoading(true);
    try {
      const res = await dashboardFetch('/api/server-actions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action })
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Request submitted! Admin will review shortly.');
        await fetchPendingRequest();
      } else {
        showServiceError(data.message || data.error, { action, title: 'Request failed' });
      }
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to request action:', error);
      toast.error('Failed to submit request');
    } finally {
      setRequestLoading(false);
    }
  };

  // Check if server management actions are available
  const isServerManagementAvailable = (order: Order, ipStock: IPStock | null): boolean => {
    // Manual Slot IP inventory — no upstream API. Netbay HTTP proxy (Premium tab) is allowed.
    if (isSlotIpOrder(order)) return false;

    if (isNetbayProxyManageAvailable(order, ipStock)) return true;

    const provider = getProviderFromOrder(order, ipStock);

    console.log('[ORDER-DETAILS] Checking server management availability:', {
      provider,
      hostycareServiceId: order.hostycareServiceId,
      ipAddress: order.ipAddress,
      smartvpsServiceId: order.smartvpsServiceId,
      advpsServiceId: order.advpsServiceId,
    });

    if (provider === 'hostycare' && order.hostycareServiceId) return true;
    if (provider === 'smartvps' && (order.smartvpsServiceId || order.ipAddress)) return true;
    if (provider === 'advps' && order.advpsServiceId) return true;
    if (provider === 'netbay' && order.netbayServiceId) return true;
    if (provider === 'kurohost' && order.kurohostInstanceId) return true;

    // Fall back to per-company automation (Virtualizor or reseller HTTP API).
    // This kicks in for:
    //  - oceanlinux orders linked to an automation-enabled company, AND
    //  - orders whose declared `provider` (e.g. 'hostycare') never received a
    //    real service ID, so the legacy provider integration can't act on them.
    //    These would otherwise hit the manual-request fallback or surface a
    //    "No valid API configured" error from the server.
    if (hasCompanyAnyAutomation(ipStock)) {
      console.log('[ORDER-DETAILS] Server management available via company automation (',
        ipStock?.companyAutomation?.provider, ', provider=', provider, ')');
      return true;
    }

    console.log('[ORDER-DETAILS] No management available for provider:', provider);
    return false;
  };

  /**
   * True when the order's IP stock is linked to a company that has Virtualizor
   * automation enabled. Drives both the auto/manual fork in the UI and the
   * status polling logic.
   */
  const hasCompanyVirtualizorAutomation = (stock: IPStock | null): boolean => {
    return !!(stock?.companyAutomation?.enabled && stock?.companyAutomation?.provider === 'virtualizor');
  };

  /**
   * True when the order's IP stock is linked to a company that has external
   * reseller-API automation enabled (Hostheaven / SomaniOne pattern).
   */
  const hasCompanyResellerApiAutomation = (stock: IPStock | null): boolean => {
    return !!(stock?.companyAutomation?.enabled && stock?.companyAutomation?.provider === 'reseller-api');
  };

  const hasCompanyNetbayAutomation = (stock: IPStock | null): boolean => {
    return !!(stock?.companyAutomation?.enabled && stock?.companyAutomation?.provider === 'netbay');
  };

  /**
   * True when the order's company is wired to Joy Services (manage-only:
   * power actions + status; no reinstall/OS change via the connect API).
   */
  const hasCompanyJoyAutomation = (stock: IPStock | null): boolean => {
    return !!(stock?.companyAutomation?.enabled && stock?.companyAutomation?.provider === 'joy');
  };

  /**
   * True when the order's company has ANY automation configured (Virtualizor,
   * reseller API, or Netbay). Use this anywhere the difference between the
   * three doesn't matter — the actual automation type is selected on the server.
   */
  const hasCompanyAnyAutomation = (stock: IPStock | null): boolean => {
    return (
      hasCompanyVirtualizorAutomation(stock) ||
      hasCompanyResellerApiAutomation(stock) ||
      hasCompanyNetbayAutomation(stock) ||
      hasCompanyJoyAutomation(stock)
    );
  };

  /**
   * True when this specific order is *actually being driven* by the company's
   * automation (either Virtualizor or the reseller API). Covers two cases:
   *   1. Pure oceanlinux orders linked to an automation-enabled company.
   *   2. Orders whose declared provider (e.g. 'hostycare') was never wired up
   *      with a real service ID, so the legacy provider path can't act on them
   *      and we silently fall back to the company's automation instead.
   */
  const isOrderCompanyAutomated = (orderArg: Order | null, stock: IPStock | null): boolean => {
    if (!orderArg) return false;
    if (isSlotIpOrder(orderArg)) return false;
    if (!hasCompanyAnyAutomation(stock)) return false;
    const prov = getProviderFromOrder(orderArg, stock);
    if (prov === 'oceanlinux') return true;
    const hasNativeServiceId = (prov === 'hostycare' && !!orderArg.hostycareServiceId) ||
      (prov === 'smartvps' && !!(orderArg.smartvpsServiceId || orderArg.ipAddress)) ||
      (prov === 'advps' && !!orderArg.advpsServiceId) ||
      (prov === 'netbay' && !!orderArg.netbayServiceId);
    return !hasNativeServiceId;
  };

  /** ADVPS reset-mac is VPS-only; omit the control when stock or sync says LINUX/LXC. */
  const isAdvpsMacResetBlockedByServiceType = (stock: IPStock | null, details: any): boolean => {
    const raw = stock as Record<string, unknown> | null;
    const dc = raw?.defaultConfigurations as
      | Record<string, unknown>
      | Map<string, unknown>
      | undefined;
    let adv: { vmType?: string } | undefined;
    if (dc && typeof (dc as Map<string, unknown>).get === 'function') {
      adv = (dc as Map<string, unknown>).get('advps') as { vmType?: string } | undefined;
    } else if (dc && typeof dc === 'object') {
      adv = (dc as { advps?: { vmType?: string } }).advps;
    }
    const vm = String(adv?.vmType || '').toUpperCase();
    if (vm === 'LXC' || vm === 'LINUX') return true;
    const st = String(details?.details?.serviceType || '').toUpperCase();
    if (st === 'LINUX' || st === 'LXC') return true;
    return false;
  };

  const resolvePowerStateFromStatusResponse = (data: {
    powerState?: string;
    powerStatus?: string;
    rawStatus?: string;
    status?: string;
    details?: { PowerStatus?: string; ActionStatus?: string; status?: string };
  }): typeof serverPowerState | null => {
    const powerStatus = String(
      data.powerStatus || data.details?.PowerStatus || ''
    ).toLowerCase().trim();
    if (powerStatus === 'online' || powerStatus === 'on') return 'running';
    if (powerStatus === 'offline' || powerStatus === 'off') return 'stopped';

    const raw = String(
      data.rawStatus || data.status || data.details?.status || ''
    ).toLowerCase().trim();
    if (['online', 'running', 'active', 'started', 'on', 'up'].includes(raw)) return 'running';
    if (['offline', 'stopped', 'inactive', 'off', 'shutdown', 'down'].includes(raw)) return 'stopped';
    if (['suspended', 'paused'].includes(raw)) return 'suspended';

    const ps = data.powerState;
    // Never persist API "busy" — it can stick while ActionStatus=processing
    if (ps === 'busy') return null;
    if (ps === 'running' || ps === 'stopped' || ps === 'suspended') return ps;
    if (ps === 'unknown') return 'unknown';
    return ps ? (ps as typeof serverPowerState) : null;
  };

  const fetchServerPowerState = async (opts?: { force?: boolean }): Promise<typeof serverPowerState | null> => {
    if (!order) return null;

    const provider = getProviderFromOrder(order, ipStock);

    const isHostycare = provider === 'hostycare' && order.hostycareServiceId;
    const isSmartVPS = provider === 'smartvps' && (order.smartvpsServiceId || order.ipAddress);
    const isAdvps = provider === 'advps' && order.advpsServiceId;
    const isNetbay = provider === 'netbay' && !!order.netbayServiceId;
    const isKurohost = provider === 'kurohost' && !!order.kurohostInstanceId;
    const isCompanyAuto = hasCompanyAnyAutomation(ipStock) &&
      (provider === 'oceanlinux' || (!isHostycare && !isSmartVPS && !isAdvps && !isNetbay && !isKurohost));

    if (!isHostycare && !isSmartVPS && !isAdvps && !isNetbay && !isKurohost && !isCompanyAuto) {
      return null;
    }

    if (!opts?.force && powerStateLoading) return null;
    if (powerFetchInFlight.current) return null;

    powerFetchInFlight.current = true;
    setPowerStateLoading(true);

    try {
      console.log('[ORDER-DETAILS] Fetching server power state for provider:', provider);

      const endpoint = provider === 'smartvps' ? 'smartvps-action' : provider === 'advps' ? 'advps-action' : 'service-action';

      const res = await dashboardFetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action: 'status' })
      });
      const data = await res.json();

      const nextState = resolvePowerStateFromStatusResponse(data);
      if (nextState) {
        console.log('[ORDER-DETAILS] Server power state:', nextState);
        setServerPowerState(nextState);
      } else {
        console.log('[ORDER-DETAILS] Power state unchanged (transient/busy):', data);
      }

      // SmartVPS status sync always writes panel expiry — reload order so UI matches DB.
      if (provider === 'smartvps') {
        await fetchOrder({ silent: true });
      } else if (
        data.credentialsUpdated ||
        data.syncResult?.credentialsUpdated ||
        (Array.isArray(data.syncResult?.changes) && data.syncResult.changes.length > 0)
      ) {
        await fetchOrder({ silent: true });
        if (provider === 'netbay' && (data.credentialsUpdated || data.syncResult?.credentialsUpdated)) {
          setShowPassword(true);
        }
      } else if (data.syncResult?.expiryUpdated) {
        await fetchOrder({ silent: true });
      }

      return nextState;
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to fetch power state:', error);
      setServerPowerState('unknown');
      return 'unknown';
    } finally {
      powerFetchInFlight.current = false;
      setPowerStateLoading(false);
    }
  };

  /** Poll until start/stop/restart is reflected (providers can lag 30–90s on Windows). */
  const pollPowerStateAfterAction = async (
    action: 'start' | 'stop' | 'restart',
    provider?: ReturnType<typeof getProviderFromOrder>,
  ) => {
    const target = action === 'stop' ? 'stopped' : 'running';
    const resellerPoll = hasCompanyResellerApiAutomation(ipStock);
    const pollIntervalMs = resellerPoll ? 8000 : 3000;
    const maxAttempts = resellerPoll ? 20 : 60;

    if (action === 'restart' && provider === 'smartvps') {
      let sawStopped = false;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
        if (powerFetchInFlight.current) continue;
        const state = await fetchServerPowerState({ force: true });
        if (state === 'stopped' || state === 'suspended') sawStopped = true;
        if (sawStopped && state === 'running') return state;
      }

      toast.info(
        'Restart was sent. Status may still be updating — use Refresh if it looks stale.',
        { duration: 6000 }
      );
      return null;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
      if (powerFetchInFlight.current) continue;
      const state = await fetchServerPowerState({ force: true });
      if (state === target) return state;
      if (action === 'stop' && (state === 'stopped' || state === 'suspended')) return state;
      if (action !== 'stop' && state === 'running') return state;
    }

    toast.info(
      action === 'stop'
        ? 'Stop was sent to the panel. Windows can take 1–2 minutes to shut down — use Refresh if status looks stale.'
        : 'Power action was sent. Status may still be updating — use Refresh.',
      { duration: 6000 }
    );
    return null;
  };

  const getManageEndpoint = (provider: ReturnType<typeof getProviderFromOrder>) =>
    provider === 'smartvps' ? 'smartvps-action' : provider === 'advps' ? 'advps-action' : 'service-action';

  /** Pull latest VM state from the provider before re-reading the order document. */
  const syncManageOrderFromProvider = async () => {
    if (!order) return;
    const provider = getProviderFromOrder(order, ipStock);
    const endpoint = getManageEndpoint(provider);
    try {
      await dashboardFetch(`/api/orders/${endpoint}?orderId=${order._id}`, { cache: 'no-store', credentials: 'include' });
    } catch (err) {
      console.warn('[ORDER-DETAILS] Provider sync failed:', err);
    }
  };

  const loadServiceDetails = async (opts?: { skipPowerRefresh?: boolean }) => {
    if (!order) return;

    const provider = getProviderFromOrder(order, ipStock);

    // Only load service details for providers with management APIs
    if (!isServerManagementAvailable(order, ipStock)) {
      return;
    }

    setServiceLoading(true);
    try {
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : provider === 'advps' ? 'advps-action' : 'service-action';
      console.log('[ORDER-DETAILS] Loading service details from:', endpoint);

      const res = await dashboardFetch(`/api/orders/${endpoint}?orderId=${order._id}`);
      const data = await res.json();

      if (data.success || data.syncResult) {
        if (data.success) {
          setServiceDetails(data);
        }

        // SmartVPS GET sync includes PowerStatus on details — update badge immediately
        const syncedPower = resolvePowerStateFromStatusResponse({
          powerState: data.powerState,
          powerStatus: data.powerStatus,
          details: data.details,
        });
        if (syncedPower) {
          setServerPowerState(syncedPower);
        }

        await fetchOrder({ silent: true });

        if (!opts?.skipPowerRefresh && data.success && (
          provider === 'hostycare' ||
          provider === 'smartvps' ||
          provider === 'advps' ||
          provider === 'netbay' ||
          provider === 'kurohost'
        )) {
          await fetchServerPowerState({ force: true });
        }

        // Show sync result — never pretend success when ADVPS API failed
        if (data.syncResult?.apiBlocked) {
          showServiceError(
            'Server sync is temporarily unavailable. Please contact support for help.',
            { action: 'sync', title: 'Sync unavailable' }
          );
        } else if (data.syncResult?.syncFailed || data.syncResult?.error) {
          showServiceError('Could not refresh server details.', { action: 'sync', title: 'Sync failed' });
        } else if (data.syncResult?.passwordStale && provider === 'advps') {
          setAdvpsPasswordIssue(true);
          toast.warning(
            'The password shown may be outdated. Use Generate New Password below to get the current login password automatically.',
            { duration: 10000 }
          );
        } else if (data.syncResult?.credentialsUpdated || data.syncResult?.expiryUpdated) {
          if (data.syncResult.changes?.includes('password')) {
            setAdvpsPasswordIssue(false);
          }
          const changed = data.syncResult.changes?.length
            ? data.syncResult.changes.join(', ')
            : 'IP/credentials';
          if (provider === 'netbay') {
            if (data.syncResult.changes?.includes('password')) setShowPassword(true);
            toast.success(`Synced: ${changed} updated`, { duration: 6000 });
          } else if (hasCompanyJoyAutomation(ipStock) && isOrderCompanyAutomated(order, ipStock)) {
            toast.success(
              data.syncResult.expiryUpdated
                ? `Synced: expiry updated (${changed})`
                : `Synced: ${changed}`,
              { duration: 6000 }
            );
          } else {
            toast.success(`Synced: ${changed} updated`);
          }
        } else if (provider === 'advps') {
          toast.success('Server credentials are already up to date');
        } else if (provider === 'netbay') {
          toast.success('Already up to date with your server');
        } else if (hasCompanyJoyAutomation(ipStock) && isOrderCompanyAutomated(order, ipStock)) {
          toast.success('Already up to date with your server');
        }
      } else {
        showServiceError(data.error || data.message, {
          action: 'sync',
          code: data.code,
          title: 'Could not load server details',
        });
      }
    } catch (error) {
      console.error('[ORDER-DETAILS] Failed to load service details:', error);
      toast.error('Failed to load service details');
    } finally {
      setServiceLoading(false);
    }
  };

  const runServiceAction = async (action: string, payload?: any) => {
    if (!order || !isServerManagementAvailable(order, ipStock)) return;

    setActionBusy(action);

    const isPowerAction = POWER_ACTIONS.has(action);

    try {
      const provider = getProviderFromOrder(order, ipStock);
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : provider === 'advps' ? 'advps-action' : 'service-action';

      const res = await dashboardFetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action, payload })
      });
      const data = await res.json();

      if (data.success) {
        // For power actions, show a more informative message
        if (['start', 'stop', 'restart'].includes(action)) {
          const actionLabel = action === 'start' ? 'Starting' : action === 'stop' ? 'Stopping' : 'Restarting';
          const panelMsg = data.result?.message
            ? ` ${customerSuccessMessage(data.result.message, '')}`
            : '';
          const ipNote =
            action === 'start' && provider === 'advps' && data.result?.ipConfig?.ok && data.result?.ipConfig?.ip
              ? ` IP configured after start (${data.result.ipConfig.ip}).`
              : '';
          toast.success(`${actionLabel} server…${panelMsg}${ipNote} Status may take 1–2 minutes to update.`, {
            duration: 6000,
          });

          await pollPowerStateAfterAction(action as 'start' | 'stop' | 'restart', provider);
        } else if (action === 'resetmac') {
          const r = data.result;
          const oldM = r?.oldMacAddress;
          const newM = r?.newMacAddress;
          if (oldM && newM) {
            toast.success(`MAC address updated: ${oldM} → ${newM}`);
          } else if (newM) {
            toast.success(`MAC address regenerated: ${newM}`);
          } else {
            toast.success('MAC address reset successfully');
          }
          toast.info('Waiting for server to come back online…', { duration: 3000 });
          await pollPowerStateAfterAction('restart');
        } else if (action === 'reinstall' || action === 'format') {
          toast.success(
            action === 'format'
              ? 'Format started. Waiting for server to finish…'
              : 'Reinstall started. Waiting for server to finish…',
            { duration: 4000 }
          );
          await pollForServerUpdates({
            expectedTemplateId: payload?.templateId,
            useOsDialog: false,
          });
        } else if (action === 'generatepassword') {
          const newPass = data.result?.password;
          if (newPass) {
            setAdvpsPasswordIssue(false);
            setShowPassword(true);
            toast.success('New password generated and saved. Copy it from Connection Details above.', { duration: 8000 });
          } else {
            toast.success('Password request completed. Check Connection Details for your login password.');
          }
        } else {
          toast.success(`Action "${action}" executed successfully`);
        }

        await Promise.all([
          loadServiceDetails({
            skipPowerRefresh: ['start', 'stop', 'restart', 'resetmac'].includes(action),
          }),
          fetchOrder({ silent: true }),
        ]);

        if (action === 'changepassword' || action === 'reinstall' || action === 'format') {
          toast.success('Password updated in your records');
        }
      } else {
        if (action === 'generatepassword' && data.code === 'PASSWORD_ALREADY_EXISTS') {
          showServiceError(data.error || data.message, {
            action: 'generatepassword',
            code: data.code,
            title: 'Password not available',
          });
        } else if (data.code === 'NETBAY_REBUILD_LIMIT' || data.code === 'ADVPS_REBUILD_LIMIT') {
          showServiceError(data.message || data.error, {
            action,
            code: data.code,
            title: 'Reinstall limit reached',
          });
        } else {
          showServiceError(data.message || data.error, {
            action,
            code: data.code,
            title: 'Action failed',
          });
        }
        // Refresh power state on error too
        if (['start', 'stop', 'restart', 'resetmac'].includes(action)) {
          await fetchServerPowerState({ force: true });
        }
      }
    } catch (e: any) {
      showServiceError(e.message, { action, title: 'Action failed' });
      if (POWER_ACTIONS.has(action)) {
        await fetchServerPowerState({ force: true });
      }
    } finally {
      if (isPowerAction) {
        await fetchServerPowerState({ force: true });
      }
      setActionBusy(null);
    }
  };

  const handleAdvpsGeneratePassword = async () => {
    if (!order || getProviderFromOrder(order, ipStock) !== 'advps' || !order.advpsServiceId) return;

    const ok = await confirm({
      title: 'Generate New Password',
      description: (
        <div className="space-y-2">
          <p>Generate a new login password from your server panel? The new password will be saved here automatically.</p>
          <p className="text-xs">If a password was already generated for this server, use Format Server instead — it creates a fresh OS and new password.</p>
        </div>
      ),
      confirmLabel: 'Generate Password',
    });
    if (!ok) return;

    await runServiceAction('generatepassword');
  };

  const promptReinstallAction = (action: 'reinstall' | 'format') => {
    if (!order || !isServerManagementAvailable(order, ipStock)) return;
    setPendingReinstallAction(action);
    setReinstallConfirmOpen(true);
  };

  const openLegacyActionDialog = (
    action: 'reinstall' | 'format',
    actionLabel: string,
    templateList: Record<string, any>,
    warning?: string | null,
  ) => {
    const templates: Record<string, string> = {};
    Object.entries(templateList).forEach(([id, template]) => {
      const name = typeof template === 'string'
        ? template
        : (template?.name || template?.os || template?.distro || `Template ${id}`);
      templates[id] = name;
    });
    setLegacyAction(action);
    setLegacyActionLabel(actionLabel);
    setLegacyTemplates(templates);
    setLegacySelectedTemplate('');
    setLegacyPassword('');
    setLegacyTemplateWarning(warning ?? null);
    setLegacyActionOpen(true);
  };

  const submitLegacyAction = async () => {
    if (legacyPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }
    setLegacyActionOpen(false);
    await runServiceAction(legacyAction, {
      password: legacyPassword,
      templateId: legacySelectedTemplate || undefined,
    });
    setLegacyPassword('');
    setLegacySelectedTemplate('');
    setLegacyTemplateWarning(null);
  };

  const handleResetMac = async (variant: 'advps' | 'reseller') => {
    const ok = await confirm({
      title: 'Reset MAC Address',
      description: variant === 'advps'
        ? 'Generate and apply a new MAC address? Without a MAC reset subscription this is limited to once per 24 hours. You may need to renew DHCP or adjust networking inside the VM.'
        : 'Generate a new MAC address on the reseller panel? The VM will be stopped, the MAC updated, and then restarted. You may need to renew DHCP inside the guest OS.',
      confirmLabel: 'Reset MAC',
      destructive: true,
    });
    if (ok) void runServiceAction('resetmac');
  };

  const executeAdvancedAction = async (action: 'reinstall' | 'format') => {
    if (!order || !isServerManagementAvailable(order, ipStock)) return;

    const provider = getProviderFromOrder(order, ipStock);
    const actionLabel = action === 'format' ? 'Format' : 'Reinstall OS';

    if ((provider === 'smartvps' && action === 'format') ||
      (provider === 'advps' && action === 'format') ||
      (provider === 'hostycare' && action === 'reinstall' && order.hostycareServiceId) ||
      (provider === 'netbay' && action === 'reinstall' && order.netbayServiceId) ||
      (provider === 'kurohost' && action === 'reinstall' && order.kurohostInstanceId) ||
      (action === 'reinstall' && isOrderCompanyAutomated(order, ipStock))) {
      await openOsDialog(provider);
      return;
    }


    // For other providers, open the legacy template/password dialog
    try {
      setActionBusy(action);

      // Get available templates
      const endpoint = provider === 'smartvps' ? 'smartvps-action' : provider === 'advps' ? 'advps-action' : 'service-action';
      const templatesRes = await dashboardFetch(`/api/orders/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order._id, action: 'templates' })
      });
      const templatesData = await templatesRes.json();

      if (templatesData.success && templatesData.result) {
        const templates = templatesData.result;
        const templateList: Record<string, any> = {};

        if (Array.isArray(templates)) {
          templates.forEach((template, index) => {
            const id = template.id || template.templateId || index.toString();
            templateList[id] = template;
          });
        } else if (typeof templates === 'object' && templates !== null) {
          Object.entries(templates).forEach(([id, template]) => {
            templateList[id] = template;
          });
        }

        if (Object.keys(templateList).length > 0) {
          setActionBusy(null);
          openLegacyActionDialog(action, actionLabel, templateList);
        } else {
          setActionBusy(null);
          openLegacyActionDialog(
            action,
            actionLabel,
            {},
            `No templates available. Proceed with default ${actionLabel}.`,
          );
        }
      } else {
        setActionBusy(null);
        openLegacyActionDialog(
          action,
          actionLabel,
          {},
          `Failed to load templates. Proceed with default ${actionLabel}.`,
        );
      }
    } catch (error) {
      console.error(`Error in ${action} process:`, error);
      toast.error(`Failed to initiate ${action}`);
      setActionBusy(null);
    }
  };



  // New function to open format dialog for SmartVPS
  const openFormatDialog = async () => {
    console.log('[FORMAT-DIALOG] Opening format dialog for SmartVPS');
    setFormatProgress('Loading available operating systems...');
    setFormatDialogOpen(true);
    setFormatLoading(true);
    setSelectedTemplate('');

    try {
      // Get available templates
      const templatesRes = await dashboardFetch(`/api/orders/smartvps-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order!._id, action: 'templates' })
      });
      const templatesData = await templatesRes.json();

      if (templatesData.success && templatesData.result) {
        console.log('[FORMAT-DIALOG] Templates loaded:', templatesData.result);
        setAvailableTemplates(templatesData.result);
        setFormatProgress('');
        setFormatLoading(false);
      } else {
        throw new Error('Failed to load templates');
      }
    } catch (error: any) {
      console.error('[FORMAT-DIALOG] Error loading templates:', error);
      const msg = customerServiceErrorMessage(error?.message, { action: 'templates' });
      showServiceError(msg, { action: 'templates', title: 'Could not load operating systems' });
      setFormatProgress('');
      setFormatLoading(false);
    }
  };

  // Function to execute SmartVPS format
  const executeSmartVPSFormat = async () => {
    if (!selectedTemplate) {
      toast.error('Please select an operating system');
      return;
    }

    console.log('[FORMAT-DIALOG] Starting format with template:', selectedTemplate);
    setActionBusy('format');
    setFormatLoading(true);
    setFormatProgress('Initiating server format...');

    try {
      // Execute format action
      const formatRes = await dashboardFetch(`/api/orders/smartvps-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order!._id,
          action: 'format',
          payload: {
            templateId: selectedTemplate
          }
        })
      });
      const formatData = await formatRes.json();

      if (formatData.success) {
        console.log('[FORMAT-DIALOG] Format initiated successfully');
        setFormatProgress('Format initiated. Waiting for server to update...');

        await pollForServerUpdates({ expectedTemplateId: selectedTemplate });
      } else {
        throw new Error(formatData.error || 'Format failed');
      }
    } catch (error: any) {
      console.error('[FORMAT-DIALOG] Format error:', error);
      setActionBusy(null);
      const msg = customerServiceErrorMessage(error.message, { action: 'format' });
      showServiceError(msg, { action: 'format', title: 'Format failed' });
      setFormatProgress(msg);
      setTimeout(() => {
        setFormatDialogOpen(false);
        setFormatLoading(false);
        setFormatProgress('');
      }, 3000);
    }
  };

  // Poll after format / reinstall until credentials or OS update (all providers).
  const pollForServerUpdates = async (options?: {
    expectedTemplateId?: string;
    useOsDialog?: boolean;
    kurohostReinstall?: boolean;
  }) => {
    const expectedTemplateId = options?.expectedTemplateId;
    const useOsDialog = options?.useOsDialog ?? false;
    const kurohostReinstall = options?.kurohostReinstall ?? false;
    const setProgress = useOsDialog ? setOsProgress : setFormatProgress;

    const closeDialog = () => {
      setActionBusy(null);
      if (useOsDialog) {
        setOsDialogOpen(false);
        setOsLoading(false);
        setOsProgress('');
        setSelectedOs('');
      } else {
        setFormatDialogOpen(false);
        setFormatLoading(false);
        setFormatProgress('');
      }
    };

    const maxAttempts = expectedTemplateId ? 54 : 24;
    const intervalMs = 10000;
    const initialDelayMs = expectedTemplateId ? 15000 : 8000;
    const originalOrder = { ...order! };

    console.log('[ORDER-DETAILS] Polling for format/reinstall completion', {
      expectedTemplateId,
      useOsDialog,
      maxAttempts,
    });

    await new Promise((resolve) => setTimeout(resolve, initialDelayMs));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      setProgress(`Checking server status... (${attempt}/${maxAttempts})`);

      try {
        await syncManageOrderFromProvider();

        const orderRes = await dashboardFetch(`/api/orders/${order!._id}`, { cache: 'no-store', credentials: 'include' });
        if (!orderRes.ok) throw new Error('Failed to fetch order');
        const latestOrder = await orderRes.json();

        const pollProvider = getProviderFromOrder(order!, ipStock);
        const expectedOsName = expectedTemplateId
          ? getOsTemplateRebuildName(osTemplates[expectedTemplateId], expectedTemplateId).toLowerCase()
          : '';
        const targetOsReached = expectedTemplateId
          ? orderOsMatchesTemplate(latestOrder.os, expectedTemplateId) ||
            (pollProvider === 'netbay' && expectedOsName && (
              String(latestOrder.os || '').toLowerCase().includes('ubuntu') && expectedOsName.includes('ubuntu') ||
              String(latestOrder.os || '').toLowerCase().includes('windows') && expectedOsName.includes('windows')
            ))
          : false;
        const credentialsUpdated =
          latestOrder.username !== originalOrder.username ||
          latestOrder.password !== originalOrder.password ||
          latestOrder.os !== originalOrder.os;
        const netbayPasswordReady =
          pollProvider === 'netbay' &&
          !!latestOrder.password &&
          latestOrder.password !== originalOrder.password;
        const kurohostPasswordReady =
          pollProvider === 'kurohost' &&
          kurohostReinstall &&
          latestOrder.provisioningStatus === 'active';
        const statusImproved =
          latestOrder.provisioningStatus === 'active' &&
          originalOrder.provisioningStatus !== 'active';
        const stillProvisioning = latestOrder.provisioningStatus === 'provisioning';

        const formatComplete = expectedTemplateId
          ? netbayPasswordReady || kurohostPasswordReady || ((targetOsReached || credentialsUpdated) && !stillProvisioning)
          : credentialsUpdated || statusImproved;

        if (formatComplete) {
          setOrder(latestOrder);
          if (netbayPasswordReady || kurohostPasswordReady || credentialsUpdated) {
            setShowPassword(true);
          }
          setProgress(
            targetOsReached
              ? `Installed ${getOsTemplateLabel(osTemplates[expectedTemplateId!] || expectedTemplateId, expectedTemplateId!)} successfully!`
              : 'Server update completed successfully!'
          );

          if (targetOsReached || credentialsUpdated) {
            toast.success(
              targetOsReached
                ? `Server is now running ${latestOrder.os}. New credentials are ready.`
                : 'Server update completed! New credentials are ready.'
            );
          } else {
            toast.success('Server update completed! Server is now active.');
          }

          await fetchServerPowerState({ force: true });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          closeDialog();
          return;
        }
      } catch (error) {
        console.error('[ORDER-DETAILS] Poll error:', error);
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    console.log('[ORDER-DETAILS] Format/reinstall poll timed out');
    setProgress(
      expectedTemplateId
        ? 'OS change is taking longer than expected. Use Sync to refresh credentials.'
        : 'Update is taking longer than expected. Use Sync or check back shortly.'
    );
    await fetchOrder({ silent: true });
    await fetchServerPowerState({ force: true });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    closeDialog();
  };




  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    toast.success(`${field} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const getDaysUntilExpiry = (expiryDate: Date | string | null | undefined) => {
    if (!expiryDate) return 0;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const isRenewalEligible = (order: Order | null) => {
    if (!order || !order.expiryDate) return false;
    if (isSlotIpOrder(order)) return false;
    return isWithinRenewalWindow(order.expiryDate);
  };



  // Add this function after the other utility functions
  const isExpired = (order: Order | null) => {
    if (!order || !order.expiryDate) return false;
    return getDaysUntilExpiry(order.expiryDate) < 0;
  };

  // Check if order is unpaid (pending status means payment didn't go through)
  const isUnpaid = (order: Order | null) => {
    if (!order) return false;
    return order.status.toLowerCase() === 'pending';
  };

  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const handleDownloadInvoice = async () => {
    if (!order) return;
    setDownloadingInvoice(true);
    try {
      const res = await dashboardFetch(`/api/invoice/download?orderId=${order._id}`);
      if (!res.ok) throw new Error('Failed to generate invoice');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `invoice-${order._id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Invoice downloaded!');
    } catch {
      toast.error('Failed to download invoice');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const cancelPendingRenewal = async (renewalTxnId: string) => {
    try {
      const res = await dashboardFetch('/api/payment/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientTxnId: renewalTxnId,
          orderId: order?._id,
          userInitiated: true,
        }),
      });
      const result = await res.json();
      if (result.success) {
        fetchWalletSummary().then((wallet) => {
          if (wallet) setWalletBalance(wallet.balance);
        }).catch(() => {});
        if (result.refunded > 0) {
          toast.info(`Renewal cancelled. ₹${result.refunded.toLocaleString('en-IN')} returned to your wallet.`);
        } else {
          toast.info('Renewal cancelled.');
        }
      }
      return result;
    } catch (err) {
      console.error('[RENEWAL] Cancel/refund failed:', err);
      return null;
    }
  };

  const executeRenewService = async (selectedMethod?: 'razorpay' | 'upi') => {
    if (!order || !order.expiryDate) {
      toast.error('Order has no expiry date');
      return;
    }

    setActionBusy('renew');

    try {
      const launchRenewalPayment = async (data: any, method: string) => {
        if (method === 'razorpay' || data.razorpay) {
          await handleRazorpayRenewal(data);
          return;
        }
        await handleUpiRenewal(data);
      };

      const methodsToTry = getGatewayTryOrder(
        renewalPaymentMethod,
        paymentConfig.primaryGateway,
        paymentConfig.methodsToTry,
        renewalGatewayUserPicked
      );

      let lastError: any = null;
      for (let i = 0; i < methodsToTry.length; i++) {
        const gw = methodsToTry[i];
        try {
          const res = await dashboardFetch("/api/payment/renew", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: order._id,
              paymentMethod: gw,
              useWallet: useWalletRenewal,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 401) {
              const errorCode = data.code || '';
              if (errorCode === 'SESSION_EXPIRED' || data.message?.toLowerCase().includes('expired')) {
                showAlert('session_expired', 'Your session expired. Please log in again to renew your service.');
              } else {
                showAlert('action_requires_login', 'Please log in to renew your service.');
              }
              setActionBusy(null);
              return;
            }
            throw new Error(data.message || "Failed to initiate renewal payment");
          }

          if (data.renewalTxnId) {
            localStorage.setItem('lastRenewalTxnId', data.renewalTxnId);
            localStorage.setItem('renewalOrderId', order._id);
          }

          if (data.walletOnly) {
            const confirmRes = await dashboardFetch("/api/payment/renew-confirm", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                renewalTxnId: data.renewalTxnId,
                orderId: order._id,
                paymentMethod: 'wallet',
              }),
            });
            const confirmData = await confirmRes.json();
            if (!confirmRes.ok || !confirmData.success) {
              await cancelPendingRenewal(data.renewalTxnId);
              toast.error(confirmData.message || "Wallet renewal failed. Amount refunded to wallet.");
              setActionBusy(null);
              return;
            }
            fetchWalletSummary().then((wallet) => {
              if (wallet) setWalletBalance(wallet.balance);
            }).catch(() => {});
            if (confirmData.companyApproval?.status === 'pending') {
              toast.success('Renewal paid from wallet — awaiting provider approval');
            } else {
              toast.success('Service renewed successfully using wallet balance!');
            }
            await fetchOrder({ silent: true });
            setActionBusy(null);
            return;
          }

          const actualMethod = data.paymentMethod || gw;
          if (data.fallbackUsed || gw !== actualMethod) {
            toast.info(fallbackToastMessage(gw, actualMethod as PaymentGateway));
          }
          await launchRenewalPayment(data, actualMethod);
          return;
        } catch (err: any) {
          lastError = err;
          if (i < methodsToTry.length - 1) {
            toast.info(fallbackToastMessage(gw, methodsToTry[i + 1]));
            continue;
          }
        }
      }

      toast.error(lastError?.message || "Failed to initiate renewal payment");
      setActionBusy(null);
    } catch (error: any) {
      console.error("[RENEWAL] Error initiating renewal payment:", error);
      toast.error("Something went wrong. Please try again");
      setActionBusy(null);
    }
  };

  const handleRazorpayRenewal = async (data: any) => {
    try {
      await openRazorpayModal({
        data,
        description: `Renewal: ${order?.productName}`,
        themeColor: '#3399cc',
        onSuccess: async (response) => {
          toast.success("Payment successful! Processing renewal...");
          try {
            const confirmRes = await dashboardFetch("/api/payment/renew-confirm", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                renewalTxnId: data.renewalTxnId,
                orderId: order?._id,
                paymentMethod: 'razorpay',
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            const confirmData = await confirmRes.json();

            if (confirmRes.ok && confirmData.success) {
              triggerRenewalSuccessBird();
              if (confirmData.companyApproval?.status === 'pending') {
                toast.success('Payment received — your provider will approve the renewal shortly.');
              }
              await fetchOrder({ silent: true });
            } else {
              toast.error("Payment successful but renewal processing failed. Please contact support.");
            }
          } catch {
            toast.error("Payment successful but renewal confirmation failed. Please contact support.");
          } finally {
            setActionBusy(null);
          }
        },
        onDismiss: () => {
          cancelPendingRenewal(data.renewalTxnId);
          setActionBusy(null);
        },
        onFailed: () => {
          cancelPendingRenewal(data.renewalTxnId);
          toast.error("Payment failed. Wallet amount returned if it was used.");
          setActionBusy(null);
        },
      });
    } catch (error: any) {
      console.error("[RENEWAL] Razorpay renewal error:", error);
      await cancelPendingRenewal(data.renewalTxnId);
      toast.error("Payment could not be started. Wallet amount returned if it was used.");
      setActionBusy(null);
    }
  };

  const handleUpiRenewal = async (data: any) => {
    try {
      const amount = Number(data.renewalPrice ?? renewalPaymentTotals?.gatewayCharge ?? 0);
      const launched = launchUpiInlineOrRedirect(
        { ...data, clientTxnId: data.renewalTxnId },
        {
          amount,
          flow: 'renewal',
          orderId: order?._id,
          onInline: (session) => {
            setUpiQrSession(session);
            setActionBusy(null);
          },
        }
      );
      if (!launched) {
        throw new Error('UPI payment could not be started');
      }
      if (data.upi?.qrImageUrl) return;
    } catch (error: any) {
      console.error('[RENEWAL] UPI renewal error:', error);
      await cancelPendingRenewal(data.renewalTxnId);
      toast.error('UPI payment could not be started. Wallet amount returned if it was used.');
      setActionBusy(null);
    }
  };

  // ... existing imports and code ...

  // Helper to get power state badge for active servers
  const getPowerStateBadge = () => {
    if (isPowerActionBusy(actionBusy)) {
      return (
        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    }

    if (powerStateLoading) {
      return (
        <Badge className="bg-muted text-muted-foreground border-border">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Checking...
        </Badge>
      );
    }

    switch (serverPowerState) {
      case 'running':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Online
          </Badge>
        );
      case 'stopped':
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </Badge>
        );
      case 'suspended':
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </Badge>
        );
      default:
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string, order?: Order) => {
    if (actionBusy) {
      const actionLabels = {
        'restart': { label: 'Restarting', icon: RefreshCw, color: 'bg-primary/10 text-primary border-primary/20' },
        'start': { label: 'Starting', icon: Loader2, color: 'bg-primary/10 text-primary border-primary/20' },
        'stop': { label: 'Stopping', icon: Loader2, color: 'bg-muted text-muted-foreground border-border' },
        'renew': { label: 'Renewing', icon: Loader2, color: 'bg-primary/10 text-primary border-primary/20' },
        'reinstall': { label: 'Reinstalling', icon: Loader2, color: 'bg-muted text-muted-foreground border-border' },
        'format': { label: 'Formatting', icon: Loader2, color: 'bg-muted text-muted-foreground border-border' },
        'changepassword': { label: 'Changing Password', icon: Loader2, color: 'bg-primary/10 text-primary border-primary/20' },
        'resetmac': { label: 'Resetting MAC', icon: Loader2, color: 'bg-primary/10 text-primary border-primary/20' },
      };

      const actionConfig = actionLabels[actionBusy as keyof typeof actionLabels];
      if (actionConfig) {
        const Icon = actionConfig.icon;
        return (
          <Badge className={actionConfig.color}>
            <Icon className="w-3 h-3 mr-1 animate-spin" />
            {actionConfig.label}
          </Badge>
        );
      }
    }

    const currentStatus = provisioningStatus || status;
    const companyAutomated = isOrderCompanyAutomated(order ?? null, ipStock);
    const hasAssignedIp = !!(order?.ipAddress?.trim());

    if (order && isOrderPaid(order) && hasOrderBeenDelivered(order)) {
      return (
        <Badge className="bg-primary/10 text-green-500 border-primary/20">
          <div className="w-2 h-2 bg-primary rounded-full mr-2 animate-pulse"></div>
          Active
        </Badge>
      );
    }

    // Paid but admin/company has not delivered yet — always show Processing
    if (order && isOrderAwaitingDelivery(order)) {
      return (
        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    }

    const isActiveStatus =
      status.toLowerCase() === 'completed' ||
      currentStatus.toLowerCase() === 'active' ||
      (companyAutomated && hasAssignedIp);
    const canShowPowerState =
      (
        provider === 'hostycare' ||
        provider === 'smartvps' ||
        (provider === 'advps' && !!order?.advpsServiceId) ||
        (provider === 'netbay' && !!order?.netbayServiceId) ||
        (provider === 'kurohost' && !!order?.kurohostInstanceId) ||
        (companyAutomated && hasAssignedIp)
      ) &&
      isActiveStatus;

    // For active servers with power state support, show actual power state
    if (canShowPowerState) {
      return getPowerStateBadge();
    }

    if (status.toLowerCase() === 'completed') {
      return (
        <Badge className="bg-primary/10 text-green-500 border-primary/20">
          <div className="w-2 h-2 bg-primary rounded-full mr-2 animate-pulse"></div>
          Active
        </Badge>
      );
    }

    // Legacy hostycare config errors — skip for company-automated orders that
    // already have a live IP on the reseller / Virtualizor panel.
    if (
      !companyAutomated &&
      order?.provisioningError &&
      (order.provisioningError.includes('Missing hostycareProductId') ||
        order.provisioningError.includes('CONFIG:') ||
        order.provisioningError.includes('Memory configuration not found') ||
        order.provisioningError.includes('lacks hostycareProductId'))
    ) {
      return (
        <Badge className="bg-muted text-muted-foreground border-border">
          <Settings2 className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    }

    switch (currentStatus.toLowerCase()) {
      case 'active':
        if (powerStateLoading && canShowPowerState) {
          return (
            <Badge className="bg-muted text-muted-foreground border-border">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Checking...
            </Badge>
          );
        }
        if (canShowPowerState) {
          return getPowerStateBadge();
        }
        return (
          <Badge className="bg-primary/10 text-green-500 border-primary/20">
            <div className="w-2 h-2 bg-primary rounded-full mr-2 animate-pulse"></div>
            Active
          </Badge>
        );
      case 'pending':
      case 'confirmed':
        if (companyAutomated && hasAssignedIp) {
          return getPowerStateBadge();
        }
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            <Clock className="w-3 h-3 mr-1" />
            Pending Setup
          </Badge>
        );
      case 'provisioning':
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Provisioning
          </Badge>
        );
      case 'suspended':
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </Badge>
        );
      case 'failed':
        // Double-check for config errors even in failed status
        if (order?.provisioningError && order.provisioningError.includes('CONFIG:')) {
          return (
            <Badge className="bg-muted text-muted-foreground border-border">
              <Settings2 className="w-3 h-3 mr-1" />
              Awaiting Config
            </Badge>
          );
        }
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'terminated':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
            <XCircle className="w-3 h-3 mr-1" />
            Terminated
          </Badge>
        );
      default:
        // Enhanced default case
        const isManualOrder = !lastAction || lastAction.includes('manual');
        if (
          (isManualOrder || currentStatus.toLowerCase() === 'confirmed') &&
          !(order && isOrderPaid(order) && hasOrderBeenDelivered(order))
        ) {
          return (
            <Badge className="bg-muted text-muted-foreground border-border">
              <Clock className="w-3 h-3 mr-1" />
              Awaiting Setup
            </Badge>
          );
        }

        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
            <Shield className="w-3 h-3 mr-1" />
            {currentStatus}
          </Badge>
        );
    }
  };

  // ... rest of existing code ...
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex justify-center items-center'>
        <div className="w-full flex justify-center items-center px-4">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 bg-primary/20 rounded-full animate-pulse"></div>
              <Loader2 className="absolute inset-0 m-auto animate-spin h-8 w-8 text-primary" />
            </div>
            <p className="text-muted-foreground font-medium">Loading server details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className='min-h-screen bg-background flex justify-center items-center'>
        <div className="w-full flex justify-center items-center px-4">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Server not found</h3>
            <p className="text-muted-foreground mb-6">The requested server could not be found.</p>
            <Button onClick={goBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {isAdminView ? 'Back to admin' : 'Back to Servers'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const provider = getProviderFromOrder(order, ipStock);
  const canManageServer = isServerManagementAvailable(order, ipStock);
  const slotIpOrder = isSlotIpOrder(order);
  const netbayProxyOrder = isNetbayProxyOrder(order, ipStock);
  const proxyStyleOrder = slotIpOrder || netbayProxyOrder;
  const slotIpConnection = proxyStyleOrder ? parseSlotIpConnection(order) : null;
  const hasConnectionDetails = proxyStyleOrder
    ? !!(slotIpConnection?.ip && (slotIpConnection?.username || slotIpConnection?.port))
    : !!(order.ipAddress && order.username);
  const usesLivePowerUi =
    !proxyStyleOrder &&
    (provider === 'hostycare' ||
    provider === 'smartvps' ||
    (provider === 'advps' && !!order.advpsServiceId) ||
    (provider === 'netbay' && !!order.netbayServiceId) ||
    (provider === 'kurohost' && !!order.kurohostInstanceId) ||
    isOrderCompanyAutomated(order, ipStock));
  const currentListPrice = getCurrentListPriceFromStock(ipStock, order.memory);
  const renewalPrice = renewalPaymentTotals.total;
  const renewalPriceNote = getOrderRenewalPriceNote(order, currentListPrice);

  return (
    <div className='premium-dashboard-page premium-order-detail-page min-h-0'>
      {isAdminView && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-200">
          Admin mode — managing customer order{order.customerEmail ? ` (${order.customerEmail})` : ''}. Start / stop / format work without seller login.
        </div>
      )}
      {/* Order sub-header — matches dashboard topbar in light & dark */}
      <div className='premium-order-detail-header sticky top-0 z-30 lg:top-0'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 lg:px-6 lg:py-4 max-w-7xl mx-auto'>
            <div className='flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1'>
              <Button
                variant="ghost"
                size="icon"
                onClick={goBack}
                className="premium-dashboard-icon-btn rounded-lg flex-shrink-0 h-10 w-10"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <OsIcon os={order.os} productName={order.productName} className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className='text-base sm:text-lg font-semibold break-words mb-1.5 premium-dashboard-title'>
                  {styleText(order.productName)}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs h-5">
                    {getProviderDisplayName(provider)}
                  </Badge>
                  {isOrderCompanyAutomated(order, ipStock) && (
                    <Badge variant="outline" className={cn(premiumBadge.success, "text-xs h-5 gap-1")}>
                      Auto-managed
                    </Badge>
                  )}
                  {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (order && getProviderFromOrder(order, ipStock) === 'advps' && order.advpsServiceId) {
                    loadServiceDetails();
                  } else if (order && (usesLivePowerUi || (provider === 'kurohost' && order.kurohostInstanceId))) {
                    void fetchServerPowerState({ force: true });
                    void fetchOrder({ silent: true });
                  } else {
                    fetchOrder({ silent: true });
                  }
                }}
                disabled={loading || serviceLoading}
                className={cn("h-9 gap-2", premiumBtnOutline)}
              >
                <RefreshCw className={`h-4 w-4 ${(loading || serviceLoading) ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync</span>
              </Button>
            </div>
          </div>
        </div>

        <div className='premium-dashboard-page-inner max-w-7xl'>
          {/* Check if order is unpaid */}
          {isUnpaid(order) ? (
            /* Unpaid Order UI */
            <div className="flex justify-center items-center min-h-[60vh]">
              <Card className="shadow-lg border-0 bg-card max-w-lg w-full">
                <CardContent className="p-6 lg:p-8 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <XCircle className="h-8 w-8 sm:h-10 sm:w-10 text-red-600 dark:text-red-400" />
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold mb-4">
                    Order Purchase Didn't Go Through
                  </h2>

                  <div className="bg-red-500/10 border border-red-400/25 rounded-xl p-4 sm:p-6 mb-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-left">
                        <h3 className="font-semibold text-red-200 mb-2">
                          Payment Not Completed
                        </h3>
                        <p className="text-sm text-red-300/90">
                          This order was created but the payment was not completed.
                          The server has not been provisioned.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-xl p-4 sm:p-6 mb-6 text-left">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      Order Details
                    </h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Service:</span>
                        <span className="font-medium text-foreground break-words max-w-[60%] text-right">
                          {order.productName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Configuration:</span>
                        <span className="font-medium text-foreground">{order.memory}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Operating System:</span>
                        <span className="font-medium text-foreground">{order.os}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Price:</span>
                        <span className="font-medium text-foreground">₹{order.price}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Order ID:</span>
                        <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">
                          {order._id}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <Button
                      onClick={() => router.push('/dashboard/ipStock')}
                      className="flex-1 gap-2 h-11 sm:h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                    >
                      <Server className="h-4 w-4 sm:h-5 sm:w-5" />
                      Purchase New Server
                    </Button>
                    <Button
                      variant="outline"
                      onClick={goBack}
                      className="flex-1 gap-2 h-11 sm:h-12"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Servers
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : isExpired(order) ? (
            /* Expired Service UI */
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
              {/* Left Column - Service Information */}
              <div className="xl:col-span-2">
                <Card className="shadow-lg border-0 bg-card">
                  <CardContent className="p-6 lg:p-8 text-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Calendar className="h-8 w-8 sm:h-10 sm:w-10 text-amber-600 dark:text-amber-400" />
                    </div>

                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-4">
                      Your Service Has Expired
                    </h2>

                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 sm:p-6 mb-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-left">
                          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                            Service No Longer Active
                          </h3>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                            This server service expired on <strong>{formatDate(order.expiryDate!)}</strong>
                            ({Math.abs(getDaysUntilExpiry(order.expiryDate))} days ago) and is no longer accessible.
                            To continue using our services, you'll need to purchase a new plan.
                          </p>

                          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-2 rounded-lg">
                            <strong>Note:</strong> All server data and configurations have been removed due to expiration.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-xl p-4 sm:p-6 mb-6 text-left">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        Expired Service Details
                      </h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Service:</span>
                          <span className="font-medium text-foreground break-words max-w-[60%] text-right">
                            {order.productName}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Configuration:</span>
                          <span className="font-medium text-foreground">{order.memory}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Operating System:</span>
                          <span className="font-medium text-foreground">{order.os}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Original Price:</span>
                          <span className="font-medium text-foreground">₹{order.price}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Provider:</span>
                          <span className="font-medium text-foreground">{getProviderDisplayName(provider)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Service ID:</span>
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">
                            {order._id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <Button
                        onClick={() => router.push('/dashboard/ipStock')}
                        className="flex-1 gap-2 h-11 sm:h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                      >
                        <Server className="h-4 w-4 sm:h-5 sm:w-5" />
                        Browse New Plans
                      </Button>
                      <Button
                        variant="outline"
                        onClick={goBack}
                        className="flex-1 gap-2 h-11 sm:h-12 text-base"
                      >
                        <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                        Back to Servers
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Additional Info */}
              <div className="space-y-4 lg:space-y-6">
                {/* Renewal History if exists */}
                {order.renewalPayments && order.renewalPayments.length > 0 && (
                  <Card className="shadow-lg border-0 bg-card">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                        <CreditCard className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                        Payment History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm p-3 bg-muted rounded-lg">
                          <div>
                            <p className="font-semibold">₹{order.price} paid</p>
                            <p className="text-muted-foreground">{order.createdAt ? formatDate(order.createdAt) : 'Initial purchase'}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-muted-foreground">Service period</p>
                            <p className="font-medium">{order.expiryDate ? formatDate(order.expiryDate) : 'N/A'}</p>
                          </div>
                        </div>

                        {order.renewalPayments.map((renewal, index) => (
                          <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm p-3 bg-muted rounded-lg">
                            <div>
                              <p className="font-semibold">₹{renewal.amount} paid</p>
                              <p className="text-muted-foreground">{formatDate(renewal.paidAt)}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-muted-foreground">Extended to</p>
                              <p className="font-medium">{formatDate(renewal.newExpiry)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Support Card */}
                <Card className="shadow-lg border-0 bg-card">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                      <Info className="h-5 w-5 lg:h-6 lg:w-6 text-primary flex-shrink-0" />
                      Need Help?
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        If you have questions about this expired service or need assistance with a new purchase, our support team is here to help.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => router.push('/support/tickets')}
                        className="w-full gap-2"
                      >
                        <LifeBuoy className="h-4 w-4" />
                        Contact Support
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
              {/* ADVPS Provisioning Banner */}
              {provider === 'advps' && order.provisioningStatus === 'provisioning' && (
                <div className="xl:col-span-3">
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base mb-1">Setting up your server...</h3>
                          <p className="text-sm text-muted-foreground">
                            Your server is being started and credentials are being generated. This usually takes 1-3 minutes. This page will update automatically.
                          </p>
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className="h-2 w-2 rounded-full bg-green-500"></div>
                              <span>IP Address fetched</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              <span>Starting server & generating password...</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* SmartVPS format / OS change banner */}
              {provider === 'smartvps' && order.provisioningStatus === 'provisioning' && order.lastAction === 'format' && (
                <div className="xl:col-span-3">
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base mb-1">
                            {order.serverDetails?.pendingFormatTarget?.osLabel
                              ? `Installing ${order.serverDetails.pendingFormatTarget.osLabel}...`
                              : 'Formatting your server...'}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Your server is reinstalling the operating system. OS may still show the old version until finished — this usually takes 5–10 minutes. This page updates automatically.
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Current OS on panel: <strong>{order.os || 'Unknown'}</strong> — will update when complete.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Left Column - Server Info & Connection */}
              <div className="xl:col-span-2 space-y-4 lg:space-y-6">
                {/* Server Overview */}
                <Card className="border-border hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Server className="h-4 w-4 text-primary" />
                        </div>
                        Server Overview
                      </CardTitle>
                      <Badge variant="outline" className="text-xs h-6 self-start sm:self-auto">
                        <Clock className="h-3 w-3 mr-1" />
                        {order.createdAt ? formatDate(order.createdAt) : 'Unknown'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <Terminal className="h-5 w-5 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Operating System</p>
                            <p className="font-semibold text-foreground text-sm break-words mt-0.5">{order.os}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <MemoryStick className="h-5 w-5 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Memory</p>
                            <p className="font-semibold text-foreground text-sm break-words mt-0.5">{order.memory}</p>
                          </div>
                        </div>
                      </div>

                      <div className={cn(
                        "p-3 rounded-lg border shadow-sm",
                        usesLivePowerUi && serverPowerState === 'running' && "bg-green-500/10 border-green-500/30",
                        usesLivePowerUi && serverPowerState === 'stopped' && "bg-red-500/10 border-red-500/30",
                        usesLivePowerUi && isPowerActionBusy(actionBusy) && "bg-blue-500/10 border-blue-500/30",
                        !(usesLivePowerUi && (['running', 'stopped'].includes(serverPowerState) || isPowerActionBusy(actionBusy))) && "bg-primary/10 border-primary/30"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm",
                            usesLivePowerUi && serverPowerState === 'running' && "bg-green-500/20",
                            usesLivePowerUi && serverPowerState === 'stopped' && "bg-red-500/20",
                            usesLivePowerUi && isPowerActionBusy(actionBusy) && "bg-blue-500/20",
                            !(usesLivePowerUi && (['running', 'stopped'].includes(serverPowerState) || isPowerActionBusy(actionBusy))) && "bg-primary/20"
                          )}>
                            <Activity className={cn(
                              "h-5 w-5",
                              usesLivePowerUi && serverPowerState === 'running' && "text-green-600",
                              usesLivePowerUi && serverPowerState === 'stopped' && "text-red-600",
                              usesLivePowerUi && isPowerActionBusy(actionBusy) && "text-blue-600"
                            )} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              {usesLivePowerUi ? 'Power Status' : 'Status'}
                            </p>
                            <div className="mt-1">
                              {usesLivePowerUi
                                ? getPowerStateBadge()
                                : getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <Database className="h-5 w-5 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Provider</p>
                            <p className="font-semibold text-foreground text-sm capitalize mt-0.5">
                              {getProviderDisplayName(provider)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Connection Details */}
                {hasConnectionDetails ? (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Network className="h-4 w-4 text-primary" />
                        </div>
                        {proxyStyleOrder ? 'Proxy Connection Details' : 'Connection Details'}
                      </CardTitle>
                      <CardDescription className="text-xs lg:text-sm">
                        {proxyStyleOrder
                          ? 'Use these credentials to connect to your HTTP proxy'
                          : 'Use these credentials to connect to your server'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {proxyStyleOrder && slotIpConnection ? (
                        <>
                          {/* Slot IP — IP */}
                          <div className="space-y-2">
                            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                              <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                                <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                                  <Globe className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <span className="text-muted-foreground">IP Address</span>
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  readOnly
                                  value={slotIpConnection.ip}
                                  className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => copyToClipboard(slotIpConnection.ip, 'IP Address')}
                                  className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                                >
                                  {copied === 'IP Address' ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Slot IP — Port */}
                          {slotIpConnection.port && (
                            <div className="space-y-2">
                              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                                <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                                  <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                                    <Hash className="h-3.5 w-3.5 text-primary" />
                                  </div>
                                  <span className="text-muted-foreground">Port</span>
                                </Label>
                                <div className="flex gap-2">
                                  <Input
                                    readOnly
                                    value={slotIpConnection.port}
                                    className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                                  />
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => copyToClipboard(slotIpConnection.port, 'Port')}
                                    className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                                  >
                                    {copied === 'Port' ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Slot IP — Username */}
                          <div className="space-y-2">
                            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                              <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                                <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                                  <User className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <span className="text-muted-foreground">Username</span>
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  readOnly
                                  value={slotIpConnection.username}
                                  className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => copyToClipboard(slotIpConnection.username, 'Username')}
                                  className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                                >
                                  {copied === 'Username' ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Slot IP — Password */}
                          <div className="space-y-2">
                            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                              <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                                <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                                  <Lock className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <span className="text-muted-foreground">Password</span>
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  readOnly
                                  type={showPassword ? 'text' : 'password'}
                                  value={slotIpConnection.password}
                                  className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => copyToClipboard(slotIpConnection.password, 'Password')}
                                  className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                                >
                                  {copied === 'Password' ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Copy full proxy string */}
                          <Button
                            variant="outline"
                            className="w-full gap-2 h-9 text-sm"
                            onClick={() => {
                              const proxy = `${slotIpConnection.ip}:${slotIpConnection.port}:${slotIpConnection.username}:${slotIpConnection.password}`;
                              copyToClipboard(proxy, 'Proxy String');
                            }}
                          >
                            {copied === 'Proxy String' ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                            Copy Full Proxy String
                          </Button>
                        </>
                      ) : (
                        <>
                      {/* IP Address */}
                      <div className="space-y-2">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <Globe className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">Server IP Address</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={order.ipAddress}
                              className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(order.ipAddress!, 'IP Address')}
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                            >
                              {copied === 'IP Address' ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Username */}
                      <div className="space-y-2">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">Username</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={order.username}
                              className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(order.username!, 'Username')}
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                            >
                              {copied === 'Username' ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Password */}
                      <div className="space-y-2">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <Lock className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">Password</span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              type={showPassword ? "text" : "password"}
                              value={order.password || ''}
                              className="font-mono bg-background/50 border-border text-sm min-w-0 h-9"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setShowPassword(!showPassword)}
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(order.password || '', 'Password')}
                              className="shrink-0 h-9 w-9 hover:bg-primary/10 hover:border-primary/30"
                            >
                              {copied === 'Password' ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {provider === 'advps' && order.advpsServiceId && (
                          <div className="space-y-2">
                            {advpsPasswordIssue && (
                              <Alert className="bg-amber-500/10 border-amber-500/25">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                  The password here may not match your server. Use the button below to pull the current password automatically.
                                </AlertDescription>
                              </Alert>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleAdvpsGeneratePassword}
                              disabled={!!actionBusy || order.provisioningStatus === 'provisioning'}
                              className="w-full h-9 gap-2 text-sm"
                            >
                              {actionBusy === 'generatepassword' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <KeyRound className="h-4 w-4" />
                              )}
                              Generate New Password
                            </Button>
                            <p className="text-[11px] text-muted-foreground px-0.5">
                              Password not working? This updates your login here automatically — no admin needed. If a password was already generated, use Format Server instead.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* SSH/RDP Command */}
                      <div className="pt-1">
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <Label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                              <Terminal className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-muted-foreground">
                              {order.os.toLowerCase().includes('windows') ? 'RDP Connection' : 'SSH Connection Command'}
                            </span>
                          </Label>
                          <div className="relative">
                            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                  <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></div>
                                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                                  <span className="text-gray-400 text-xs ml-2">
                                    {order.os.toLowerCase().includes('windows') ? 'Remote Desktop' : 'Terminal'}
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (order.os.toLowerCase().includes('windows')) {
                                      copyToClipboard(order.ipAddress!, 'RDP Address');
                                    } else {
                                      copyToClipboard(`ssh ${order.username}@${order.ipAddress}`, 'SSH Command');
                                    }
                                  }}
                                  className="text-green-400 hover:bg-green-400/20 h-6 px-2"
                                >
                                  {copied === 'SSH Command' || copied === 'RDP Address' ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                              <div className="overflow-x-auto">
                                {order.os.toLowerCase().includes('windows') ? (
                                  <div className="space-y-1">
                                    <code className="text-green-400 font-mono text-xs whitespace-nowrap block">
                                      Address: {order.ipAddress}
                                    </code>
                                    <code className="text-gray-400 font-mono text-xs whitespace-nowrap block">
                                      Use Remote Desktop Connection (mstsc)
                                    </code>
                                  </div>
                                ) : (
                                  <code className="text-green-400 font-mono text-xs whitespace-nowrap">
                                    ssh {order.username}@{order.ipAddress}
                                  </code>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-border">
                    <CardContent className="text-center py-10 lg:py-12">
                      <div className="w-14 h-14 lg:w-16 lg:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="h-7 w-7 lg:h-8 lg:w-8 text-primary" />
                      </div>
                      <h3 className="text-base lg:text-lg font-semibold mb-2">Server Setup in Progress</h3>
                      <p className="text-muted-foreground mb-4 text-sm px-4">
                        Your server is being configured. Connection details will appear here once ready.
                      </p>
                      <Badge variant="outline" className="text-xs px-3 py-1.5">
                        <Clock className="h-3 w-3 mr-1.5" />
                        Est. setup time: 5-10 minutes
                      </Badge>
                    </CardContent>
                  </Card>
                )}

                {/* Netbay proxy — Manage System (visible above fold, left column) */}
                {netbayProxyOrder && canManageServer && (
                  <Card className="border-primary/30 bg-primary/5 hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
                          <Settings2 className="h-4 w-4 text-primary" />
                        </div>
                        Manage System
                      </CardTitle>
                      <CardDescription className="text-xs lg:text-sm">
                        Sync proxy credentials and expiry date
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {!order.netbayServiceId ? (
                        <div className="p-3 rounded-lg border bg-muted/40 text-xs text-muted-foreground">
                          Proxy is still provisioning. Sync will be available once your connection is ready.
                        </div>
                      ) : (
                        <Button
                          variant="default"
                          onClick={() => loadServiceDetails()}
                          disabled={serviceLoading}
                          className="w-full h-10 gap-2"
                        >
                          {serviceLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Sync Proxy Details
                        </Button>
                      )}
                      {order.lastSyncTime && (
                        <p className="text-xs text-muted-foreground text-center">
                          Last synced: {formatDate(order.lastSyncTime)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Recent Activity */}
                {(order.lastAction || order.lastActionTime) && !slotIpOrder && (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Activity className="h-4 w-4 text-primary" />
                        </div>
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          {order.lastAction === 'start' && <Play className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'stop' && <Square className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'restart' && <RotateCcw className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'reboot' && <RotateCcw className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'renew' && <CreditCard className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'changepassword' && <KeyRound className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'reinstall' && <HardDriveIcon className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'format' && <HardDriveIcon className="h-5 w-5 text-primary" />}
                          {order.lastAction === 'resetmac' && <Network className="h-5 w-5 text-primary" />}
                          {!order.lastAction && <Activity className="h-5 w-5 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm break-words">
                            {order.lastAction ?
                              `Last action: ${order.lastAction === 'resetmac' ? 'Reset MAC' : order.lastAction.charAt(0).toUpperCase() + order.lastAction.slice(1)}`
                              : 'Server Activity'
                            }
                          </p>
                          {order.lastActionTime && (
                            <p className="text-muted-foreground text-xs mt-0.5">
                              {formatDate(order.lastActionTime)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Manual Server Action Requests - For non-auto-provisioned products.
                    Hidden when the company has Virtualizor or reseller-API automation;
                    those orders use the regular Server Control card above. */}
                {provider === 'oceanlinux' && !hasCompanyAnyAutomation(ipStock) && !slotIpOrder && (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Settings2 className="h-4 w-4 text-primary" />
                        </div>
                        Server Actions
                      </CardTitle>
                      <CardDescription className="text-xs lg:text-sm">
                        Request server actions - Admin will review and process
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Pending Request Alert */}
                      {pendingRequest && (
                        <Alert className={
                          pendingRequest.status === 'pending' ? 'bg-yellow-500/10 border-yellow-500/20' :
                            pendingRequest.status === 'approved' ? 'bg-green-500/10 border-green-500/20' :
                              'bg-red-500/10 border-red-500/20'
                        }>
                          <Clock className="h-4 w-4" />
                          <AlertDescription>
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {pendingRequest.status === 'pending' && `${pendingRequest.action.toUpperCase()} request pending admin approval`}
                                {pendingRequest.status === 'approved' && `${pendingRequest.action.toUpperCase()} request approved`}
                                {pendingRequest.status === 'rejected' && `${pendingRequest.action.toUpperCase()} request rejected`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Requested: {new Date(pendingRequest.requestedAt).toLocaleString()}
                              </p>
                              {pendingRequest.adminNotes && (
                                <p className="text-xs mt-2 p-2 bg-muted rounded">
                                  <span className="font-medium">Admin notes:</span> {pendingRequest.adminNotes}
                                </p>
                              )}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2 premium-order-action-grid">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('start')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          {requestLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Request Start
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('stop')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          <Square className="h-4 w-4" />
                          Request Stop
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('restart')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Request Restart
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestServerAction('format')}
                          disabled={!!pendingRequest || requestLoading}
                          className="flex items-center gap-2"
                        >
                          <HardDriveIcon className="h-4 w-4" />
                          Request Format
                        </Button>
                      </div>

                      {!pendingRequest && (
                        <p className="text-xs text-muted-foreground text-center pt-2">
                          Submit a request and an admin will process it shortly
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
              <Dialog
                open={osDialogOpen}
                onOpenChange={(open) => {
                  if (!osLoading) {
                    setOsDialogOpen(open);
                    if (!open) {
                      setSelectedOs('');
                      setOsTemplates({});
                      setOsProgress('');
                    }
                  }
                }}
              >
                <DialogContent
                  className="premium-dashboard-dialog premium-dialog-mobile-sheet sm:max-w-[480px] w-[calc(100vw-1.25rem)] overflow-hidden"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <DialogHeader className="premium-dashboard-dialog-header">
                    <DialogTitle className="flex items-center gap-2">
                      <HardDriveIcon className="h-5 w-5 text-primary" />
                      {osMode === 'format' ? 'Format Server' : 'Reinstall OS'}
                    </DialogTitle>
                    <DialogDescription>
                      Select an operating system. This will erase all data and install a fresh OS.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="premium-dashboard-dialog-body space-y-6 py-0">
                    {osLoading && osProgress ? (
                      <div className="flex flex-col items-center gap-4 py-6">
                        <div className="relative">
                          <div className="w-16 h-16 bg-primary/20 rounded-full animate-pulse"></div>
                          <Loader2 className="absolute inset-0 m-auto animate-spin h-8 w-8 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-sm">{osProgress}</p>
                          <p className="text-xs text-muted-foreground mt-1">Please don't close this dialog</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Select Operating System
                          </Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                            {Object.entries(osTemplates).map(([id, name]) => {
                              const label = getOsTemplateLabel(name, id);
                              const isSelected = selectedOs === id;
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => setSelectedOs(id)}
                                  className={cn(
                                    'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                                    isSelected
                                      ? 'border-emerald-400/40 bg-emerald-500/15 ring-1 ring-emerald-400/30'
                                      : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.06] hover:border-emerald-400/20'
                                  )}
                                >
                                  <OsIcon os={label} className="h-8 w-8 shrink-0" />
                                  <span className="min-w-0 flex-1 text-sm font-medium leading-tight">{label}</span>
                                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            <strong>Warning:</strong> This will permanently delete all data on your server and install the selected operating system.
                          </AlertDescription>
                        </Alert>

                        {order && provider === 'netbay' && (
                          <p className="text-xs text-muted-foreground text-center">
                            A new login password is generated automatically after reinstall — no need to enter one.
                            {' '}Limit: <strong>3 reinstalls every 24 hours</strong>.
                          </p>
                        )}

                        {order && provider === 'kurohost' && (
                          <p className="text-xs text-muted-foreground text-center">
                            A new root password is generated automatically after reinstall. Server must be <strong>Running</strong> or <strong>Stopped</strong>. All disk data will be erased; your IP stays the same.
                          </p>
                        )}

                        {order && provider === 'advps' && (() => {
                          const { remaining: rebuildsRemaining } = getAdvpsRebuildUsage(order);
                          return (
                            <p className="text-xs text-muted-foreground text-center">
                              <span className="font-medium text-foreground">{rebuildsRemaining}</span> rebuild{rebuildsRemaining !== 1 ? 's' : ''} remaining &mdash; limit is {ADVPS_REBUILD_LIMIT}/billing period, resets when you renew or on the 1st.
                            </p>
                          );
                        })()}

                        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => setOsDialogOpen(false)}
                            className="flex-1 premium-btn-outline"
                            disabled={osLoading}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={executeOsAction}
                            disabled={!selectedOs || osLoading}
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white border-0"
                          >
                            {osMode === 'format'
                              ? `Format to ${getOsTemplateLabel(osTemplates[selectedOs] || selectedOs, selectedOs)}`
                              : 'Reinstall OS'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>


              {/* Right Column - Management & Billing */}
              <div className="space-y-4 lg:space-y-6">
                {/* Server Management - Only show if provider supports management */}
                {canManageServer && !netbayProxyOrder ? (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Settings2 className="h-4 w-4 text-primary" />
                        </div>
                        {netbayProxyOrder ? 'Proxy Management' : 'Server Control'}
                      </CardTitle>
                      <CardDescription className="text-xs lg:text-sm">
                        {netbayProxyOrder
                          ? 'Sync connection details — host, port, username and password'
                          : 'Manage your server\'s power state and configuration'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {netbayProxyOrder ? (
                        <div className="space-y-3">
                          <div className="p-3 rounded-lg border bg-muted/40 text-xs text-muted-foreground">
                            HTTP proxy has no start/stop controls. Use Sync to refresh credentials or expiry after updates.
                          </div>
                          <Button
                            variant="default"
                            onClick={() => loadServiceDetails()}
                            disabled={serviceLoading}
                            className="w-full h-10 gap-2"
                          >
                            {serviceLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            Sync Proxy Details
                          </Button>
                          {order.lastSyncTime && (
                            <p className="text-xs text-muted-foreground text-center">
                              Last synced: {formatDate(order.lastSyncTime)}
                            </p>
                          )}
                        </div>
                      ) : (
                      <>
                      {/* Server Power State Indicator */}
                      {usesLivePowerUi && (
                        <div className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                          (powerStateLoading || isPowerActionBusy(actionBusy)) && "bg-sky-500/10 border-sky-400/25",
                          !powerStateLoading && !isPowerActionBusy(actionBusy) && serverPowerState === 'running' && "bg-emerald-500/10 border-emerald-400/25",
                          !powerStateLoading && !isPowerActionBusy(actionBusy) && serverPowerState === 'stopped' && "bg-red-500/10 border-red-400/25",
                          !powerStateLoading && !isPowerActionBusy(actionBusy) && serverPowerState === 'suspended' && "bg-red-500/10 border-red-400/25",
                          !powerStateLoading && !isPowerActionBusy(actionBusy) && serverPowerState === 'unknown' && "bg-red-500/10 border-red-400/25"
                        )}>
                          {powerStateLoading || isPowerActionBusy(actionBusy) ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-sky-300">
                                  {isPowerActionBusy(actionBusy) ? 'Processing...' : 'Checking Status...'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {isPowerActionBusy(actionBusy)
                                    ? 'Please wait — this can take 1–3 minutes on some providers'
                                    : 'Fetching server power state'}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={cn(
                                "w-3 h-3 rounded-full",
                                serverPowerState === 'running' && "bg-green-500 animate-pulse",
                                serverPowerState === 'stopped' && "bg-red-500",
                                serverPowerState === 'suspended' && "bg-red-500",
                                serverPowerState === 'unknown' && "bg-red-500"
                              )} />
                              <div className="flex-1">
                                <p className={cn(
                                  "text-sm font-medium",
                                  serverPowerState === 'running' && "text-emerald-300",
                                  serverPowerState === 'stopped' && "text-red-300",
                                  serverPowerState === 'suspended' && "text-red-300",
                                  serverPowerState === 'unknown' && "text-red-300"
                                )}>
                                  {serverPowerState === 'running' && 'Server is Online'}
                                  {serverPowerState === 'stopped' && 'Server is Offline'}
                                  {serverPowerState === 'suspended' && 'Server is Offline'}
                                  {serverPowerState === 'unknown' && 'Server is Offline'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {serverPowerState === 'running' && 'Your server is online and responding'}
                                  {serverPowerState === 'stopped' && 'Your server is powered off'}
                                  {serverPowerState === 'suspended' && 'Your server is powered off'}
                                  {serverPowerState === 'unknown' && 'Your server is powered off'}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => fetchServerPowerState({ force: true })}
                                disabled={powerStateLoading}
                                className="h-8 w-8 p-0 hover:bg-muted"
                                title="Refresh status"
                              >
                                <RefreshCw className={cn(
                                  "h-4 w-4 text-muted-foreground",
                                  powerStateLoading && "animate-spin"
                                )} />
                              </Button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Power Controls */}
                      <div className="grid grid-cols-1 gap-2">
                        <Button
                          variant="default"
                          onClick={() => runServiceAction('start')}
                          disabled={!!actionBusy || serverPowerState === 'running'}
                          className={cn(
                            "h-10 gap-2 text-sm",
                            serverPowerState === 'running'
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-primary hover:bg-primary/90"
                          )}
                        >
                          {actionBusy === 'start' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {serverPowerState === 'running' ? 'Server Already Online' : 'Start Server'}
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => runServiceAction('stop')}
                          disabled={!!actionBusy || serverPowerState === 'stopped'}
                          className={cn(
                            "h-10 gap-2 text-sm",
                            serverPowerState === 'stopped' && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {actionBusy === 'stop' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                          {serverPowerState === 'stopped' ? 'Server Already Offline' : 'Stop Server'}
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => runServiceAction('restart')}
                          disabled={!!actionBusy || serverPowerState === 'stopped'}
                          className={cn(
                            "h-10 gap-2 text-sm",
                            serverPowerState === 'stopped' && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {actionBusy === 'restart' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          {serverPowerState === 'stopped' ? 'Cannot Restart (Offline)' : 'Restart Server'}
                        </Button>
                      </div>

                      <Separator className="my-3" />

                      {/* Advanced Actions */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Advanced Actions</h4>

                        {(() => {
                          const isAdvps = provider === 'advps';
                          const isCompanyResellerApi = hasCompanyResellerApiAutomation(ipStock) &&
                            isOrderCompanyAutomated(order, ipStock);
                          // Joy Services is manage-only (power actions + status). Its
                          // connect API has no reinstall/OS-change endpoint, so we hide
                          // the destructive reinstall control for Joy-backed orders.
                          const isCompanyJoy = hasCompanyJoyAutomation(ipStock) &&
                            isOrderCompanyAutomated(order, ipStock);
                          const { count: rebuildCount, remaining: rebuildsRemaining, limitReached } = getAdvpsRebuildUsage(order);
                          const rebuildLimitReached = isAdvps && limitReached;

                          return (
                            <>
                              {isAdvps && (
                                <div className={cn(
                                  "flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md",
                                  rebuildLimitReached
                                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                                    : "bg-muted/60 text-muted-foreground"
                                )}>
                                  <span className="flex items-center gap-1.5">
                                    <HardDriveIcon className="h-3 w-3" />
                                    Rebuilds this month
                                  </span>
                                  <span className={cn("font-semibold tabular-nums", rebuildLimitReached && "text-destructive")}>
                                    {rebuildCount}/{ADVPS_REBUILD_LIMIT}
                                  </span>
                                </div>
                              )}

                              {rebuildLimitReached && (
                                <p className="text-xs text-destructive px-1">
                                  Rebuild limit reached. Resets when you renew or on the 1st of next month.
                                </p>
                              )}

                              {isAdvps && !isAdvpsMacResetBlockedByServiceType(ipStock, serviceDetails) && (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => void handleResetMac('advps')}
                                    disabled={!!actionBusy}
                                    className="w-full h-10 gap-2 text-sm"
                                  >
                                    {actionBusy === 'resetmac' ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Network className="h-4 w-4" />
                                    )}
                                    Reset MAC address
                                  </Button>
                                  <p className="text-xs text-muted-foreground px-1">
                                    VPS (VM) services only. LXC/Linux containers are not supported by ADVPS for this action.
                                  </p>
                                </>
                              )}

                              {isCompanyResellerApi && (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => void handleResetMac('reseller')}
                                    disabled={!!actionBusy}
                                    className="w-full h-10 gap-2 text-sm"
                                  >
                                    {actionBusy === 'resetmac' ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Network className="h-4 w-4" />
                                    )}
                                    Reset MAC address
                                  </Button>
                                  <p className="text-xs text-muted-foreground px-1">
                                    The VM will be briefly stopped to apply the new MAC, then restarted automatically.
                                  </p>
                                </>
                              )}

                              {isCompanyJoy ? (
                                <p className="text-xs text-muted-foreground px-1">
                                  OS reinstall isn&apos;t available for this server from the panel. Please contact support if you need a fresh OS.
                                </p>
                              ) : (
                                <Button
                                  variant="destructive"
                                  onClick={() => promptReinstallAction((provider === 'smartvps' || provider === 'advps') ? 'format' : 'reinstall')}
                                  disabled={!!actionBusy || rebuildLimitReached}
                                  className="w-full h-10 gap-2 text-sm"
                                >
                                  {(actionBusy === 'reinstall' || actionBusy === 'format') ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <HardDriveIcon className="h-4 w-4" />
                                  )}
                                  {provider === 'smartvps' ? 'Format Server' : provider === 'advps' ? `Rebuild/Format Server${isAdvps && !rebuildLimitReached ? ` (${rebuildsRemaining} left)` : ''}` : 'Reinstall OS'}
                                </Button>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Service Status */}
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Service Status</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void loadServiceDetails()}
                            disabled={serviceLoading}
                            className="gap-1.5 h-7 px-2 text-xs"
                          >
                            <RefreshCw className={`h-3 w-3 ${serviceLoading ? 'animate-spin' : ''}`} />
                            {serviceLoading ? 'Syncing...' : 'Sync'}
                          </Button>
                        </div>

                        {serviceLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground text-xs p-2.5 bg-muted/50 rounded-lg">
                            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                            <span>Syncing server status...</span>
                          </div>
                        ) : serviceDetails ? (
                          <div className="p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                            <div className="flex items-start gap-2">
                              <Info className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-muted-foreground">
                                Last synced: {order.lastSyncTime ? formatDate(order.lastSyncTime) : 'Never'}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-xs p-2.5 bg-muted/50 rounded-lg">
                            Click Sync to refresh server status
                          </p>
                        )}
                      </div>
                      </>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  /* Show info card when management is not available */
                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Info className="h-4 w-4 text-primary" />
                        </div>
                        Service Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-3 bg-muted/50 rounded-lg border border-border">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Database className="h-4 w-4 text-" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-foreground mb-1 text-sm">
                              {getProviderDisplayName(provider)} Service
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              {slotIpOrder
                                ? 'This is a Slot IP proxy order. Use the connection details above — start, stop, and server controls are not available.'
                                : provider === 'oceanlinux'
                                  ? 'This service is directly managed by OceanLinux. Server management tools are not available through this interface.'
                                  : 'This service is offered with a partner provider.'}
                            </p>
                            {order.ipAddress && (
                              <p className="text-xs text-muted-foreground">
                                You can still connect to your server using the connection details above.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Billing & Renewal — show for all billable orders (incl. manual company stocks) */}
                {order.expiryDate && !isSlotIpOrder(order) && (
                  <Card className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Wallet className="h-4 w-4 text-primary" />
                        </div>
                        Billing Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={cn(
                        "p-4 rounded-lg border shadow-sm",
                        isExpired(order)
                          ? "bg-destructive/10 border-destructive/30"
                          : getDaysUntilExpiry(order.expiryDate) <= 7
                            ? "bg-muted/70 border-border"
                            : "bg-primary/10 border-primary/30"
                      )}>
                        {/* Expiry Status with Icon */}
                        <div className="flex items-start gap-3 mb-4">
                          <div className={cn(
                            "h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0",
                            isExpired(order)
                              ? "bg-destructive/15"
                              : getDaysUntilExpiry(order.expiryDate) <= 7
                                ? "bg-muted"
                                : "bg-primary/15"
                          )}>
                            <Calendar className={cn(
                              "h-6 w-6",
                              isExpired(order)
                                ? "text-destructive"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground"
                                  : "text-primary"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "font-semibold text-sm mb-0.5",
                              isExpired(order)
                                ? "text-destructive"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground"
                                  : "text- "
                            )}>
                              {isExpired(order) ? 'Service Expired' : 'Service Expires'}
                            </p>
                            <p className={cn(
                              "text-xs",
                              isExpired(order)
                                ? "text-destructive/80"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground/80"
                                  : "text-muted-foreground /80"
                            )}>
                              {formatDate(order.expiryDate)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={cn(
                              "text-3xl font-bold leading-none",
                              isExpired(order)
                                ? "text-destructive"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground"
                                  : "text-"
                            )}>
                              {Math.abs(getDaysUntilExpiry(order.expiryDate))}
                            </p>
                            <p className={cn(
                              "text-xs font-medium mt-1",
                              isExpired(order)
                                ? "text-destructive/80"
                                : getDaysUntilExpiry(order.expiryDate) <= 7
                                  ? "text-muted-foreground/80"
                                  : "text-muted-foreground /80"
                            )}>
                              {isExpired(order) ? 'days ago' : 'days left'}
                            </p>
                          </div>
                        </div>

                        {getDaysUntilExpiry(order.expiryDate) > 0 && (
                          <div className="mb-4">
                            <Progress
                              value={Math.max(0, 100 - (getDaysUntilExpiry(order.expiryDate) / 30) * 100)}
                              className="h-2"
                            />
                          </div>
                        )}

                        {/* Service Price */}
                        <div className="flex items-center justify-between p-2.5 bg-background/50 rounded-md border border-border mb-3">
                          <span className="text-xs text-muted-foreground">Renewal Rate</span>
                          <span className="font-semibold text-sm">₹{renewalPrice}/month</span>
                        </div>

                        {renewalPriceNote && (
                          <p className="text-[11px] text-muted-foreground mb-3 px-0.5">
                            {renewalPriceNote}
                          </p>
                        )}

                        {order.price < renewalPrice && (
                          <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-md border border-border mb-3 text-xs">
                            <span className="text-muted-foreground">First purchase paid</span>
                            <span className="font-medium">₹{order.price}</span>
                          </div>
                        )}

                        {provider === 'oceanlinux' && !!ipStock?.company && !hasCompanyAnyAutomation(ipStock) && !order.pendingRenewal?.awaitingCompanyApproval && (
                          <div className="flex items-start gap-2 mb-3 p-3 rounded-md bg-primary/5 border border-primary/20">
                            <Building2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              This service is managed by your provider. After you pay, they approve the renewal from their company dashboard before your expiry is extended.
                            </p>
                          </div>
                        )}

                        {/* Awaiting company approval banner — payment received,
                            extension blocked until the linked company approves. */}
                        {order.pendingRenewal?.awaitingCompanyApproval && (
                          <div className="flex items-start gap-2 mb-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
                            <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div className="text-xs space-y-0.5">
                              <p className="font-medium text-amber-700 dark:text-amber-400">Renewal payment received — awaiting approval</p>
                              <p className="text-amber-700/80 dark:text-amber-400/80">
                                Your provider has to approve this renewal before your service is extended. You&apos;ll see the new expiry date here once approved.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Renewal Payment Method Selection */}
                        {isRenewalEligible(order) && !order.pendingRenewal?.awaitingCompanyApproval && (
                          <>
                            <div className="mb-3 p-3 rounded-md border border-primary/20 bg-primary/5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <Wallet className="h-4 w-4 text-primary" />
                                  <div>
                                    <p className="text-sm font-medium">Use wallet balance</p>
                                    <p className="text-xs text-muted-foreground">
                                      Available: ₹{walletBalance.toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                </div>
                                <Switch
                                  checked={useWalletRenewal}
                                  onCheckedChange={setUseWalletRenewal}
                                  disabled={walletBalance <= 0 || actionBusy === 'renew'}
                                />
                              </div>
                              {useWalletRenewal && renewalPaymentTotals.walletApplied > 0 && (
                                <div className="mt-3 space-y-1 text-xs border-t border-border/60 pt-3">
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>Renewal total</span>
                                    <span>₹{renewalPaymentTotals.total.toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex justify-between text-green-600 dark:text-green-400">
                                    <span>From wallet</span>
                                    <span>-₹{renewalPaymentTotals.walletApplied.toLocaleString('en-IN')}</span>
                                  </div>
                                  {renewalPaymentTotals.gatewayCharge > 0 ? (
                                    <div className="flex justify-between font-medium">
                                      <span>Pay via gateway</span>
                                      <span>₹{renewalPaymentTotals.gatewayCharge.toLocaleString('en-IN')}</span>
                                    </div>
                                  ) : (
                                    <p className="text-green-600 dark:text-green-400 font-medium">
                                      Fully covered by wallet — no gateway payment needed.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {renewalPaymentTotals.gatewayCharge > 0 && (
                            <div className="flex items-center gap-2 mb-2">
                              {sortGatewaysByPrimary(paymentConfig.primaryGateway).map((method) => (
                              <button
                                key={method}
                                onClick={() => {
                                  setRenewalPaymentMethod(method);
                                  setRenewalGatewayUserPicked(method !== paymentConfig.primaryGateway);
                                }}
                                disabled={actionBusy === 'renew'}
                                className={cn(
                                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                  renewalPaymentMethod === method
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                              >
                                {method === 'upi' ? 'UPI' : 'Razorpay'}
                              </button>
                              ))}
                            </div>
                            )}

                            <Button
                              onClick={() => setRenewConfirmOpen(true)}
                              disabled={actionBusy === 'renew'}
                              className={cn(
                                "w-full gap-2 h-10 text-sm shadow-sm",
                                isExpired(order)
                                  ? "bg-destructive hover:bg-destructive/90"
                                  : "dark:bg-green-700 bg-green-500 text-white  hover:bg-primary/90"
                              )}
                            >
                              {actionBusy === 'renew' ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="hidden sm:inline">Processing Payment...</span>
                                  <span className="sm:hidden">Processing...</span>
                                </>
                              ) : renewalPaymentTotals.gatewayCharge === 0 && useWalletRenewal ? (
                                <>
                                  <Wallet className="h-4 w-4" />
                                  Renew with Wallet (₹{renewalPrice})
                                </>
                              ) : (
                                <>
                                  <CreditCard className="h-4 w-4" />
                                  Renew for ₹{renewalPrice}
                                </>
                              )}
                            </Button>
                          </>
                        )}

                        {isExpired(order) && isRenewalEligible(order) && (
                          <div className="flex items-start gap-2 mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-destructive/90">
                              Renewal opens within 2 days of expiry (available for up to 7 days after expiry)
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Renewal History */}
                      {order.renewalPayments && order.renewalPayments.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-3">Renewal History</h4>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {order.renewalPayments.map((renewal, index) => (
                              <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs p-3 bg-primary/5 rounded-lg border border-primary/20">
                                <div>
                                  <p className="font-semibold text-foreground">₹{renewal.amount} paid</p>
                                  <p className="text-muted-foreground mt-0.5">{formatDate(renewal.paidAt)}</p>
                                </div>
                                <div className="text-left sm:text-right">
                                  <p className="text-muted-foreground">Extended to</p>
                                  <p className="font-medium text-foreground mt-0.5">{formatDate(renewal.newExpiry)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Download Invoice */}
                      <div className="mt-4 pt-4 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadInvoice}
                          disabled={downloadingInvoice}
                          className="w-full gap-2 h-9 text-sm"
                        >
                          {downloadingInvoice ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          {downloadingInvoice ? 'Generating...' : 'Download Invoice'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Download Invoice (standalone, shows when billing card is hidden) */}
                {(!order.expiryDate || provider === 'oceanlinux') && (
                  <Button
                    variant="outline"
                    onClick={handleDownloadInvoice}
                    disabled={downloadingInvoice}
                    className="w-full gap-2 h-10 text-sm"
                  >
                    {downloadingInvoice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {downloadingInvoice ? 'Generating Invoice...' : 'Download Invoice'}
                  </Button>
                )}

                {/* Service Details */}
                <Card className="border-border hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Server className="h-4 w-4 text-primary" />
                      </div>
                      Service Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                        <span className="text-xs text-muted-foreground">Service ID</span>
                        <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order._id}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-border">
                        <span className="text-xs text-muted-foreground">Price</span>
                        <span className="font-semibold text-sm">₹{order.price}</span>
                      </div>
                      {order.ipStockId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                          <span className="text-xs text-muted-foreground">IP Stock ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.ipStockId}</span>
                        </div>
                      )}
                      {order.lastSyncTime && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2 border-b border-border">
                          <span className="text-xs text-muted-foreground">Last Sync</span>
                          <span className="text-xs">{formatDate(order.lastSyncTime)}</span>
                        </div>
                      )}
                      {provider === 'hostycare' && order.hostycareServiceId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-xs text-muted-foreground">Hostycare ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.hostycareServiceId}</span>
                        </div>
                      )}
                      {provider === 'smartvps' && order.smartvpsServiceId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-xs text-muted-foreground">SmartVPS ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.smartvpsServiceId}</span>
                        </div>
                      )}
                      {provider === 'advps' && order.advpsServiceId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-xs text-muted-foreground">ADVPS Service ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.advpsServiceId}</span>
                        </div>
                      )}
                      {provider === 'advps' && order.advpsOrderId && (
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 py-2">
                          <span className="text-xs text-muted-foreground">ADVPS Order ID</span>
                          <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded break-all">{order.advpsOrderId}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

      <AlertDialog
        open={reinstallConfirmOpen}
        onOpenChange={(open) => {
          setReinstallConfirmOpen(open);
          if (!open) setPendingReinstallAction(null);
        }}
      >
        <AlertDialogContent className="premium-dashboard-alert sm:max-w-md w-[calc(100vw-1.5rem)]">
          <AlertDialogHeader className="premium-dashboard-dialog-header !border-0">
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {pendingReinstallAction === 'format'
                ? (order && getProviderFromOrder(order, ipStock) === 'advps'
                  ? 'Rebuild/Format Server'
                  : 'Format Server')
                : 'Reinstall OS'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This will <strong className="text-foreground">permanently erase all data</strong> on your server
                  and install a fresh operating system. This action cannot be undone.
                </p>
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs">
                  Make sure you have backed up any important files before continuing.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => {
                const action = pendingReinstallAction;
                setReinstallConfirmOpen(false);
                setPendingReinstallAction(null);
                if (action) void executeAdvancedAction(action);
              }}
            >
              Yes, continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renewConfirmOpen} onOpenChange={setRenewConfirmOpen}>
        <DialogContent className="premium-dashboard-dialog premium-dialog-mobile-sheet sm:max-w-md w-[calc(100vw-1.25rem)] overflow-hidden">
          <DialogHeader className="premium-dashboard-dialog-header">
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Renew Service
            </DialogTitle>
            <DialogDescription>
              Review your renewal details before proceeding to payment.
            </DialogDescription>
          </DialogHeader>

          {order?.expiryDate && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-medium text-right">{order.productName}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Configuration</span>
                  <span className="font-medium text-right">{order.memory}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Current expiry</span>
                  <span className="font-medium text-right">{formatDate(order.expiryDate)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium text-right">
                    {getDaysUntilExpiry(order.expiryDate) < 0
                      ? 'Expired'
                      : `${getDaysUntilExpiry(order.expiryDate)} days remaining`}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Renewal price</span>
                  <span className="font-semibold text-primary text-base">₹{renewalPrice}</span>
                </div>
                {useWalletRenewal && renewalPaymentTotals.walletApplied > 0 && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" />
                        Wallet
                      </span>
                      <span className="font-medium">₹{renewalPaymentTotals.walletApplied.toLocaleString('en-IN')}</span>
                    </div>
                    {renewalPaymentTotals.gatewayCharge > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" />
                          Gateway ({renewalPaymentMethod})
                        </span>
                        <span className="font-medium">₹{renewalPaymentTotals.gatewayCharge.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  After payment, your service will be extended for <strong>30 days</strong>.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setRenewConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className={cn(
                    isExpired(order)
                      ? "bg-destructive hover:bg-destructive/90"
                      : "dark:bg-green-700 bg-green-500 hover:bg-green-600"
                  )}
                  onClick={() => {
                    setRenewConfirmOpen(false);
                    void executeRenewService();
                  }}
                >
                  {renewalPaymentTotals.gatewayCharge === 0 && useWalletRenewal ? (
                    <>
                      <Wallet className="h-4 w-4 mr-2" />
                      Pay with Wallet
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Proceed to Payment
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={legacyActionOpen}
        onOpenChange={(open) => {
          setLegacyActionOpen(open);
          if (!open) {
            setLegacyPassword('');
            setLegacySelectedTemplate('');
            setLegacyTemplateWarning(null);
          }
        }}
      >
        <DialogContent className="premium-dashboard-dialog premium-dialog-mobile-sheet sm:max-w-md w-[calc(100vw-1.25rem)] overflow-hidden">
          <DialogHeader className="premium-dashboard-dialog-header">
            <DialogTitle className="flex items-center gap-2">
              <HardDriveIcon className="h-5 w-5 text-primary" />
              {legacyActionLabel}
            </DialogTitle>
            <DialogDescription>
              Choose an OS template and set a new root/administrator password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {legacyTemplateWarning && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">{legacyTemplateWarning}</AlertDescription>
              </Alert>
            )}

            {Object.keys(legacyTemplates).length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="legacy-template">OS Template (optional)</Label>
                <Select value={legacySelectedTemplate} onValueChange={setLegacySelectedTemplate}>
                  <SelectTrigger id="legacy-template">
                    <SelectValue placeholder="Use default template" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(legacyTemplates).map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="legacy-password">New Password</Label>
              <Input
                id="legacy-password"
                type="password"
                value={legacyPassword}
                onChange={(e) => setLegacyPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
              />
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                This will erase all data on the server and cannot be undone.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setLegacyActionOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void submitLegacyAction()}
                disabled={legacyPassword.length < 6}
              >
                {legacyAction === 'format' ? 'Format Server' : 'Reinstall OS'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={serviceErrorPopup.open}
        onOpenChange={(open) => setServiceErrorPopup((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent className="premium-dashboard-alert sm:max-w-md w-[calc(100vw-1.5rem)]">
          <AlertDialogHeader className="premium-dashboard-dialog-header !border-0">
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {serviceErrorPopup.title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{serviceErrorPopup.message}</p>
                <p className="text-xs">
                  If this keeps happening, please raise a support ticket from your dashboard.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="premium-dashboard-dialog-footer sm:justify-center">
            <AlertDialogAction className="min-w-[120px] w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-emerald-950">
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpiQrPaymentDialog
        session={upiQrSession}
        open={!!upiQrSession}
        onOpenChange={(open) => {
          if (!open) setUpiQrSession(null);
        }}
        title="Renew via UPI"
        onSuccess={async () => {
          setUpiQrSession(null);
          toast.success('Service renewed successfully!');
          await fetchOrder({ silent: true });
          setActionBusy(null);
        }}
        onCancel={() => {
          if (upiQrSession?.clientTxnId) {
            void cancelPendingRenewal(upiQrSession.clientTxnId);
          }
          setActionBusy(null);
        }}
      />

      <ConfirmDialog />
    </div>
  );
};

export default OrderDetails;
