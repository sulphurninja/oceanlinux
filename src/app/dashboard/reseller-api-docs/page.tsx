'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

export default function ResellerApiDocsPage() {
    const baseUrl = useMemo(() => {
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/api/v1/reseller`;
        }
        return 'https://oceanlinux.com/api/v1/reseller';
    }, []);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    const CodeBlock = ({ code, language = 'json' }: { code: string, language?: string }) => (
        <div className="relative mt-4 rounded-lg bg-muted p-4 overflow-x-auto group">
            <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                onClick={() => copyToClipboard(code)}
            >
                <Copy className="h-4 w-4" />
            </Button>
            <pre className="text-sm font-mono whitespace-pre text-wrap break-words">
                <code>{code.trim()}</code>
            </pre>
        </div>
    );

    const authHeaders = `x-api-key: YOUR_API_KEY
x-api-secret: YOUR_API_SECRET`;

    return (
        <div className="p-6 space-y-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Reseller API Documentation</h1>
                <p className="text-muted-foreground mt-2">
                    Admin ne jo reseller account banaya hai (<code>/admin/resellers</code>), usi ke credentials se apni website / billing panel integrate karo.
                </p>
            </div>

            <Tabs defaultValue="flow" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-6">
                    <TabsTrigger value="flow">Step-by-Step</TabsTrigger>
                    <TabsTrigger value="intro">Introduction</TabsTrigger>
                    <TabsTrigger value="auth">Authentication</TabsTrigger>
                    <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
                    <TabsTrigger value="errors">Errors</TabsTrigger>
                    <TabsTrigger value="examples">Examples</TabsTrigger>
                </TabsList>

                {/* STEP BY STEP FLOW */}
                <TabsContent value="flow" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Pura flow — 1 se 6 tak</CardTitle>
                            <CardDescription>Reseller website par server bechna ho to yeh order follow karo</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 text-sm">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Step 1 — Admin se credentials lo</h3>
                                <p className="text-muted-foreground">
                                    Admin <strong>/admin/resellers/create</strong> se account banata hai. Tumhe <code>rz_...</code> API Key aur <code>sec_...</code> Secret milta hai (secret sirf ek baar dikhta hai). Wallet balance admin add karta hai.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Step 2 — Account check karo</h3>
                                <p className="text-muted-foreground"><code>GET /account</code> — business name, wallet balance, credit limit verify karo.</p>
                                <CodeBlock language="bash" code={`
curl "${baseUrl}/account" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"
                                `} />
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Step 3 — Products / stock list lo</h3>
                                <p className="text-muted-foreground">
                                    <code>GET /products</code> — saari available servers aati hain. Price tumhare markup / custom price ke saath aati hai (website par wahi dikhao).
                                </p>
                                <CodeBlock language="bash" code={`
curl "${baseUrl}/products" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"
                                `} />
                                <p className="text-muted-foreground">Single product: <code>GET /products?id=PRODUCT_ID</code></p>
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Step 4 — Order place karo</h3>
                                <p className="text-muted-foreground">
                                    <code>POST /orders</code> — wallet se amount cut hoti hai, server auto-provision hota hai. Customer email optional hai (tracking ke liye).
                                </p>
                                <CodeBlock language="bash" code={`
curl -X POST "${baseUrl}/orders" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "productId": "65a...",
    "memoryOption": "4GB",
    "userEmail": "customer@yourdomain.com",
    "os": "Ubuntu 22"
  }'
                                `} />
                                <p className="text-muted-foreground">
                                    OS options: <code>Ubuntu 22</code>, <code>CentOS 7</code>, <code>Windows 2022 64</code>
                                </p>
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Step 5 — Order status / credentials lo</h3>
                                <p className="text-muted-foreground">
                                    List: <code>GET /orders</code> — saare orders. Detail: <code>GET /orders/ORDER_ID</code> — IP, username, password (jab provision ho jaye).
                                </p>
                                <CodeBlock language="bash" code={`
curl "${baseUrl}/orders/ORDER_ID" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"
                                `} />
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Step 6 — Server manage karo (online/offline)</h3>
                                <p className="text-muted-foreground">
                                    <code>POST /orders/manage</code> — start, stop, restart, <strong>status</strong> (running/stopped), format, changeos.
                                </p>
                                <CodeBlock language="bash" code={`
curl -X POST "${baseUrl}/orders/manage" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"orderId": "ORDER_ID", "action": "status"}'
                                `} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="intro" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Overview</CardTitle>
                            <CardDescription>Automate your business with our REST API</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p>
                                Reseller API se tum programmatically servers khareed sakte ho, stock check kar sakte ho, wallet balance dekh sakte ho, aur customer servers manage kar sakte ho.
                                Yeh Customer API (<code>/docs/api</code> Bearer keys) se alag hai — iske liye admin-created reseller credentials chahiye.
                            </p>
                            <div className="flex gap-2 mt-4 flex-wrap">
                                <Badge variant="secondary">REST</Badge>
                                <Badge variant="secondary">JSON</Badge>
                                <Badge variant="secondary">Wallet billing</Badge>
                                <Badge variant="secondary">Auto provisioning</Badge>
                            </div>
                            <h3 className="font-semibold mt-4">All endpoints (Universal)</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                <li><code>GET /</code> — API index (sab endpoints list)</li>
                                <li><code>GET /account</code> — Account & wallet summary</li>
                                <li><code>GET /wallet</code> — Balance + transactions</li>
                                <li><code>GET /products</code> — Stock list (your prices)</li>
                                <li><code>POST /orders</code> — Buy server</li>
                                <li><code>GET /orders</code> — Your orders list</li>
                                <li><code>GET /orders/{`{orderId}`}</code> — Order detail + capabilities</li>
                                <li><code>GET /orders/{`{orderId}`}/status</code> — Online/offline (OceanLinux se)</li>
                                <li><code>POST /orders/{`{orderId}`}/sync</code> — IP/username/password sync</li>
                                <li><code>POST /orders/manage</code> — start/stop/restart/reinstall</li>
                                <li><code>GET /orders/{`{orderId}`}/renew</code> — Renewal price check</li>
                                <li><code>POST /orders/{`{orderId}`}/renew</code> — Renew service</li>
                            </ul>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="auth" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Authentication</CardTitle>
                            <CardDescription>Secure your API requests</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p>Har request mein dono headers required hain:</p>
                            <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 border border-yellow-200 dark:border-yellow-900 rounded-md text-sm text-yellow-800 dark:text-yellow-200">
                                <strong>Important:</strong> API Secret kabhi frontend JavaScript mein mat daalo. Sirf apne backend server se call karo.
                            </div>

                            <h3 className="font-semibold text-lg mt-4">Headers</h3>
                            <CodeBlock code={authHeaders} language="text" />
                            <p className="text-sm text-muted-foreground">
                                Aliases bhi chalte hain: <code>x-reseller-api-key</code> aur <code>x-reseller-api-secret</code>
                            </p>

                            <h3 className="font-semibold text-lg mt-4">Base URL</h3>
                            <CodeBlock code={baseUrl} language="bash" />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="endpoints" className="space-y-6">
                    {/* Account */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 hover:bg-blue-700">GET</Badge>
                                <CardTitle className="text-xl font-mono">/account</CardTitle>
                            </div>
                            <CardDescription>Reseller account info + wallet summary</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock code={`
{
  "success": true,
  "account": {
    "id": "65a...",
    "businessName": "My Hosting",
    "email": "reseller@example.com",
    "status": "active",
    "joinedAt": "2024-01-15T00:00:00.000Z"
  },
  "wallet": {
    "balance": 50000,
    "currency": "INR",
    "creditLimit": 10000
  },
  "stats": { "totalOrders": 12, "totalRevenue": 48000 }
}
                            `} />
                        </CardContent>
                    </Card>

                    {/* Wallet */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 hover:bg-blue-700">GET</Badge>
                                <CardTitle className="text-xl font-mono">/wallet</CardTitle>
                            </div>
                            <CardDescription>Balance, credit limit, recent transactions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock code={`
{
  "success": true,
  "balance": 50000,
  "currency": "INR",
  "creditLimit": 10000,
  "minBalance": 0,
  "transactions": [
    {
      "type": "deduction",
      "amount": 1200,
      "description": "Reseller API order 65b... — Indian VPS (4GB)",
      "createdAt": "2024-03-20T10:00:00.000Z"
    }
  ]
}
                            `} />
                        </CardContent>
                    </Card>

                    {/* Products */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 hover:bg-blue-700">GET</Badge>
                                <CardTitle className="text-xl font-mono">/products</CardTitle>
                            </div>
                            <CardDescription>Available stock with your markup/custom prices applied</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">
                                Query: <code>?id=PRODUCT_ID</code> for single product. Prices include admin-set custom price or global markup.
                            </p>
                            <CodeBlock code={`
{
  "success": true,
  "count": 5,
  "currency": "INR",
  "products": [
    {
      "_id": "65a...",
      "name": "103.148.205 Linux Platinum 4GB",
      "available": true,
      "serverType": "vps",
      "memoryOptions": {
        "4GB": {
          "price": 1200,
          "basePrice": 999,
          "hostycareProductId": "1"
        }
      }
    }
  ]
}
                            `} />
                        </CardContent>
                    </Card>

                    {/* GET Orders */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 hover:bg-blue-700">GET</Badge>
                                <CardTitle className="text-xl font-mono">/orders</CardTitle>
                            </div>
                            <CardDescription>List your orders (newest first). Query: <code>?limit=50</code> (max 100)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock code={`
{
  "success": true,
  "count": 2,
  "orders": [
    {
      "id": "65b...",
      "productName": "103.148.205 Linux Platinum 4GB - 4GB",
      "memory": "4GB",
      "price": 1200,
      "status": "confirmed",
      "provisioningStatus": "completed",
      "ipAddress": "103.148.205.10",
      "username": "root",
      "password": "****",
      "os": "Ubuntu 22",
      "expiryDate": "2025-07-20T00:00:00.000Z",
      "customerEmail": "client@example.com",
      "createdAt": "2024-03-20T10:00:00.000Z"
    }
  ]
}
                            `} />
                        </CardContent>
                    </Card>

                    {/* GET Order by ID */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 hover:bg-blue-700">GET</Badge>
                                <CardTitle className="text-xl font-mono">/orders/{`{orderId}`}</CardTitle>
                            </div>
                            <CardDescription>Single order detail — IP & credentials after provisioning</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock code={`
{
  "success": true,
  "order": {
    "id": "65b...",
    "productName": "103.148.205 Linux Platinum 4GB - 4GB",
    "status": "confirmed",
    "provisioningStatus": "completed",
    "ipAddress": "103.148.205.10",
    "username": "root",
    "password": "your-password",
    "os": "Ubuntu 22"
  }
}
                            `} />
                        </CardContent>
                    </Card>

                    {/* POST Orders */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-green-600 hover:bg-green-700">POST</Badge>
                                <CardTitle className="text-xl font-mono">/orders</CardTitle>
                            </div>
                            <CardDescription>Purchase server — wallet deduct + auto provision</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <h4 className="font-semibold text-sm mb-2">Request Body</h4>
                            <CodeBlock code={`
{
  "productId": "65a...",
  "memoryOption": "4GB",
  "userEmail": "customer@yourdomain.com",
  "os": "Ubuntu 22"
}
                            `} />

                            <h4 className="font-semibold text-sm mt-4 mb-2">Response (201)</h4>
                            <CodeBlock code={`
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "id": "65b...",
    "productName": "103.148.205 Linux Platinum 4GB - 4GB",
    "memory": "4GB",
    "price": 1200,
    "status": "confirmed",
    "provisioningStatus": "pending",
    "ipAddress": null,
    "customerEmail": "customer@yourdomain.com"
  },
  "walletBalance": 48800,
  "creditLimit": 10000
}
                            `} />
                            <p className="text-sm text-muted-foreground mt-2">
                                Provision complete hone ke baad <code>GET /orders/{`{orderId}`}</code> se IP aur credentials milenge.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Manage Server */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-green-600 hover:bg-green-700">POST</Badge>
                                <CardTitle className="text-xl font-mono">/orders/manage</CardTitle>
                            </div>
                            <CardDescription>Server actions: start, stop, restart, status, format, changeos, sync</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <h4 className="font-semibold text-sm mb-2">Request Body</h4>
                            <CodeBlock code={`
{
  "orderId": "65b...",
  "action": "status",
  "osType": "ubuntu"
}
                            `} />

                            <h4 className="font-semibold text-sm mt-4 mb-2">Actions</h4>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                <li><code>start</code> — VPS start</li>
                                <li><code>stop</code> — VPS stop</li>
                                <li><code>restart</code> — Restart</li>
                                <li><code>status</code> — Online/offline (<code>powerState: running|stopped</code>)</li>
                                <li><code>format</code> — Reset VPS (SmartVPS) ya reinstall OS (ADVPS — <code>osType</code> required)</li>
                                <li><code>reinstall</code> — ADVPS products ke liye (same as format)</li>
                                <li><code>changeos</code> — OS change (SmartVPS only)</li>
                                <li><code>sync</code> — Provider se status sync</li>
                            </ul>

                            <h4 className="font-semibold text-sm mt-4 mb-2">Status response</h4>
                            <CodeBlock code={`
{
  "success": true,
  "action": "status",
  "orderId": "65b...",
  "ipAddress": "103.148.205.10",
  "message": "Status retrieved",
  "data": { "powerState": "running" },
  "timestamp": "2024-03-20T10:00:00.000Z"
}
                            `} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="errors" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Status Codes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono">200</Badge>
                                    <span className="text-sm">Success</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono">201</Badge>
                                    <span className="text-sm">Order created</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-yellow-600 border-yellow-200">400</Badge>
                                    <span className="text-sm">Bad request (invalid product/memory)</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-red-600 border-red-200">401</Badge>
                                    <span className="text-sm">Unauthorized (wrong/missing API key or secret)</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-red-600 border-red-200">402</Badge>
                                    <span className="text-sm">Insufficient wallet balance</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-red-600 border-red-200">403</Badge>
                                    <span className="text-sm">Reseller account inactive</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-yellow-600 border-yellow-200">409</Badge>
                                    <span className="text-sm">Product unavailable / out of stock</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-gray-500">404</Badge>
                                    <span className="text-sm">Order or product not found</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline" className="font-mono text-red-600 border-red-200">500</Badge>
                                    <span className="text-sm">Internal server error</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="examples" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Node.js — Full integration</CardTitle>
                            <CardDescription>Products → purchase → poll status → check online</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock language="javascript" code={`
