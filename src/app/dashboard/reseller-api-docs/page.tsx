'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

export default function ResellerApiDocsPage() {

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

    return (
        <div className="p-6 space-y-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Reseller API Documentation</h1>
                <p className="text-muted-foreground mt-2">
                    Integrate OceanLinux services directly into your billing platform or website.
                </p>
            </div>

            <Tabs defaultValue="intro" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
                    <TabsTrigger value="intro">Introduction</TabsTrigger>
                    <TabsTrigger value="auth">Authentication</TabsTrigger>
                    <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
                    <TabsTrigger value="errors">Errors</TabsTrigger>
                    <TabsTrigger value="examples">Examples</TabsTrigger>
                </TabsList>

                <TabsContent value="intro" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Overview</CardTitle>
                            <CardDescription>Automate your business with our REST API</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p>
                                The OceanLinux Reseller API allows you to programmatically purchase servers, check stock, and manage your wallet.
                                It is designed to be easy to use and integrates with any programming language that supports HTTP requests.
                            </p>
                            <div className="flex gap-2 mt-4">
                                <Badge variant="secondary">REST</Badge>
                                <Badge variant="secondary">JSON</Badge>
                                <Badge variant="secondary">Secure</Badge>
                            </div>
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
                            <p>All API requests must include your API credentials in the request headers.</p>
                            <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 border border-yellow-200 dark:border-yellow-900 rounded-md text-sm text-yellow-800 dark:text-yellow-200">
                                <strong>Important:</strong> Never expose your API Secret in client-side code (frontend JavaScript). Always make requests from your backend server.
                            </div>

                            <h3 className="font-semibold text-lg mt-4">Headers</h3>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><code>x-api-key</code>: Your unique API Key (Public)</li>
                                <li><code>x-api-secret</code>: Your API Secret (Private)</li>
                            </ul>

                            <h3 className="font-semibold text-lg mt-4">Base URL</h3>
                            <CodeBlock code="https://oceanlinux.com/api/v1/reseller" language="bash" />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="endpoints" className="space-y-6">
                    {/* Products */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 hover:bg-blue-700">GET</Badge>
                                <CardTitle className="text-xl font-mono">/products</CardTitle>
                            </div>
                            <CardDescription>Fetch available IP Stocks and server configurations.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">
                                Product prices in the response are automatically adjusted to include your specific markup/custom pricing.
                            </p>
                            <h4 className="font-semibold text-sm">Response Example</h4>
                            <CodeBlock code={`
{
  "success": true,
  "currency": "INR",
  "products": [
    {
      "_id": "65a...",
      "name": "Indian Residential VPS",
      "available": true,
      "memoryOptions": {
        "4GB": { "price": 1200, "hostycareProductId": "1" },
        "8GB": { "price": 2200, "hostycareProductId": "2" }
      }
    }
  ]
}
                            `} />
                        </CardContent>
                    </Card>

                    {/* Orders */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-green-600 hover:bg-green-700">POST</Badge>
                                <CardTitle className="text-xl font-mono">/orders</CardTitle>
                            </div>
                            <CardDescription>Place a new order. Amount is deducted from wallet instantly.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <h4 className="font-semibold text-sm mb-2">Request Body</h4>
                            <CodeBlock code={`
{
  "productId": "65a...",
  "memoryOption": "4GB",
  "userEmail": "customer@yourdomain.com"
}
                            `} />

                            <h4 className="font-semibold text-sm mt-4 mb-2">Response Example</h4>
                            <CodeBlock code={`
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "_id": "ord_123...",
    "status": "active",
    "productName": "Indian Residential VPS",
    "price": 1200
  },
  "walletBalance": 4500
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
                            <CardDescription>Get wallet balance and recent transactions.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <h4 className="font-semibold text-sm mb-2">Response Example</h4>
                            <CodeBlock code={`
{
  "success": true,
  "transactions": [
    {
      "type": "deduction",
      "amount": 1200,
      "description": "Order ord_123...",
      "createdAt": "2024-03-20T10:00:00Z"
    }
  ]
}
                            `} />
                        </CardContent>
                    </Card>

                    {/* Manage Server */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-green-600 hover:bg-green-700">POST</Badge>
                                <CardTitle className="text-xl font-mono">/orders/manage</CardTitle>
                            </div>
                            <CardDescription>Execute server management actions (start, stop, restart, status, format, changeos)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <h4 className="font-semibold text-sm mb-2">Request Body</h4>
                            <CodeBlock code={`
{
  "orderId": "ord_123...",
  "action": "start|stop|restart|status|format|changeos|sync",
  "osType": "ubuntu"  // Required only for changeos
}
                            `} />

                            <h4 className="font-semibold text-sm mt-4 mb-2">Available Actions</h4>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                <li><code>start</code> - Start the VPS server</li>
                                <li><code>stop</code> - Stop the VPS server</li>
                                <li><code>restart</code> - Restart the VPS server</li>
                                <li><code>status</code> - Get current power status</li>
                                <li><code>format</code> - Format/reset the VPS (OceanLinux only)</li>
                                <li><code>changeos</code> - Change OS (OceanLinux only, requires osType)</li>
                                <li><code>sync</code> - Sync server status from provider</li>
                            </ul>

                            <h4 className="font-semibold text-sm mt-4 mb-2">Response Example</h4>
                            <CodeBlock code={`
{
  "success": true,
  "action": "status",
  "orderId": "ord_123...",
  "ipAddress": "103.82.72.120",
  "message": "Status retrieved",
  "data": {
    "powerState": "running"
  },
  "timestamp": "2024-03-20T10:00:00Z"
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
                                    <Badge variant="outline" className="font-mono text-yellow-600 border-yellow-200">400</Badge>
                                    <span className="text-sm">Bad Request (Invalid input)</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-red-600 border-red-200">401</Badge>
                                    <span className="text-sm">Unauthorized (Invalid/Missing API Key)</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-red-600 border-red-200">402</Badge>
                                    <span className="text-sm">Payment Required (Low Wallet Balance)</span>
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <Badge variant="outline" className="font-mono text-gray-500">404</Badge>
                                    <span className="text-sm">Not Found (Invalid Product ID)</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline" className="font-mono text-red-600 border-red-200">500</Badge>
                                    <span className="text-sm">Internal Server Error</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="examples" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Node.js Integration</CardTitle>
                            <CardDescription>Using axios</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock language="javascript" code={`
const axios = require('axios');

const client = axios.create({
  baseURL: 'https://oceanlinux.com/api/v1/reseller',
  headers: {
    'x-api-key': 'YOUR_API_KEY',
    'x-api-secret': 'YOUR_API_SECRET'
  }
});

async function buyServer() {
  try {
    // 1. Get Products
    const productsRes = await client.get('/products');
    const vps = productsRes.data.products[0];
    
    // 2. Buy
    const orderRes = await client.post('/orders', {
      productId: vps._id,
      memoryOption: "4GB",
      userEmail: "client@example.com"
    });
    
    console.log('Order Success:', orderRes.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

buyServer();
                            `} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
