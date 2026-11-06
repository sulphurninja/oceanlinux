"use client";

import { useEffect, useLayoutEffect, useState, Suspense, useMemo, memo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { dashboardFetch } from '@/lib/dashboardFetch';
import { fetchCurrentUser } from '@/lib/currentUserRequest';
import { PlanListSkeleton } from '@/components/dashboard/DashboardPageSkeleton';
import {
  readDashboardCache,
  writeDashboardCache,
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
  ArrowUp,
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

/** Catalog paints from Mongo. Provider sync runs only when the user hits Refresh. */
const LIVE_SYNC_TIMEOUT_MS = 12_000;

/** 08:00–11:59 IST — skip background panel sync on store load (matches server peak guard). */
function isIstPeakStoreQuietHours() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  );
  const h = hour === 24 ? 0 : hour;
  return h >= 8 && h < 12;
}

const ipStockRequests = new Map<string, Promise<{ ok: boolean; status: number; data: unknown }>>();

function fetchIpStockCatalog(url: string) {
  const existing = ipStockRequests.get(url);
  if (existing) return existing;
  const request = dashboardFetch(url, { cache: 'no-store' })
    .then(async (res) => ({ ok: res.ok, status: res.status, data: await res.json() }))
    .finally(() => {
      ipStockRequests.delete(url);
    });
  ipStockRequests.set(url, request);
  return request;
}

const LIVE_STOCK_SYNC_ENDPOINTS = [
  '/api/nexa/refresh-stock',
  '/api/advps/refresh-stock',
  '/api/reseller-panel/refresh-stock',
  '/api/kurohost/refresh-stock',
  '/api/hostdzire/refresh-stock',
  '/api/smartvps/sync',
] as const;

const LIVE_STOCK_SYNC_ENDPOINTS_PEAK = ['/api/nexa/refresh-stock'] as const;

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
  resellerPanelLiveStock?: boolean | null;
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
  return stock.resellerPanelLiveStock === true || stock.resellerUseLiveStockApi === true;
}

/** Matches server `stockNameRequiresMappedZone` — wallet must not sell region-titled plans without zoneIds. */
function stockNameRequiresMappedZone(stock: IPStock) {
  return /\s-\s[A-Za-z][A-Za-z0-9\s.]+\s\|\s/.test(String(stock.name || ''));
}

function resellerPlanHasMappedZone(stock: IPStock) {
  const cfg = stock.defaultConfigurations?.resellerApi;
  if (!cfg) return false;
  if (cfg.zoneId != null && Number.isFinite(Number(cfg.zoneId))) return true;
  return Array.isArray(cfg.zoneIds) && cfg.zoneIds.length > 0;
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
  if (usesCompanyManualUnits(stock)) {
    return getStockUnitsRemaining(stock) > 0;
  }
  const savedVps = stock.inventoryAvailable ?? 0;
  if (savedVps > 0) return true;

  if (stockNameRequiresMappedZone(stock) && !resellerPlanHasMappedZone(stock)) {
    return false;
  }

  const reseller = stock.defaultConfigurations?.resellerApi;
  const variant = reseller?.variantStock?.[memory];
  const panelLive =
    isResellerLiveStock(stock) ||
    stock.resellerPanelLiveStock === true ||
    stock.resellerUseLiveStockApi === true;

  if (panelLive && variant && typeof variant === 'object') {
    if (variant.available === true) return true;
    if (variant.available === false) return false;
  }

  if (stock.available) return true;
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

function pricedMemoryKeys(stock: IPStock) {
  return Object.entries(stock.memoryOptions || {})
    .filter(([key, details]) => key && !String(key).startsWith('$') && Number(details?.price) > 0)
    .map(([key]) => key);
}

function isStockPurchasable(stock: IPStock, memory?: string) {
  if (usesCompanyManualUnits(stock)) {
    return getStockUnitsRemaining(stock) > 0;
  }
  const savedVps = stock.inventoryAvailable ?? 0;
  if (savedVps > 0) return true;
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
    const sellable = pricedMemoryKeys(stock);
    if (sellable.length) return sellable.some((key) => isResellerMemoryInStock(stock, key));
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
        type === 'Linux' ? premiumBadge.success : premiumBadge.info,
      )}
    >
      {type}
    </span>
  );
}

function stripTagDisplayPrefix(tag: string) {
  return String(tag || '')
    .trim()
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+plans?\s*$/i, '');
}

function formatTagGroupTitle(tag: string) {
  const cleaned = stripTagDisplayPrefix(tag);
  const t = normalizePlanTag(cleaned);
  if (t === 'ocean linux' || t === 'oceanlinux') return 'Ocean Linux';
  return cleaned;
}

/** Section heading without duplicate "Plans" or stale "1." prefixes from admin tags. */
function toTitleCaseLabel(value: string) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function tagGroupSectionHeading(tag: string) {
  const base = formatTagGroupTitle(tag);
  const withPlans = /\bplans?\b/i.test(base) ? base : `${base} plans`;
  return toTitleCaseLabel(withPlans);
}

function tagSlugForAnchor(tag: string) {
  return normalizePlanTag(stripTagDisplayPrefix(tag)).replace(/[^a-z0-9]+/g, '-');
}

function jumpShortLabel(label: string) {
  const parts = label.split(/\s+[—–-]\s+/);
  const head = (parts[0] || label).replace(/\s+plans?\b/gi, '').trim();
  const tail = (parts[1] || '').replace(/\(.*\)/, '').replace(/\s+plans?\b/gi, '').trim();
  if (tail) return `${head} ${tail}`.replace(/\s+/g, ' ');
  return head || label;
}

function tagSectionDisambiguator(tag: string, stocks: IPStock[]) {
  const parts: string[] = [];
  const linux = stocks.filter((s) => s.serverType === 'Linux').length;
  const vps = stocks.filter((s) => s.serverType === 'VPS').length;
  if (linux) parts.push(`${linux} Linux`);
  if (vps) parts.push(`${vps} Windows`);
  const raw = stripTagDisplayPrefix(tag);
  if (parts.length === 0) return raw !== formatTagGroupTitle(tag) ? raw : `${stocks.length} items`;
  return parts.join(' · ');
}