const axios = require('axios');

const client = axios.create({
  baseURL: '${baseUrl}',
  headers: {
    'x-api-key': process.env.OCEAN_RESELLER_KEY,
    'x-api-secret': process.env.OCEAN_RESELLER_SECRET,
  },
});

async function sellServer(customerEmail) {
  // 1. Wallet check
  const wallet = await client.get('/wallet');
  console.log('Balance:', wallet.data.balance);

  // 2. Products with YOUR prices
  const { data: catalog } = await client.get('/products');
  const product = catalog.products.find(p => p.name.includes('4GB'));
  const plan = product.memoryOptions['4GB'];

  // 3. Purchase
  const { data: purchase } = await client.post('/orders', {
    productId: product._id,
    memoryOption: '4GB',
    userEmail: customerEmail,
    os: 'Ubuntu 22',
  });
  const orderId = purchase.order.id;

  // 4. Wait for IP (poll every 10s)
  let order;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await client.get('/orders/' + orderId);
    order = res.data.order;
    if (order.ipAddress) break;
  }

  // 5. Check if server is online
  const status = await client.post('/orders/manage', {
    orderId,
    action: 'status',
  });
  console.log('Power:', status.data.data.powerState); // running | stopped

  return order;
}
                            `} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>PHP — cURL example</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock language="php" code={`
<?php
$base = '${baseUrl}';
$headers = [
  'x-api-key: ' . getenv('OCEAN_RESELLER_KEY'),
  'x-api-secret: ' . getenv('OCEAN_RESELLER_SECRET'),
  'Content-Type: application/json',
];

$ch = curl_init("$base/orders");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => $headers,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POSTFIELDS => json_encode([
    'productId' => 'YOUR_PRODUCT_ID',
    'memoryOption' => '4GB',
    'userEmail' => 'client@example.com',
  ]),
]);
$response = curl_exec($ch);
print_r(json_decode($response, true));
                            `} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
