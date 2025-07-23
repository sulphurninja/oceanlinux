"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
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
  ServerIcon,
  Check,
  X,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
  CreditCard
} from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

// Validation schema for transaction ID
const transactionSchema = z.object({
  transactionId: z
    .string()
    .min(12, "Transaction ID must be at least 12 characters")
    .max(50, "Transaction ID is too long")
    .regex(
      /^[0-9]{12,}$|^[A-Za-z0-9]{12,}$|^[A-Za-z0-9]{8,}-[A-Za-z0-9]{4,}$/,
      "Please enter a valid UPI Transaction ID/Reference Number"
    )
    .refine(
      (val) => {
        // Additional check for common patterns
        const commonPatterns = [
          /^\d{12,}$/, // Pure numeric (12+ digits)
          /^[A-Za-z0-9]{8,}-[A-Za-z0-9]{4,}$/, // Format with hyphen
          /^UPI[A-Za-z0-9]{10,}$/, // Starting with UPI
          /^[A-Za-z]{3,}[A-Za-z0-9]{9,}$/ // Starting with bank code
        ];
        return commonPatterns.some(pattern => pattern.test(val));
      },
      {
        message: "Transaction ID format doesn't match a standard UPI reference number"
      }
    )
});


interface MemoryOptionDetails {
  price: number | null;
}

interface IPStock {
  _id: string;
  name: string;
  description?: string;
  available: boolean;
  memoryOptions: Record<string, MemoryOptionDetails>;
}

