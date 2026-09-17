"use client";

import { useEffect, useState, Suspense, useMemo, memo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { dashboardFetch } from '@/lib/dashboardFetch';
import {
  readDashboardCache,
  writeDashboardCache,
  dashboardCacheAge,
  DASHBOARD_CACHE_KEYS,
} from '@/lib/dashboardCache';
import { normalizeMemoryKey } from '@/lib/orderRenewalPricing';
import { listNetbayGroupTags, isNetbayProxyStock, pickPricedMemoryKey } from '@/lib/netbayGroupTags';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DashboardSearchInput from "@/components/dashboard/DashboardSearchInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  AlertCircle,
  Loader2,
  Info,
  CreditCard,
  Tag,
  Percent,
  Server,
  Cloud,
  Grid3X3,
  Zap,
  ChevronDown,
  ChevronRight,
  Package,
  Search,
  Copy,
  ShoppingCart,
  Wallet as WalletIcon,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { premiumBadge } from "@/lib/premium-badges";
import Link from "next/link";
import AddToCartButton from "@/components/cart/AddToCartButton";
import { fetchWalletSummary } from "@/lib/walletClient";
import { customerStockUnavailableMessage } from "@/lib/customerStockMessages";
import { openRazorpayModal } from "@/lib/razorpayCheckout";
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
import { PurchaseDisclaimerNotice } from "@/components/purchase/PurchaseDisclaimerNotice";
import {
  trialVpsPlanCategoryLabel,
  formatTrialVpsMemoryGb,
  trialVpsPlanUsesMemoryTier,
  resolveTrialVpsOrderMemory,
} from '@/lib/trialVpsCatalog';

// Keep all existing interfaces and global declarations unchanged...

declare global {
  interface Window {
    Cashfree: any;
    Razorpay: any;
  }
}

/** Catalog paints from Mongo first. Live provider syncs run one-by-one in the background. */
const STOCK_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;
const LIVE_STOCK_SYNC_ENDPOINTS = [
  '/api/advps/refresh-stock',
  '/api/reseller-panel/refresh-stock',
  '/api/kurohost/refresh-stock',
  '/api/hostdzire/refresh-stock',
  '/api/smartvps/sync',
] as const;

interface MemoryOptionDetails {
  price: number | null;
  listPrice?: number | null;
}

interface PromoCode {
  code: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  isActive: boolean;
  createdAt?: string;
}

interface IPStock {
  _id: string;
  name: string;
  description?: string;
  available: boolean;
  hiddenFromStore?: boolean;
  inventoryAvailable?: number;
  usesPreconfiguredInventory?: boolean;
  defaultConfigurations?: Record<string, any>;
  stockCount?: number;
  availabilityManual?: boolean;
  fulfillmentMode?: 'units' | 'inventory' | null;
  company?: string | null;
  netbayUseLiveStockApi?: boolean | null;
  kurohostUseLiveStockApi?: boolean | null;
  hostdzireUseLiveStockApi?: boolean | null;
  resellerUseLiveStockApi?: boolean | null;
  serverType: string;
  tags: string[];
  memoryOptions: Record<string, MemoryOptionDetails>;
  promoCodeCount?: number;
  resellerPriced?: boolean;
}

function isKurohostLiveStock(stock: IPStock) {
  const cfg = stock.defaultConfigurations?.kurohost;
  if (!cfg?.cloudZoneId && !(cfg?.zoneIds?.length)) return false;
  if (!Object.values(cfg.flavorByMemory || {}).some(Boolean)) return false;
  return stock.kurohostUseLiveStockApi === true;
}

function isNetbayLiveStock(stock: IPStock) {
  const cfg = stock.defaultConfigurations?.netbay;
  if (!cfg?.planByMemory) return false;
  if (!Object.values(cfg.planByMemory).some(Boolean)) return false;
  return stock.netbayUseLiveStockApi === true;
}

function isHostdzireLiveStock(stock: IPStock) {
  const cfg = stock.defaultConfigurations?.hostdzire;
  if (!cfg) return false;
  const hasByMemory = Object.values(cfg.inventoryByMemory || {}).some(Boolean);
  if (!hasByMemory) return false;
  return stock.hostdzireUseLiveStockApi === true;
}

function stockHasResellerPanelConfig(stock: IPStock) {
  const cfg = stock.defaultConfigurations?.resellerApi;
  if (cfg && typeof cfg === 'object') return true;
  const tags = (stock.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('reseller-api') || tags.includes('primevps') || tags.includes('primevm');
}

function isResellerLiveStock(stock: IPStock) {
  if (!stockHasResellerPanelConfig(stock)) return false;
  return stock.resellerUseLiveStockApi === true;
}

/** Company portal set manual units — overrides live panel stock for store listing. */
function usesCompanyManualUnits(stock: IPStock) {
  if (!stock.company) return false;
  return stock.availabilityManual === true;
}

function isCompanyStock(stock: IPStock) {
  if (usesCompanyManualUnits(stock)) return true;
  return !!stock.company && !isNetbayLiveStock(stock) && !isHostdzireLiveStock(stock) && !isKurohostLiveStock(stock) && !isResellerLiveStock(stock);
}

function getStockUnitsRemaining(stock: IPStock) {
  if (usesCompanyManualUnits(stock)) {
    return Math.max(0, stock.stockCount ?? 0);
  }
  if (isNetbayLiveStock(stock) || isHostdzireLiveStock(stock) || isKurohostLiveStock(stock) || isResellerLiveStock(stock)) {
    return stock.available ? Number.POSITIVE_INFINITY : 0;
  }
  if (isCompanyStock(stock)) {
    if (stock.usesPreconfiguredInventory) {
      return Math.max(0, stock.inventoryAvailable ?? 0);
    }
    return Math.max(0, stock.stockCount ?? 0);
  }
  return stock.available ? Number.POSITIVE_INFINITY : 0;
}

function isKurohostMemoryInStock(stock: IPStock, memory: string) {
  if (stock.available) return true;
  const kh = stock.defaultConfigurations?.kurohost;
  const variant = kh?.variantStock?.[memory];
  if (variant?.available === true) return true;
  if (!variant) return stock.available !== false;
  return variant.available === true;
}

function isNetbayMemoryInStock(stock: IPStock, memory: string) {
  if (stock.available) return true;
  const netbay = stock.defaultConfigurations?.netbay;
  const variant = netbay?.variantStock?.[memory];
  if (variant?.available === true) return true;
  if (!variant) return stock.available !== false;
  if (variant.skipped || variant.available === null) {
    const primary = netbay?.variantStock?.['2GB'];
    if (primary?.available === true) return true;
    return false;
  }
  return variant.available === true;
}

function resellerVariantValues(stock: IPStock) {
  const raw = stock.defaultConfigurations?.resellerApi?.variantStock || {};
  return Object.entries(raw)
    .filter(([k, v]) => k && !String(k).startsWith('$') && v && typeof v === 'object')
    .map(([, v]) => v as { available?: boolean; skipped?: boolean });
}

function isHostdzireMemoryInStock(stock: IPStock, memory: string) {
  const hd = stock.defaultConfigurations?.hostdzire;
  const variant = hd?.variantStock?.[memory];
  if (variant && typeof variant === 'object') {
    return variant.available === true;
  }
  if (hd?.inventoryByMemory?.[memory]) {
    return stock.available !== false;
  }
  return false;
}

function isResellerMemoryInStock(stock: IPStock, memory: string) {
  if (stock.available) return true;
  const reseller = stock.defaultConfigurations?.resellerApi;
  const variant = reseller?.variantStock?.[memory];
  if (variant?.available === true) return true;
  if (!variant) return stock.available !== false;
  if (variant.skipped || variant.available === null) {
    for (const fallback of ['2GB', '4GB', '8GB']) {
      if (reseller?.variantStock?.[fallback]?.available === true) return true;
    }
    return false;
  }
  return variant.available === true;
}

function isStockPurchasable(stock: IPStock, memory?: string) {
  const savedVps = stock.inventoryAvailable ?? 0;
  if (savedVps > 0) return true;
  if (usesCompanyManualUnits(stock)) {
    return getStockUnitsRemaining(stock) > 0;
  }
  if (isNetbayLiveStock(stock)) {
    if (memory) return isNetbayMemoryInStock(stock, memory);
    if (stock.available) return true;
    const variants: Array<{ available?: boolean }> = Object.values(
      stock.defaultConfigurations?.netbay?.variantStock || {}
    );
    return variants.some((v) => v?.available === true);
  }
  if (isKurohostLiveStock(stock)) {
    if (memory) return isKurohostMemoryInStock(stock, memory);
    if (stock.available) return true;
    const variants: Array<{ available?: boolean }> = Object.values(
      stock.defaultConfigurations?.kurohost?.variantStock || {}
    );
    return variants.some((v) => v?.available === true);
  }
  if (isHostdzireLiveStock(stock)) {
    if (memory) return isHostdzireMemoryInStock(stock, memory);
    if (stock.available) return true;
    const variants: Array<{ available?: boolean }> = Object.values(
      stock.defaultConfigurations?.hostdzire?.variantStock || {}
    );
    return variants.some((v) => v?.available === true);
  }
  if (isResellerLiveStock(stock)) {
    if (memory) return isResellerMemoryInStock(stock, memory);
    if (stock.available) return true;
    return resellerVariantValues(stock).some((v) => v?.available === true);
  }
  if (isCompanyStock(stock)) {
    if (stock.usesPreconfiguredInventory) {
      return (stock.inventoryAvailable ?? 0) > 0;
    }
    return getStockUnitsRemaining(stock) > 0;
  }
  return stock.available !== false;
}

const MEMORY_TIER_ORDER = ['1GB', '2GB', '4GB', '6GB', '8GB', '12GB', '16GB', '32GB'];

function normalizePlanTag(tag: string) {
  return String(tag || '').trim().toLowerCase();
}

function stockTagsNormalized(stock: IPStock) {
  return (stock.tags || []).map(normalizePlanTag);
}

function planNameLower(stock: IPStock) {
  return String(stock.name || '').trim().toLowerCase();
}

/** SmartVPS / Ocean Linux product family (4GB Linux vs 8GB+ Windows VPS tiers). */
function isOceanLinuxCategoryPlan(stock: IPStock) {
  return stockTagsNormalized(stock).some(
    (t) => t === 'ocean linux' || t === 'oceanlinux' || t.includes('ocean linux'),
  );
}

function isOceanSmartVpsPlan(stock: IPStock) {
  return isOceanLinuxCategoryPlan(stock) || String(stock.name || '').trimStart().startsWith('🌊');
}

function isOceanSmartVpsProductName(name: string) {
  return String(name || '').trimStart().startsWith('🌊');
}

/** SmartVPS display only: 4GB = Linux slot, 8GB+ = VPS (Linux + Windows). */
function formatOceanMemoryDisplay(memory: string) {
  return normalizeMemoryKey(memory);
}

function oceanSmartVpsPlanType(memory: string): 'Linux' | 'VPS' | null {
  const gb = Number(String(memory).match(/(\d+)/)?.[1]);
  if (!Number.isFinite(gb)) return null;
  if (gb === 4) return 'Linux';
  if (gb >= 8) return 'VPS';
  return null;
}

function OceanPlanTypeBadge({ memory }: { memory: string }) {
  const type = oceanSmartVpsPlanType(memory);
  if (!type) return null;
  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0',
        type === 'Linux'
          ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/15'
          : 'text-sky-300 border-sky-400/40 bg-sky-500/15',
      )}
    >
      {type}
    </span>
  );
}

