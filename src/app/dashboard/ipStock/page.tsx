"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { PurchaseDisclaimerNotice } from "@/components/purchase/PurchaseDisclaimerNotice";

// Keep all existing interfaces and global declarations unchanged...

declare global {
  interface Window {
    Cashfree: any;
    Razorpay: any;
  }
}

interface MemoryOptionDetails {
  price: number | null;
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
  defaultConfigurations?: Record<string, any>;
  stockCount?: number;
  company?: string | null;
  netbayUseLiveStockApi?: boolean | null;
  resellerUseLiveStockApi?: boolean | null;
  serverType: string;
  tags: string[];
  memoryOptions: Record<string, MemoryOptionDetails>;
  promoCodes?: PromoCode[];
}

function isNetbayLiveStock(stock: IPStock) {
  const cfg = stock.defaultConfigurations?.netbay;
  if (!cfg?.planByMemory) return false;
  if (!Object.values(cfg.planByMemory).some(Boolean)) return false;
  return stock.netbayUseLiveStockApi === true;
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

function isCompanyStock(stock: IPStock) {
  return !!stock.company && !isNetbayLiveStock(stock) && !isResellerLiveStock(stock);
}

function getStockUnitsRemaining(stock: IPStock) {
  if (isNetbayLiveStock(stock) || isResellerLiveStock(stock)) {
    return stock.available ? Number.POSITIVE_INFINITY : 0;
  }
  if (isCompanyStock(stock)) return Math.max(0, stock.stockCount ?? 0);
  return stock.available ? Number.POSITIVE_INFINITY : 0;
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
  if (isNetbayLiveStock(stock)) {
    if (memory) return isNetbayMemoryInStock(stock, memory);
    if (stock.available) return true;
    const variants = Object.values(stock.defaultConfigurations?.netbay?.variantStock || {});
    return variants.some((v) => v?.available === true);
  }
  if (isResellerLiveStock(stock)) {
    if (memory) return isResellerMemoryInStock(stock, memory);
    if (stock.available) return true;
    return resellerVariantValues(stock).some((v) => v?.available === true);
  }
  if (isCompanyStock(stock)) return getStockUnitsRemaining(stock) > 0;
  return stock.available !== false;
}

interface SlotIPPackage {
  _id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  totalCount: number;
  availableCount: number;
  allocatedCount: number;
  promoCodes?: PromoCode[];
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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingStock, setIsRefreshingStock] = useState(false);
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
  const [paymentMethod, setPaymentMethod] = useState<'cashfree' | 'razorpay' | 'upi'>('razorpay');
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(true);

  // Tab filter state — read initial category from URL
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  const [activeTab, setActiveTab] = useState<string>(categoryParam || 'all');

  const router = useRouter();

  useEffect(() => {
    setActiveTab(categoryParam || 'all');
  }, [categoryParam]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === 'all') {
      router.push('/dashboard/ipStock', { scroll: false });
    } else {
      router.push(`/dashboard/ipStock?category=${tabId}`, { scroll: false });
    }
  };

  const loadPlans = async (options?: { silent?: boolean; forceAdvps?: boolean }) => {
    const silent = options?.silent ?? false;
    const forceAdvps = options?.forceAdvps ?? false;
    try {
      if (!silent) setIsLoading(true);
      setIsRefreshingStock(true);

      console.log("[IP Stock] ADVPS refresh-stock (sync + live check)…");
      try {
        const refreshUrl = forceAdvps
          ? "/api/advps/refresh-stock?force=1"
          : "/api/advps/refresh-stock";
        const refreshRes = await fetch(refreshUrl, { cache: "no-store" });
        const refreshBody = await refreshRes.json().catch(() => ({}));
        if (refreshRes.ok) {
          console.log("[IP Stock] ADVPS refresh OK", refreshBody);
        } else {
          console.warn("[IP Stock] ADVPS refresh failed", refreshRes.status, refreshBody);
        }
      } catch (e) {
        console.warn("[IP Stock] ADVPS refresh error", e);
      }

      console.log("[IP Stock] Reseller panel refresh-stock (wallet + pricing)…");
      try {
        const resellerRefreshRes = await fetch("/api/reseller-panel/refresh-stock", { cache: "no-store" });
        const resellerRefreshBody = await resellerRefreshRes.json().catch(() => ({}));
        if (resellerRefreshRes.ok) {
          console.log("[IP Stock] Reseller refresh OK", resellerRefreshBody);
        } else {
          console.warn("[IP Stock] Reseller refresh failed", resellerRefreshRes.status, resellerRefreshBody);
        }
      } catch (e) {
        console.warn("[IP Stock] Reseller refresh error", e);
      }

      // Netbay stock is synced on a schedule (cron) and at checkout — not on every page load
      // to avoid hitting NetBay's 120 stock-checks / 10 min rate limit.
      setIsRefreshingStock(false);

      const [ipRes, slotRes] = await Promise.all([
        fetch("/api/ipstock", { cache: "no-store" }),
        fetch("/api/slot-ips?view=customer", { cache: "no-store" }),
      ]);

      const ipData = await ipRes.json();
      const slotData = await slotRes.json();
      const ipRows: IPStock[] = (Array.isArray(ipData) ? ipData : []).filter(
        (s) => !s.hiddenFromStore
      );

      if (!ipRes.ok) {
        console.warn("[IP Stock] /api/ipstock HTTP", ipRes.status, ipData);
      } else {
        const advpsRows = ipRows.filter((s) => /^⚡/.test(String(s.name || "").trimStart())).length;
        console.log("[IP Stock] Loaded IP stocks", {
          total: ipRows.length,
          advpsRows,
          availableCount: ipRows.filter((s) => s.available).length,
        });
      }

      setIpStocks(ipRows);

      const availableSlots = (slotData || []).filter(
        (pkg: SlotIPPackage) => pkg.available && pkg.availableCount > 0
      );
      setSlotPackages(availableSlots);

      fetch("/api/smartvps/sync")
        .then(() => console.log("[IPSTOCK] SmartVPS sync completed in background"))
        .catch((err) => console.warn("[IPSTOCK] SmartVPS sync failed in background", err));
    } catch (error) {
      toast.error("Failed to load plans");
      console.error(error);
    } finally {
      if (!silent) setIsLoading(false);
      setIsRefreshingStock(false);
    }
  };

  // Refresh ADVPS + SmartVPS stock when user opens IP Stock
  useEffect(() => {
    loadPlans();
  }, []);

  // NEW: Filter and sort logic
  const getFilteredAndSortedStocks = () => {
    let filtered = ipStocks.filter((stock) => !stock.hiddenFromStore);

    // Filter by tab
    if (activeTab && activeTab !== 'all') {
      filtered = filtered.filter(stock => {
        if (stock.serverType === 'Windows & Linux') {
          return activeTab === 'Linux' || activeTab === 'VPS';
        }
        if (stock.tags.includes('ocean linux')) {
          return activeTab === 'Linux' || activeTab === 'VPS';
        }
        return stock.serverType === activeTab;
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(stock =>
        stock.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Price filter
    if (priceFilter !== 'all') {
      filtered = filtered.filter(stock => {
        const prices = Object.values(stock.memoryOptions)
          .filter(option => option.price !== null)
          .map(option => option.price!);

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

    // Sort: in-stock first, then user-selected order
    filtered.sort((a, b) => {
      const aInStock = isStockPurchasable(a) ? 0 : 1;
      const bInStock = isStockPurchasable(b) ? 0 : 1;
      if (aInStock !== bInStock) return aInStock - bInStock;

      switch (sortBy) {
        case 'price-low': {
          const aMinPrice = Math.min(...Object.values(a.memoryOptions).map(o => o.price || Infinity));
          const bMinPrice = Math.min(...Object.values(b.memoryOptions).map(o => o.price || Infinity));
          return aMinPrice - bMinPrice;
        }
        case 'price-high': {
          const aMaxPrice = Math.max(...Object.values(a.memoryOptions).map(o => o.price || 0));
          const bMaxPrice = Math.max(...Object.values(b.memoryOptions).map(o => o.price || 0));
          return bMaxPrice - aMaxPrice;
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  };

  // Use filtered stocks instead of original filteredIpStocks
  const filteredIpStocks = getFilteredAndSortedStocks();

  // Get counts for each tab
  const getCounts = () => {
    const all = ipStocks.length;
    const linux = ipStocks.filter(stock => 
      stock.serverType === 'Linux' || stock.serverType === 'Windows & Linux' || stock.tags.includes('ocean linux')
    ).length;
    const vps = ipStocks.filter(stock => 
      stock.serverType === 'VPS' || stock.serverType === 'Windows & Linux'
    ).length;
    const slot = slotPackages.length;
    return { all, linux, vps, slot };
  };

  const counts = getCounts();

  // Group stocks by tags
  const groupStocksByTags = (stocks: IPStock[]) => {
    const grouped: { [key: string]: IPStock[] } = {};
    const untagged: IPStock[] = [];

    stocks.forEach(stock => {
      if (!stock.tags || stock.tags.length === 0) {
        untagged.push(stock);
      } else {
        // Use the first tag as the primary grouping tag
        const primaryTag = stock.tags[0];
        if (!grouped[primaryTag]) {
          grouped[primaryTag] = [];
        }
        grouped[primaryTag].push(stock);
      }
    });

    return { grouped, untagged };
  };

  useEffect(() => {
    if (!showDialog) return;
    fetchWalletSummary().then((w) => {
      if (w) setWalletBalance(w.balance);
    });
  }, [showDialog]);

  const openOutOfStockPopup = (opts: {
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
      loadPlans({ silent: true, forceAdvps: true });
    }
  };

  const verifyLiveStock = async (payload: {
    ipStockId?: string;
    slotIpPackageId?: string;
    memory?: string;
  }) => {
    const res = await fetch('/api/ipstock/verify-purchase', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, message: data.message as string | undefined, data };
  };

  // Handle buy now with ipStockId (regular) or slotIpPackageId (slot)
  const handleBuyNow = async (
    productName: string,
    memory: string,
    price: number,
    ipStockId: string,
    slotIpPackageId?: string,
    stockAvailable = true
  ) => {
    if (!stockAvailable) {
      openOutOfStockPopup({
        message: 'This plan is currently out of stock. Please choose another plan or check back later.',
        productName,
        memory,
        refreshPlans: false,
        slot: !!slotIpPackageId,
      });
      return;
    }

    const verifyKey = slotIpPackageId || `${ipStockId}:${memory}`;
    setVerifyingPurchaseKey(verifyKey);
    try {
      const { ok, message } = await verifyLiveStock({
        ipStockId: slotIpPackageId ? undefined : ipStockId,
        slotIpPackageId,
        memory,
      });

      if (!ok) {
        openOutOfStockPopup({
          message: message || 'This plan is no longer available. Stock may have sold out while you were browsing.',
          productName,
          memory,
          slot: !!slotIpPackageId,
        });
        return;
      }

      setSelectedProduct({ name: productName, memory, price, ipStockId, slotIpPackageId });
      setPurchaseDisclaimerAccepted(false);
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
        slot: !!slotIpPackageId,
      });
    } finally {
      setVerifyingPurchaseKey(null);
    }
  };

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

    if (selectedProduct.slotIpPackageId) {
      body.slotIpPackageId = selectedProduct.slotIpPackageId;
    } else {
      body.ipStockId = selectedProduct.ipStockId;
    }

    const response = await fetch('/api/validate-promo', {
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
      const res = await fetch('/api/payment/cancel', {
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
      const liveCheck = await verifyLiveStock({
        ipStockId: selectedProduct.slotIpPackageId ? undefined : selectedProduct.ipStockId,
        slotIpPackageId: selectedProduct.slotIpPackageId,
        memory: selectedProduct.memory,
      });
      if (!liveCheck.ok) {
        setShowDialog(false);
        openOutOfStockPopup({
          message: liveCheck.message || 'This plan just went out of stock. Please refresh and pick another plan.',
          productName: selectedProduct.name,
          memory: selectedProduct.memory,
          slot: !!selectedProduct.slotIpPackageId,
        });
        setPaymentInitiating(false);
        return;
      }

      let checkoutPromo = { code: null as string | null, discount: 0, applied: false };
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
        paymentMethod: paymentMethod,
        useWallet,
      };

      if (selectedProduct.slotIpPackageId) {
        paymentBody.slotIpPackageId = selectedProduct.slotIpPackageId;
      } else {
        paymentBody.ipStockId = selectedProduct.ipStockId;
      }

      const res = await fetch("/api/payment/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentBody),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setShowDialog(false);
          openOutOfStockPopup({
            message: data.message || 'This plan is no longer available.',
            productName: selectedProduct.name,
            memory: selectedProduct.memory,
            refreshPlans: false,
            slot: !!selectedProduct.slotIpPackageId,
          });
          loadPlans({ silent: true, forceAdvps: true });
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

      // Check if backend used fallback
      if (data.fallbackUsed) {
        toast.info(`${data.originalMethod === 'cashfree' ? 'Cashfree' : 'Razorpay'} unavailable, using ${data.actualPaymentMethod === 'cashfree' ? 'Cashfree' : 'Razorpay'}`);
      }

      setShowDialog(false);

      // Use the actual payment method from backend (which may have used fallback)
      const actualMethod = data.actualPaymentMethod || paymentMethod;
      
      console.log(`[Payment] Using method: ${actualMethod}`);

      let primarySuccess = false;
      
      try {
        if (actualMethod === 'upi') {
          await handleUPIPayment(data);
          primarySuccess = true;
        } else if (actualMethod === 'cashfree') {
          await handleCashfreePayment(data);
          primarySuccess = true;
        } else {
          await handleRazorpayPayment(data);
          primarySuccess = true;
        }
      } catch (primaryError) {
        console.error(`[Payment] ${actualMethod} failed:`, primaryError);
        
        // Determine fallback method
        const fallbackMethods = ['upi', 'cashfree', 'razorpay'].filter(m => m !== actualMethod);
        const fallbackMethod = fallbackMethods[0];
        
        // Try fallback method
        const fallbackLabel = fallbackMethod === 'upi' ? 'UPI' : fallbackMethod === 'cashfree' ? 'Cashfree' : 'Razorpay';
        toast.info(`Switching to ${fallbackLabel}...`);
        
        try {
          const fallbackBody: Record<string, any> = {
              productName: selectedProduct.name,
              memory: selectedProduct.memory,
              price: finalPrice,
              originalPrice: selectedProduct.price,
              promoCode: checkoutPromo.applied ? checkoutPromo.code : null,
              promoDiscount: checkoutPromo.applied ? checkoutPromo.discount : 0,
              paymentMethod: fallbackMethod,
              useWallet,
            };
            if (selectedProduct.slotIpPackageId) {
              fallbackBody.slotIpPackageId = selectedProduct.slotIpPackageId;
            } else {
              fallbackBody.ipStockId = selectedProduct.ipStockId;
            }

          const fallbackRes = await fetch("/api/payment/create", {
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

            if (fallbackMethod === 'upi') {
              await handleUPIPayment(fallbackData);
            } else if (fallbackMethod === 'cashfree') {
              await handleCashfreePayment(fallbackData);
            } else {
              await handleRazorpayPayment(fallbackData);
            }
          } else {
            throw new Error(fallbackData.message || "Fallback payment failed");
          }
        } catch (fallbackError) {
          console.error(`[Payment] Fallback ${fallbackMethod} also failed:`, fallbackError);
          toast.error("Both payment methods failed. Please try again later.");
          setPaymentInitiating(false);
        }
      }

    } catch (error) {
      console.error("Error initiating payment:", error);
      toast.error("Something went wrong. Please try again");
      setPaymentInitiating(false);
    }
  };

  const handleCashfreePayment = async (data: any) => {
    // Check if Cashfree data exists
    if (!data.cashfree || !data.cashfree.payment_session_id) {
      console.error('[Cashfree] Missing cashfree data in response');
      throw new Error('Cashfree payment data missing');
    }

    // Check if Cashfree SDK is loaded
    if (typeof window.Cashfree === 'undefined') {
      console.error('[Cashfree] SDK not loaded');
      throw new Error('Cashfree SDK not available');
    }

    // Initialize Cashfree SDK
    const cashfree = await window.Cashfree({
      mode: process.env.NEXT_PUBLIC_CASHFREE_ENVIRONMENT || "production"
    });

    // Create checkout options
    const checkoutOptions = {
      paymentSessionId: data.cashfree.payment_session_id,
      returnUrl: `${window.location.origin}/payment/callback?client_txn_id=${data.clientTxnId}`,
    };

    console.log("[Cashfree] Opening checkout");

    // Open Cashfree checkout and AWAIT the result
    const result = await cashfree.checkout(checkoutOptions);
    
    if (result.error) {
      console.error("[Cashfree] Checkout error:", result.error);
      await cancelPendingPayment(data.clientTxnId);
      throw new Error('Cashfree checkout failed: ' + (result.error.message || 'Unknown error'));
    }

    if (!result.paymentDetails) {
      await cancelPendingPayment(data.clientTxnId);
      setPaymentInitiating(false);
      return;
    }

    if (result.paymentDetails) {
      toast.success("Payment successful! Processing order...");

      try {
        const confirmRes = await fetch("/api/payment/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientTxnId: data.clientTxnId,
            orderId: data.cashfree.order_id
          })
        });

        if (confirmRes.ok) {
          toast.success("Order confirmed! Redirecting...");
          router.push(`/payment/callback?client_txn_id=${data.clientTxnId}&order_id=${data.cashfree.order_id}`);
        } else {
          toast.error("Payment confirmed but order processing failed. Please contact support.");
          router.push(`/payment/callback?client_txn_id=${data.clientTxnId}&status=processing_failed`);
        }
      } catch (error) {
        console.error('[Cashfree] Error confirming payment:', error);
        toast.error("Payment successful but order confirmation failed. Please contact support.");
        router.push(`/payment/callback?client_txn_id=${data.clientTxnId}&status=confirmation_failed`);
      }
    }
  };

  const handleUPIPayment = async (data: any) => {
    console.log('[UPI] Starting payment initialization');
    console.log('[UPI] Payment data:', data);

    // Check if UPI data exists
    if (!data.upi) {
      console.error('[UPI] Missing upi object in response');
      throw new Error('UPI payment data missing');
    }

    if (!data.upi.payment_url) {
      console.error('[UPI] Missing payment_url in upi data');
      throw new Error('UPI payment URL missing');
    }

    console.log('[UPI] Redirecting to payment URL:', data.upi.payment_url);

    // Redirect to UPI Gateway payment page
    window.location.href = data.upi.payment_url;
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
          const confirmRes = await fetch("/api/payment/confirm", {
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
  ];

  const iconActiveClass: Record<string, string> = {
    all: 'bg-emerald-500 text-emerald-950',
    Linux: 'bg-emerald-500 text-emerald-950',
    VPS: 'bg-sky-400 text-sky-950',
    SlotIP: 'bg-orange-400 text-orange-950',
  };

  return (
    <div className="min-h-screen">
      {/* Promo — compact, polished */}
      <div className="relative overflow-hidden border-b mt-6 md:mt-0 premium-promo-strip">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-emerald-500/5" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
        <div className="container relative mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5">
          <div className="flex items-center justify-center gap-2.5 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Badge variant="outline" className={cn(premiumBadge.success, "h-5 px-1.5 gap-1 font-medium shadow-sm")}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
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

      <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400 mb-4" />
            <p className="text-white/50">Loading server plans...</p>
          </div>
        ) : (
          <div>
            {/* Category tabs — compact cards, responsive grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
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
                      isActive
                        ? cn("text-white ring-1 ring-emerald-400/20 scale-[1.01]", cat.activeClass)
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
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 border-white/15 bg-white/[0.04] text-white/70 hover:text-white hover:bg-white/[0.08]"
                    disabled={isRefreshingStock}
                    onClick={() => loadPlans({ silent: true, forceAdvps: true })}
                    title="Refresh stock from ADVPS"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingStock && "animate-spin")} />
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

            {/* Plan listings */}
            <div>
              {/* Slot IP Section */}
              {(activeTab === 'all' || activeTab === 'SlotIP') && slotPackages.length > 0 && (
                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-6 bg-orange-500 rounded-full"></div>
                    <h2 className="text-base font-semibold text-white">Premium IP Proxies</h2>
                    <Badge variant="outline" className="text-[10px] border-orange-400/40 bg-orange-500/15 text-orange-200 h-5 px-2">
                      {slotPackages.length} {slotPackages.length === 1 ? 'package' : 'packages'}
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
                        <div className="flex items-center gap-3 p-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-400/35 flex-shrink-0">
                            <Zap className="h-4 w-4 text-orange-300" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm md:text-base text-white">{pkg.name}</h3>
                              <Badge variant="outline" className="text-[10px] border-orange-400/35 bg-orange-500/15 text-orange-200 px-1.5 py-0 h-5">
                                Premium IP
                              </Badge>
                              {pkg.promoCodes && pkg.promoCodes.length > 0 && (
                                <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/15 text-amber-200 border-amber-400/35 px-1.5 py-0 h-5">
                                  <Tag className="h-2.5 w-2.5" />
                                  Promo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {pkg.description && (
                                <p className="text-xs text-white/45">{pkg.description}</p>
                              )}
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 bg-white/10 text-white/70 border-0">
                                <Package className="h-3 w-3" />
                                {pkg.availableCount} available
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="font-bold text-base md:text-lg text-white">₹{pkg.price}</p>
                              <p className="text-[10px] text-white/45">per IP</p>
                            </div>
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
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'SlotIP' && slotPackages.length === 0 && (
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

              {activeTab !== 'SlotIP' && filteredIpStocks.length === 0 ? (
                <Card className="text-center py-12 premium-dashboard-card border-0">
                  <CardContent>
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                      <AlertCircle className="h-8 w-8 text-white/40" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-white">No Plans Available</h3>
                    <p className="text-sm text-white/45 max-w-md mx-auto">
                      {searchTerm
                        ? `No servers match your search "${searchTerm}".`
                        : activeTab === 'all'
                        ? 'No server plans are currently available.'
                        : `No ${activeTab} plans are currently available.`
                      }
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
                  const { grouped, untagged } = groupStocksByTags(filteredIpStocks);
                  const tagKeys = Object.keys(grouped).sort();

                  return (
                    <div className="space-y-6">
                      {tagKeys.map(tag => (
                        <div key={tag} className="space-y-2">
                          <div className="flex items-center gap-2 px-1">
                            <div className="w-1 h-6 bg-emerald-400 rounded-full"></div>
                            <h2 className="text-base font-semibold capitalize text-white">{tag} Plans</h2>
                            <Badge variant="outline" className="text-[10px] border-white/15 bg-white/5 text-white/70 h-5 px-2">
                              {grouped[tag].length}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {grouped[tag].map((stock) => (
                              <CompactServerPlanRow
                                key={stock._id}
                                stock={stock}
                                onBuyNow={handleBuyNow}
                                verifyingPurchaseKey={verifyingPurchaseKey}
                              />
                            ))}
                          </div>
                        </div>
                      ))}

                      {untagged.length > 0 && (
                        <div className="space-y-2">
                          {tagKeys.length > 0 && (
                            <div className="flex items-center gap-2 px-1">
                              <div className="w-1 h-6 bg-white/25 rounded-full"></div>
                              <h2 className="text-base font-semibold text-white">Other Plans</h2>
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
              )}
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
                  <span>{selectedProduct.memory}</span>
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
                  {(['razorpay', 'upi', 'cashfree'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
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
    </div>
  );
}

// Modern Compact List Row Component
function CompactServerPlanRow({
  stock,
  onBuyNow,
  verifyingPurchaseKey,
}: {
  stock: IPStock;
  onBuyNow: (name: string, memory: string, price: number, id: string, slotIpPackageId?: string, stockAvailable?: boolean) => void | Promise<void>;
  verifyingPurchaseKey?: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inStock = isStockPurchasable(stock);
  const unitsLeft = getStockUnitsRemaining(stock);
  const showUnits = isCompanyStock(stock) && Number.isFinite(unitsLeft);
  const isNetbay = isNetbayLiveStock(stock);
  const isReseller = isResellerLiveStock(stock);

  const memoryOptions = Object.entries(stock.memoryOptions || {})
    .filter(([_, details]) => details.price !== null)
    .sort(([, a], [, b]) => (a.price || 0) - (b.price || 0));

  const hasPromoCodes = stock.promoCodes && stock.promoCodes.length > 0;
  const startingPrice = Math.min(...memoryOptions.map(([_, details]) => details.price || 0));

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
          "flex items-center gap-3 p-3 cursor-pointer",
          !inStock && "cursor-default"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
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
          ) : (
            <Server className="h-4 w-4 text-emerald-300" />
          )}
        </div>

        {/* Name & Type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn(
              "font-semibold text-sm md:text-base",
              inStock ? "text-white" : "text-white/45 line-through decoration-white/25"
            )}>
              {stock.name}
            </h3>
            <Badge variant="outline" className={cn(premiumBadge.neutral, "text-[10px] px-1.5 py-0 h-5")}>
              {stock.serverType}
            </Badge>
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
          <p className="text-xs text-white/45 mt-0.5">
            {!inStock
              ? 'Currently unavailable — check back later'
              : showUnits
              ? `${unitsLeft} unit${unitsLeft === 1 ? '' : 's'} left · ${memoryOptions.length} configuration${memoryOptions.length !== 1 ? 's' : ''}`
              : `${memoryOptions.length} configuration${memoryOptions.length !== 1 ? 's' : ''} available`}
          </p>
        </div>

        {/* Status + Price */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className={cn(
            "hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
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
          <div className="text-right">
            <p className="text-xs text-white/45">From</p>
            <p className={cn(
              "font-bold text-base md:text-lg",
              inStock ? "text-emerald-300" : "text-white/35"
            )}>
              ₹{startingPrice}
            </p>
          </div>
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-white/40 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Expanded Section - Configurations */}
      {isExpanded && (
        <div className="border-t border-white/10 bg-white/[0.02]">
          <div className="p-3 space-y-2">
            {memoryOptions.length > 0 ? (
              <>
                <p className="text-xs font-medium text-white/45 uppercase tracking-wide mb-3">
                  Select Configuration
                </p>
                <div className="space-y-2">
                  {memoryOptions.map(([memory, details]) => {
                    const memoryInStock = isStockPurchasable(stock, memory);
                    return (
                    <div
                      key={memory}
                      className={cn(
                        "flex items-center justify-between gap-3 p-2.5 rounded-md border transition-colors",
                        memoryInStock
                          ? "bg-white/[0.04] border-white/10 hover:border-emerald-400/35"
                          : "bg-white/[0.02] border-red-400/10 opacity-80"
                      )}
                    >
                      <span className={cn(
                        "text-sm font-medium flex-1",
                        memoryInStock ? "text-white/90" : "text-white/45"
                      )}>
                        {memory}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-bold text-base",
                          memoryInStock ? "text-emerald-300" : "text-white/35"
                        )}>
                          ₹{details.price}
                        </span>
                        <AddToCartButton
                          kind="ipstock"
                          ipStockId={stock._id}
                          memory={memory}
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5"
                          label="Cart"
                          disabled={!memoryInStock}
                        />
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBuyNow(stock.name, memory, details.price!, stock._id, undefined, memoryInStock);
                          }}
                          disabled={!memoryInStock || verifyingPurchaseKey === `${stock._id}:${memory}`}
                          className={cn(
                            "h-8 px-3 gap-1.5 border-0",
                            memoryInStock
                              ? "premium-btn-primary"
                              : "bg-red-500/15 text-red-300 hover:bg-red-500/20 cursor-not-allowed"
                          )}
                        >
                          {verifyingPurchaseKey === `${stock._id}:${memory}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : memoryInStock ? (
                            <Zap className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {verifyingPurchaseKey === `${stock._id}:${memory}`
                            ? 'Checking…'
                            : memoryInStock
                              ? 'Buy Now'
                              : 'Sold out'}
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
}