export default function IPStockPage() {
  const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    memory: string;
    price: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Add these state variables inside your component
  const [paymentInitiating, setPaymentInitiating] = useState(false);
  const router = useRouter();

  // Fetch available IP stocks on mount
  useEffect(() => {
    const fetchIPStocks = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/ipstock");
        const data = await response.json();
        setIpStocks(data);
      } catch (error) {
        toast.error("Failed to load plans");
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchIPStocks();
  }, []);

  // Toggle expanded state for a list item
  const toggleExpanded = (id: string) => {
    setExpandedItem(expandedItem === id ? null : id);
  };

  // Replace the handleBuyNow function with this one
  const handleBuyNow = (productName: string, memory: string, price: number) => {
    setSelectedProduct({ name: productName, memory, price });
    setShowDialog(true);
  };

  // Replace the existing handleSubmitTransactionId with this function
  const handleProceedToPayment = async () => {
    if (!selectedProduct) return;

    setPaymentInitiating(true);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: selectedProduct.name,
          memory: selectedProduct.memory,
          price: selectedProduct.price
        })
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to initiate payment");
        setPaymentInitiating(false);
        return;
      }

      // Close the dialog and redirect to payment URL
      setShowDialog(false);

      // You can either redirect to the payment URL
      window.location.href = data.paymentUrl;

      // Or open in a new tab
      // window.open(data.paymentUrl, "_blank");

    } catch (error) {
      console.error("Error initiating payment:", error);
      toast.error("Something went wrong. Please try again");
      setPaymentInitiating(false);
    }
  };
  // Get a short version of the description
  const getShortDescription = (text: string) => {
    if (!text) return "";
    return text.split(". ")[0] + (text.includes(". ") ? "..." : "");
  };

  return (
    <div className="w-full min-h-full text-white bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 p-4">
        <div className="flex items-center gap-2">
          <ServerIcon className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-semibold">Linux Server Plans</h1>
        </div>
      </div>

      {/* Main Content - Compact List Layout */}
      <div className="max-w-5xl mx-auto p-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {ipStocks.length === 0 ? (
              <div className="text-center py-8 bg-gray-800/50 rounded-lg border border-gray-700">
                <AlertCircle className="h-10 w-10 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-400">No server plans available at this time</p>
              </div>
            ) : (
              <div className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden">
                <div className="grid grid-cols-12 p-4 text-xs uppercase text-gray-500 font-medium border-b border-gray-700/50">
                  <div className="col-span-5 sm:col-span-6">Plan</div>
                  <div className="col-span-3 sm:col-span-2 text-center">Status</div>
                  <div className="col-span-4 sm:col-span-4 text-right pr-2">Actions</div>
                </div>

                {ipStocks.map((stock) => {
                  const isExpanded = expandedItem === stock._id;
                  const memoryKeys = Object.keys(stock.memoryOptions || {});
                  const shortDesc = getShortDescription(stock.description || "");

                  return (
                    <div key={stock._id} className="border-b border-gray-700/50 last:border-b-0">
                      {/* Main Row - Always visible */}
                      <div
                        className={cn(
                          "grid grid-cols-12 p-4 items-center hover:bg-gray-800/60 transition-colors cursor-pointer",
                          isExpanded && "bg-gray-800/40"
                        )}
                        onClick={() => toggleExpanded(stock._id)}
                      >
                        <div className="col-span-5 sm:col-span-6">
                          <div className="flex items-center gap-3">
                            <div className="text-blue-500">
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>
                            <div>
                              <h3 className="font-medium text-white">{stock.name}</h3>
                              <p className="text-sm text-gray-400 mt-0.5 hidden sm:block">
                                {shortDesc}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-3 sm:col-span-2 flex justify-center">
                          <Badge
                            variant={stock.available ? "outline" : "destructive"}
                            className={cn(
                              "text-xs h-6",
                              stock.available ? "border-green-500 text-green-400" : ""
                            )}
                          >
                            {stock.available ? (
                              <span className="flex items-center gap-1">
                                <Check className="h-3 w-3" /> Available
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <X className="h-3 w-3" /> Sold Out
                              </span>
                            )}
                          </Badge>
                        </div>

                        <div className="col-span-4 sm:col-span-4 text-right pr-2">
                          <span className="text-xs text-gray-400">
                            {memoryKeys.length} configurations available
                          </span>
                        </div>
                      </div>

                      {/* Expanded Section - Memory Options */}
                      {isExpanded && (
                        <div className="p-4 pt-0 bg-gray-800/10">
                          <div className="pl-8 mb-2">
                            <p className="text-sm text-gray-300">{stock.description}</p>
                          </div>

                          <div className="mt-3 pl-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {memoryKeys.map((memKey) => {
                              const priceObj = stock.memoryOptions[memKey];
                              return (
                                <Card
                                  key={memKey}
                                  className={cn(
                                    "bg-gray-800 border-gray-700",
                                    priceObj?.price === null && "opacity-60"
                                  )}
                                >
                                  <CardContent className="p-3 flex justify-between items-center">
                                    <div>
                                      <h4 className="font-medium">{memKey}</h4>
                                      {priceObj?.price !== null ? (
                                        <div className="text-blue-400 font-bold">₹{priceObj.price}</div>
                                      ) : (
                                        <div className="text-gray-500 text-sm">Not available</div>
                                      )}
                                    </div>

                                    {priceObj?.price !== null && (
                                      <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700 h-8 px-3"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleBuyNow(stock.name, memKey, priceObj.price!);
                                        }}
                                        disabled={!stock.available}
                                      >
                                        <CreditCard className="h-3.5 w-3.5 mr-1" />
                                        Buy
                                      </Button>
                                    )}
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>


      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-gray-800 h-fit max-h-screen m-auto overflow-y-scroll border border-gray-700 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Complete Your Purchase</DialogTitle>
            <DialogDescription className="text-gray-300">
              Proceed to UPI payment gateway to complete your order
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Order summary */}
            {selectedProduct && (
              <div className="bg-gray-700/40 p-3 rounded-lg">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Plan:</span>
                    <span>{selectedProduct.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Memory:</span>
                    <span>{selectedProduct.memory}</span>
                  </div>
                  <Separator className="my-2 bg-gray-600" />
                  <div className="flex justify-between font-medium">
                    <span>Total:</span>
                    <span className="text-lg text-blue-400">₹{selectedProduct.price}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-700/50">
              <div className="flex gap-2">
                <Info className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <p className="text-sm text-blue-200">
                  You will be redirected to a secure UPI payment page. Complete the payment using any UPI app like PhonePe, Google Pay, or others.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Cancel
            </Button>

            <Button
              onClick={handleProceedToPayment}
              disabled={paymentInitiating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {paymentInitiating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Proceed to Payment
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}