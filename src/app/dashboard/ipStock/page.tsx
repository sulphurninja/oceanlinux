"use client";

import { useEffect, useState } from "react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ServerIcon,
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
  Clock,
  Shield,
  ChevronDown,
  ChevronRight,
  Package,
  Search,
  Filter,
  SlidersHorizontal,
  Copy
} from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Keep all existing interfaces and global declarations unchanged...

declare global {
  interface Window {
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
  serverType: string;
  tags: string[];
  memoryOptions: Record<string, MemoryOptionDetails>;
  promoCodes?: PromoCode[];
}

export default function IPStockPage() {
  const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    memory: string;
    price: number;
    ipStockId: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentInitiating, setPaymentInitiating] = useState(false);

  // NEW: Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [priceFilter, setPriceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");

  // Promo code states
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoMessage, setPromoMessage] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);

  // Tab filter state
  const [activeTab, setActiveTab] = useState<string>('all');

  const router = useRouter();

  // Fetch available IP stocks on mount
  useEffect(() => {
    const fetchIPStocks = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/ipstock");
        const data = await response.json();
        // Filter out unavailable/out-of-stock items immediately
        const availableStocks = data.filter((stock: IPStock) => stock.available);
        setIpStocks(availableStocks);
      } catch (error) {
        toast.error("Failed to load plans");
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchIPStocks();
  }, []);

  // NEW: Filter and sort logic
  const getFilteredAndSortedStocks = () => {
    let filtered = ipStocks;

    // Filter by tab
    if (activeTab !== 'all') {
      filtered = filtered.filter(stock => {
        // Handle "Windows & Linux" - show in both Linux and VPS tabs
        if (stock.serverType === 'Windows & Linux') {
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

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          const aMinPrice = Math.min(...Object.values(a.memoryOptions).map(o => o.price || Infinity));
          const bMinPrice = Math.min(...Object.values(b.memoryOptions).map(o => o.price || Infinity));
          return aMinPrice - bMinPrice;
        case 'price-high':
          const aMaxPrice = Math.max(...Object.values(a.memoryOptions).map(o => o.price || 0));
          const bMaxPrice = Math.max(...Object.values(b.memoryOptions).map(o => o.price || 0));
          return bMaxPrice - aMaxPrice;
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
    // Count "Windows & Linux" in both Linux and VPS tabs
    const linux = ipStocks.filter(stock => 
      stock.serverType === 'Linux' || stock.serverType === 'Windows & Linux'
    ).length;
    const vps = ipStocks.filter(stock => 
      stock.serverType === 'VPS' || stock.serverType === 'Windows & Linux'
    ).length;
    return { all, linux, vps };
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

  // Handle buy now with ipStockId
  const handleBuyNow = (productName: string, memory: string, price: number, ipStockId: string) => {
    setSelectedProduct({ name: productName, memory, price, ipStockId });
    setShowDialog(true);
    // Reset promo code states when opening dialog
    setPromoCode("");
    setPromoDiscount(0);
    setPromoMessage("");
    setPromoApplied(false);
  };

  // Update the validatePromoCode function
  const validatePromoCode = async () => {
    if (!promoCode.trim() || !selectedProduct) return;

    setPromoValidating(true);
    try {
      const response = await fetch("/api/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promoCode: promoCode.trim(),
          ipStockId: selectedProduct.ipStockId,
          productPrice: selectedProduct.price // Add product price for calculation
        })
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
    return Math.max(0, selectedProduct.price - promoDiscount); // Ensure price doesn't go below 0
  };


  const sanitizeForRazorpay = (str: string) => {
    // Remove or replace characters that Razorpay doesn't allow
    return str
      .replace(/[^\w\s\-\.]/g, '') // Keep only alphanumeric, spaces, hyphens, and dots
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim() // Remove leading/trailing spaces
      .substring(0, 255); // Limit length to 255 characters (Razorpay limit)
  };

  // Update the handleProceedToPayment function
  // Update the handleProceedToPayment function
  const handleProceedToPayment = async () => {
    if (!selectedProduct) return;

    setPaymentInitiating(true);
    try {
      const finalPrice = getDiscountedPrice();

      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: selectedProduct.name,
          memory: selectedProduct.memory,
          price: finalPrice,
          originalPrice: selectedProduct.price,
          promoCode: promoApplied ? promoCode : null,
          promoDiscount: promoApplied ? promoDiscount : 0,
          ipStockId: selectedProduct.ipStockId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to initiate payment");
        setPaymentInitiating(false);
        return;
      }

      // Store client transaction ID
      if (data.clientTxnId) {
        localStorage.setItem('lastClientTxnId', data.clientTxnId);
        console.log("Stored clientTxnId in localStorage:", data.clientTxnId);
      }

      // Sanitize all text fields for Razorpay
      const sanitizedDescription = sanitizeForRazorpay(`${selectedProduct.name} - ${selectedProduct.memory}`);
      const sanitizedCustomerName = sanitizeForRazorpay(data.customer.name);

      console.log("Original description:", `${selectedProduct.name} - ${selectedProduct.memory}`);
      console.log("Sanitized description:", sanitizedDescription);

      // Initialize Razorpay
      const options = {
        key: data.razorpay.key,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        name: 'OceanLinux',
        description: sanitizedDescription, // Use sanitized description
        order_id: data.razorpay.order_id,
        prefill: {
          name: sanitizedCustomerName, // Use sanitized customer name
          email: data.customer.email, // Email is usually safe but we can sanitize if needed
        },
        theme: {
          color: '#3b82f6'
        },
        handler: async function (response: any) {
          console.log('Payment successful:', response);
          toast.success("Payment successful! Processing order...");

          try {
            // Call your API to confirm payment and trigger provisioning
            const confirmRes = await fetch("/api/payment/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientTxnId: data.clientTxnId,
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
            console.log('Payment modal dismissed');
            setPaymentInitiating(false);
          }
        }
      };

      setShowDialog(false);

      const razorpay = new window.Razorpay(options);
      razorpay.open();

    } catch (error) {
      console.error("Error initiating payment:", error);
      toast.error("Something went wrong. Please try again");
      setPaymentInitiating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Modern Compact Header */}
         {/* Promo Banner */}
         <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-y border-primary/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                <Percent className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Special Discount Available</p>
                <p className="text-xs text-muted-foreground">Save on all server plans with our exclusive offer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-4 py-2 rounded-lg bg-background border border-border">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <code className="text-sm font-bold tracking-wider">OCEAN50</code>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText('OCEAN50');
                  toast.success('Promo code copied to clipboard!');
                }}
                className="h-9 gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Search & Filters Bar */}
      <div className="sticky sm:static top-[64px] sm:top-0 z-30 sm:z-0 bg-card/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search servers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 bg-background border-border"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap sm:items-center">
              <Select value={priceFilter} onValueChange={setPriceFilter}>
                <SelectTrigger className="w-[calc(50%-4px)] sm:w-32 h-9 text-xs border-border bg-background">
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
                <SelectTrigger className="w-[calc(50%-4px)] sm:w-28 h-9 text-xs border-border bg-background">
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
                  onClick={() => {
                    setSearchTerm("");
                    setPriceFilter("all");
                    setSortBy("name");
                  }}
                  className="h-9 px-3 text-xs w-full sm:w-auto"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

   

      {/* Main Content - Keep everything else exactly the same */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 md:py-6 ">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading server plans...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid h-9 grid-cols-3 w-full max-w-sm mx-auto bg-muted border border-border">
              <TabsTrigger value="all" className="flex items-center gap-1.5 text-xs">
                <Grid3X3 className="h-3.5 w-3.5" />
                All
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                  {counts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="Linux" className="flex items-center gap-1.5 text-xs">
                <Server className="h-3.5 w-3.5" />
                Linux
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                  {counts.linux}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="VPS" className="flex items-center gap-1.5 text-xs">
                <Cloud className="h-3.5 w-3.5" />
                VPS
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                  {counts.vps}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {filteredIpStocks.length === 0 ? (
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
                        onClick={() => {
                          setSearchTerm("");
                          setPriceFilter("all");
                          setSortBy("name");
                        }}
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
                      {/* Tagged Groups */}
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

                      {/* Untagged Plans */}
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
            </TabsContent>
          </Tabs>
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

            {/* Payment Info */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">Secure UPI Payment</p>
                    <p className="text-muted-foreground">
                      You'll be redirected to a secure payment gateway. Complete your payment using any UPI app
                      like PhonePe, Google Pay, Paytm, or your banking app.
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
              ) : (
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Pay ₹{getDiscountedPrice().toFixed(2)}
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
  onBuyNow: (name: string, memory: string, price: number, id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const memoryOptions = Object.entries(stock.memoryOptions || {})
    .filter(([_, details]) => details.price !== null)
    .sort(([, a], [, b]) => (a.price || 0) - (b.price || 0));

  const hasPromoCodes = stock.promoCodes && stock.promoCodes.length > 0;
  const startingPrice = Math.min(...memoryOptions.map(([_, details]) => details.price || 0));

  return (
    <div className="border border-border rounded-lg bg-card hover:bg-muted/30 transition-colors overflow-hidden">
      {/* Main Row - Always Visible */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-border flex-shrink-0">
          {stock.serverType === 'VPS' ? (
            <Cloud className="h-4 w-4 text-primary" />
          ) : (
            <Server className="h-4 w-4 text-primary" />
          )}
        </div>

        {/* Name & Type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm md:text-base">{stock.name}</h3>
            <Badge variant="outline" className="text-[10px] border-border px-1.5 py-0 h-5">
              {stock.serverType}
            </Badge>
            {hasPromoCodes && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-primary/10 text-green-500 border-primary/20 px-1.5 py-0 h-5">
                <Tag className="h-2.5 w-2.5" />
                Promo
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {memoryOptions.length} configuration{memoryOptions.length !== 1 ? 's' : ''} available
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
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-base">₹{details.price}</span>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBuyNow(stock.name, memory, details.price!, stock._id);
                          }}
                          className="h-8 px-3 gap-1.5"
                        >
                          <Zap className="h-3 w-3" />
                          Buy Now
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
