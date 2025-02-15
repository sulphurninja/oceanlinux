"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from "@/components/ui/tabs";
import { ServerIcon } from "lucide-react";

/** Convert a paragraph-style description into bullet points.
 *  This splits on the period + space (". ").
 *  Adjust if you need more sophisticated splitting.
 */
function toBulletPoints(text: string) {
  if (!text) return [];
  const rawPoints = text.split(". ");
  // Trim each point and remove empty strings
  const finalPoints = rawPoints.map((p) => p.trim()).filter(Boolean);
  return finalPoints;
}

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

declare global {
  interface Window {
    Cashfree: any;
  }
}

export default function IPStockPage() {
  const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
  const router = useRouter();

  useEffect(() => {
    const loadCashfreeScript = () => {
      return new Promise((resolve, reject) => {
        if (window.Cashfree) {
          console.log("Cashfree SDK already loaded");
          resolve(true);
          return;
        }

        const script = document.createElement("script");
        script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
        script.async = true;
        script.onload = () => {
          console.log("Cashfree SDK Loaded");
          resolve(true);
        };
        script.onerror = () => {
          console.error("Failed to load Cashfree SDK");
          reject(false);
        };

        document.body.appendChild(script);
      });
    };
    loadCashfreeScript();
  }, []);

  const handleBuyNow = async (productName: string, memory: string, price: number) => {
    if (!price) {
      toast.error("No price set for this plan.");
      return;
    }
    try {
      const orderResponse = await fetch("/api/createOrder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, memory, price })
      });

      const orderData = await orderResponse.json();

      if (!orderData || !orderData.paymentSessionId) {
        toast.error("Failed to initiate payment.");
        return;
      }

      console.log("🔗 Redirecting to Cashfree Hosted Checkout:", orderData.paymentSessionId);

      if (typeof window !== "undefined" && window.Cashfree) {
        const cashfree = window.Cashfree({ mode: "production" });
        // use "sandbox" if testing
        cashfree.checkout({
          paymentSessionId: orderData.paymentSessionId,
          redirectTarget: "_self"
        });
      } else {
        console.error("❌ Cashfree SDK not loaded.");
        toast.error("Payment gateway not loaded. Please refresh the page.");
      }
    } catch (error) {
      console.error("❌ Payment Error:", error);
      toast.error("Something went wrong.");
    }
  };

  useEffect(() => {
    const fetchIPStocks = async () => {
      const response = await fetch("/api/ipstock");
      const data = await response.json();
      setIpStocks(data);
    };
    fetchIPStocks();
  }, []);

  return (
    <div className="w-full min-h-full  text-white">
      {/* Header / Title */}
      <div className="flex items-center gap-2 border-b border-gray-700 p-4">
        <ServerIcon />
        <h1 className="text-xl font-semibold">Our Linux Plans</h1>
      </div>

      {/* Single-column Cards Grid */}
      <div className="grid md:grid-cols-2 gap-6 px-4 py-8">
        {ipStocks.map((stock) => {
          const memoryKeys = Object.keys(stock.memoryOptions || {});
          // Turn the paragraph into bullet points
          const bulletPoints = toBulletPoints(stock.description || "");

          return (
            <Card key={stock._id} className="bg-gray-800 border border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg font-bold">
                  {stock.name}
                </CardTitle>

                {bulletPoints.length > 0 && (
                  <CardDescription className="text-gray-400 mt-2">
                    <ul className="list-disc list-inside space-y-1 text-sm leading-5">
                      {bulletPoints.map((point, idx) => (
                        <li key={idx}>{point.endsWith(".") ? point : `${point}.`}</li>
                      ))}
                    </ul>
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {/* Availability */}
                <p className="mb-4 text-sm">
                  Availability:{" "}
                  <span className={stock.available ? "text-green-400" : "text-red-400"}>
                    {stock.available ? "In Stock" : "Out of Stock"}
                  </span>
                </p>

                {/* Memory Options in Tabs */}
                {memoryKeys.length > 0 ? (
                  <Tabs defaultValue={memoryKeys[0]} className="w-full">
                    <TabsList className="bg-gray-700 rounded-lg p-1 flex">
                      {memoryKeys.map((memKey) => (
                        <TabsTrigger
                          key={memKey}
                          value={memKey}
                          className="px-4 py-1 text-white text-sm hover:bg-gray-600"
                        >
                          {memKey}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {memoryKeys.map((memKey) => {
                      const priceObj = stock.memoryOptions[memKey];
                      return (
                        <TabsContent
                          key={memKey}
                          value={memKey}
                          className="py-4"
                        >
                          {priceObj?.price !== null ? (
                            <div className="flex flex-col space-y-2">
                              <div className="text-xl font-semibold">
                                ₹{priceObj.price}
                              </div>
                              <Button
                                className="w-full"
                                onClick={() => handleBuyNow(stock.name, memKey, priceObj.price!)}
                                disabled={!stock.available}
                              >
                                Buy Now
                              </Button>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">
                              Not available for {memKey}
                            </div>
                          )}
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                ) : (
                  <p className="text-sm text-gray-500">No memory options defined.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