function formatTagGroupTitle(tag: string) {
  const t = normalizePlanTag(tag);
  if (t === 'ocean linux' || t === 'oceanlinux') return 'Ocean Linux';
  return tag;
}

/** HTTP proxy IPStock (Netbay Applications) — show with Slot IP under Premium IP Proxies. */
function isPremiumProxyPlan(stock: IPStock) {
  const server = String(stock.serverType || '').toLowerCase();
  if (server === 'proxy' || server === 'slotip') return true;
  if (isNetbayProxyStock(stock)) return true;
  const tags = stockTagsNormalized(stock);
  if (tags.some((t) => t === 'proxy' || t.includes('proxy'))) return true;
  const name = planNameLower(stock);
  return name.includes('proxy') || name.includes('multi-ip');
}

function planHasLinuxSignals(stock: IPStock) {
  const tags = stockTagsNormalized(stock);
  const name = planNameLower(stock);
  return (
    stock.serverType === 'Linux' ||
    tags.some((t) => (t.includes('linux') || t.includes('ocean')) && !t.includes('windows')) ||
    (name.includes('linux') && !name.includes('windows'))
  );
}

function planHasWindowsSignals(stock: IPStock) {
  const tags = stockTagsNormalized(stock);
  const name = planNameLower(stock);
  return (
    stock.serverType === 'VPS' ||
    tags.some((t) => t.includes('windows') || t === 'vps') ||
    name.includes('windows') ||
    /\bwindows vps\b/.test(name)
  );
}

/** Whether a memory tier belongs on Linux vs Windows VPS tab (SmartVPS only). */
function memoryMatchesCategoryTab(memory: string, tab: string, stock: IPStock) {
  if (!tab || tab === 'all' || tab === 'SlotIP' || tab === 'Trial') return true;
  if (!isOceanSmartVpsPlan(stock)) return true;
  const type = oceanSmartVpsPlanType(memory);
  if (tab === 'Linux') return type === 'Linux';
  if (tab === 'VPS') return type === 'VPS';
  return true;
}

/** Linux tab — SmartVPS 4GB tiers + dedicated Linux plans. */
function isLinuxCategoryPlan(stock: IPStock) {
  if (isPremiumProxyPlan(stock)) return false;
  if (isOceanSmartVpsPlan(stock)) {
    return Object.keys(stock.memoryOptions || {}).some(
      (mem) => memoryMatchesCategoryTab(mem, 'Linux', stock),
    );
  }
  const hasLinux = planHasLinuxSignals(stock);
  const hasWindows = planHasWindowsSignals(stock);
  if (stock.serverType === 'Windows & Linux') return hasLinux || !hasWindows;
  return hasLinux;
}

function isVpsCategoryPlan(stock: IPStock) {
  if (isPremiumProxyPlan(stock)) return false;
  if (isOceanSmartVpsPlan(stock)) {
    return Object.keys(stock.memoryOptions || {}).some(
      (mem) => memoryMatchesCategoryTab(mem, 'VPS', stock),
    );
  }
  const hasLinux = planHasLinuxSignals(stock);
  const hasWindows = planHasWindowsSignals(stock);
  if (stock.serverType === 'Windows & Linux') return hasWindows || !hasLinux;
  return hasWindows;
}

function matchesCategoryTab(stock: IPStock, tab: string) {
  if (!tab || tab === 'all') return true;
  if (tab === 'SlotIP') return isPremiumProxyPlan(stock);
  if (tab === 'Linux') return isLinuxCategoryPlan(stock);
  if (tab === 'VPS') return isVpsCategoryPlan(stock);
  return stock.serverType === tab;
}