function buildTagSectionTitles(grouped: Record<string, IPStock[]>) {
  const titles = new Map<string, string>();
  const normKeys = new Map<string, string[]>();

  for (const tag of Object.keys(grouped)) {
    const norm = normalizePlanTag(stripTagDisplayPrefix(tag));
    if (!normKeys.has(norm)) normKeys.set(norm, []);
    normKeys.get(norm)!.push(tag);
  }

  for (const tag of Object.keys(grouped)) {
    const stocks = grouped[tag];
    const linux = stocks.filter((s) => s.serverType === 'Linux').length;
    const vps = stocks.filter((s) => s.serverType === 'VPS').length;
    const tierCore = toTitleCaseLabel(
      formatTagGroupTitle(tag).replace(/\s+plans?\s*$/i, '')
    );
    let heading: string;
    if (linux && !vps) {
      heading = `${tierCore} Plans — Linux`;
    } else if (vps && !linux) {
      heading = `${tierCore} Plans — Windows`;
    } else if (linux && vps) {
      heading = `${tierCore} Plans — Linux & Windows`;
    } else {
      heading = tagGroupSectionHeading(tag);
    }

    const norm = normalizePlanTag(stripTagDisplayPrefix(tag));
    const siblings = normKeys.get(norm) || [];
    if (siblings.length > 1) {
      const rawHint = stripTagDisplayPrefix(tag);
      if (rawHint && normalizePlanTag(rawHint) !== norm) {
        heading = `${heading} (${toTitleCaseLabel(rawHint)})`;
      } else {
        heading = `${heading} (${tagSectionDisambiguator(tag, stocks)})`;
      }
    } else {
      const names = stocks.map((s) => s.name).join(' ');
      const mixedTiers = /basic/i.test(names) && /advance|premium|starter/i.test(names);
      if (mixedTiers && /advance/i.test(heading)) {
        heading = `Mixed Tier Plans (${tagSectionDisambiguator(tag, stocks)})`;
      }
    }
    titles.set(tag, heading);
  }
  return titles;
}

function pricedMemoryEntriesForStock(stock: IPStock, categoryTab: string) {
  return sortMemoryOptionEntries(
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
  ).filter(([, details]) => details.price != null && Number(details.price) > 0);
}

function isServerPlanRowVisible(stock: IPStock, categoryTab: string) {
  if (
    categoryTab !== 'all' &&
    categoryTab !== 'SlotIP' &&
    isOceanSmartVpsPlan(stock) &&
    pricedMemoryEntriesForStock(stock, categoryTab).length === 0
  ) {
    return false;
  }
  return true;
}

const PLAN_ROW_ACTION = 'h-10 px-3 shrink-0';

function nexaGroupKey(stock: IPStock): string | null {
  const tags = (stock.tags || []).map((tag) => String(tag).toLowerCase());
  const nexa = stock.defaultConfigurations?.nexa;
  const isNexa = tags.includes('nexa') || nexa?.planId || nexa?.poolId;
  if (!isNexa) return null;
  if (nexa?.planId != null && String(nexa.planId) !== '') return `plan:${nexa.planId}`;
  const parts = String(stock.name || '').split(' — ');
  if (parts.length > 1) return `name:${parts.slice(0, -1).join(' — ').trim().toLowerCase()}`;
  return null;
}

function nexaPlanLabel(stock: IPStock) {
  const parts = String(stock.name || '').split(' — ');
  return parts.length > 1 ? parts.slice(0, -1).join(' — ').trim() : stock.name;
}

function nexaSubnetLabel(stock: IPStock) {
  const subnet = String(stock.defaultConfigurations?.nexa?.subnet || '').trim();
  if (subnet) return subnet;
  const parts = String(stock.name || '').split(' — ');
  return parts.length > 1 ? parts[parts.length - 1].trim() : stock.name;
}

function stockStartingPrice(stock: IPStock) {
  const prices = Object.values(stock.memoryOptions || {})
    .map((option) => Number(option?.price) || 0)
    .filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : 0;
}

type ProxyCatalogRow =
  | { kind: 'stock'; stock: IPStock }
  | { kind: 'nexa'; key: string; planName: string; stocks: IPStock[] };

function groupProxyCatalogRows(stocks: IPStock[]): ProxyCatalogRow[] {
  const byPlan = new Map<string, IPStock[]>();
  for (const stock of stocks) {
    const key = nexaGroupKey(stock);
    if (!key) continue;
    const list = byPlan.get(key) || [];
    list.push(stock);
    byPlan.set(key, list);
  }
  const emitted = new Set<string>();
  const rows: ProxyCatalogRow[] = [];
  for (const stock of stocks) {
    const key = nexaGroupKey(stock);
    const siblings = key ? byPlan.get(key) || [] : [];
    if (!key || siblings.length < 2) {
      rows.push({ kind: 'stock', stock });
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    rows.push({
      kind: 'nexa',
      key,
      planName: nexaPlanLabel(siblings[0]),
      stocks: [...siblings].sort((a, b) => nexaSubnetLabel(a).localeCompare(nexaSubnetLabel(b))),
    });
  }
  return rows;
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

function PlanSectionJump({ links }: { links: { id: string; label: string; short: string }[] }) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (links.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const nextId = visible[0]?.target.id;
        if (nextId) setActiveSectionId((current) => (current === nextId ? current : nextId));
      },
      { rootMargin: '-120px 0px -60% 0px' }
    );
    for (const link of links) {
      const el = document.getElementById(link.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [links]);

  if (links.length < 2) return null;

  return (
    <nav
      aria-label="Plan sections"
      className="sticky top-[6.5rem] z-30 mb-4 hidden w-full min-w-0 max-w-full premium-ipstock-section-jump lg:flex lg:flex-wrap"
    >
      <span className="premium-ipstock-jump-label">Jump to</span>
      <div className="premium-ipstock-jump-track">
        {links.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            title={link.label}
            aria-current={activeSectionId === link.id ? 'true' : undefined}
            className="premium-ipstock-section-jump-link"
          >
            {link.short}
          </a>
        ))}
      </div>
      <button
        type="button"
        className="premium-ipstock-jump-top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Back to filters"
      >
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden xl:inline">Top</span>
      </button>
    </nav>
  );
}

