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
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import { cn } from "@/lib/utils";
import Link from "next/link";
import AddToCartButton from "@/components/cart/AddToCartButton";
import { fetchWalletSummary } from "@/lib/walletClient";

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
  stockCount?: number;
  company?: string | null;
  serverType: string;
  tags: string[];
  memoryOptions: Record<string, MemoryOptionDetails>;
  promoCodes?: PromoCode[];
}

function isCompanyStock(stock: IPStock) {
  return !!stock.company;
}

function getStockUnitsRemaining(stock: IPStock) {
  if (isCompanyStock(stock)) return Math.max(0, stock.stockCount ?? 0);
  return stock.available ? Number.POSITIVE_INFINITY : 0;
}

function isStockPurchasable(stock: IPStock) {
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
  const [showDialog, setShowDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    memory: string;
    price: number;
    ipStockId: string;
    slotIpPackageId?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentInitiating, setPaymentInitiating] = useState(false);

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

  // Fetch available IP stocks and Slot IP packages on mount
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setIsLoading(true);

        console.log("[IP Stock] ADVPS stock-check…");
        try {
          const scRes = await fetch("/api/advps/stock-check");
          const scBody = await scRes.json().catch(() => ({}));
          if (scRes.ok) {
            console.log("[IP Stock] ADVPS stock-check OK", scBody);
          } else {
            console.warn("[IP Stock] ADVPS stock-check failed", scRes.status, scBody);
          }
        } catch (e) {
          console.warn("[IP Stock] ADVPS stock-check error", e);
        }

        const [ipRes, slotRes] = await Promise.all([
          fetch("/api/ipstock"),
          fetch("/api/slot-ips?view=customer"),
        ]);

        const ipData = await ipRes.json();
        const slotData = await slotRes.json();
        const ipRows: IPStock[] = Array.isArray(ipData) ? ipData : [];

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

        setIsLoading(false);
        
        fetch("/api/smartvps/sync")
          .then(() => console.log('[IPSTOCK] SmartVPS sync completed in background'))
          .catch((err) => console.warn('[IPSTOCK] SmartVPS sync failed in background', err));
          
      } catch (error) {
        toast.error("Failed to load plans");
        console.error(error);
        setIsLoading(false);
      }
    };
    fetchAll();
  }, []);

  // NEW: Filter and sort logic
  const getFilteredAndSortedStocks = () => {
    let filtered = ipStocks;

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

  // Handle buy now with ipStockId (regular) or slotIpPackageId (slot)
  const handleBuyNow = (productName: string, memory: string, price: number, ipStockId: string, slotIpPackageId?: string, stockAvailable = true) => {
    if (!stockAvailable) {
      toast.error('This plan is currently out of stock');
      return;
    }
    setSelectedProduct({ name: productName, memory, price, ipStockId, slotIpPackageId });
    setShowDialog(true);
    setPromoCode("");
    setPromoDiscount(0);
    setPromoMessage("");
    setPromoApplied(false);
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim() || !selectedProduct) return;

    setPromoValidating(true);
    try {
      const body: Record<string, any> = {
        promoCode: promoCode.trim(),
        productPrice: selectedProduct.price,
      };

      if (selectedProduct.slotIpPackageId) {
        body.slotIpPackageId = selectedProduct.slotIpPackageId;
      } else {
        body.ipStockId = selectedProduct.ipStockId;
      }

      const response = await fetch("/api/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.valid) {
        setPromoDiscount(data.discountAmount); // Store the actual discount amount
        setPromoMessage(data.message);
        setPromoApplied(true);
        toast.success(data.message);
      } else {
        setPromoDiscount(0);
        setPromoMessage(data.message);
        setPromoApplied(false);
        toast.error(data.message);
      }
    } catch (error) {
      toast.error("Failed to validate promo code");
      setPromoDiscount(0);
      setPromoMessage("Error validating promo code");
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

    setPaymentInitiating(true);
    try {
      const finalPrice = getDiscountedPrice();

      const paymentBody: Record<string, any> = {
        productName: selectedProduct.name,
        memory: selectedProduct.memory,
        price: finalPrice,
        originalPrice: selectedProduct.price,
        promoCode: promoApplied ? promoCode : null,
        promoDiscount: promoApplied ? promoDiscount : 0,
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
        toast.error(data.message || "Failed to initiate payment");
        setPaymentInitiating(false);
        fetchWalletSummary().then((w) => { if (w) setWalletBalance(w.balance); }).catch(() => {});
        return;
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
              promoCode: promoApplied ? promoCode : null,
              promoDiscount: promoApplied ? promoDiscount : 0,
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
    console.log('[Razorpay] Starting payment initialization');
    console.log('[Razorpay] Payment data:', data);

    // Wait for Razorpay SDK to be loaded (with timeout)
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds total
    while (typeof window.Razorpay === 'undefined' && attempts < maxAttempts) {
      console.log(`[Razorpay] Waiting for SDK to load... (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    // Check if Razorpay SDK is loaded
    if (typeof window.Razorpay === 'undefined') {
      console.error('[Razorpay] SDK not loaded after waiting');
      throw new Error('Razorpay SDK not available');
    }

    console.log('[Razorpay] SDK loaded successfully');

    // Check if razorpay data exists in response
    if (!data.razorpay) {
      console.error('[Razorpay] Missing razorpay object in response');
      throw new Error('Razorpay payment data missing');
    }

    if (!data.razorpay.order_id) {
      console.error('[Razorpay] Missing order_id in razorpay data');
      throw new Error('Razorpay order ID missing');
    }

    console.log('[Razorpay] All checks passed, order_id:', data.razorpay.order_id);

    try {

      // Sanitize text for Razorpay
      const sanitizeForRazorpay = (text: string) => {
        if (!text) return '';
        return text.replace(/[^\w\s\-\.]/g, '').trim().substring(0, 255);
      };

      const options = {
        key: data.razorpay.key,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        name: 'OceanLinux',
        description: sanitizeForRazorpay(`${selectedProduct?.name} - ${selectedProduct?.memory}`),
        order_id: data.razorpay.order_id,
        prefill: {
          name: sanitizeForRazorpay(data.customer.name),
          email: data.customer.email,
        },
        theme: {
          color: '#3b82f6'
        },
        handler: async function (response: any) {
          console.log('Razorpay payment successful:', response);
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
                razorpay_signature: response.razorpay_signature
              })
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
        modal: {
          ondismiss: function () {
            console.log('Razorpay payment modal dismissed');
            setPaymentInitiating(false);
            cancelPendingPayment(data.clientTxnId);
          }
        }
      };

      console.log('[Razorpay] Creating Razorpay instance with options:', { 
        ...options, 
        key: options.key ? '***' + options.key.slice(-4) : 'MISSING',
        amount: options.amount,
        order_id: options.order_id
      });

      const razorpay = new window.Razorpay(options);
      console.log('[Razorpay] Instance created successfully, opening modal');
      razorpay.open();

    } catch (error: any) {
      console.error("[Razorpay] Error:", error);
      throw new Error('Razorpay initialization failed: ' + (error?.message || 'Unknown error'));
    }
  };

  const categoryCards = [
    { id: 'all', Icon: Grid3X3, label: 'All Plans', shortLabel: 'All', count: counts.all + counts.slot, activeClass: 'border-primary/40 bg-primary/5 shadow-sm shadow-primary/10' },
    { id: 'Linux', Icon: Server, label: 'Linux Servers', shortLabel: 'Linux', count: counts.linux, activeClass: 'border-emerald-500/40 bg-emerald-500/5 shadow-sm shadow-emerald-500/10' },
    { id: 'VPS', Icon: Cloud, label: 'Windows VPS', shortLabel: 'Windows', count: counts.vps, activeClass: 'border-sky-500/40 bg-sky-500/5 shadow-sm shadow-sky-500/10' },
    { id: 'SlotIP', Icon: Zap, label: 'Premium IP Proxies', shortLabel: 'Proxies', count: counts.slot, activeClass: 'border-orange-500/40 bg-orange-500/5 shadow-sm shadow-orange-500/10' },
  ];

  const iconActiveClass: Record<string, string> = {
    all: 'bg-primary text-primary-foreground',
    Linux: 'bg-emerald-500 text-white',
    VPS: 'bg-sky-500 text-white',
    SlotIP: 'bg-orange-500 text-white',
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Promo — compact, polished */}
      <div className="relative overflow-hidden border-b mt-6 md:mt-0 border-primary/15">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/12 via-transparent to-primary/8" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="container relative mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5">
          <div className="flex items-center justify-center gap-2.5 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Badge variant="outline" className="h-5 px-1.5 gap-1 border-green-500/35 bg-green-500/10 text-green-600 dark:text-green-400 font-medium shadow-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                Live
              </Badge>
              <span className="text-muted-foreground hidden min-[380px]:inline">Limited offer</span>
              <span className="font-semibold text-foreground">Save on every plan</span>
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground/70 dark:text-primary shrink-0 animate-pulse" />
            </div>
            <div className="h-3.5 w-px bg-gradient-to-b from-transparent via-border to-transparent hidden sm:block" />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText('OCEAN50');
                toast.success('Promo code OCEAN50 copied!');
              }}
              className="group flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full border border-primary/40 bg-gradient-to-r from-primary/20 to-primary/10 dark:from-primary/25 dark:to-primary/15 hover:from-primary/30 hover:to-primary/20 hover:border-primary/60 hover:shadow-md hover:shadow-primary/15 transition-all duration-200 active:scale-[0.98]"
            >
              <Percent className="h-3 w-3 text-primary-foreground/80 dark:text-primary-foreground group-hover:text-primary-foreground shrink-0" />
              <code className="text-[11px] sm:text-xs font-semibold tracking-[0.12em] text-primary-foreground dark:text-primary-foreground">OCEAN50</code>
              <Copy className="h-3 w-3 text-primary-foreground/60 dark:text-primary-foreground/70 group-hover:text-primary-foreground transition-colors shrink-0" />
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading server plans...</p>
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
                        ? cn("text-foreground ring-1 ring-primary/15 scale-[1.01] shadow-sm", cat.activeClass)
                        : "border-border/80 bg-card/80 text-muted-foreground hover:border-primary/25 hover:bg-muted/40 hover:text-foreground hover:shadow-sm"
                    )}
                  >
                    <span className={cn(
                      "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200",
                      isActive ? iconActiveClass[cat.id] : "bg-muted/80 text-muted-foreground"
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
                        "text-[10px] h-4 min-w-[1.25rem] px-1 justify-center shrink-0 tabular-nums",
                        isActive && "bg-background/80 text-foreground font-semibold"
                      )}
                    >
                      {cat.count}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {/* Search & filters — compact toolbar */}
            <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 backdrop-blur-sm p-2 sm:p-2.5 mb-4 sm:mb-5 shadow-sm">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search servers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-9 text-sm bg-background/90 border-border/70 focus-visible:ring-primary/25"
                  />
                </div>
                <div className="flex gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap sm:items-center">
                  <Select value={priceFilter} onValueChange={setPriceFilter}>
                    <SelectTrigger className="flex-1 sm:flex-none sm:w-[7.5rem] h-9 text-xs bg-background/90 border-border/70">
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
                    <SelectTrigger className="flex-1 sm:flex-none sm:w-[6.5rem] h-9 text-xs bg-background/90 border-border/70">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="price-low">Low Price</SelectItem>
                      <SelectItem value="price-high">High Price</SelectItem>
                    </SelectContent>
                  </Select>
                  {(searchTerm || priceFilter !== 'all' || sortBy !== 'name') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearchTerm(""); setPriceFilter("all"); setSortBy("name"); }}
                      className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    asChild
                    size="sm"
                    className="h-9 gap-1.5 px-3 bg-gradient-to-r from-primary to-primary/85 hover:from-primary/95 hover:to-primary/75 text-primary-foreground shadow-sm hover:shadow-md hover:shadow-primary/20 transition-all sm:ml-auto"
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
                    <h2 className="text-base font-semibold">Premium IP Proxies</h2>
                    <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/5 text-orange-600 h-5 px-2">
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
                      <div key={pkg._id} className="border border-border rounded-lg bg-card hover:bg-muted/30 transition-colors overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20 flex-shrink-0">
                            <Zap className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm md:text-base">{pkg.name}</h3>
                              <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/5 text-orange-600 px-1.5 py-0 h-5">
                                Premium IP
                              </Badge>
                              {pkg.promoCodes && pkg.promoCodes.length > 0 && (
                                <Badge variant="outline" className="text-[10px] gap-1 bg-primary/10 text-green-500 border-primary/20 px-1.5 py-0 h-5">
                                  <Tag className="h-2.5 w-2.5" />
                                  Promo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {pkg.description && (
                                <p className="text-xs text-muted-foreground">{pkg.description}</p>
                              )}
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1">
                                <Package className="h-3 w-3" />
                                {pkg.availableCount} available
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="font-bold text-base md:text-lg">₹{pkg.price}</p>
                              <p className="text-[10px] text-muted-foreground">per IP</p>
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
                              className="h-8 px-3 gap-1.5"
                              disabled={pkg.availableCount === 0}
                            >
                              <Zap className="h-3 w-3" />
                              Buy Now
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'SlotIP' && slotPackages.length === 0 && (
                <Card className="text-center py-12 border-border">
                  <CardContent>
                    <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Zap className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Premium IP Proxies Available</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Premium IP proxy packages are currently unavailable. Check back soon!
                    </p>
                  </CardContent>
                </Card>
              )}

              {activeTab !== 'SlotIP' && filteredIpStocks.length === 0 ? (
                <Card className="text-center py-12 border-border">
                  <CardContent>
                    <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Plans Available</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
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
                            <div className="w-1 h-6 bg-primary rounded-full"></div>
                            <h2 className="text-base font-semibold capitalize">{tag} Plans</h2>
                            <Badge variant="outline" className="text-[10px] border-border h-5 px-2">
                              {grouped[tag].length}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {grouped[tag].map((stock) => (
                              <CompactServerPlanRow
                                key={stock._id}
                                stock={stock}
                                onBuyNow={handleBuyNow}
                              />
                            ))}
                          </div>
                        </div>
                      ))}

                      {untagged.length > 0 && (
                        <div className="space-y-2">
                          {tagKeys.length > 0 && (
                            <div className="flex items-center gap-2 px-1">
                              <div className="w-1 h-6 bg-muted rounded-full"></div>
                              <h2 className="text-base font-semibold">Other Plans</h2>
                              <Badge variant="outline" className="text-[10px] border-border h-5 px-2">
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
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="h-fit max-h-screen m-auto max-w-6xl overflow-y-scroll scrollbar-hide">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Complete Your Purchase
            </DialogTitle>
            <DialogDescription>
              Review your order and apply any promo codes before proceeding to payment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Order Summary */}
            {selectedProduct && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Plan:</span>
                    <span className="font-medium">{selectedProduct.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Configuration:</span>
                    <span className="font-medium">{selectedProduct.memory}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Original Price:</span>
                    <span className={cn("font-medium", promoApplied && "line-through text-muted-foreground")}>
                      ₹{selectedProduct.price}
                    </span>
                  </div>
                  {promoApplied && (
                    <div className="flex justify-between text-sm text-primary">
                      <span className="flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        Discount:
                      </span>
                      <span className="font-medium">-₹{promoDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-semibold">Total:</span>
                    <span className="text-lg font-bold text-white">₹{getDiscountedPrice().toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Promo Code Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Promo Code
                </CardTitle>
                <CardDescription>Have a promo code? Apply it to get a discount!</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    disabled={promoApplied}
                    className="flex-1"
                  />
                  {!promoApplied ? (
                    <Button
                      onClick={validatePromoCode}
                      disabled={!promoCode.trim() || promoValidating}
                      variant="secondary"
                    >
                      {promoValidating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Apply"
                      )}
                    </Button>
                  ) : (
                    <Button onClick={removePromoCode} variant="destructive">
                      Remove
                    </Button>
                  )}
                </div>
                {promoMessage && (
                  <p className={cn(
                    "text-xs mt-2",
                    promoApplied ? "text-primary" : "text-destructive"
                  )}>
                    {promoMessage}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Wallet balance */}
            <Card className="border-primary/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <WalletIcon className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Use wallet balance</p>
                      <p className="text-xs text-muted-foreground">
                        Available: ₹{walletBalance.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={useWallet}
                    onCheckedChange={setUseWallet}
                    disabled={walletBalance <= 0 || paymentInitiating}
                  />
                </div>
                {useWallet && paymentTotals.walletApplied > 0 && (
                  <div className="mt-3 space-y-1 text-sm border-t border-border/60 pt-3">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Order total</span>
                      <span>₹{paymentTotals.total.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>From wallet</span>
                      <span>−₹{paymentTotals.walletApplied.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>{paymentTotals.gatewayCharge > 0 ? 'Pay via gateway' : 'Fully covered by wallet'}</span>
                      <span>₹{paymentTotals.gatewayCharge.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                )}
                {walletBalance < paymentTotals.total && useWallet && paymentTotals.gatewayCharge > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Only ₹{paymentTotals.gatewayCharge.toLocaleString('en-IN')} will be charged on {paymentMethod === 'upi' ? 'UPI' : paymentMethod === 'cashfree' ? 'Cashfree' : 'Razorpay'}.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Payment Method Selection - Inline & Minimal */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {paymentTotals.gatewayCharge > 0 ? 'Pay remainder via:' : 'Payment method:'}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPaymentMethod('razorpay')}
                  disabled={paymentTotals.gatewayCharge === 0}
                  className={cn(
                    "px-3 py-1.5 rounded-md border transition-all text-xs font-medium",
                    paymentMethod === 'razorpay'
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50",
                    paymentTotals.gatewayCharge === 0 && "opacity-40 cursor-not-allowed"
                  )}
                >
                  Razorpay
                </button>
                <button
                  onClick={() => setPaymentMethod('upi')}
                  disabled={paymentTotals.gatewayCharge === 0}
                  className={cn(
                    "px-3 py-1.5 rounded-md border transition-all text-xs font-medium",
                    paymentMethod === 'upi'
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50",
                    paymentTotals.gatewayCharge === 0 && "opacity-40 cursor-not-allowed"
                  )}
                >
                  UPI
                </button>
                <button
                  onClick={() => setPaymentMethod('cashfree')}
                  disabled={paymentTotals.gatewayCharge === 0}
                  className={cn(
                    "px-3 py-1.5 rounded-md border transition-all text-xs font-medium",
                    paymentMethod === 'cashfree'
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50",
                    paymentTotals.gatewayCharge === 0 && "opacity-40 cursor-not-allowed"
                  )}
                >
                  Cashfree
                </button>
              </div>
            </div>

            {/* Payment Info */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">Secure Payment</p>
                    <p className="text-muted-foreground">
                      {paymentTotals.gatewayCharge > 0
                        ? `You'll pay ₹${paymentTotals.gatewayCharge.toLocaleString('en-IN')} via the gateway${paymentTotals.walletApplied > 0 ? ` (₹${paymentTotals.walletApplied.toLocaleString('en-IN')} from wallet)` : ''}.`
                        : 'Your wallet balance covers the full order amount.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={paymentInitiating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProceedToPayment}
              disabled={paymentInitiating}
              className="flex-1 sm:flex-none"
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
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Pay ₹{paymentTotals.gatewayCharge.toLocaleString('en-IN')}
                  {paymentTotals.walletApplied > 0 && (
                    <span className="text-xs opacity-80">(+ ₹{paymentTotals.walletApplied.toLocaleString('en-IN')} wallet)</span>
                  )}
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Modern Compact List Row Component
function CompactServerPlanRow({
  stock,
  onBuyNow
}: {
  stock: IPStock;
  onBuyNow: (name: string, memory: string, price: number, id: string, slotIpPackageId?: string, stockAvailable?: boolean) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inStock = isStockPurchasable(stock);
  const unitsLeft = getStockUnitsRemaining(stock);
  const showUnits = isCompanyStock(stock) && Number.isFinite(unitsLeft);

  const memoryOptions = Object.entries(stock.memoryOptions || {})
    .filter(([_, details]) => details.price !== null)
    .sort(([, a], [, b]) => (a.price || 0) - (b.price || 0));

  const hasPromoCodes = stock.promoCodes && stock.promoCodes.length > 0;
  const startingPrice = Math.min(...memoryOptions.map(([_, details]) => details.price || 0));

  return (
    <div className={cn(
      "border border-border rounded-lg bg-card transition-colors overflow-hidden",
      inStock ? "hover:bg-muted/30" : "opacity-75"
    )}>
      {/* Main Row - Always Visible */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Icon */}
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center border border-border flex-shrink-0",
          inStock ? "bg-primary/10" : "bg-muted/50"
        )}>
          {stock.serverType === 'VPS' ? (
            <Cloud className={cn("h-4 w-4", inStock ? "text-primary" : "text-muted-foreground")} />
          ) : (
            <Server className={cn("h-4 w-4", inStock ? "text-primary" : "text-muted-foreground")} />
          )}
        </div>

        {/* Name & Type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm md:text-base">{stock.name}</h3>
            <Badge variant="outline" className="text-[10px] border-border px-1.5 py-0 h-5">
              {stock.serverType}
            </Badge>
            {!inStock && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-red-500/10 text-red-600 border-red-500/20 px-1.5 py-0 h-5">
                Out of stock
              </Badge>
            )}
            {inStock && showUnits && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-700 border-emerald-500/20 px-1.5 py-0 h-5">
                {unitsLeft} in stock
              </Badge>
            )}
            {inStock && hasPromoCodes && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-primary/10 text-green-500 border-primary/20 px-1.5 py-0 h-5">
                <Tag className="h-2.5 w-2.5" />
                Promo
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {!inStock
              ? 'Currently unavailable — check back later'
              : showUnits
              ? `${unitsLeft} unit${unitsLeft === 1 ? '' : 's'} left · ${memoryOptions.length} configuration${memoryOptions.length !== 1 ? 's' : ''}`
              : `${memoryOptions.length} configuration${memoryOptions.length !== 1 ? 's' : ''} available`}
          </p>
        </div>

        {/* Price & Expand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">From</p>
            <p className="font-bold text-base md:text-lg">₹{startingPrice}</p>
          </div>
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Expanded Section - Configurations */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/20">
          <div className="p-3 space-y-2">
            {memoryOptions.length > 0 ? (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Select Configuration
                </p>
                <div className="space-y-2">
                  {memoryOptions.map(([memory, details]) => (
                    <div
                      key={memory}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-background border border-border hover:border-primary/50 transition-colors"
                    >
                      <span className="text-sm font-medium flex-1">{memory}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">₹{details.price}</span>
                        <AddToCartButton
                          kind="ipstock"
                          ipStockId={stock._id}
                          memory={memory}
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5"
                          label="Cart"
                          disabled={!inStock}
                        />
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBuyNow(stock.name, memory, details.price!, stock._id, undefined, inStock);
                          }}
                          disabled={!inStock}
                          className="h-8 px-3 gap-1.5"
                        >
                          <Zap className="h-3 w-3" />
                          {inStock ? 'Buy Now' : 'Out of stock'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {hasPromoCodes && (
                  <div className="mt-3 p-2 rounded-md bg-primary/10 border border-primary/20">
                    <p className="text-xs text-primary flex items-center gap-1.5">
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