function stockMatchesSearch(stock: IPStock, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (stock.name.toLowerCase().includes(q)) return true;
  if (stock.description?.toLowerCase().includes(q)) return true;
  if (stock.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
  if (Object.keys(stock.memoryOptions || {}).some((mem) => mem.toLowerCase().includes(q))) return true;
  return false;
}

function memoryTierSortIndex(label: string) {
  const normalized = normalizeMemoryKey(label);
  const idx = MEMORY_TIER_ORDER.indexOf(normalized);
  if (idx !== -1) return idx;
  const gb = normalized.match(/^(\d+)GB$/i);
  if (gb) return 1000 + Number(gb[1]);
  return 9999;
}

function sortMemoryOptionEntries(entries: [string, MemoryOptionDetails][]) {
  return [...entries].sort((a, b) => {
    const ai = memoryTierSortIndex(a[0]);
    const bi = memoryTierSortIndex(b[0]);
    if (ai !== bi) return ai - bi;
    return (a[1].price || 0) - (b[1].price || 0);
  });
}

interface SlotIPPackage {
  _id: string;
  name: string;
  description: string;
  price: number;
  listPrice?: number;
  available: boolean;
  totalCount: number;
  availableCount: number;
  allocatedCount: number;
  promoCodes?: PromoCode[];
  resellerPriced?: boolean;
}

interface TrialVpsPackage {
  _id: string;
  name: string;
  description: string;
  price: number;
  listPrice?: number;
  trialDays: number;
  memoryGb?: number;
  planCategory?: string;
  available: boolean;
  totalCount: number;
  availableCount: number;
  allocatedCount: number;
  promoCodes?: PromoCode[];
  resellerPriced?: boolean;
}

function groupStocksByTags(stocks: IPStock[]) {
  const grouped: { [key: string]: IPStock[] } = {};
  const untagged: IPStock[] = [];

  stocks.forEach((stock) => {
    if (!stock.tags || stock.tags.length === 0) {
      untagged.push(stock);
    } else {
      const primaryTag = stock.tags[0];
      if (!grouped[primaryTag]) {
        grouped[primaryTag] = [];
      }
      grouped[primaryTag].push(stock);
    }
  });

  return { grouped, untagged };
}

export default function IPStockPage() {
  return (
    <Suspense>
      <IPStockContent />
    </Suspense>
  );
}

function IPStockContent() {
  const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
  const [slotPackages, setSlotPackages] = useState<SlotIPPackage[]>([]);
  const [trialPackages, setTrialPackages] = useState<TrialVpsPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingStock, setIsRefreshingStock] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [verifyingPurchaseKey, setVerifyingPurchaseKey] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [outOfStockPopup, setOutOfStockPopup] = useState<{
    open: boolean;
    message: string;
    productName?: string;
    memory?: string;
  }>({ open: false, message: '' });
  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    memory: string;
    price: number;
    ipStockId: string;
    slotIpPackageId?: string;
    trialVpsPackageId?: string;
    netbayGroupTag?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentInitiating, setPaymentInitiating] = useState(false);
  const [purchaseDisclaimerAccepted, setPurchaseDisclaimerAccepted] = useState(false);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [priceFilter, setPriceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");

  // Promo code states
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoMessage, setPromoMessage] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);

  // Payment method selection
  const paymentConfig = usePaymentConfig();
  const [paymentMethod, setPaymentMethod] = useState<PaymentGateway>('upi');
  const [gatewayUserPicked, setGatewayUserPicked] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(true);
  const [upiQrSession, setUpiQrSession] = useState<UpiQrSession | null>(null);

  // Panel buying is disabled for resellers — they order via the Reseller API.
  const [isReseller, setIsReseller] = useState(false);
  useEffect(() => {
    const cached = readDashboardCache(DASHBOARD_CACHE_KEYS.currentUser) as { userType?: string } | null;
    if (cached?.userType === 'reseller') {
      setIsReseller(true);
      return;
    }
    dashboardFetch('/api/users/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u?.userType === 'reseller') setIsReseller(true); })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    if (paymentConfig.loaded) {
      setPaymentMethod(paymentConfig.primaryGateway);
      setGatewayUserPicked(false);
    }
  }, [paymentConfig.loaded, paymentConfig.primaryGateway]);

  const router = useRouter();

  // Category tab — URL is the source of truth (sidebar links + in-page tabs).
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('category') || 'all';

  const handleTabChange = (tabId: string) => {
    const url =
      tabId === 'all' ? '/dashboard/ipStock' : `/dashboard/ipStock?category=${encodeURIComponent(tabId)}`;
    router.replace(url, { scroll: false });
  };

  const liveSyncAbortRef = useRef<AbortController | null>(null);
  const liveSyncGenerationRef = useRef(0);

  const loadPlans = useCallback(async (options?: {
    silent?: boolean;
    waitForLiveSync?: boolean;
    skipUpstreamSync?: boolean;
    /** User clicked toolbar refresh — always reload catalog + live sync. */
    manual?: boolean;
  }) => {
    const silent = options?.silent ?? false;
    const waitForLiveSync = options?.waitForLiveSync ?? false;
    const skipUpstreamSync = options?.skipUpstreamSync ?? false;
    const manual = options?.manual ?? false;

    const parseIpStockRows = (ipData: unknown): IPStock[] =>
      (Array.isArray(ipData) ? ipData : []).filter((s) => !s.hiddenFromStore);

    const applyCatalogPayload = (
      ipRows: IPStock[],
      slotData: unknown,
      trialData: unknown
    ) => {
      const slotRows = (Array.isArray(slotData) ? slotData : []).filter(
        (pkg: SlotIPPackage) => pkg.available && pkg.availableCount > 0
      );
      const trialRows = (Array.isArray(trialData) ? trialData : []).filter(
        (pkg: TrialVpsPackage) => pkg.available && pkg.availableCount > 0
      );

      writeDashboardCache(DASHBOARD_CACHE_KEYS.ipStock, ipRows);
      writeDashboardCache(DASHBOARD_CACHE_KEYS.slotIps, slotRows);
      writeDashboardCache(DASHBOARD_CACHE_KEYS.trialVps, trialRows);

      setIpStocks(ipRows);
      setSlotPackages(slotRows);
      setTrialPackages(trialRows);
    };

    const fetchFullCatalog = async (signal?: AbortSignal) => {
      const [ipRes, slotRes, trialRes] = await Promise.all([
        dashboardFetch("/api/ipstock", { cache: "no-store", signal }),
        dashboardFetch("/api/slot-ips?view=customer", { cache: "no-store", signal }),
        dashboardFetch("/api/trial-vps", { cache: "no-store", signal }),
      ]);

      const ipData = await ipRes.json();
      const slotData = await slotRes.json();
      const trialData = await trialRes.json();
      const ipRows = parseIpStockRows(ipData);

      if (!ipRes.ok) {
        console.warn("[IP Stock] /api/ipstock HTTP", ipRes.status, ipData);
      }

      applyCatalogPayload(ipRows, slotData, trialData);
      return ipRes.ok;
    };

    const reloadIpStocks = async (signal?: AbortSignal) => {
      if (signal?.aborted) return;
      const ipRes = await dashboardFetch("/api/ipstock", { cache: "no-store", signal });
      if (!ipRes.ok || signal?.aborted) return;
      const ipData = await ipRes.json();
      const rows = parseIpStockRows(ipData);
      writeDashboardCache(DASHBOARD_CACHE_KEYS.ipStock, rows);
      setIpStocks(rows);
    };

    const syncLiveStockSequentially = async (signal: AbortSignal, generation: number) => {
      setIsRefreshingStock(true);
      try {
        if (!manual && !waitForLiveSync) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
        for (const url of LIVE_STOCK_SYNC_ENDPOINTS) {
          if (signal.aborted) return;
          try {
            const timeoutCtrl = new AbortController();
            const timeoutId = window.setTimeout(() => timeoutCtrl.abort(), 90_000);
            const onAbort = () => timeoutCtrl.abort();
            signal.addEventListener("abort", onAbort, { once: true });
            try {
              await dashboardFetch(url, {
                cache: "no-store",
                signal: timeoutCtrl.signal,
              });
            } finally {
              window.clearTimeout(timeoutId);
              signal.removeEventListener("abort", onAbort);
            }
          } catch (err) {
            if (signal.aborted) return;
            console.warn("[IP Stock] background live sync skipped", url, err);
          }
          if (signal.aborted) return;
          await reloadIpStocks(signal);
        }
        if (!signal.aborted) {
          writeDashboardCache(DASHBOARD_CACHE_KEYS.stockSyncedAt, Date.now());
        }
      } catch (e) {
        if (!signal.aborted) console.warn("[IP Stock] Live stock sync error", e);
      } finally {
        if (liveSyncGenerationRef.current === generation) {
          setIsRefreshingStock(false);
        }
      }
    };

    let catalogOk = true;
    try {
      if (!silent) setIsLoading(true);
      catalogOk = await fetchFullCatalog();
    } catch (error) {
      catalogOk = false;
      if (!silent) toast.error("Failed to load plans");
      console.error(error);
    } finally {
      if (!silent) setIsLoading(false);
    }

    if (skipUpstreamSync && !manual) return catalogOk;

    const generation = ++liveSyncGenerationRef.current;
    liveSyncAbortRef.current?.abort();
    const ac = new AbortController();
    liveSyncAbortRef.current = ac;
    if (waitForLiveSync || manual) {
      await syncLiveStockSequentially(ac.signal, generation);
      if (!ac.signal.aborted) {
        try {
          await fetchFullCatalog(ac.signal);
        } catch (e) {
          console.warn("[IP Stock] catalog reload after sync failed", e);
        }
      }
    } else {
      void syncLiveStockSequentially(ac.signal, generation);
    }

    return catalogOk;
  }, []);

  const handleManualRefresh = useCallback(async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      const ok = await loadPlans({
        silent: true,
        waitForLiveSync: true,
        skipUpstreamSync: false,
        manual: true,
      });
      if (ok) {
        toast.success("Plans refreshed");
      } else {
        toast.error("Could not refresh all plans — try again");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not refresh plans");
    } finally {
      setIsManualRefreshing(false);
    }
  }, [isManualRefreshing, loadPlans]);

  // Paint cached plans immediately, then refresh in the background. Upstream
  // provider sync is heavy (multi-second), so it only runs when stock data is
  // actually stale rather than on every visit.
  useEffect(() => {
    const cachedStocks = readDashboardCache(DASHBOARD_CACHE_KEYS.ipStock) as IPStock[] | null;
    const cachedSlots = readDashboardCache(DASHBOARD_CACHE_KEYS.slotIps) as SlotIPPackage[] | null;
    const cachedTrials = readDashboardCache(DASHBOARD_CACHE_KEYS.trialVps) as TrialVpsPackage[] | null;
    const hasCache = Array.isArray(cachedStocks) && cachedStocks.length > 0;

    if (hasCache) {
      setIpStocks(cachedStocks);
      if (Array.isArray(cachedSlots)) setSlotPackages(cachedSlots);
      if (Array.isArray(cachedTrials)) setTrialPackages(cachedTrials);
      setIsLoading(false);
    }

    const syncAge = dashboardCacheAge(DASHBOARD_CACHE_KEYS.stockSyncedAt);
    loadPlans({
      silent: hasCache,
      skipUpstreamSync: syncAge < STOCK_SYNC_MIN_INTERVAL_MS,
    });

    return () => {
      liveSyncAbortRef.current?.abort();
    };
  }, [loadPlans]);

  const filteredIpStocks = useMemo(() => {
    let filtered = ipStocks.filter((stock) => !stock.hiddenFromStore);

    if (activeTab === 'Trial') {
      filtered = [];
    } else if (activeTab && activeTab !== 'all' && activeTab !== 'SlotIP') {
      filtered = filtered.filter((stock) => matchesCategoryTab(stock, activeTab));
    } else if (activeTab === 'SlotIP') {
      filtered = filtered.filter((stock) => isPremiumProxyPlan(stock));
    }

    if (searchTerm.trim()) {
      filtered = filtered.filter((stock) => stockMatchesSearch(stock, searchTerm));
    }

    if (priceFilter !== 'all') {
      filtered = filtered.filter((stock) => {
        const prices = Object.values(stock.memoryOptions)
          .filter((option) => option.price !== null)
          .map((option) => option.price!);

        if (prices.length === 0) return false;

        const minPrice = Math.min(...prices);

        switch (priceFilter) {
          case 'under-500':
            return minPrice < 500;
          case '500-1000':
            return minPrice >= 500 && minPrice <= 1000;
          case '1000-2000':
            return minPrice > 1000 && minPrice <= 2000;
          case 'above-2000':
            return minPrice > 2000;
          default:
            return true;
        }
      });
    }

    filtered.sort((a, b) => {
      const aInStock = isStockPurchasable(a) ? 0 : 1;
      const bInStock = isStockPurchasable(b) ? 0 : 1;
      if (aInStock !== bInStock) return aInStock - bInStock;

      switch (sortBy) {
        case 'price-low': {
          const aMinPrice = Math.min(...Object.values(a.memoryOptions).map((o) => o.price || Infinity));
          const bMinPrice = Math.min(...Object.values(b.memoryOptions).map((o) => o.price || Infinity));
          return aMinPrice - bMinPrice;
        }
        case 'price-high': {
          const aMaxPrice = Math.max(...Object.values(a.memoryOptions).map((o) => o.price || 0));
          const bMaxPrice = Math.max(...Object.values(b.memoryOptions).map((o) => o.price || 0));
          return bMaxPrice - aMaxPrice;
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [ipStocks, activeTab, searchTerm, priceFilter, sortBy]);

  const proxyIpStocks = useMemo(
    () => filteredIpStocks.filter((stock) => isPremiumProxyPlan(stock)),
    [filteredIpStocks]
  );

  const serverIpStocks = useMemo(
    () => filteredIpStocks.filter((stock) => !isPremiumProxyPlan(stock)),
    [filteredIpStocks]
  );

  const tagGroupedStocks = useMemo(
    () => groupStocksByTags(serverIpStocks),
    [serverIpStocks]
  );

  const visibleStocks = useMemo(
    () => ipStocks.filter((stock) => !stock.hiddenFromStore),
    [ipStocks]
  );

  const counts = useMemo(() => {
    const linux = visibleStocks.filter((stock) => matchesCategoryTab(stock, 'Linux')).length;
    const vps = visibleStocks.filter((stock) => matchesCategoryTab(stock, 'VPS')).length;
    const proxyPlans = visibleStocks.filter((stock) => isPremiumProxyPlan(stock)).length;
    const slot = slotPackages.length + proxyPlans;
    const trial = trialPackages.length;
    return {
      all: visibleStocks.length + slotPackages.length + trialPackages.length,
      linux,
      vps,
      slot,
      trial,
    };
  }, [visibleStocks, slotPackages, trialPackages]);

  const listedPlanCount = useMemo(() => {
    if (activeTab === 'Trial') return trialPackages.length;
    if (activeTab === 'SlotIP') return slotPackages.length + proxyIpStocks.length;
    if (activeTab === 'all') {
      return serverIpStocks.length + slotPackages.length + proxyIpStocks.length + trialPackages.length;
    }
    return serverIpStocks.length;
  }, [activeTab, serverIpStocks.length, proxyIpStocks.length, slotPackages.length, trialPackages.length]);

  // Group stocks by tags — computed in tagGroupedStocks useMemo above.

  useEffect(() => {
    if (!showDialog) return;
    fetchWalletSummary().then((w) => {
      if (w) setWalletBalance(w.balance);
    });
  }, [showDialog]);

  const openOutOfStockPopup = useCallback((opts: {
    message: string;
    productName?: string;
    memory?: string;
    refreshPlans?: boolean;
    slot?: boolean;
  }) => {
    setOutOfStockPopup({
      open: true,
      message: customerStockUnavailableMessage(opts.message, { kind: opts.slot ? 'slot' : 'plan' }),
      productName: opts.productName,
      memory: opts.memory,
    });
    if (opts.refreshPlans !== false) {
      loadPlans({ silent: true, skipUpstreamSync: true });
    }
  }, [loadPlans]);

  const verifyLiveStock = useCallback(async (payload: {
    ipStockId?: string;
    slotIpPackageId?: string;
    trialVpsPackageId?: string;
    memory?: string;
  }) => {
    const res = await dashboardFetch('/api/ipstock/verify-purchase', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, message: data.message as string | undefined, data };
  }, []);

  // Handle buy now with ipStockId (regular) or slotIpPackageId (slot)
  const handleBuyNow = useCallback(async (
    productName: string,
    memory: string,
    price: number,
    ipStockId: string,
    slotIpPackageId?: string,
    stockAvailable = true,
    netbayGroupTag?: string,
    trialVpsPackageId?: string
  ) => {
    const inventoryPackage = !!(slotIpPackageId || trialVpsPackageId);
    if (!stockAvailable) {
      openOutOfStockPopup({
        message: 'This plan is currently out of stock. Please choose another plan or check back later.',
        productName,
        memory,
        refreshPlans: false,
        slot: inventoryPackage,
      });
      return;
    }

    const verifyKey = trialVpsPackageId || slotIpPackageId || `${ipStockId}:${memory}:${netbayGroupTag || ''}`;
    setVerifyingPurchaseKey(verifyKey);
    try {
      const { ok, message } = await verifyLiveStock({
        ipStockId: inventoryPackage ? undefined : ipStockId,
        slotIpPackageId,
        trialVpsPackageId,
        memory,
      });

      if (!ok) {
        openOutOfStockPopup({
          message: message || 'This plan is no longer available. Stock may have sold out while you were browsing.',
          productName,
          memory,
          slot: inventoryPackage,
        });
        return;
      }

      setSelectedProduct({
        name: productName,
        memory,
        price,
        ipStockId,
        slotIpPackageId,
        trialVpsPackageId,
        netbayGroupTag,
      });
      setPurchaseDisclaimerAccepted(false);
      if (paymentConfig.loaded) {
        setPaymentMethod(paymentConfig.primaryGateway);
        setGatewayUserPicked(false);
      }
      setShowDialog(true);
      setPromoCode("");
      setPromoDiscount(0);
      setPromoMessage("");
      setPromoApplied(false);
    } catch {
      openOutOfStockPopup({
        message: 'This plan is currently out of stock. Please choose another plan or check back later.',
        productName,
        memory,
        slot: inventoryPackage,
      });
    } finally {
      setVerifyingPurchaseKey(null);
    }
  }, [openOutOfStockPopup, paymentConfig.loaded, paymentConfig.primaryGateway, verifyLiveStock]);

  const resolvePromoForCheckout = async (): Promise<{
    code: string | null;
    discount: number;
    applied: boolean;
    message?: string;
  }> => {
    if (!selectedProduct) {
      return { code: null, discount: 0, applied: false };
    }

    const code = promoCode.trim().toUpperCase();
    if (!code) {
      return { code: null, discount: 0, applied: false };
    }

    if (promoApplied && promoDiscount > 0) {
      return { code, discount: promoDiscount, applied: true, message: promoMessage };
    }

    const body: Record<string, any> = {
      promoCode: code,
      productPrice: selectedProduct.price,
    };

    if (selectedProduct.trialVpsPackageId) {
      body.trialVpsPackageId = selectedProduct.trialVpsPackageId;
    } else if (selectedProduct.slotIpPackageId) {
      body.slotIpPackageId = selectedProduct.slotIpPackageId;
    } else {
      body.ipStockId = selectedProduct.ipStockId;
    }

    const response = await dashboardFetch('/api/validate-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (data.valid) {
      setPromoCode(code);
      setPromoDiscount(data.discountAmount);
      setPromoMessage(data.message);
      setPromoApplied(true);
      return {
        code,
        discount: Number(data.discountAmount) || 0,
        applied: true,
        message: data.message,
      };
    }

    setPromoDiscount(0);
    setPromoMessage(data.message || 'Invalid promo code');
    setPromoApplied(false);
    return {
      code: null,
      discount: 0,
      applied: false,
      message: data.message || 'Invalid promo code',
    };
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim() || !selectedProduct) return;

    setPromoValidating(true);
    try {
      const result = await resolvePromoForCheckout();
      if (result.applied) {
        toast.success(result.message || 'Promo applied');
      } else {
        toast.error(result.message || 'Invalid promo code');
      }
    } catch (error) {
      toast.error('Failed to validate promo code');
      setPromoDiscount(0);
      setPromoMessage('Error validating promo code');
      setPromoApplied(false);
    } finally {
      setPromoValidating(false);
    }
  };

  // Remove promo code
  const removePromoCode = () => {
    setPromoCode("");
    setPromoDiscount(0);
    setPromoMessage("");
    setPromoApplied(false);
  };

  // Update the getDiscountedPrice function
  const getDiscountedPrice = () => {
    if (!selectedProduct || !promoApplied) return selectedProduct?.price || 0;
    return Math.max(0, selectedProduct.price - promoDiscount);
  };

  const paymentTotals = useMemo(() => {
    const total = selectedProduct
      ? (promoApplied ? Math.max(0, selectedProduct.price - promoDiscount) : selectedProduct.price)
      : 0;
    const walletApplied = useWallet ? Math.min(walletBalance, total) : 0;
    const gatewayCharge = Math.max(0, total - walletApplied);
    return { total, walletApplied, gatewayCharge };
  }, [selectedProduct, promoApplied, promoDiscount, walletBalance, useWallet]);


  const sanitizeForRazorpay = (str: string) => {
    // Remove or replace characters that Razorpay doesn't allow
    return str
      .replace(/[^\w\s\-\.]/g, '') // Keep only alphanumeric, spaces, hyphens, and dots
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim() // Remove leading/trailing spaces
      .substring(0, 255); // Limit length to 255 characters (Razorpay limit)
  };

  const cancelPendingPayment = async (clientTxnId: string) => {
    if (!clientTxnId) return;
    try {
      const res = await dashboardFetch('/api/payment/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTxnId, userInitiated: true }),
      });
      const result = await res.json();
      const summary = await fetchWalletSummary().catch(() => null);
      if (summary) setWalletBalance(summary.balance);

      if (result.success) {
        if (result.refunded > 0) {
          toast.info(`Payment cancelled. ₹${result.refunded.toLocaleString('en-IN')} returned to your wallet.`);
        } else if (result.alreadyProcessed) {
          toast.info('Payment cancelled. Wallet balance restored.');
        } else {
          toast.info('Payment cancelled.');
        }
      } else if (result.message) {
        toast.error(result.message);
      }
    } catch (err) {
      console.error('[Payment] Cancel/refund failed:', err);
      toast.error('Could not restore wallet — please refresh or contact support.');
    }
  };

  const handleProceedToPayment = async () => {
    if (!selectedProduct) return;
    if (!purchaseDisclaimerAccepted) {
      toast.error('Please read and accept the purchase notice before paying');
      return;
    }

    setPaymentInitiating(true);
    try {
      const inventoryPkg = !!(selectedProduct.slotIpPackageId || selectedProduct.trialVpsPackageId);
      const liveCheck = await verifyLiveStock({
        ipStockId: inventoryPkg ? undefined : selectedProduct.ipStockId,
        slotIpPackageId: selectedProduct.slotIpPackageId,
        trialVpsPackageId: selectedProduct.trialVpsPackageId,
        memory: selectedProduct.memory,
      });
      if (!liveCheck.ok) {
        setShowDialog(false);
        openOutOfStockPopup({
          message: liveCheck.message || 'This plan just went out of stock. Please refresh and pick another plan.',
          productName: selectedProduct.name,
          memory: selectedProduct.memory,
          slot: inventoryPkg,
        });
        setPaymentInitiating(false);
        return;
      }

      let checkoutPromo: Awaited<ReturnType<typeof resolvePromoForCheckout>> = {
        code: null,
        discount: 0,
        applied: false,
      };
      if (promoCode.trim()) {
        checkoutPromo = await resolvePromoForCheckout();
        if (!checkoutPromo.applied) {
          toast.error(checkoutPromo.message || 'Please apply a valid promo code or remove it');
          setPaymentInitiating(false);
          return;
        }
      }

      const finalPrice = Math.max(0, selectedProduct.price - checkoutPromo.discount);

      const paymentBody: Record<string, any> = {
        productName: selectedProduct.name,
        memory: selectedProduct.memory,
        price: finalPrice,
        originalPrice: selectedProduct.price,
        promoCode: checkoutPromo.applied ? checkoutPromo.code : null,
        promoDiscount: checkoutPromo.applied ? checkoutPromo.discount : 0,
        paymentMethod: paymentMethod === 'razorpay' ? 'razorpay' : 'upi',
        useWallet,
      };

      if (selectedProduct.trialVpsPackageId) {
        paymentBody.trialVpsPackageId = selectedProduct.trialVpsPackageId;
      } else if (selectedProduct.slotIpPackageId) {
        paymentBody.slotIpPackageId = selectedProduct.slotIpPackageId;
      } else {
        paymentBody.ipStockId = selectedProduct.ipStockId;
        if (selectedProduct.netbayGroupTag) {
          paymentBody.netbayGroupTag = selectedProduct.netbayGroupTag;
        }
      }

      const methodsToTry = getGatewayTryOrder(
        paymentMethod,
        paymentConfig.primaryGateway,
        paymentConfig.methodsToTry,
        gatewayUserPicked
      );
      let res: Response | null = null;
      let data: any = null;

      for (let i = 0; i < methodsToTry.length; i++) {
        const gw = methodsToTry[i];
        paymentBody.paymentMethod = gw;

        res = await dashboardFetch("/api/payment/create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paymentBody),
        });
        data = await res.json();

        if (res.ok) {
          if (data.fallbackUsed || i > 0) {
            toast.info(fallbackToastMessage(methodsToTry[0], (data.actualPaymentMethod || gw) as PaymentGateway));
          }
          break;
        }

        if (res.status === 409) break;

        if (i < methodsToTry.length - 1) {
          toast.info(fallbackToastMessage(gw, methodsToTry[i + 1]));
          continue;
        }
      }

      if (!res || !res.ok) {
        if (res?.status === 409) {
          setShowDialog(false);
          openOutOfStockPopup({
            message: data.message || 'This plan is no longer available.',
            productName: selectedProduct.name,
            memory: selectedProduct.memory,
            refreshPlans: false,
            slot: inventoryPkg,
          });
          loadPlans({ silent: true, skipUpstreamSync: true });
        } else {
          toast.error(data.message || "Failed to initiate payment");
        }
        setPaymentInitiating(false);
        fetchWalletSummary().then((w) => { if (w) setWalletBalance(w.balance); }).catch(() => {});
        return;
      }

      if (checkoutPromo.applied) {
        const serverTotal = Number(data.totalPrice);
        const expectedTotal = Math.max(1, Math.round(finalPrice));
        if (Number.isFinite(serverTotal) && Math.abs(serverTotal - expectedTotal) > 1) {
          toast.error('Promo could not be applied at checkout. Please try again.');
          setPaymentInitiating(false);
          return;
        }
        if (data.promoApplied === false || Number(data.promoDiscount) <= 0) {
          toast.error('Promo was not applied on the server. Please try again.');
          setPaymentInitiating(false);
          return;
        }
      }

      if (data.walletApplied > 0) {
        fetchWalletSummary().then((w) => { if (w) setWalletBalance(w.balance); }).catch(() => {});
      }

      // Store client transaction ID
      if (data.clientTxnId) {
        localStorage.setItem('lastClientTxnId', data.clientTxnId);
        console.log("Stored clientTxnId in localStorage:", data.clientTxnId);
      }

      console.log("Payment data received:", data);

      if (data.walletOnly) {
        toast.success('Order paid using wallet balance!');
        fetchWalletSummary().catch(() => {});
        setShowDialog(false);
        setPaymentInitiating(false);
        router.push(`/payment/callback?client_txn_id=${data.clientTxnId}&status=wallet_paid`);
        return;
      }

      setShowDialog(false);

      const actualMethod = data.actualPaymentMethod || (paymentMethod === 'razorpay' ? 'razorpay' : 'upi');
      
      console.log(`[Payment] Using method: ${actualMethod}`);
      
      try {
        if (actualMethod === 'upi') {
          await handleUPIPayment(data, finalPrice);
        } else {
          await handleRazorpayPayment(data);
        }
      } catch (primaryError) {
        console.error(`[Payment] ${actualMethod} failed:`, primaryError);
        
        const fallbackGw: PaymentGateway =
          paymentConfig.primaryGateway === 'upi' ? 'razorpay' : 'upi';

        if (actualMethod === fallbackGw) {
          throw primaryError;
        }

        toast.info(fallbackToastMessage(actualMethod as PaymentGateway, fallbackGw));
        
        try {
          const fallbackBody: Record<string, any> = {
              productName: selectedProduct.name,
              memory: selectedProduct.memory,
              price: finalPrice,
              originalPrice: selectedProduct.price,
              promoCode: checkoutPromo.applied ? checkoutPromo.code : null,
              promoDiscount: checkoutPromo.applied ? checkoutPromo.discount : 0,
              paymentMethod: fallbackGw,
              useWallet,
            };
            if (selectedProduct.trialVpsPackageId) {
              fallbackBody.trialVpsPackageId = selectedProduct.trialVpsPackageId;
            } else if (selectedProduct.slotIpPackageId) {
              fallbackBody.slotIpPackageId = selectedProduct.slotIpPackageId;
            } else {
              fallbackBody.ipStockId = selectedProduct.ipStockId;
            }

          const fallbackRes = await dashboardFetch("/api/payment/create", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackBody),
          });

          const fallbackData = await fallbackRes.json();

          if (fallbackRes.ok) {
            if (fallbackData.clientTxnId) {
              localStorage.setItem('lastClientTxnId', fallbackData.clientTxnId);
            }

            await handleRazorpayPayment(fallbackData);
          } else {
            throw new Error(fallbackData.message || "Fallback payment failed");
          }
        } catch (fallbackError) {
          console.error('[Payment] Razorpay fallback failed:', fallbackError);
          toast.error("Payment could not be started. Please try again later.");
          setPaymentInitiating(false);
        }
      }

    } catch (error) {
      console.error("Error initiating payment:", error);
      toast.error("Something went wrong. Please try again");
      setPaymentInitiating(false);
    }
  };

  const handleUPIPayment = async (data: any, payAmount?: number) => {
    const amount = payAmount ?? Number(data.totalPrice ?? data.price ?? selectedProduct?.price ?? 0);
    const launched = launchUpiInlineOrRedirect(data, {
      amount,
      flow: 'order',
      onInline: (session) => {
        setUpiQrSession(session);
        setPaymentInitiating(false);
      },
    });
    if (!launched) {
      throw new Error('UPI payment could not be started');
    }
    if (data.upi?.qrImageUrl) return;
  };

  const handleRazorpayPayment = async (data: any) => {
    if (!data.razorpay?.order_id) {
      throw new Error('Razorpay order ID missing');
    }

    const sanitizeForRazorpay = (text: string) => {
      if (!text) return '';
      return text.replace(/[^\w\s\-\.]/g, '').trim().substring(0, 255);
    };

    await openRazorpayModal({
      data: {
        ...data,
        customer: {
          ...data.customer,
          name: sanitizeForRazorpay(data.customer?.name),
        },
      },
      description: sanitizeForRazorpay(`${selectedProduct?.name} - ${selectedProduct?.memory}`),
      themeColor: '#3b82f6',
      onSuccess: async (response) => {
        toast.success("Payment successful! Processing order...");
        try {
          const confirmRes = await dashboardFetch("/api/payment/confirm", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientTxnId: data.clientTxnId,
              paymentMethod: 'razorpay',
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          if (confirmRes.ok) {
            toast.success("Order confirmed! Redirecting...");
            router.push(`/payment/callback?client_txn_id=${data.clientTxnId}&payment_id=${response.razorpay_payment_id}`);
          } else {
            toast.error("Payment confirmed but order processing failed. Please contact support.");
            router.push(`/payment/callback?client_txn_id=${data.clientTxnId}&status=processing_failed`);
          }
        } catch (error) {
          console.error('Error confirming payment:', error);
          toast.error("Payment successful but order confirmation failed. Please contact support.");
          router.push(`/payment/callback?client_txn_id=${data.clientTxnId}&status=confirmation_failed`);
        }
      },
      onDismiss: () => {
        setPaymentInitiating(false);
        cancelPendingPayment(data.clientTxnId);
      },
      onFailed: () => {
        setPaymentInitiating(false);
        toast.error('Payment failed. Please try again.');
      },
    });
  };

  const categoryCards = [
    { id: 'all', Icon: Grid3X3, label: 'All Plans', shortLabel: 'All', count: counts.all + counts.slot, activeClass: 'border-emerald-400/50 bg-emerald-500/15 shadow-[0_0_20px_rgba(52,211,153,0.12)]' },
    { id: 'Linux', Icon: Server, label: 'Linux Servers', shortLabel: 'Linux', count: counts.linux, activeClass: 'border-emerald-400/50 bg-emerald-500/15 shadow-[0_0_20px_rgba(52,211,153,0.12)]' },
    { id: 'VPS', Icon: Cloud, label: 'Windows VPS', shortLabel: 'Windows', count: counts.vps, activeClass: 'border-sky-400/50 bg-sky-500/15 shadow-[0_0_20px_rgba(56,189,248,0.12)]' },
    { id: 'SlotIP', Icon: Zap, label: 'Premium IP Proxies', shortLabel: 'Proxies', count: counts.slot, activeClass: 'border-orange-400/50 bg-orange-500/15 shadow-[0_0_20px_rgba(251,146,60,0.12)]' },
    { id: 'Trial', Icon: Clock, label: 'Trial VPS', shortLabel: 'Trial', count: counts.trial, activeClass: 'border-violet-400/50 bg-violet-500/15 shadow-[0_0_20px_rgba(167,139,250,0.12)]' },
  ];

  const iconActiveClass: Record<string, string> = {
    all: 'bg-emerald-500 text-emerald-950',
    Linux: 'bg-emerald-500 text-emerald-950',
    VPS: 'bg-sky-400 text-sky-950',
    SlotIP: 'bg-orange-400 text-orange-950',
    Trial: 'bg-violet-400 text-violet-950',
  };

  if (isReseller) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-white/10 bg-white/[0.03]">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
              <WalletIcon className="h-7 w-7 text-emerald-300" />
            </div>
            <CardTitle className="text-xl text-white">Panel purchasing is disabled</CardTitle>
            <CardDescription className="text-white/55 leading-relaxed">
              Purchases are disabled for reseller accounts in the panel. Please place orders
              via the Reseller API — your API rates apply automatically.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => router.push('/dashboard/reseller-api-docs')}>
              Reseller API Docs
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard/reseller-wallet')}>
              Reseller Console
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const showServerPlanList = activeTab !== 'SlotIP' && activeTab !== 'Trial';

  return (
    <div className="premium-dashboard-page w-full min-w-0 max-w-[100vw] overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Promo — compact, polished */}
      <div className="relative overflow-hidden border-b mt-6 md:mt-0 premium-promo-strip">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-emerald-500/5" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
        <div className="relative w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 min-w-0 box-border">
          <div className="flex items-center justify-center gap-2.5 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Badge variant="outline" className={cn(premiumBadge.success, "h-5 px-1.5 gap-1 font-medium shadow-sm")}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="ocean-soft-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                Live
              </Badge>
              <span className="text-white/45 hidden min-[380px]:inline">Limited offer</span>
              <span className="font-semibold text-white">Save on every plan</span>
              <Sparkles className="h-3.5 w-3.5 text-emerald-300 shrink-0 animate-pulse" />
            </div>
            <div className="h-3.5 w-px bg-white/15 hidden sm:block" />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText('OCEAN50');
                toast.success('Promo code OCEAN50 copied!');
              }}
              className="group flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 hover:border-emerald-300/50 transition-all duration-200 active:scale-[0.98]"
            >
              <Percent className="h-3 w-3 text-emerald-200 group-hover:text-emerald-100 shrink-0" />
              <code className="text-[11px] sm:text-xs font-semibold tracking-[0.12em] text-emerald-100">OCEAN50</code>
              <Copy className="h-3 w-3 text-emerald-300/70 group-hover:text-emerald-200 transition-colors shrink-0" />
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 min-w-0 box-border">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400 mb-4" />
            <p className="text-white/50">Loading server plans...</p>
          </div>
        ) : (
          <div>
            {/* Category tabs — scroll on phone, grid on large screens */}
            <div className="mb-3 sm:mb-4 -mx-1 px-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-1.5 sm:gap-2 w-max min-w-full lg:grid lg:grid-cols-5 lg:w-full">
              {categoryCards.map((cat) => {
                const isActive = activeTab === cat.id;
                const CatIcon = cat.Icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleTabChange(cat.id)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl border text-left transition-all duration-200 min-w-0",
                      "flex-[1_1_calc(50%-0.375rem)] min-[480px]:flex-[1_1_auto] min-[480px]:min-w-[7.25rem] lg:flex-none lg:min-w-0",
                      isActive
                        ? cn("text-white ring-1 ring-emerald-400/20", cat.activeClass)
                        : "border-white/12 bg-white/[0.03] text-white/55 hover:border-white/20 hover:bg-white/[0.06] hover:text-white/90"
                    )}
                  >
                    <span className={cn(
                      "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200",
                      isActive ? iconActiveClass[cat.id] : "bg-white/10 text-emerald-300 border border-white/10"
                    )}>
                      <CatIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </span>
                    <span className="font-medium text-xs sm:text-sm truncate flex-1 min-w-0">
                      <span className="sm:hidden">{cat.shortLabel}</span>
                      <span className="hidden sm:inline">{cat.label}</span>
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] h-4 min-w-[1.25rem] px-1 justify-center shrink-0 tabular-nums border-0",
                        isActive
                          ? "bg-emerald-500/25 text-emerald-100 font-semibold"
                          : "bg-white/10 text-white/60"
                      )}
                    >
                      {cat.count}
                    </Badge>
                  </button>
                );
              })}
              </div>
            </div>

            {/* Search & filters — compact toolbar */}
            <div className="premium-dashboard-card rounded-xl p-2 sm:p-2.5 mb-4 sm:mb-5">
              <div className="flex flex-col sm:flex-row gap-2">
                <DashboardSearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search servers..."
                />
                <div className="flex gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap sm:items-center">
                  <Select value={priceFilter} onValueChange={setPriceFilter}>
                    <SelectTrigger className="premium-dashboard-select flex-1 sm:flex-none sm:w-[7.5rem]">
                      <SelectValue placeholder="Price" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Prices</SelectItem>
                      <SelectItem value="under-500">&lt; ₹500</SelectItem>
                      <SelectItem value="500-1000">₹500-1K</SelectItem>
                      <SelectItem value="1000-2000">₹1K-2K</SelectItem>
                      <SelectItem value="above-2000">&gt; ₹2K</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="premium-dashboard-select flex-1 sm:flex-none sm:w-[6.5rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="price-low">Low Price</SelectItem>
                      <SelectItem value="price-high">High Price</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 border-white/15 bg-white/[0.04] text-white/70 hover:text-white hover:bg-white/[0.08]"
                    disabled={isManualRefreshing}
                    onClick={() => void handleManualRefresh()}
                    title="Refresh plans and live stock"
                  >
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5",
                        (isManualRefreshing || isRefreshingStock) && "animate-spin"
                      )}
                    />
                    <span className="sr-only">Refresh stock</span>
                  </Button>
                  {(searchTerm || priceFilter !== 'all' || sortBy !== 'name') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearchTerm(""); setPriceFilter("all"); setSortBy("name"); }}
                      className="h-9 px-2.5 text-xs text-white/50 hover:text-white hover:bg-white/[0.06]"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    asChild
                    size="sm"
                    className="premium-btn-primary h-9 gap-1.5 px-3 border-0 shadow-none sm:ml-auto"
                  >
                    <Link href="/dashboard/cart">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">Cart</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-xs text-white/45 mb-3 px-0.5">
              Showing {listedPlanCount} plan{listedPlanCount === 1 ? '' : 's'}
              {activeTab === 'Linux' ? ' · Linux category' : activeTab === 'VPS' ? ' · Windows VPS' : activeTab === 'SlotIP' ? ' · Premium proxies' : activeTab === 'Trial' ? ' · Trial VPS' : ''}
              {(searchTerm || priceFilter !== 'all') ? ' (filtered)' : ''}
              {(isManualRefreshing || isRefreshingStock) && !isLoading ? ' · refreshing…' : ''}
            </p>

            {/* Plan listings */}
            <div>
              {/* Slot IP Section */}
              {(activeTab === 'all' || activeTab === 'SlotIP') && (slotPackages.length > 0 || proxyIpStocks.length > 0) && (
                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-6 bg-orange-500 rounded-full"></div>
                    <h2 className="text-base font-semibold text-white">Premium IP Proxies</h2>
                    <Badge variant="outline" className="text-[10px] border-orange-400/40 bg-orange-500/15 text-orange-200 h-5 px-2">
                      {slotPackages.length + proxyIpStocks.length} {(slotPackages.length + proxyIpStocks.length) === 1 ? 'package' : 'packages'}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {slotPackages
                      .filter(pkg => {
                        if (!searchTerm.trim()) return true;
                        return pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               pkg.description?.toLowerCase().includes(searchTerm.toLowerCase());
                      })
                      .map((pkg) => (
                      <div key={pkg._id} className="premium-dashboard-card rounded-lg hover:border-emerald-400/20 transition-colors overflow-hidden">
                        <div className="p-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-400/35 flex-shrink-0">
                              <Zap className="h-4 w-4 text-orange-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm md:text-base text-white break-words">{pkg.name}</h3>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <Badge variant="outline" className="text-[10px] border-orange-400/35 bg-orange-500/15 text-orange-200 px-1.5 py-0 h-5">
                                  Premium IP
                                </Badge>
                                {pkg.resellerPriced && (
                                  <Badge variant="outline" className="text-[10px] border-emerald-400/35 bg-emerald-500/15 text-emerald-200 px-1.5 py-0 h-5">
                                    Your rate
                                  </Badge>
                                )}
                                {pkg.promoCodes && pkg.promoCodes.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/15 text-amber-200 border-amber-400/35 px-1.5 py-0 h-5">
                                    <Tag className="h-2.5 w-2.5" />
                                    Promo
                                  </Badge>
                                )}
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 bg-white/10 text-white/70 border-0">
                                  <Package className="h-3 w-3" />
                                  {pkg.availableCount} available
                                </Badge>
                              </div>
                              {pkg.description && (
                                <p className="text-xs text-white/45 mt-1 break-words">{pkg.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2.5 sm:border-0 sm:pt-0 sm:justify-end sm:flex-shrink-0">
                            <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-end sm:gap-0">
                              {pkg.resellerPriced && Number(pkg.listPrice) > Number(pkg.price) && (
                                <p className="text-[10px] text-white/40 line-through order-2 sm:order-none">₹{pkg.listPrice}</p>
                              )}
                              <p className="font-bold text-base md:text-lg text-white order-1 sm:order-none">₹{pkg.price}</p>
                              <p className="text-[10px] text-white/45 order-3 sm:order-none">per IP</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {pkg.availableCount > 0 && (
                                <AddToCartButton
                                  kind="slotip"
                                  slotIpPackageId={pkg._id}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2.5"
                                  label="Cart"
                                />
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleBuyNow(pkg.name, 'Premium IP Proxies', pkg.price, '', pkg._id)}
                                className="h-8 px-3 gap-1.5 premium-btn-primary border-0"
                                disabled={pkg.availableCount === 0 || verifyingPurchaseKey === pkg._id}
                              >
                                {verifyingPurchaseKey === pkg._id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3" />
                                )}
                                {verifyingPurchaseKey === pkg._id ? 'Checking…' : 'Buy Now'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {proxyIpStocks.map((stock) => (
                      <CompactServerPlanRow
                        key={stock._id}
                        stock={stock}
                        categoryTab={activeTab}
                        onBuyNow={handleBuyNow}
                        verifyingPurchaseKey={verifyingPurchaseKey}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'SlotIP' && slotPackages.length === 0 && proxyIpStocks.length === 0 && (
                <Card className="text-center py-12 premium-dashboard-card border-0">
                  <CardContent>
                    <div className="w-16 h-16 bg-orange-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-orange-400/25">
                      <Zap className="h-8 w-8 text-orange-300" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-white">No Premium IP Proxies Available</h3>
                    <p className="text-sm text-white/45 max-w-md mx-auto">
                      Premium IP proxy packages are currently unavailable. Check back soon!
                    </p>
                  </CardContent>
                </Card>
              )}

              {(activeTab === 'all' || activeTab === 'Trial') && trialPackages.length > 0 && (
                <div className="space-y-2 mb-6 min-w-0">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-6 bg-violet-500 rounded-full shrink-0" />
                    <div
                      className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-400/35 flex items-center justify-center shrink-0"
                      aria-hidden
                    >
                      <span className="text-base leading-none">⏱️</span>
                    </div>
                    <h2 className="text-base font-semibold text-white">Trial VPS</h2>
                    <Badge variant="outline" className="text-[10px] border-violet-400/40 bg-violet-500/15 text-violet-200 h-5 px-2">
                      {trialPackages.length} {trialPackages.length === 1 ? 'package' : 'packages'}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {trialPackages
                      .filter((pkg) => {
                        if (!searchTerm.trim()) return true;
                        return (
                          pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          pkg.description?.toLowerCase().includes(searchTerm.toLowerCase())
                        );
                      })
                      .map((pkg) => (
                        <TrialVpsPlanRow
                          key={pkg._id}
                          pkg={pkg}
                          onBuyNow={handleBuyNow}
                          verifyingPurchaseKey={verifyingPurchaseKey}
                        />
                      ))}
                  </div>
                </div>
              )}

              {activeTab === 'Trial' && trialPackages.length === 0 && (
                <Card className="text-center py-12 premium-dashboard-card border-0">
                  <CardContent>
                    <div className="w-16 h-16 bg-violet-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-violet-400/25 text-3xl">
                      ⏱️
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-white">No Trial VPS Available</h3>
                    <p className="text-sm text-white/45 max-w-md mx-auto">
                      Trial packages are currently unavailable. Check back soon!
                    </p>
                  </CardContent>
                </Card>
              )}

              {showServerPlanList &&
                (serverIpStocks.length === 0 &&
                !(activeTab === 'all' && (slotPackages.length > 0 || proxyIpStocks.length > 0 || trialPackages.length > 0)) ? (
                  <Card className="text-center py-12 premium-dashboard-card border-0">
                    <CardContent>
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                        <AlertCircle className="h-8 w-8 text-white/40" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2 text-white">No Plans Available</h3>
                      <p className="text-sm text-white/45 max-w-md mx-auto px-2">
                        {searchTerm
                          ? `No servers match your search "${searchTerm}".`
                          : activeTab === 'all'
                          ? 'No server plans are currently available.'
                          : `No ${activeTab} plans are currently available.`}
                      </p>
                      {(searchTerm || priceFilter !== 'all') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSearchTerm(""); setPriceFilter("all"); setSortBy("name"); }}
                          className="mt-4"
                        >
                          Clear Filters
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  (() => {
                    const { grouped, untagged } = tagGroupedStocks;
                    const tagKeys = Object.keys(grouped).sort();

                    return (
                      <div className="space-y-6 min-w-0">
                        {tagKeys.map(tag => (
                          <div key={tag} className="space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 px-1 min-w-0">
                              <div className="w-1 h-6 bg-emerald-400 rounded-full shrink-0"></div>
                              <h2 className="text-sm sm:text-base font-semibold capitalize text-white min-w-0">{formatTagGroupTitle(tag)} Plans</h2>
                              <Badge variant="outline" className="text-[10px] border-white/15 bg-white/5 text-white/70 h-5 px-2 shrink-0">
                                {grouped[tag].length}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              {grouped[tag].map((stock) => (
                                <CompactServerPlanRow
                                  key={stock._id}
                                  stock={stock}
                                  categoryTab={activeTab}
                                  onBuyNow={handleBuyNow}
                                  verifyingPurchaseKey={verifyingPurchaseKey}
                                />
                              ))}
                            </div>
                          </div>
                        ))}

                        {untagged.length > 0 && (
                          <div className="space-y-2 min-w-0">
                            {tagKeys.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2 px-1">
                                <div className="w-1 h-6 bg-white/25 rounded-full shrink-0"></div>
                                <h2 className="text-sm sm:text-base font-semibold text-white">Other Plans</h2>
                                <Badge variant="outline" className="text-[10px] border-white/15 bg-white/5 text-white/70 h-5 px-2">
                                  {untagged.length}
                                </Badge>
                              </div>
                            )}
                            <div className="space-y-2">
                              {untagged.map((stock) => (
                                <CompactServerPlanRow
                                  key={stock._id}
                                  stock={stock}
                                  categoryTab={activeTab}
                                  onBuyNow={handleBuyNow}
                                  verifyingPurchaseKey={verifyingPurchaseKey}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Keep the existing Purchase Dialog unchanged */}
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setPurchaseDisclaimerAccepted(false);
        }}
      >
        <DialogContent className="premium-dashboard-dialog premium-dashboard-dialog--purchase max-w-md w-[calc(100vw-1.5rem)] sm:w-full overflow-hidden p-0 gap-0">
          <DialogHeader className="premium-dashboard-dialog-header !py-3 sm:!py-4 space-y-0.5">
            <DialogTitle className="flex items-center gap-2 premium-dashboard-title text-base sm:text-lg">
              <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400 shrink-0" />
              Complete Your Purchase
            </DialogTitle>
            {selectedProduct && (
              <p className="text-sm font-semibold premium-price-accent pt-0.5">
                Total: ₹{getDiscountedPrice().toFixed(2)}
              </p>
            )}
          </DialogHeader>

          <div className="premium-dashboard-dialog-body premium-dashboard-dialog-body--compact space-y-3 !py-3 sm:!py-4">
            {selectedProduct && (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 space-y-1.5">
                <p className="text-xs sm:text-sm font-medium leading-snug line-clamp-2">{selectedProduct.name}</p>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {isOceanSmartVpsProductName(selectedProduct.name)
                      ? formatOceanMemoryDisplay(selectedProduct.memory)
                      : selectedProduct.memory}
                    {isOceanSmartVpsProductName(selectedProduct.name) && (
                      <OceanPlanTypeBadge memory={selectedProduct.memory} />
                    )}
                  </span>
                  <span className={cn(promoApplied && 'line-through')}>₹{selectedProduct.price}</span>
                </div>
                {promoApplied && (
                  <div className="flex justify-between text-xs text-primary">
                    <span>Discount</span>
                    <span>−₹{promoDiscount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!promoApplied && promoCode.trim()) validatePromoCode();
                  }
                }}
                disabled={promoApplied}
                className="h-9 flex-1 premium-dashboard-input text-sm"
              />
              {!promoApplied ? (
                <Button
                  variant="ghost"
                  onClick={validatePromoCode}
                  disabled={!promoCode.trim() || promoValidating}
                  className="premium-btn-apply h-9 px-3 shrink-0 text-sm"
                >
                  {promoValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              ) : (
                <Button onClick={removePromoCode} variant="outline" className="h-9 px-3 shrink-0 text-sm">
                  Remove
                </Button>
              )}
            </div>
            {promoMessage && (
              <p className={cn('text-[11px] -mt-1', promoApplied ? 'text-primary' : 'text-destructive')}>
                {promoMessage}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <WalletIcon className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-none">Wallet</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    ₹{walletBalance.toLocaleString('en-IN')} available
                  </p>
                </div>
              </div>
              <Switch
                checked={useWallet}
                onCheckedChange={setUseWallet}
                disabled={walletBalance <= 0 || paymentInitiating}
              />
            </div>

            {paymentTotals.gatewayCharge > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Pay via</p>
                <div className="flex flex-wrap gap-1.5">
                  {sortGatewaysByPrimary(paymentConfig.primaryGateway).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(method);
                        setGatewayUserPicked(method !== paymentConfig.primaryGateway);
                      }}
                      className={cn(
                        'premium-payment-pill capitalize text-[11px] px-2.5 py-1',
                        paymentMethod === method ? 'premium-payment-pill--active' : 'premium-payment-pill--inactive'
                      )}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                {useWallet && paymentTotals.walletApplied > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    ₹{paymentTotals.walletApplied.toLocaleString('en-IN')} from wallet · ₹
                    {paymentTotals.gatewayCharge.toLocaleString('en-IN')} on gateway
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="premium-dashboard-dialog-footer premium-dashboard-dialog-footer--purchase !flex-col !items-stretch gap-2 !py-3 sm:!py-3">
            <PurchaseDisclaimerNotice
              compact
              checked={purchaseDisclaimerAccepted}
              onCheckedChange={setPurchaseDisclaimerAccepted}
            />
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={paymentInitiating}
              className="w-full sm:w-auto premium-btn-outline order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleProceedToPayment}
              disabled={paymentInitiating || !purchaseDisclaimerAccepted}
              className="w-full sm:w-auto sm:flex-none premium-btn-pay order-1 sm:order-2"
            >
              {paymentInitiating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : paymentTotals.gatewayCharge === 0 ? (
                <span className="flex items-center gap-2">
                  <WalletIcon className="h-4 w-4" />
                  Pay with Wallet (₹{paymentTotals.total.toLocaleString('en-IN')})
                </span>
              ) : (
                <span className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 text-center sm:text-left">
                  <span className="inline-flex items-center gap-2">
                    <CreditCard className="h-4 w-4 shrink-0" />
                    Pay ₹{paymentTotals.gatewayCharge.toLocaleString('en-IN')}
                  </span>
                  {paymentTotals.walletApplied > 0 && (
                    <span className="text-[11px] sm:text-xs opacity-80">
                      (+ ₹{paymentTotals.walletApplied.toLocaleString('en-IN')} wallet)
                    </span>
                  )}
                </span>
              )}
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={outOfStockPopup.open}
        onOpenChange={(open) => setOutOfStockPopup((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent className="premium-dashboard-alert max-w-md w-[calc(100vw-1.5rem)]">
          <AlertDialogHeader className="premium-dashboard-dialog-header !border-0 pb-0">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 border border-red-400/25">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <AlertDialogTitle className="text-center text-foreground">Out of Stock</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-center text-sm text-muted-foreground px-2 pb-2">
                {outOfStockPopup.productName && (
                  <p className="font-medium text-foreground">
                    {outOfStockPopup.productName}
                    {outOfStockPopup.memory ? ` · ${outOfStockPopup.memory}` : ''}
                  </p>
                )}
                <p>{outOfStockPopup.message}</p>
                <p className="text-xs text-muted-foreground">
                  Stock is checked live when you buy. The plan list has been refreshed with the latest availability.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="premium-dashboard-dialog-footer sm:justify-center">
            <AlertDialogAction className="min-w-[120px] w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-emerald-950">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpiQrPaymentDialog
        session={upiQrSession}
        open={!!upiQrSession}
        onOpenChange={(open) => {
          if (!open) setUpiQrSession(null);
        }}
        title="Pay via UPI"
        onSuccess={(payload) => {
          const clientTxnId = upiQrSession?.clientTxnId;
          setUpiQrSession(null);
          toast.success('Payment successful! Processing order…');
          if (clientTxnId) {
            const orderId = (payload.order as { id?: string })?.id;
            router.push(
              orderId
                ? `/payment/callback?client_txn_id=${clientTxnId}&order_id=${orderId}`
                : `/payment/callback?client_txn_id=${clientTxnId}`
            );
          }
        }}
        onCancel={() => setPaymentInitiating(false)}
      />
    </div>
  );
}

/** Trial-only row icon — not Linux/Windows/Proxy server icons (type is on the badge). */
function TrialVpsProductIcon({ inStock }: { inStock: boolean }) {
  if (!inStock) {
    return <XCircle className="h-4 w-4 text-red-400" aria-hidden />;
  }
  return (
    <span
      className="text-[1.15rem] leading-none select-none"
      role="img"
      aria-label="Trial VPS"
      title="Trial VPS"
    >
      ⏱️
    </span>
  );
}

function trialPlanCategoryBadgeClass(planCategory?: string) {
  const cat = String(planCategory || 'linux').toLowerCase();
  if (cat === 'windows') return 'border-sky-400/35 bg-sky-500/15 text-sky-200';
  if (cat === 'premium_proxy') return 'border-orange-400/35 bg-orange-500/15 text-orange-200';
  return 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200';
}

const TrialVpsPlanRow = memo(function TrialVpsPlanRow({
  pkg,
  onBuyNow,
  verifyingPurchaseKey,
}: {
  pkg: TrialVpsPackage;
  onBuyNow: (
    productName: string,
    memory: string,
    price: number,
    ipStockId: string,
    slotIpPackageId?: string,
    stockAvailable?: boolean,
    netbayGroupTag?: string,
    trialVpsPackageId?: string
  ) => void | Promise<void>;
  verifyingPurchaseKey?: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inStock = pkg.availableCount > 0;
  const usesMemory = trialVpsPlanUsesMemoryTier(pkg.planCategory);
  const memoryLabel = formatTrialVpsMemoryGb(pkg.memoryGb ?? 4, pkg.planCategory);
  const categoryLabel = trialVpsPlanCategoryLabel(pkg.planCategory);
  const checkoutMemory = resolveTrialVpsOrderMemory(pkg);
  const hasPromoCodes = (pkg.promoCodes?.length ?? 0) > 0;
  const verifyKey = pkg._id;

  return (
    <div
      className={cn(
        'premium-dashboard-card rounded-lg transition-all overflow-hidden border-l-4',
        inStock
          ? 'border-l-violet-400 hover:border-violet-400/40'
          : 'border-l-red-500 opacity-75'
      )}
    >
      <div
        className={cn(
          'p-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3',
          inStock ? 'cursor-pointer' : 'cursor-default'
        )}
        onClick={() => inStock && setIsExpanded((v) => !v)}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1 sm:gap-3">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0',
              inStock
                ? 'bg-violet-500/25 border-violet-400/45'
                : 'bg-red-500/15 border-red-400/35'
            )}
          >
            <TrialVpsProductIcon inStock={inStock} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h3
                className={cn(
                  'font-semibold text-sm md:text-base min-w-0 flex-1 break-words sm:truncate',
                  inStock ? 'text-white' : 'text-white/45 line-through decoration-white/25'
                )}
              >
                {pkg.name}
              </h3>
              <ChevronDown
                className={cn(
                  'h-4 w-4 mt-0.5 shrink-0 text-white/40 transition-transform sm:hidden',
                  isExpanded && 'rotate-180'
                )}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <Badge
                variant="outline"
                className="text-[10px] border-violet-400/35 bg-violet-500/15 text-violet-200 px-1.5 py-0 h-5"
              >
                Trial VPS
              </Badge>
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0 h-5', trialPlanCategoryBadgeClass(pkg.planCategory))}
              >
                {categoryLabel}
              </Badge>
              {pkg.resellerPriced && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-emerald-400/35 bg-emerald-500/15 text-emerald-200 px-1.5 py-0 h-5"
                >
                  Your rate
                </Badge>
              )}
              {inStock ? (
                <Badge
                  variant="outline"
                  className={cn(premiumBadge.success, 'text-[10px] gap-1 px-2 py-0 h-5 font-semibold')}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {pkg.availableCount} available
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 px-2 py-0 h-5 font-semibold bg-red-500/20 text-red-300 border-red-400/40"
                >
                  <XCircle className="h-3 w-3" />
                  Out of stock
                </Badge>
              )}
              {inStock && hasPromoCodes && (
                <Badge variant="outline" className={cn(premiumBadge.warning, 'text-[10px] gap-1 px-1.5 py-0 h-5')}>
                  <Tag className="h-2.5 w-2.5" />
                  Promo
                </Badge>
              )}
            </div>
            <p className="text-xs text-white/45 mt-1">
              {!inStock
                ? 'Currently unavailable — check back later'
                : usesMemory
                  ? `${pkg.trialDays}-day trial · ${memoryLabel} · one-time · no renewal`
                  : `${pkg.trialDays}-day trial · HTTP proxy · one-time · no renewal`}
            </p>
            {pkg.description ? (
              <p className="text-xs text-white/40 mt-1 break-words line-clamp-2">{pkg.description}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5 sm:border-0 sm:pt-0 sm:gap-3 sm:justify-end sm:flex-shrink-0 min-w-0">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shrink-0',
              inStock
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                : 'bg-red-500/20 text-red-300 border border-red-400/35'
            )}
          >
            {inStock ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                In stock
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Sold out
              </>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0 flex-1 sm:flex-col sm:items-end sm:flex-none sm:gap-0">
            <p className="text-xs text-white/45 shrink-0">{pkg.resellerPriced ? 'Your rate' : 'Price'}</p>
            <p
              className={cn(
                'font-bold text-base md:text-lg truncate',
                inStock && pkg.price > 0 ? 'text-emerald-300' : 'text-white/35'
              )}
            >
              {pkg.price > 0 ? `₹${pkg.price}` : '—'}
            </p>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-white/40 transition-transform hidden sm:block',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
      </div>

      {isExpanded && inStock && (
        <div className="border-t border-white/10 bg-white/[0.02]">
          <div className="p-3 space-y-2">
            <p className="text-xs font-medium text-white/45 uppercase tracking-wide mb-3">
              Select Configuration
            </p>
            <div
              className={cn(
                'flex flex-col gap-2 p-2.5 rounded-md border transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3',
                'bg-white/[0.04] border-white/10 hover:border-violet-400/35'
              )}
            >
              <div className="flex items-center justify-between gap-2 min-w-0 sm:flex-1">
                <span className="text-sm font-medium font-mono tracking-wide truncate text-white/90">
                  {usesMemory ? `${memoryLabel} · ${categoryLabel}` : categoryLabel}
                </span>
                <span className="font-bold text-base shrink-0 sm:hidden text-emerald-300">₹{pkg.price}</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                <span className="hidden sm:inline font-bold text-base text-emerald-300">₹{pkg.price}</span>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onBuyNow(
                      pkg.name,
                      checkoutMemory,
                      pkg.price,
                      '',
                      undefined,
                      true,
                      undefined,
                      pkg._id
                    );
                  }}
                  disabled={verifyingPurchaseKey === verifyKey}
                  className="h-8 flex-1 sm:flex-none px-3 gap-1.5 premium-btn-primary border-0"
                >
                  {verifyingPurchaseKey === verifyKey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {verifyingPurchaseKey === verifyKey ? 'Checking…' : 'Buy Now'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Modern Compact List Row Component
const CompactServerPlanRow = memo(function CompactServerPlanRow({
  stock,
  categoryTab = 'all',
  onBuyNow,
  verifyingPurchaseKey,
}: {
  stock: IPStock;
  categoryTab?: string;
  onBuyNow: (name: string, memory: string, price: number, id: string, slotIpPackageId?: string, stockAvailable?: boolean, netbayGroupTag?: string) => void | Promise<void>;
  verifyingPurchaseKey?: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inStock = isStockPurchasable(stock);
  const unitsLeft = getStockUnitsRemaining(stock);
  const manualUnits = usesCompanyManualUnits(stock);
  const showUnits = manualUnits && Number.isFinite(unitsLeft) && unitsLeft < Number.POSITIVE_INFINITY;
  const isNetbay = isNetbayLiveStock(stock);
  const isReseller = isResellerLiveStock(stock);
  const isOceanSmartVps = isOceanSmartVpsPlan(stock);

  const memoryOptions = sortMemoryOptionEntries(
    Object.entries(stock.memoryOptions || {}).filter(([memory]) => {
      if (!memory || String(memory).startsWith('$')) return false;
      if (!memoryMatchesCategoryTab(memory, categoryTab, stock)) return false;
      const allowed = stock.defaultConfigurations?.smartvps?.allowedRams;
      if (Array.isArray(allowed) && allowed.length > 0) {
        const gb = String(memory).match(/(\d+)/)?.[1];
        return gb ? allowed.includes(Number(gb)) : true;
      }
      return true;
    })
  );

  const pricedMemoryOptions = memoryOptions.filter(
    ([, details]) => details.price != null && Number(details.price) > 0
  );

  if (
    categoryTab !== 'all' &&
    categoryTab !== 'SlotIP' &&
    isOceanSmartVps &&
    pricedMemoryOptions.length === 0
  ) {
    return null;
  }

  const netbayGroupTags = listNetbayGroupTags(stock);
  const isProxyProduct = isNetbayProxyStock(stock);
  const proxyBillingKey = isProxyProduct ? pickPricedMemoryKey(stock.memoryOptions) : '';
  const proxyPriceEntry =
    pricedMemoryOptions.find(([memory]) => memory === proxyBillingKey) || pricedMemoryOptions[0];
  const configRows = isProxyProduct
    ? (netbayGroupTags.length ? netbayGroupTags : ['HTTP Proxy']).map((tag) => ({
        key: tag,
        memory: proxyPriceEntry?.[0] || proxyBillingKey || '4GB',
        details: proxyPriceEntry?.[1] || { price: 0 },
        tag: netbayGroupTags.includes(tag) ? tag : (netbayGroupTags[0] || ''),
        label: tag,
      }))
    : netbayGroupTags.length > 1
      ? pricedMemoryOptions.flatMap(([memory, details]) =>
          netbayGroupTags.map((tag) => ({
            key: `${memory}:${tag}`,
            memory,
            details,
            tag,
            label: pricedMemoryOptions.length > 1 ? `${tag} · ${memory}` : tag,
          }))
        )
      : pricedMemoryOptions.map(([memory, details]) => ({
          key: memory,
          memory,
          details,
          tag: netbayGroupTags[0] || '',
          label: memory,
        }));
  const hasPromoCodes = (stock.promoCodeCount ?? 0) > 0;
  const startingPrice = pricedMemoryOptions.length
    ? Math.min(...pricedMemoryOptions.map(([, details]) => details.price || 0))
    : 0;

  return (
    <div className={cn(
      "premium-dashboard-card rounded-lg transition-all overflow-hidden border-l-4",
      inStock
        ? "border-l-emerald-400 hover:border-emerald-400/40"
        : "border-l-red-500 opacity-75"
    )}>
      {/* Main Row - Always Visible */}
      <div 
        className={cn(
          "p-3 flex flex-col gap-2.5 cursor-pointer sm:flex-row sm:items-center sm:gap-3",
          !inStock && "cursor-default"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1 sm:gap-3">
          {/* Icon */}
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0",
            inStock
              ? "bg-emerald-500/25 border-emerald-400/45"
              : "bg-red-500/15 border-red-400/35"
          )}>
            {!inStock ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : stock.serverType === 'VPS' ? (
              <Cloud className="h-4 w-4 text-sky-300" />
            ) : stock.serverType === 'Proxy' || isProxyProduct ? (
              <Zap className="h-4 w-4 text-orange-300" />
            ) : (
              <Server className="h-4 w-4 text-emerald-300" />
            )}
          </div>

          {/* Name & Type */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h3 className={cn(
                "font-semibold text-sm md:text-base min-w-0 flex-1 break-words sm:truncate",
                inStock ? "text-white" : "text-white/45 line-through decoration-white/25"
              )}>
                {stock.name}
              </h3>
              <ChevronDown
                className={cn(
                  "h-4 w-4 mt-0.5 shrink-0 text-white/40 transition-transform sm:hidden",
                  isExpanded && "rotate-180"
                )}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <Badge variant="outline" className={cn(premiumBadge.neutral, "text-[10px] px-1.5 py-0 h-5")}>
                {stock.serverType}
              </Badge>
              {stock.resellerPriced && (
                <Badge variant="outline" className="text-[10px] border-emerald-400/35 bg-emerald-500/15 text-emerald-200 px-1.5 py-0 h-5">
                  Your rate
                </Badge>
              )}
              {inStock ? (
                <Badge variant="outline" className={cn(premiumBadge.success, "text-[10px] gap-1 px-2 py-0 h-5 font-semibold")}>
                  <CheckCircle2 className="h-3 w-3" />
                  {showUnits ? `${unitsLeft} in stock` : isNetbay || isReseller ? 'In stock' : 'Available'}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0 h-5 font-semibold bg-red-500/20 text-red-300 border-red-400/40">
                  <XCircle className="h-3 w-3" />
                  Out of stock
                </Badge>
              )}
              {inStock && hasPromoCodes && (
                <Badge variant="outline" className={cn(premiumBadge.warning, "text-[10px] gap-1 px-1.5 py-0 h-5")}>
                  <Tag className="h-2.5 w-2.5" />
                  Promo
                </Badge>
              )}
            </div>
            <p className="text-xs text-white/45 mt-1">
              {!inStock
                ? 'Currently unavailable — check back later'
                : showUnits
                ? `${unitsLeft} unit${unitsLeft === 1 ? '' : 's'} left · ${pricedMemoryOptions.length} configuration${pricedMemoryOptions.length !== 1 ? 's' : ''}`
                : `${configRows.length} configuration${configRows.length !== 1 ? 's' : ''} available`}
            </p>
          </div>
        </div>

        {/* Status + Price */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5 sm:border-0 sm:pt-0 sm:gap-3 sm:justify-end sm:flex-shrink-0 min-w-0">
          <div className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shrink-0",
            inStock
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
              : "bg-red-500/20 text-red-300 border border-red-400/35"
          )}>
            {inStock ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                In stock
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Sold out
              </>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0 flex-1 sm:flex-col sm:items-end sm:flex-none sm:gap-0">
            <p className="text-xs text-white/45 shrink-0">{stock.resellerPriced ? 'Your rate from' : 'From'}</p>
            <p className={cn(
              "font-bold text-base md:text-lg truncate",
              inStock && startingPrice > 0 ? "text-emerald-300" : "text-white/35"
            )}>
              {startingPrice > 0 ? `₹${startingPrice}` : '—'}
            </p>
          </div>
          <ChevronDown 
            className={cn(
              "h-4 w-4 shrink-0 text-white/40 transition-transform hidden sm:block",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Expanded Section - Configurations */}
      {isExpanded && (
        <div className="border-t border-white/10 bg-white/[0.02]">
          <div className="p-3 space-y-2">
            {configRows.length > 0 ? (
              <>
                <p className="text-xs font-medium text-white/45 uppercase tracking-wide mb-3">
                  {isProxyProduct || netbayGroupTags.length > 1 ? 'IP ranges' : 'Select Configuration'}
                </p>
                <div className="space-y-2">
                  {configRows.map((row) => {
                    const { memory, details, tag, label, key } = row;
                    const hasPrice = details.price != null && Number(details.price) > 0;
                    const memoryInStock = hasPrice && isStockPurchasable(stock, memory);
                    const verifyKey = `${stock._id}:${memory}:${tag || ''}`;
                    return (
                    <div
                      key={key}
                      className={cn(
                        "flex flex-col gap-2 p-2.5 rounded-md border transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                        memoryInStock
                          ? "bg-white/[0.04] border-white/10 hover:border-emerald-400/35"
                          : "bg-white/[0.02] border-red-400/10 opacity-80"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0 sm:flex-1">
                        {isOceanSmartVps ? (
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span className={cn(
                              "text-sm font-medium font-mono tracking-wide truncate",
                              memoryInStock ? "text-white/90" : "text-white/45"
                            )}>
                              {formatOceanMemoryDisplay(memory)}
                            </span>
                            <OceanPlanTypeBadge memory={memory} />
                          </span>
                        ) : (
                          <span className={cn(
                            "text-sm font-medium font-mono tracking-wide truncate",
                            memoryInStock ? "text-white/90" : "text-white/45"
                          )}>
                            {label}
                          </span>
                        )}
                        <span className={cn(
                          "font-bold text-base shrink-0 sm:hidden",
                          memoryInStock ? "text-emerald-300" : "text-white/35"
                        )}>
                          {hasPrice ? `₹${details.price}` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                        <span className={cn(
                          "hidden sm:inline font-bold text-base",
                          memoryInStock ? "text-emerald-300" : "text-white/35"
                        )}>
                          {hasPrice ? `₹${details.price}` : 'Price N/A'}
                        </span>
                        <AddToCartButton
                          kind="ipstock"
                          ipStockId={stock._id}
                          memory={memory}
                          netbayGroupTag={tag || undefined}
                          size="sm"
                          variant="outline"
                          className="h-8 flex-1 sm:flex-none px-2.5"
                          label="Cart"
                          disabled={!memoryInStock}
                        />
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBuyNow(stock.name, memory, details.price!, stock._id, undefined, memoryInStock, tag || undefined);
                          }}
                          disabled={!memoryInStock || !hasPrice || verifyingPurchaseKey === verifyKey}
                          className={cn(
                            "h-8 flex-1 sm:flex-none px-3 gap-1.5 border-0",
                            memoryInStock && hasPrice
                              ? "premium-btn-primary"
                              : "bg-red-500/15 text-red-300 hover:bg-red-500/20 cursor-not-allowed"
                          )}
                        >
                          {verifyingPurchaseKey === verifyKey ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : memoryInStock && hasPrice ? (
                            <Zap className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {verifyingPurchaseKey === verifyKey
                            ? 'Checking…'
                            : memoryInStock && hasPrice
                              ? 'Buy Now'
                              : hasPrice
                                ? 'Sold out'
                                : 'No price'}
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
                {hasPromoCodes && (
                  <div className="mt-3 p-2 rounded-md bg-emerald-500/10 border border-emerald-400/25">
                    <p className="text-xs text-emerald-200 flex items-center gap-1.5">
                      <Tag className="h-3 w-3" />
                      Promo codes available for additional discounts!
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No configurations available</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