export default function IPStockPage() {
  return (
    <Suspense fallback={<PlanListSkeleton />}>
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
  const [walletLoaded, setWalletLoaded] = useState(false);
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
    fetchCurrentUser()
      .then(({ ok, data }) => { if (ok && data?.userType === 'reseller') setIsReseller(true); })
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

    const fetchFullCatalog = async (signal?: AbortSignal, fresh = false) => {
      const ipUrl = fresh ? "/api/ipstock?fresh=1" : "/api/ipstock";
      const ipResult = await fetchIpStockCatalog(ipUrl);
      const ipRows = parseIpStockRows(ipResult.data);

      if (!ipResult.ok) {
        console.warn("[IP Stock] /api/ipstock HTTP", ipResult.status, ipResult.data);
      }

      if (!signal?.aborted) {
        writeDashboardCache(DASHBOARD_CACHE_KEYS.ipStock, ipRows);
        setIpStocks(ipRows);
        setIsLoading(false);
      }

      const [slotData, trialData] = await Promise.all([
        dashboardFetch("/api/slot-ips?view=customer", { cache: "no-store", signal })
          .then((res) => res.json())
          .catch(() => []),
        dashboardFetch("/api/trial-vps", { cache: "no-store", signal })
          .then((res) => res.json())
          .catch(() => []),
      ]);
      if (signal?.aborted) return ipResult.ok;

      applyCatalogPayload(ipRows, slotData, trialData);
      return ipResult.ok;
    };

    const reloadIpStocks = async (signal?: AbortSignal) => {
      if (signal?.aborted) return;
      const ipResult = await fetchIpStockCatalog("/api/ipstock");
      if (!ipResult.ok || signal?.aborted) return;
      const rows = parseIpStockRows(ipResult.data);
      writeDashboardCache(DASHBOARD_CACHE_KEYS.ipStock, rows);
      setIpStocks(rows);
    };

    const syncLiveStock = async (signal: AbortSignal, generation: number) => {
      setIsRefreshingStock(true);
      const timeoutMs = manual ? 20_000 : LIVE_SYNC_TIMEOUT_MS;
      const endpoints = isIstPeakStoreQuietHours() && !manual
        ? [...LIVE_STOCK_SYNC_ENDPOINTS_PEAK]
        : [...LIVE_STOCK_SYNC_ENDPOINTS];
      try {
        const results = await Promise.all(
          endpoints.map(async (url) => {
            if (signal.aborted) return { skipped: true };
            const timeoutCtrl = new AbortController();
            const timeoutId = window.setTimeout(() => timeoutCtrl.abort(), timeoutMs);
            const onAbort = () => timeoutCtrl.abort();
            signal.addEventListener("abort", onAbort, { once: true });
            try {
              const res = await dashboardFetch(url, {
                cache: "no-store",
                signal: timeoutCtrl.signal,
              });
              return await res.json().catch(() => ({ skipped: true }));
            } catch (err) {
              if (!signal.aborted) console.warn("[IP Stock] background live sync skipped", url, err);
              return { skipped: true };
            } finally {
              window.clearTimeout(timeoutId);
              signal.removeEventListener("abort", onAbort);
            }
          })
        );
        if (signal.aborted) return;
        const nexaImported = results.some(
          (row) => row && typeof row === "object" && Number((row as { changed?: number }).changed) > 0
        );
        const syncOk = results.some(
          (row) => row && row.skipped !== true && row.throttled !== true && row.success !== false
        );
        if (manual || nexaImported || syncOk) {
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

    if (skipUpstreamSync && !manual) {
      const generation = ++liveSyncGenerationRef.current;
      liveSyncAbortRef.current?.abort();
      const ac = new AbortController();
      liveSyncAbortRef.current = ac;
      void (async () => {
        try {
          const res = await dashboardFetch("/api/nexa/refresh-stock", {
            cache: "no-store",
            signal: ac.signal,
          });
          const row = await res.json().catch(() => ({}));
          if (ac.signal.aborted) return;
          if (Number(row?.changed) > 0) {
            await fetchFullCatalog(ac.signal, true);
          }
        } catch (err) {
          if (!ac.signal.aborted) console.warn("[IP Stock] Nexa background catalog sync", err);
        }
      })();
      return catalogOk;
    }
    if (isIstPeakStoreQuietHours() && !manual) return catalogOk;

    const generation = ++liveSyncGenerationRef.current;
    liveSyncAbortRef.current?.abort();
    const ac = new AbortController();
    liveSyncAbortRef.current = ac;
    if (waitForLiveSync || manual) {
      await syncLiveStock(ac.signal, generation);
      if (!ac.signal.aborted) {
        try {
          await fetchFullCatalog(ac.signal, true);
        } catch (e) {
          console.warn("[IP Stock] catalog reload after sync failed", e);
        }
      }
    } else {
      void syncLiveStock(ac.signal, generation);
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

  // Paint from the database. Provider stock sync stays on the Refresh button
  // and the server cron — running it on every visit stalled the whole site.
  useLayoutEffect(() => {
    const cacheFor = 24 * 60 * 60 * 1000;
    const cachedStocks = readDashboardCache(DASHBOARD_CACHE_KEYS.ipStock, cacheFor) as IPStock[] | null;
    const cachedSlots = readDashboardCache(DASHBOARD_CACHE_KEYS.slotIps, cacheFor) as SlotIPPackage[] | null;
    const cachedTrials = readDashboardCache(DASHBOARD_CACHE_KEYS.trialVps, cacheFor) as TrialVpsPackage[] | null;
    const hasCache = Array.isArray(cachedStocks) && cachedStocks.length > 0;

    if (hasCache) {
      setIpStocks(cachedStocks);
      if (Array.isArray(cachedSlots)) setSlotPackages(cachedSlots);
      if (Array.isArray(cachedTrials)) setTrialPackages(cachedTrials);
      setIsLoading(false);
    }

    loadPlans({
      silent: hasCache,
      skipUpstreamSync: true,
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

  const proxyCatalogRows = useMemo(
    () => groupProxyCatalogRows(proxyIpStocks),
    [proxyIpStocks]
  );

  const serverIpStocks = useMemo(
    () => filteredIpStocks.filter((stock) => !isPremiumProxyPlan(stock)),
    [filteredIpStocks]
  );

  const tagGroupedStocks = useMemo(
    () => groupStocksByTags(serverIpStocks),
    [serverIpStocks]
  );

  const tagSectionTitles = useMemo(
    () => buildTagSectionTitles(tagGroupedStocks.grouped),
    [tagGroupedStocks.grouped]
  );

  const visibleStocks = useMemo(
    () => ipStocks.filter((stock) => !stock.hiddenFromStore),
    [ipStocks]
  );

  const counts = useMemo(() => {
    const linux = visibleStocks.filter(
      (stock) => matchesCategoryTab(stock, 'Linux') && isServerPlanRowVisible(stock, 'Linux')
    ).length;
    const vps = visibleStocks.filter(
      (stock) => matchesCategoryTab(stock, 'VPS') && isServerPlanRowVisible(stock, 'VPS')
    ).length;
    const proxyPlans = groupProxyCatalogRows(
      visibleStocks.filter((stock) => isPremiumProxyPlan(stock))
    ).length;
    const slot = slotPackages.length + proxyPlans;
    const trial = trialPackages.length;
    const listableServerAll = visibleStocks.filter(
      (stock) => !isPremiumProxyPlan(stock) && isServerPlanRowVisible(stock, 'all')
    ).length;
    const all = listableServerAll + proxyPlans + slotPackages.length + trial;
    return {
      all,
      linux,
      vps,
      slot,
      trial,
    };
  }, [visibleStocks, slotPackages, trialPackages]);

  const categoryTabTotal = useMemo(() => {
    switch (activeTab) {
      case 'Linux':
        return counts.linux;
      case 'VPS':
        return counts.vps;
      case 'SlotIP':
        return counts.slot;
      case 'Trial':
        return counts.trial;
      default:
        return counts.all;
    }
  }, [activeTab, counts]);

  const listedPlanCount = useMemo(() => {
    const visibleServerRows = serverIpStocks.filter((s) =>
      isServerPlanRowVisible(s, activeTab === 'all' ? 'all' : activeTab)
    ).length;
    if (activeTab === 'Trial') return trialPackages.length;
    if (activeTab === 'SlotIP') return slotPackages.length + proxyIpStocks.length;
    if (activeTab === 'all') {
      return visibleServerRows + slotPackages.length + proxyIpStocks.length + trialPackages.length;
    }
    return visibleServerRows;
  }, [activeTab, serverIpStocks, proxyIpStocks.length, slotPackages.length, trialPackages.length]);

  const sectionJumpLinks = useMemo(() => {
    if (activeTab === 'Trial' || activeTab === 'SlotIP') return [];
    const links: { id: string; label: string; short: string }[] = [];
    if (activeTab === 'all' && (slotPackages.length > 0 || proxyIpStocks.length > 0)) {
      links.push({ id: 'ipstock-section-premium', label: 'Premium Proxies', short: 'Proxies' });
    }
    if (activeTab === 'all' && trialPackages.length > 0) {
      links.push({ id: 'ipstock-section-trial', label: 'Trial VPS', short: 'Trial' });
    }
    for (const tag of Object.keys(tagGroupedStocks.grouped).sort()) {
      const label = tagSectionTitles.get(tag) || tagGroupSectionHeading(tag);
      links.push({
        id: `ipstock-section-${tagSlugForAnchor(tag)}`,
        label,
        short: jumpShortLabel(label),
      });
    }
    if (tagGroupedStocks.untagged.length > 0) {
      links.push({ id: 'ipstock-section-other', label: 'Other Plans', short: 'Other' });
    }
    return links;
  }, [activeTab, slotPackages.length, proxyIpStocks.length, trialPackages.length, tagGroupedStocks, tagSectionTitles]);

  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Group stocks by tags — computed in tagGroupedStocks useMemo above.

  useEffect(() => {
    if (!showDialog) return;
    setWalletLoaded(false);
    fetchWalletSummary()
      .then((w) => {
      if (w) setWalletBalance(w.balance);
      })
      .finally(() => setWalletLoaded(true));
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
    { id: 'all', Icon: Grid3X3, label: 'All Plans', shortLabel: 'All', count: counts.all },
    { id: 'Linux', Icon: Server, label: 'Linux Servers', shortLabel: 'Linux', count: counts.linux },
    { id: 'VPS', Icon: Cloud, label: 'Windows VPS', shortLabel: 'Windows', count: counts.vps },
    { id: 'SlotIP', Icon: Zap, label: 'Premium IP Proxies', shortLabel: 'Proxies', count: counts.slot },
    { id: 'Trial', Icon: Clock, label: 'Trial VPS', shortLabel: 'Trial', count: counts.trial },
  ];

  if (isReseller) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-white/10 bg-white/[0.03]">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
              <WalletIcon className="h-7 w-7 text-emerald-300" />
            </div>
            <CardTitle className="text-xl text-white">Panel purchasing is disabled</CardTitle>
            <CardDescription className="premium-dashboard-subtitle leading-relaxed">
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
    <div className="premium-dashboard-page premium-ipstock-page w-full min-w-0 max-w-full pb-[max(5.5rem,env(safe-area-inset-bottom))]">
      {/* Promo — compact, polished */}
      <div className="relative overflow-hidden border-b premium-promo-strip">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-emerald-500/5" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
        <div className="relative w-full max-w-[96rem] mx-auto px-3 sm:px-6 lg:px-8 py-1.5 sm:py-3 min-w-0 box-border">
          <div className="flex items-center justify-center gap-1.5 sm:gap-4 flex-nowrap">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] sm:gap-2 sm:text-sm">
              <Badge variant="outline" className={cn(premiumBadge.success, "h-4 shrink-0 px-1 text-[10px] gap-1 font-medium shadow-sm sm:h-5 sm:px-1.5 sm:text-xs")}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="ocean-soft-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                Live
              </Badge>
              <span className="premium-dashboard-subtitle hidden sm:inline">Limited offer</span>
              <span className="min-w-0 truncate font-semibold premium-dashboard-title">Save on every plan</span>
              <Sparkles className="hidden h-3.5 w-3.5 shrink-0 premium-dashboard-subtitle animate-pulse sm:block" aria-hidden />
            </div>
            <div className="h-3.5 w-px bg-white/15 hidden sm:block" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText('OCEAN50');
                toast.success('Promo code OCEAN50 copied!');
              }}
              className="premium-ipstock-promo-btn h-7 shrink-0 px-2 text-[11px] active:scale-[0.98] sm:h-10 sm:px-4 sm:text-sm"
              aria-label="Copy promo code OCEAN50"
            >
              <Percent className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" aria-hidden />
              <span className="premium-ipstock-promo-hint hidden text-xs font-medium opacity-80 sm:inline">Use code</span>
              <code className="text-[11px] font-bold tracking-[0.08em] sm:text-sm sm:tracking-[0.14em]">OCEAN50</code>
              <Copy className="h-3 w-3 shrink-0 sm:ml-1 sm:h-4 sm:w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[96rem] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 min-w-0 box-border">
        {isLoading ? (
          <PlanListSkeleton />
        ) : (
          <div>
            {/* Category tabs — scroll on phone, grid on large screens */}
            <div className="mb-3 -mx-1 px-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div role="group" aria-label="Plan categories" className="flex gap-1.5 w-max">
              {categoryCards.map((cat) => {
                const isActive = activeTab === cat.id;
                const CatIcon = cat.Icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleTabChange(cat.id)}
                    className={cn(
                      "premium-ipstock-category-tab shrink-0",
                      isActive && "premium-ipstock-category-tab--active"
                    )}
                  >
                    <CatIcon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "premium-price-accent" : "premium-dashboard-subtitle")} aria-hidden />
                    <span className="font-medium text-xs sm:text-sm whitespace-nowrap">
                      <span className="sm:hidden">{cat.shortLabel}</span>
                      <span className="hidden sm:inline">{cat.label}</span>
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        premiumBadge.neutral,
                        "text-[10px] h-4 min-w-[1.25rem] px-1.5 ml-1 justify-center shrink-0 tabular-nums",
                        isActive && premiumBadge.success
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
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <DashboardSearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search servers..."
                  className="sm:min-h-10"
                />
                <div className="flex gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap sm:items-center premium-ipstock-toolbar-actions">
                  <Select value={priceFilter} onValueChange={setPriceFilter}>
                    <SelectTrigger className="premium-dashboard-select h-10 flex-1 sm:flex-none sm:w-[7.5rem]">
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
                    <SelectTrigger className="premium-dashboard-select h-10 flex-1 sm:flex-none sm:w-[6.5rem]">
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
                    className="h-10 shrink-0 gap-1.5 px-3"
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
                    <span className="hidden sm:inline text-xs font-medium">Refresh</span>
                    <span className="sr-only sm:hidden">Refresh stock</span>
                  </Button>
                  {(searchTerm || priceFilter !== 'all' || sortBy !== 'name') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearchTerm(""); setPriceFilter("all"); setSortBy("name"); }}
                      className="h-10 px-2.5 text-xs"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1.5 px-3 sm:ml-auto"
                  >
                    <Link href="/dashboard/cart">
                      <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                      <span className="premium-ipstock-cart-label text-xs font-medium">View cart</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <p className="premium-ipstock-plan-count mb-3">
              <span
                className={cn(
                  'premium-ipstock-plan-count-dot',
                  (isManualRefreshing || isRefreshingStock) && !isLoading && 'is-live'
                )}
                aria-hidden
              />
              <span>
                Showing{' '}
                <span className="premium-ipstock-plan-count-num">{listedPlanCount}</span>
                {listedPlanCount === categoryTabTotal
                  ? ` plan${listedPlanCount === 1 ? '' : 's'}`
                  : ` of ${categoryTabTotal} plans`}
                {activeTab === 'Linux' ? ' · Linux' : activeTab === 'VPS' ? ' · Windows VPS' : activeTab === 'SlotIP' ? ' · Proxies' : activeTab === 'Trial' ? ' · Trial' : ''}
                {(searchTerm || priceFilter !== 'all') ? ' · filtered' : ''}
              </span>
              {(isManualRefreshing || isRefreshingStock) && !isLoading ? (
                <span className="premium-ipstock-plan-count-live">Refreshing</span>
              ) : null}
            </p>

            <PlanSectionJump links={sectionJumpLinks} />

            {/* Plan listings */}
            <div>
              {/* Slot IP Section */}
              {(activeTab === 'all' || activeTab === 'SlotIP') && (slotPackages.length > 0 || proxyIpStocks.length > 0) && (
                <div id="ipstock-section-premium" className="space-y-2 mb-6 scroll-mt-44">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-6 bg-orange-500 rounded-full"></div>
                    <h2 className="text-base sm:text-lg font-semibold leading-snug premium-dashboard-title">Premium IP Proxies</h2>
                    <Badge variant="outline" className="text-[10px] premium-badge premium-badge--warning h-5 px-2">
                      {slotPackages.length + proxyCatalogRows.length} {(slotPackages.length + proxyCatalogRows.length) === 1 ? 'package' : 'packages'}
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
                      <div key={pkg._id} className="premium-dashboard-card rounded-lg border-l-4 border-l-orange-400 hover:border-orange-400/40 transition-colors overflow-hidden">
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2.5 sm:gap-3 sm:items-center">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="premium-ipstock-plan-icon flex-shrink-0" data-server-type="Proxy">
                              <Zap className="h-4 w-4" aria-hidden />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <h3 className="font-semibold text-sm md:text-base text-white break-words min-w-0 flex-1">{pkg.name}</h3>
                                <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 premium-dashboard-subtitle sm:hidden" aria-hidden />
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <Badge variant="outline" className="text-[10px] premium-badge premium-badge--warning px-1.5 py-0 h-5">
                                  Premium IP
                                </Badge>
                                {pkg.resellerPriced && (
                                  <Badge variant="outline" className="text-[10px] premium-badge premium-badge--success px-1.5 py-0 h-5">
                                    Your rate
                                  </Badge>
                                )}
                                {pkg.promoCodes && pkg.promoCodes.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] gap-1 premium-badge premium-badge--warning px-1.5 py-0 h-5">
                                    <Tag className="h-2.5 w-2.5" />
                                    Promo
                                  </Badge>
                                )}
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 premium-badge premium-badge--neutral">
                                  <Package className="h-3 w-3" />
                                  {pkg.availableCount} available
                                </Badge>
                              </div>
                              {pkg.description && (
                                <p className="text-xs premium-dashboard-subtitle mt-1 break-words">{pkg.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5 sm:border-0 sm:pt-0 sm:justify-end">
                            <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-end sm:gap-0 min-w-0">
                              {pkg.resellerPriced && Number(pkg.listPrice) > Number(pkg.price) && (
                                <p className="text-xs premium-dashboard-subtitle line-through">₹{pkg.listPrice}</p>
                              )}
                              <p className="font-bold text-base md:text-lg premium-price-accent">₹{pkg.price}</p>
                              <p className="text-xs premium-dashboard-subtitle">per IP</p>
                            </div>
                            <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
                              {pkg.availableCount > 0 && (
                                <AddToCartButton
                                  kind="slotip"
                                  slotIpPackageId={pkg._id}
                                  size="sm"
                                  variant="outline"
                                  iconOnly
                                  className={cn(PLAN_ROW_ACTION, 'w-10 px-0')}
                                  label="Add to cart"
                                />
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleBuyNow(pkg.name, 'Premium IP Proxies', pkg.price, '', pkg._id)}
                                className={cn(PLAN_ROW_ACTION, 'gap-1.5 premium-btn-primary border-0')}
                                disabled={pkg.availableCount === 0 || verifyingPurchaseKey === pkg._id}
                              >
                                {verifyingPurchaseKey === pkg._id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3" />
                                )}
                                {verifyingPurchaseKey === pkg._id ? 'Checking…' : 'Buy Now'}
                              </Button>
                              <ChevronDown className="h-4 w-4 shrink-0 premium-dashboard-subtitle hidden sm:block" aria-hidden />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {proxyCatalogRows.map((row) => (
                      row.kind === 'nexa' ? (
                        <NexaPlanGroupRow
                          key={row.key}
                          planName={row.planName}
                          stocks={row.stocks}
                          onBuyNow={handleBuyNow}
                          verifyingPurchaseKey={verifyingPurchaseKey}
                        />
                      ) : (
                      <CompactServerPlanRow
                          key={row.stock._id}
                          stock={row.stock}
                          categoryTab={activeTab}
                        onBuyNow={handleBuyNow}
                        verifyingPurchaseKey={verifyingPurchaseKey}
                      />
                      )
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
                    <p className="text-sm premium-dashboard-subtitle max-w-md mx-auto">
                      Premium IP proxy packages are currently unavailable. Check back soon!
                    </p>
                  </CardContent>
                </Card>
              )}

              {(activeTab === 'all' || activeTab === 'Trial') && trialPackages.length > 0 && (
                <div id="ipstock-section-trial" className="space-y-2 mb-6 min-w-0 scroll-mt-44">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-6 bg-violet-500 rounded-full shrink-0" />
                    <div
                      className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-400/35 flex items-center justify-center shrink-0"
                      aria-hidden
                    >
                      <span className="text-base leading-none">⏱️</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-semibold leading-snug premium-dashboard-title">Trial VPS</h2>
                    <Badge variant="outline" className="text-[10px] premium-badge premium-badge--pending h-5 px-2">
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
                    <p className="text-sm premium-dashboard-subtitle max-w-md mx-auto">
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
                        <AlertCircle className="h-8 w-8 premium-dashboard-subtitle" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-white">No Plans Available</h3>
                      <p className="text-sm premium-dashboard-subtitle max-w-md mx-auto px-2">
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
                        {tagKeys.map((tag) => {
                          const sectionStocks = grouped[tag];

                          return (
                          <div
                            key={tag}
                            id={`ipstock-section-${tagSlugForAnchor(tag)}`}
                            className="space-y-2 min-w-0 premium-ipstock-tag-section scroll-mt-44"
                          >
                            <div className="flex flex-wrap items-center gap-2 px-1 min-w-0">
                              <div className="w-1 h-6 bg-emerald-400 rounded-full shrink-0"></div>
                              <h2 className="text-base sm:text-lg font-semibold leading-snug premium-dashboard-title min-w-0">
                                {tagSectionTitles.get(tag) || tagGroupSectionHeading(tag)}
                              </h2>
                              <Badge variant="outline" className={cn(premiumBadge.neutral, "text-[10px] h-5 px-2 shrink-0")}>
                                {sectionStocks.length}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                              {sectionStocks.map((stock) => (
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
                          );
                        })}

                      {untagged.length > 0 && (
                          <div id="ipstock-section-other" className="space-y-2 min-w-0 premium-ipstock-tag-section scroll-mt-44">
                          {tagKeys.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2 px-1">
                                <div className="w-1 h-6 bg-white/25 rounded-full shrink-0"></div>
                                <h2 className="text-base sm:text-lg font-semibold leading-snug premium-dashboard-title">Other Plans</h2>
                                <Badge variant="outline" className="text-[10px] premium-badge premium-badge--neutral h-5 px-2">
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
              <p className={cn('text-xs -mt-1', promoApplied ? 'text-primary' : 'text-destructive')}>
                {promoMessage}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <WalletIcon className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-none">Wallet</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {walletLoaded ? `₹${walletBalance.toLocaleString('en-IN')} available` : 'Checking balance…'}
                  </p>
                </div>
              </div>
              <Switch
                checked={useWallet}
                onCheckedChange={setUseWallet}
                disabled={!walletLoaded || walletBalance <= 0 || paymentInitiating}
              />
            </div>

            {paymentTotals.gatewayCharge > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Pay via</p>
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
              disabled={paymentInitiating || !purchaseDisclaimerAccepted || !walletLoaded}
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

      {showBackToTop && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="premium-ipstock-back-to-top fixed bottom-6 left-4 z-40 h-10 w-10 rounded-full shadow-lg"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
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
  if (cat === 'windows') return premiumBadge.info;
  if (cat === 'premium_proxy') return premiumBadge.warning;
  return premiumBadge.success;
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
        'premium-dashboard-card rounded-lg overflow-hidden border-l-4',
        inStock
          ? 'border-l-violet-400 hover:border-violet-400/40'
          : 'border-l-red-500 premium-ipstock-row-sold-out'
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
                  'font-semibold text-sm md:text-base min-w-0 flex-1',
                  inStock
                    ? 'text-white break-words'
                    : 'premium-dashboard-subtitle line-through decoration-white/25 line-clamp-2 break-words'
                )}
              >
                {pkg.name}
              </h3>
              <ChevronDown
                className={cn(
                  'h-4 w-4 mt-0.5 shrink-0 premium-dashboard-subtitle transition-transform sm:hidden',
                  isExpanded && 'rotate-180'
                )}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <Badge
                variant="outline"
                className="text-[10px] premium-badge premium-badge--pending px-1.5 py-0 h-5"
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
                  className="text-[10px] premium-badge premium-badge--success px-1.5 py-0 h-5"
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
                  className="text-[10px] gap-1 px-2 py-0 h-5 font-semibold premium-badge premium-badge--error"
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
            <p className="text-xs premium-dashboard-subtitle mt-1">
              {!inStock
                ? 'Currently unavailable — check back later'
                : usesMemory
                  ? `${pkg.trialDays}-day trial · ${memoryLabel} · one-time · no renewal`
                  : `${pkg.trialDays}-day trial · HTTP proxy · one-time · no renewal`}
            </p>
            {pkg.description ? (
              <p className="text-xs premium-dashboard-subtitle mt-1 break-words line-clamp-2">{pkg.description}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5 sm:border-0 sm:pt-0 sm:gap-3 sm:justify-end sm:flex-shrink-0 min-w-0">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shrink-0',
              inStock ? premiumBadge.success : premiumBadge.error
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
            <p className="text-xs premium-dashboard-subtitle shrink-0">{pkg.resellerPriced ? 'Your rate' : 'Price'}</p>
            <p
              className={cn(
                'font-bold text-base md:text-lg truncate',
                inStock && pkg.price > 0 ? 'premium-price-accent' : 'premium-dashboard-subtitle'
              )}
            >
              {pkg.price > 0 ? `₹${pkg.price}` : '—'}
            </p>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 premium-dashboard-subtitle transition-transform hidden sm:block',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
      </div>

      {isExpanded && inStock && (
        <div className="border-t border-white/10 bg-white/[0.02]">
          <div className="p-3 space-y-2">
            <p className="text-xs font-medium premium-dashboard-subtitle uppercase tracking-wide mb-3">
              Select Configuration
            </p>
            <div
              className={cn(
                'flex flex-col gap-2 p-2.5 rounded-md border transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3',
                'bg-white/[0.04] border-white/10 hover:border-violet-400/35'
              )}
            >
              <div className="flex items-center justify-between gap-2 min-w-0 sm:flex-1">
                <span className="text-sm font-medium font-mono tracking-wide truncate premium-dashboard-title">
                  {usesMemory ? `${memoryLabel} · ${categoryLabel}` : categoryLabel}
                </span>
                <span className="font-bold text-base shrink-0 sm:hidden premium-price-accent">₹{pkg.price}</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                <span className="hidden sm:inline font-bold text-base premium-price-accent">₹{pkg.price}</span>
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
                  className={cn(PLAN_ROW_ACTION, 'flex-1 sm:flex-none gap-1.5 premium-btn-primary border-0')}
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

const NexaPlanGroupRow = memo(function NexaPlanGroupRow({
  planName,
  stocks,
  onBuyNow,
  verifyingPurchaseKey,
}: {
  planName: string;
  stocks: IPStock[];
  onBuyNow: (name: string, memory: string, price: number, id: string, slotIpPackageId?: string, stockAvailable?: boolean, netbayGroupTag?: string) => void | Promise<void>;
  verifyingPurchaseKey?: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const rows = stocks.map((stock) => {
    const memory = Object.keys(stock.memoryOptions || {}).find((key) => Number(stock.memoryOptions[key]?.price) > 0) || 'IP';
    const price = Number(stock.memoryOptions?.[memory]?.price) || stockStartingPrice(stock);
    return {
      stock,
      memory,
      price,
      label: nexaSubnetLabel(stock),
      inStock: price > 0 && isStockPurchasable(stock, memory),
    };
  });
  const openRows = rows.filter((row) => row.inStock);
  const inStock = openRows.length > 0;
  const priced = rows.map((row) => row.price).filter((price) => price > 0);
  const startingPrice = priced.length ? Math.min(...priced) : 0;

  return (
    <div className={cn(
      'premium-dashboard-card rounded-lg overflow-hidden border-l-4',
      inStock
        ? 'border-l-emerald-400 hover:border-emerald-400/40'
        : 'border-l-red-500 premium-ipstock-row-sold-out'
    )}>
      <div
        className={cn(
          'p-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2.5 sm:gap-3 sm:items-center',
          inStock ? 'cursor-pointer' : 'cursor-default'
        )}
        onClick={() => inStock && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1 sm:gap-3">
          <div className={cn('premium-ipstock-plan-icon flex-shrink-0', !inStock && 'premium-ipstock-plan-icon--muted')} data-server-type="Proxy">
            {inStock ? <Zap className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              'font-semibold text-sm md:text-base min-w-0',
              inStock ? 'premium-dashboard-title break-words sm:truncate' : 'premium-dashboard-subtitle line-through'
            )}>
              {planName}
            </h3>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" className={cn(inStock ? premiumBadge.success : premiumBadge.error, 'text-[10px] gap-1 px-2 py-0 h-5 font-semibold')}>
                {inStock ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
                {inStock
                  ? (openRows.length === rows.length
                    ? `${rows.length} IP range${rows.length === 1 ? '' : 's'}`
                    : `${openRows.length} of ${rows.length} in stock`)
                  : 'Out of stock'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-2.5 sm:border-0 sm:pt-0 sm:justify-end min-w-0">
          <p className="flex items-baseline gap-1.5 min-w-0 leading-none">
            <span className="text-xs premium-dashboard-subtitle shrink-0">From</span>
            <span className={cn('font-bold text-lg truncate premium-price-accent', !inStock && 'opacity-60')}>
              {startingPrice > 0 ? `₹${startingPrice}` : '—'}
            </span>
          </p>
          <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end" onClick={(e) => e.stopPropagation()}>
            {inStock ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={isExpanded}
                className={cn(PLAN_ROW_ACTION, 'premium-ipstock-range-toggle gap-1.5')}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Hide ranges' : 'Select IP range'}
                <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} aria-hidden />
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled className={cn(PLAN_ROW_ACTION, 'w-[7.25rem]')}>
                Sold out
              </Button>
            )}
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="premium-ipstock-range-panel">
          <div className="p-3 space-y-2">
            <p className="text-xs font-medium premium-dashboard-subtitle">IP ranges</p>
            {rows.map((row) => {
              const verifyKey = `${row.stock._id}:${row.memory}:`;
              return (
                <div
                  key={row.stock._id}
                  className={cn(
                    "premium-ipstock-range-row flex flex-col gap-2 p-2.5 rounded-md sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                    !row.inStock && "premium-ipstock-range-row--out"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 min-w-0 sm:flex-1">
                    <span className={cn("text-sm font-medium font-mono tracking-wide truncate", row.inStock ? "premium-dashboard-title" : "premium-dashboard-subtitle")}>
                      {row.label}
                    </span>
                    <span className={cn("font-bold text-base shrink-0 sm:hidden", row.inStock ? "premium-price-accent" : "premium-dashboard-subtitle")}>
                      {row.price > 0 ? `₹${row.price}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                    <span className={cn("hidden sm:inline font-bold text-base", row.inStock ? "premium-price-accent" : "premium-dashboard-subtitle")}>
                      {row.price > 0 ? `₹${row.price}` : 'Price N/A'}
                    </span>
                    {row.inStock ? (
                      <>
                        <AddToCartButton
                          kind="ipstock"
                          ipStockId={row.stock._id}
                          memory={row.memory}
                          size="sm"
                          variant="outline"
                          iconOnly
                          className={cn(PLAN_ROW_ACTION, 'w-10 px-0')}
                          label="Add to cart"
                        />
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBuyNow(row.stock.name, row.memory, row.price, row.stock._id, undefined, true);
                          }}
                          disabled={verifyingPurchaseKey === verifyKey}
                          className={cn(PLAN_ROW_ACTION, 'flex-1 sm:flex-none gap-1.5 premium-btn-primary border-0')}
                        >
                          {verifyingPurchaseKey === verifyKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                          {verifyingPurchaseKey === verifyKey ? 'Checking…' : 'Buy Now'}
                        </Button>
                      </>
                    ) : (
                      <span className="premium-ipstock-status-label">
                        <XCircle className="h-3.5 w-3.5" aria-hidden />
                        Sold out
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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

  const primaryRow = configRows.find((row) => {
    const hasPrice = row.details.price != null && Number(row.details.price) > 0;
    return hasPrice && isStockPurchasable(stock, row.memory);
  });
  const sellableRows = configRows.filter(
    (row) => row.details.price != null && Number(row.details.price) > 0
  );
  const inStock = sellableRows.length ? Boolean(primaryRow) : isStockPurchasable(stock);
  const primaryVerifyKey = primaryRow
    ? `${stock._id}:${primaryRow.memory}:${primaryRow.tag || ''}`
    : null;
  const pickRangeFirst = isProxyProduct && netbayGroupTags.length > 1;

  return (
    <div className={cn(
      'premium-dashboard-card rounded-lg overflow-hidden border-l-4',
      inStock
        ? 'border-l-emerald-400 hover:border-emerald-400/40'
        : 'border-l-red-500 premium-ipstock-row-sold-out'
    )}>
      <div 
        className={cn(
          'p-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2.5 sm:gap-3 sm:items-center',
          inStock ? 'cursor-pointer' : 'cursor-default'
        )}
        onClick={() => inStock && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1 sm:gap-3">
          {/* Icon */}
          <div
            className={cn(
              'premium-ipstock-plan-icon flex-shrink-0',
              !inStock && 'premium-ipstock-plan-icon--muted'
            )}
            data-server-type={stock.serverType}
          >
            {!inStock ? (
              <XCircle className="h-4 w-4" aria-hidden />
            ) : stock.serverType === 'VPS' ? (
              <Cloud className="h-4 w-4" aria-hidden />
            ) : stock.serverType === 'Proxy' || isProxyProduct ? (
              <Zap className="h-4 w-4" aria-hidden />
            ) : (
              <Server className="h-4 w-4" aria-hidden />
            )}
          </div>

          {/* Name & Type */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h3 className={cn(
                "font-semibold text-sm md:text-base min-w-0 flex-1",
                inStock
                  ? "premium-dashboard-title break-words sm:truncate"
                  : "premium-dashboard-subtitle line-through decoration-white/25 line-clamp-2 break-words"
              )}>
                {stock.name}
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {inStock ? (
                <Badge variant="outline" className={cn(premiumBadge.success, "text-[10px] gap-1 px-2 py-0 h-5 font-semibold")}>
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  {showUnits ? `${unitsLeft} in stock` : 'Available'}
                </Badge>
              ) : (
                <Badge variant="outline" className={cn(premiumBadge.error, "text-[10px] gap-1 px-2 py-0 h-5 font-semibold")}>
                  <XCircle className="h-3 w-3" aria-hidden />
                  Out of stock
                </Badge>
              )}
              {stock.resellerPriced && (
                <span className="text-[10px] premium-dashboard-subtitle">Your rate</span>
              )}
            </div>
          </div>
        </div>

        {/* Price + quick actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-2.5 sm:border-0 sm:pt-0 sm:justify-end min-w-0">
          <p className="flex items-baseline gap-1.5 min-w-0 leading-none">
            <span className="text-xs premium-dashboard-subtitle shrink-0">{stock.resellerPriced ? 'Your rate from' : 'From'}</span>
            <span className={cn(
              "font-bold text-lg truncate premium-price-accent",
              !inStock && "opacity-60"
            )}>
              {startingPrice > 0 ? `₹${startingPrice}` : '—'}
            </span>
          </p>
          <div
            className="flex items-center gap-2 flex-1 sm:flex-none justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            {inStock && primaryRow && !pickRangeFirst ? (
              <>
                <AddToCartButton
                  kind="ipstock"
                  ipStockId={stock._id}
                  memory={primaryRow.memory}
                  netbayGroupTag={primaryRow.tag || undefined}
                  size="sm"
                  variant="outline"
                  iconOnly
                  className={cn(PLAN_ROW_ACTION, 'w-10 px-0')}
                  label="Add to cart"
                />
                <Button
                  size="sm"
                  className={cn(PLAN_ROW_ACTION, 'w-[7.25rem] gap-1.5 premium-btn-primary border-0')}
                  disabled={verifyingPurchaseKey === primaryVerifyKey}
                  onClick={() =>
                    onBuyNow(
                      stock.name,
                      primaryRow.memory,
                      primaryRow.details.price!,
                      stock._id,
                      undefined,
                      true,
                      primaryRow.tag || undefined
                    )
                  }
                >
                  {verifyingPurchaseKey === primaryVerifyKey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="h-3 w-3" aria-hidden />
                  )}
                  Buy Now
                </Button>
              </>
            ) : inStock && pickRangeFirst ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={isExpanded}
                className={cn(PLAN_ROW_ACTION, 'premium-ipstock-range-toggle gap-1.5')}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Hide ranges' : 'Select IP range'}
                <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} aria-hidden />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  aria-label="Add to cart, sold out"
                  className={cn(PLAN_ROW_ACTION, 'w-10 px-0')}
                >
                  <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  className={cn(PLAN_ROW_ACTION, 'w-[7.25rem]')}
                >
                Sold out
                </Button>
              </>
            )}
            {!pickRangeFirst && (
            <span className="h-6 w-px bg-white/10 mx-0.5 hidden sm:block" aria-hidden />
            )}
            {!pickRangeFirst && (
            <button
              type="button"
              onClick={() => inStock && setIsExpanded(!isExpanded)}
              disabled={!inStock}
              aria-expanded={inStock ? isExpanded : undefined}
              aria-label={inStock ? (isExpanded ? 'Hide configurations' : 'Show configurations') : 'Configurations unavailable'}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md premium-dashboard-subtitle hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} aria-hidden />
            </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Section - Configurations */}
      {isExpanded && (
        <div className={pickRangeFirst ? 'premium-ipstock-range-panel' : 'border-t border-white/10 bg-white/[0.02]'}>
          <div className="p-3 space-y-2">
            {!pickRangeFirst && (
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Badge variant="outline" className={cn(premiumBadge.neutral, 'text-[10px] px-1.5 py-0 h-5')}>
                {stock.serverType}
              </Badge>
              {hasPromoCodes && (
                <Badge variant="outline" className={cn(premiumBadge.warning, 'text-[10px] gap-1 px-1.5 py-0 h-5')}>
                  <Tag className="h-2.5 w-2.5" aria-hidden />
                  Promo codes
                </Badge>
              )}
              <span className="text-xs premium-dashboard-subtitle">
                {configRows.length} configuration{configRows.length !== 1 ? 's' : ''}
              </span>
            </div>
            )}
            {configRows.length > 0 ? (
              <>
                <p className="text-xs font-medium premium-dashboard-subtitle mb-3">
                  {pickRangeFirst ? 'IP ranges' : (isProxyProduct || netbayGroupTags.length > 1 ? 'IP ranges' : 'Select configuration')}
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
                        "flex flex-col gap-2 p-2.5 rounded-md sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                        pickRangeFirst
                          ? cn('premium-ipstock-range-row', !memoryInStock && 'premium-ipstock-range-row--out')
                          : cn(
                              'border transition-colors',
                        memoryInStock
                                ? 'bg-white/[0.04] border-white/10 hover:border-emerald-400/35'
                                : 'bg-white/[0.02] border-red-400/10 opacity-80'
                            )
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0 sm:flex-1">
                        {isOceanSmartVps ? (
                          <span className="inline-flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "text-sm font-medium font-mono tracking-wide truncate",
                              memoryInStock ? "premium-dashboard-title" : "premium-dashboard-subtitle"
                            )}>
                              {formatOceanMemoryDisplay(memory)}
                            </span>
                            <OceanPlanTypeBadge memory={memory} />
                          </span>
                        ) : (
                          <span className={cn(
                            "text-sm font-medium font-mono tracking-wide truncate",
                            memoryInStock ? "premium-dashboard-title" : "premium-dashboard-subtitle"
                        )}>
                          {label}
                        </span>
                        )}
                        <span className={cn(
                          "font-bold text-base shrink-0 sm:hidden",
                          memoryInStock ? "premium-price-accent" : "premium-dashboard-subtitle"
                        )}>
                          {hasPrice ? `₹${details.price}` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                        <span className={cn(
                          "hidden sm:inline font-bold text-base",
                          memoryInStock ? "premium-price-accent" : "premium-dashboard-subtitle"
                        )}>
                          {hasPrice ? `₹${details.price}` : 'Price N/A'}
                        </span>
                        {memoryInStock && hasPrice ? (
                          <>
                        <AddToCartButton
                          kind="ipstock"
                          ipStockId={stock._id}
                          memory={memory}
                          netbayGroupTag={tag || undefined}
                          size="sm"
                          variant="outline"
                              iconOnly
                              className={cn(PLAN_ROW_ACTION, 'w-10 px-0')}
                              label="Add to cart"
                        />
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBuyNow(stock.name, memory, details.price!, stock._id, undefined, memoryInStock, tag || undefined);
                          }}
                              disabled={verifyingPurchaseKey === verifyKey}
                              className={cn(PLAN_ROW_ACTION, 'flex-1 sm:flex-none gap-1.5 premium-btn-primary border-0')}
                        >
                          {verifyingPurchaseKey === verifyKey ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Zap className="h-3 w-3" />
                              )}
                              {verifyingPurchaseKey === verifyKey ? 'Checking…' : 'Buy Now'}
                        </Button>
                          </>
                        ) : (
                          <span className="premium-ipstock-status-label">
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                            {hasPrice ? 'Sold out' : 'No price'}
                          </span>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
                {hasPromoCodes && (
                  <div className="mt-3 p-2 rounded-md bg-emerald-500/10 border border-emerald-400/25">
                    <p className="text-xs premium-price-accent flex items-center gap-1.5">
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
