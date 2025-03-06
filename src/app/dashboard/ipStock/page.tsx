"use client";

import { useEffect, useState } from "react";
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
 */
function toBulletPoints(text: string) {
  if (!text) return [];
  const rawPoints = text.split(". ");
  return rawPoints.map((p) => p.trim()).filter(Boolean);
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

export default function IPStockPage() {
  const [ipStocks, setIpStocks] = useState<IPStock[]>([]);

  // For the modal
  const [showModal, setShowModal] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    memory: string;
    price: number;
  } | null>(null);

  // Fetch available IP stocks on mount
  useEffect(() => {
    const fetchIPStocks = async () => {
      try {
        const response = await fetch("/api/ipstock");
        const data = await response.json();
        setIpStocks(data);
      } catch (error) {
        toast.error("Failed to load plans.");
        console.error(error);
      }
    };
    fetchIPStocks();
  }, []);

  // 1) Called when user clicks "Buy Now"
  const handleBuyNow = (productName: string, memory: string, price: number) => {
    // Store user’s selected plan in state, open modal
    setSelectedProduct({ name: productName, memory, price });
    setShowModal(true);
  };

  // 2) Called when user enters transaction ID and hits "Submit Payment"
  const handleSubmitTransactionId = async () => {
    if (!selectedProduct) return;

    if (!transactionId) {
      toast.error("Please enter your transaction ID.");
      return;
    }

    try {
      // Create the order in your DB
      const res = await fetch("/api/createOrder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: selectedProduct.name,
          memory: selectedProduct.memory,
          price: selectedProduct.price,
          transactionId
        })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Order creation failed.");
        return;
      }

      // Successfully created order
      toast.success("Order created! Wait for admin verification.");
      setShowModal(false);
      setTransactionId("");
      setSelectedProduct(null);
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="w-full min-h-full text-white">
      {/* Header / Title */}
      <div className="flex items-center gap-2 border-b border-gray-700 p-4">
        <ServerIcon />
        <h1 className="text-xl font-semibold">Our Linux Plans</h1>
      </div>

      {/* Single-column Cards Grid */}
      <div className="grid md:grid-cols-2 gap-6 px-4 py-8">
        {ipStocks.map((stock) => {
          const memoryKeys = Object.keys(stock.memoryOptions || {});
          const bulletPoints = toBulletPoints(stock.description || "");

          return (
            <Card key={stock._id} className="bg-gray-800 border border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg font-bold">{stock.name}</CardTitle>
               
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
                        <TabsContent key={memKey} value={memKey} className="py-4">
                          {priceObj?.price !== null ? (
                            <div className="flex flex-col space-y-2">
                              <div className="text-xl font-semibold">
                                ₹{priceObj.price}
                              </div>
                              <Button
                                className="w-full"
                                onClick={() =>
                                  handleBuyNow(stock.name, memKey, priceObj.price!)
                                }
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

      {/* Payment Modal: Show QR code & transaction ID input */}
      {showModal && selectedProduct && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4 z-50">
          <div className="bg-gray-800 p-4 rounded shadow-md w-full max-w-sm relative">
            <h2 className="text-lg font-bold mb-2">Complete Payment</h2>
            <p className="text-sm text-gray-400 mb-4">
              Scan this QR with your UPI app. Once paid, enter the transaction ID/UTR below.
            </p>

            {/* -- Example static QR code image from your public folder. 
                 Replace '/qr-demo.png' with your real QR code image -- */}
            <div className="flex justify-center mb-4">
              <img
                src="/qr.jpg"
                alt="Payment QR Code"
                className="max-w-xs"
              />
            </div>

            <p className="text-xs text-gray-400 mb-2">
              Product: {selectedProduct.name} – {selectedProduct.memory} – ₹{selectedProduct.price}
            </p>

            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="Transaction ID / UTR"
              className="w-full p-2 mb-3 rounded text-black"
            />

            <Button className="w-full mb-2" onClick={handleSubmitTransactionId}>
              Submit Payment
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
