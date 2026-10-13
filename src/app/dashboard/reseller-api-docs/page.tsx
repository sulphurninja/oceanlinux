'use client';

import { getResellerApiBaseUrl } from '@/lib/publicAppUrl';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Copy,
    Check,
    Rocket,
    KeyRound,
    Network,
    Globe,
    AlertTriangle,
    Code2,
    Wallet,
    ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const softCard = 'premium-dashboard-card border-0';

function CodeBlock({ code, label }: { code: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const text = code.trim();

    const copy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="relative mt-3 group">
            {label && (
                <p className="premium-reseller-eyebrow mb-1.5">{label}</p>
            )}
            <Button
                size="icon"
                variant="ghost"
                className="absolute right-1.5 top-1.5 h-7 w-7 opacity-60 hover:opacity-100 transition-opacity"
                onClick={copy}
                aria-label="Copy code"
            >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <pre className="premium-reseller-code whitespace-pre pr-10">
                <code>{text}</code>
            </pre>
        </div>
    );
}

function EndpointCard({
    method,
    path,
    description,
    children,
}: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    description: string;
    children?: React.ReactNode;
}) {
    const methodClass =
        method === 'GET'
            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
            : method === 'POST'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : method === 'PATCH'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300';

    return (
        <Card className={softCard}>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn('font-mono text-[10px] tracking-wide border-0', methodClass)}>
                        {method}
                    </Badge>
                    <CardTitle className="text-base sm:text-lg font-mono premium-dashboard-title break-all">
                        {path}
                    </CardTitle>
                </div>
                <CardDescription className="premium-dashboard-subtitle mt-1">{description}</CardDescription>
            </CardHeader>
            {children && <CardContent className="pt-0">{children}</CardContent>}
        </Card>
    );
}

function StepCard({
    step,
    title,
    children,
}: {
    step: number;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4 space-y-2">
            <div className="flex items-center gap-2.5">
                <span className="h-6 w-6 shrink-0 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center">
                    {step}
                </span>
                <h3 className="font-semibold text-sm sm:text-base premium-dashboard-title">{title}</h3>
            </div>
            <div className="pl-[34px] space-y-2 text-sm premium-dashboard-subtitle">{children}</div>
        </div>
    );
}

export default function ResellerApiDocsPage() {
    const baseUrl = getResellerApiBaseUrl();

    const copyBaseUrl = () => {
        navigator.clipboard.writeText(baseUrl);
        toast.success('Base URL copied');
    };

    return (
        <div className="premium-dashboard-page">
            <div className="premium-dashboard-page-inner space-y-5">
                <section className="premium-reseller-hero p-4 sm:p-6">
                    <div className="premium-reseller-hero-grid" />
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0 space-y-2">
                            <span className="premium-reseller-eyebrow">Reseller API</span>
                            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold premium-dashboard-title">
                                API Documentation
                            </h1>
                            <p className="text-sm premium-dashboard-subtitle max-w-2xl">
                                Sell servers and HTTP proxies from your own website or billing panel. Every request
                                is billed to your reseller wallet at your negotiated rates.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-1">
                                <span className="premium-reseller-chip">REST + JSON</span>
                                <span className="premium-reseller-chip">Wallet billing</span>
                                <span className="premium-reseller-chip">Auto provisioning</span>
                                <span className="premium-reseller-chip">VPS &amp; Proxies</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={copyBaseUrl}
                                className="premium-btn-outline"
                            >
                                <Copy className="h-3.5 w-3.5 mr-2" />
                                Copy base URL
                            </Button>
                            <Button size="sm" asChild className="premium-btn-primary border-0">
                                <Link href="/dashboard/reseller-wallet">
                                    <Wallet className="h-4 w-4 mr-2" />
                                    My credentials
                                </Link>
                            </Button>
                        </div>
                    </div>
                </section>

                <Card className={softCard}>
                    <CardContent className="p-3.5 sm:p-4 flex items-center gap-3 flex-wrap">
                        <Globe className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                        <div className="min-w-0 flex-1">
                            <p className="premium-reseller-eyebrow">Base URL</p>
                            <p className="font-mono text-xs sm:text-sm break-all premium-dashboard-title">
                                {baseUrl}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-lg border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                            onClick={copyBaseUrl}
                            aria-label="Copy base URL"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </CardContent>
                </Card>

                <Tabs defaultValue="quickstart" className="space-y-4 premium-dashboard-tabs">
                    <TabsList className="premium-profile-tabs-list grid w-full grid-cols-3 lg:grid-cols-7 gap-1 h-auto">
                        <TabsTrigger value="quickstart" className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <Rocket className="h-3.5 w-3.5" />
                            Quick start
                        </TabsTrigger>
                        <TabsTrigger value="auth" className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <KeyRound className="h-3.5 w-3.5" />
                            Auth
                        </TabsTrigger>
                        <TabsTrigger value="endpoints" className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <Code2 className="h-3.5 w-3.5" />
                            Endpoints
                        </TabsTrigger>
                        <TabsTrigger value="panel" className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <Network className="h-3.5 w-3.5" />
                            Panel API
                        </TabsTrigger>
                        <TabsTrigger value="proxies" className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <Network className="h-3.5 w-3.5" />
                            Proxies
                        </TabsTrigger>
                        <TabsTrigger value="errors" className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Errors
                        </TabsTrigger>
                        <TabsTrigger value="examples" className="flex items-center gap-1.5 text-xs sm:text-sm">
                            <Code2 className="h-3.5 w-3.5" />
                            Examples
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="quickstart" className="space-y-4">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    From credentials to a live server
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Six steps that cover the entire lifecycle of a reseller order
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <StepCard step={1} title="Collect your credentials">
                                    <p>
                                        Your API key and secret are issued when your reseller account is created and
                                        are always available on the{' '}
                                        <Link
                                            href="/dashboard/reseller-wallet"
                                            className="text-emerald-700 dark:text-emerald-300 font-medium hover:underline"
                                        >
                                            Reseller Console
                                        </Link>
                                        . Wallet top-ups are handled by our team.
                                    </p>
                                </StepCard>

                                <StepCard step={2} title="Verify your account and balance">
                                    <p>
                                        Call <code>GET /account</code> to confirm your business name, status, wallet
                                        balance and credit line.
                                    </p>
                                    <CodeBlock
                                        code={`curl "${baseUrl}/account" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"`}
                                    />
                                </StepCard>

                                <StepCard step={3} title="Fetch the catalogue">
                                    <p>
                                        <code>GET /products</code> returns everything in stock, priced at your
                                        reseller rate. Display those prices on your own storefront.
                                    </p>
                                    <CodeBlock
                                        code={`curl "${baseUrl}/products" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"`}
                                    />
                                    <p>
                                        Request a single item with <code>GET /products?id=PRODUCT_ID</code>.
                                    </p>
                                </StepCard>

                                <StepCard step={4} title="Place the order">
                                    <p>
                                        <code>POST /orders</code> debits your wallet and starts provisioning
                                        immediately. The customer email is optional and used only for your own
                                        tracking.
                                    </p>
                                    <CodeBlock
                                        code={`curl -X POST "${baseUrl}/orders" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "productId": "65a...",
    "memoryOption": "4GB",
    "userEmail": "customer@yourdomain.com",
    "os": "Ubuntu 22"
  }'`}
                                    />
                                    <p>
                                        Supported operating systems: <code>Ubuntu 22</code>, <code>CentOS 7</code>,{' '}
                                        <code>Windows 2022 64</code>.
                                    </p>
                                </StepCard>

                                <StepCard step={5} title="Collect the delivery details">
                                    <p>
                                        Poll <code>GET /orders/ORDER_ID</code> until the IP address and login
                                        credentials appear. Provisioning usually completes within a few minutes.
                                    </p>
                                    <CodeBlock
                                        code={`curl "${baseUrl}/orders/ORDER_ID" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"`}
                                    />
                                </StepCard>

                                <StepCard step={6} title="Manage the service">
                                    <p>
                                        <code>POST /orders/manage</code> handles power control, reinstalls, and MAC reset:{' '}
                                        <code>start</code>, <code>stop</code>, <code>restart</code>,{' '}
                                        <code>status</code>, <code>format</code>, <code>changeos</code>,{' '}
                                        <code>resetmac</code> and <code>sync</code>.
                                    </p>
                                    <CodeBlock
                                        code={`curl -X POST "${baseUrl}/orders/manage" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"orderId": "ORDER_ID", "action": "status"}'`}
                                    />
                                </StepCard>
                            </CardContent>
                        </Card>

                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Endpoint reference at a glance
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-1.5 text-sm premium-dashboard-subtitle">
                                    <li><code>GET /</code> — API index listing every available endpoint</li>
                                    <li><code>GET /wallet</code> — Balance, credit line and transactions</li>
                                    <li><code>GET /transactions</code> — Wallet ledger only</li>
                                    <li><code>GET /plans</code> — Catalogue (alias of /products)</li>
                                    <li><code>GET /vms</code> — Your VMs (alias of /orders)</li>
                                    <li><code>POST /vms</code> — Deploy VM (alias of POST /orders)</li>
                                    <li><code>PATCH /vms/{`{id}`}</code> — Auto-renew toggle</li>
                                    <li><code>POST /vms/{`{id}`}/renew</code> — Renew a VPS. Slot IP and Trial are not renewable.</li>
                                    <li><code>GET /customers</code> — White-label customers</li>
                                    <li><code>GET /account</code> — Account profile and wallet summary</li>
                                    <li><code>GET /products</code> — Legacy catalogue path</li>
                                    <li><code>POST /orders</code> — Legacy purchase path</li>
                                    <li><code>POST /orders/manage</code> — Power actions, reinstalls, MAC reset</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="auth" className="space-y-4">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Authentication
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Both headers are required on every request
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <CodeBlock
                                    label="Headers"
                                    code={`x-api-key: YOUR_API_KEY
x-api-secret: YOUR_API_SECRET`}
                                />
                                <p className="text-sm premium-dashboard-subtitle">
                                    The aliases <code>x-reseller-api-key</code> and{' '}
                                    <code>x-reseller-api-secret</code> are also accepted.
                                </p>

                                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-100">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
                                    <p>
                                        Never embed your API secret in frontend JavaScript or a mobile app. Call the
                                        reseller API only from your own backend, and rotate the secret with support
                                        if it is ever exposed.
                                    </p>
                                </div>

                                <div>
                                    <p className="premium-reseller-eyebrow mb-1.5">Rate limits</p>
                                    <p className="text-sm premium-dashboard-subtitle">
                                        Each account has a per-minute request limit shown on your{' '}
                                        <Link
                                            href="/dashboard/reseller-wallet"
                                            className="text-emerald-700 dark:text-emerald-300 font-medium hover:underline"
                                        >
                                            console
                                        </Link>
                                        . Space out polling loops by at least ten seconds to stay well inside it.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="endpoints" className="space-y-4">
                        <EndpointCard
                            method="GET"
                            path="/account"
                            description="Reseller account info + wallet summary"
                        >
                            <CodeBlock
                                code={`{
  "success": true,
  "account": {
    "id": "65a...",
    "businessName": "My Hosting",
    "email": "reseller@example.com",
    "status": "active",
    "joinedAt": "2024-01-15T00:00:00.000Z"
  },
  "wallet": { "balance": 50000, "currency": "INR", "creditLimit": 10000 },
  "stats": { "totalOrders": 12, "totalRevenue": 48000 }
}`}
                            />
                        </EndpointCard>

                        <EndpointCard
                            method="GET"
                            path="/wallet"
                            description="Balance, credit limit, recent transactions"
                        >
                            <CodeBlock
                                code={`{
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
}`}
                            />
                        </EndpointCard>

                        <EndpointCard
                            method="GET"
                            path="/products"
                            description="Available stock with your markup/custom prices applied"
                        >
                            <p className="text-sm premium-dashboard-subtitle">
                                Query: <code>?id=PRODUCT_ID</code> for single product. Prices include admin-set custom
                                price or global markup.
                            </p>
                            <CodeBlock
                                code={`{
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
}`}
                            />
                        </EndpointCard>

                        <EndpointCard
                            method="POST"
                            path="/orders"
                            description="Purchase server — wallet deduct + auto provision"
                        >
                            <CodeBlock
                                label="Request body"
                                code={`{
  "productId": "65a...",
  "memoryOption": "4GB",
  "userEmail": "customer@yourdomain.com",
  "os": "Ubuntu 22"
}`}
                            />
                            <CodeBlock
                                label="Response (201)"
                                code={`{
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
}`}
                            />
                            <p className="text-sm premium-dashboard-subtitle mt-3">
                                Provision complete hone ke baad GET /orders/{`{orderId}`} se IP aur credentials
                                milenge.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            method="GET"
                            path="/orders"
                            description="List your orders (newest first). Query: ?limit=50 (max 100)"
                        >
                            <CodeBlock
                                code={`{
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
}`}
                            />
                        </EndpointCard>

                        <EndpointCard
                            method="GET"
                            path="/orders/{orderId}"
                            description="Single order detail — credentials + live OS templates for reinstall"
                        >
                            <CodeBlock
                                code={`{
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
  },
  "management": {
    "available": true,
    "supportedActions": ["start", "stop", "restart", "status", "sync", "templates", "reinstall", "resetmac", "reconfigure-network"],
    "reinstallRequiresOs": true,
    "osOptions": ["Windows Server 2022", "Windows Server 2025", "Ubuntu 22.04"],
    "osTemplates": [
      { "id": "12", "name": "Windows Server 2022" },
      { "id": "18", "name": "Windows Server 2025" },
      { "id": "4", "name": "Ubuntu 22.04" }
    ]
  }
}`}
                            />
                            <p className="mt-3 text-sm premium-dashboard-subtitle">
                                osTemplates Ocean panel ke reinstall dropdown jaisi live list hai (2022, 2025, Ubuntu,
                                etc.). Reinstall ke liye osType me id ya name bhejo.{' '}
                                <code>resetmac</code> aur <code>reconfigure-network</code> sirf ADVPS / Reseller-panel VPS par — har product par nahi.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            method="POST"
                            path="/orders/manage"
                            description="Server actions: start, stop, restart, status, templates, reinstall, changeos, resetmac, reconfigure-network, sync"
                        >
                            <CodeBlock
                                label="Request body"
                                code={`{
  "orderId": "65b...",
  "action": "reinstall",
  "osType": "Windows Server 2025"
}`}
                            />
                            <div className="mt-3">
                                <p className="premium-reseller-eyebrow mb-1.5">Actions</p>
                                <ul className="space-y-1.5 text-sm premium-dashboard-subtitle">
                                    <li><code>start</code> — VPS start</li>
                                    <li><code>stop</code> — VPS stop</li>
                                    <li><code>restart</code> — Restart</li>
                                    <li>
                                        <code>status</code> — Online/offline (powerState: running|stopped)
                                    </li>
                                    <li>
                                        <code>templates</code> — Live OS list (same as Ocean reinstall: 2022, 2025,
                                        Ubuntu, …)
                                    </li>
                                    <li>
                                        <code>reinstall</code> — Rebuild OS — osType = template id ya name from
                                        osTemplates
                                    </li>
                                    <li><code>format</code> — Alias of reinstall</li>
                                    <li><code>changeos</code> — OS change (SmartVPS)</li>
                                    <li>
                                        <code>resetmac</code> — New MAC address (ADVPS + Reseller-panel VPS only; alias{' '}
                                        <code>reset-mac</code>)
                                    </li>
                                    <li>
                                        <code>reconfigure-network</code> — Repair primary NIC / network on Hostheaven-style panels
                                    </li>
                                    <li><code>sync</code> — Provider se status / password sync</li>
                                </ul>
                            </div>
                            <CodeBlock
                                label="Templates request"
                                code={`{ "orderId": "65b...", "action": "templates" }`}
                            />
                            <CodeBlock
                                label="MAC reset request"
                                code={`{ "orderId": "65b...", "action": "resetmac" }`}
                            />
                            <CodeBlock
                                label="Network reconfigure request"
                                code={`{ "orderId": "65b...", "action": "reconfigure-network" }`}
                            />
                            <CodeBlock
                                label="Status response"
                                code={`{
  "success": true,
  "action": "status",
  "orderId": "65b...",
  "ipAddress": "103.148.205.10",
  "message": "Status retrieved",
  "data": { "powerState": "running" },
  "timestamp": "2024-03-20T10:00:00.000Z"
}`}
                            />
                        </EndpointCard>
                    </TabsContent>

                    <TabsContent value="panel" className="space-y-4">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Reseller Panel API
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    XiteNodes-style paths for wallet billing, VM lifecycle, white-label customers and
                                    add-ons. Legacy <code>/orders</code> and <code>/products</code> paths still work.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <CodeBlock
                                    label="Index"
                                    code={`curl "${baseUrl}" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"`}
                                />
                            </CardContent>
                        </Card>

                        <EndpointCard method="GET" path="/" description="Reseller account summary + API index">
                            <p className="text-sm premium-dashboard-subtitle">
                                Returns <code>panelEndpoints</code> — full list of panel routes below.
                            </p>
                        </EndpointCard>

                        <EndpointCard method="GET" path="/wallet" description="Reseller wallet balance, minimum + credit limit">
                            <p className="text-sm premium-dashboard-subtitle">
                                Same as legacy wallet endpoint. Includes recent transactions inline.
                            </p>
                        </EndpointCard>

                        <EndpointCard method="GET" path="/transactions" description="Reseller wallet ledger">
                            <CodeBlock
                                code={`{
  "success": true,
  "currency": "INR",
  "balance": 50000,
  "count": 12,
  "transactions": [
    { "type": "deduction", "amount": 1200, "description": "Reseller API order ..." }
  ]
}`}
                            />
                        </EndpointCard>

                        <EndpointCard method="GET" path="/plans" description="Active reseller plans with your prices">
                            <p className="text-sm premium-dashboard-subtitle">
                                Alias of <code>GET /products</code>. Query <code>?id=PLAN_ID</code> for one plan.
                            </p>
                            <CodeBlock
                                code={`curl "${baseUrl}/plans" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET"`}
                            />
                        </EndpointCard>

                        <EndpointCard method="GET" path="/vms" description="List reseller VMs">
                            <p className="text-sm premium-dashboard-subtitle">
                                Alias of <code>GET /orders</code>. Returns <code>vms[]</code> instead of <code>orders[]</code>.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            method="POST"
                            path="/vms"
                            description="Deploy a VM — charged from reseller wallet, auto-provisioned"
                        >
                            <CodeBlock
                                label="Request body"
                                code={`{
  "planId": "65a...",
  "memoryOption": "4GB",
  "userEmail": "customer@yourdomain.com",
  "os": "Ubuntu 22"
}`}
                            />
                            <p className="text-sm premium-dashboard-subtitle mt-2">
                                Accepts <code>planId</code> or legacy <code>productId</code>.
                            </p>
                        </EndpointCard>

                        <EndpointCard method="PATCH" path="/vms/{id}" description="Toggle auto-renew or update customer email">
                            <CodeBlock
                                code={`{ "autoRenew": true, "customerEmail": "client@example.com" }`}
                            />
                        </EndpointCard>

                        <EndpointCard method="POST" path="/vms/{id}/renew" description="Renew a VPS from the reseller wallet">
                            <p className="text-sm premium-dashboard-subtitle">
                                <code>GET</code> on the same path returns the quote. Show a Renew button only when{' '}
                                <code>eligible</code> / <code>renewable</code> is true. Slot IP and Trial stay{' '}
                                <code>eligible: false</code>.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            method="GET"
                            path="/vms/{id}/plan"
                            description="Same-series upgrade/downgrade options + prorated quote"
                        />

                        <EndpointCard
                            method="POST"
                            path="/vms/{id}/plan"
                            description="Upgrade/downgrade VM plan (same series)"
                        >
                            <p className="text-sm premium-dashboard-subtitle">
                                Plan changes that need provider-side RAM migration — contact support or use reinstall via{' '}
                                <code>POST /orders/manage</code>.
                            </p>
                        </EndpointCard>

                        <EndpointCard
                            method="POST"
                            path="/vms/{id}/assign"
                            description="Assign or unassign VM to a white-label customer"
                        >
                            <CodeBlock
                                code={`{ "customerId": "65f...", "customerEmail": "client@example.com" }
{ "unassign": true }`}
                            />
                        </EndpointCard>

                        <EndpointCard method="GET" path="/customers" description="List white-label customers" />
                        <EndpointCard
                            method="POST"
                            path="/customers"
                            description="Create white-label customer (password optional — invite flow)"
                        >
                            <CodeBlock code={`{ "email": "client@example.com", "displayName": "Acme Hosting" }`} />
                        </EndpointCard>
                        <EndpointCard method="GET" path="/customers/{id}" description="Get one customer" />
                        <EndpointCard method="PATCH" path="/customers/{id}" description="Update customer display name">
                            <CodeBlock code={`{ "displayName": "New Name" }`} />
                        </EndpointCard>
                        <EndpointCard
                            method="DELETE"
                            path="/customers/{id}"
                            description="Remove customer — VMs unassigned, not deleted"
                        />

                        <EndpointCard method="GET" path="/import" description="List importable non-reseller VMs + cost" />
                        <EndpointCard method="POST" path="/import" description="Import VM into reseller program" />

                        <EndpointCard method="GET" path="/addons" description="IP-rotation quota + buyable packs" />
                        <EndpointCard method="POST" path="/addons" description="Buy rotation pack from wallet" />
                    </TabsContent>

                    <TabsContent value="proxies" className="space-y-4">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg flex items-center gap-2 premium-dashboard-title">
                                    <Network className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                    HTTP proxy products
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Proxies use the same order endpoints, but you choose an IP range instead of a RAM
                                    plan
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm premium-dashboard-subtitle">
                                    Proxy products are returned by <code>GET /products</code> with{' '}
                                    <code>productType: "proxy"</code>. Instead of RAM sizes, their{' '}
                                    <code>memoryOptions</code> are keyed by IP range, and the same values are listed
                                    in <code>groupTags</code>. Pick the range your customer wants and pass it as{' '}
                                    <code>memoryOption</code>.
                                </p>

                                <CodeBlock
                                    label="Proxy product in the catalogue"
                                    code={`{
  "_id": "65c...",
  "name": "Dynamic Multi-IP Power Series",
  "productType": "proxy",
  "serverType": "Proxy",
  "os": "PROXY",
  "available": true,
  "groupTags": ["103.157", "103.174"],
  "memoryOptions": {
    "103.157": { "price": 500 },
    "103.174": { "price": 500 }
  }
}`}
                                />

                                <CodeBlock
                                    label="Ordering a proxy"
                                    code={`curl -X POST "${baseUrl}/orders" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-api-secret: YOUR_API_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "productId": "65c...",
    "memoryOption": "103.157",
    "userEmail": "customer@yourdomain.com"
  }'`}
                                />

                                <p className="text-sm premium-dashboard-subtitle">
                                    You may also send the range as <code>groupTag</code> if that reads better in your
                                    codebase — both fields are accepted. The <code>os</code> field is ignored for
                                    proxies.
                                </p>

                                <CodeBlock
                                    label="Delivered proxy order"
                                    code={`{
  "success": true,
  "order": {
    "id": "65d...",
    "productType": "proxy",
    "memory": "103.157",
    "status": "confirmed",
    "provisioningStatus": "completed",
    "ipAddress": "103.157.194.50:3128",
    "username": "black",
    "password": "Secure@Pass1"
  }
}`}
                                />

                                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-100">
                                    <Network className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-300" />
                                    <p>
                                        Hand the credentials to your customer as{' '}
                                        <code>host:port:username:password</code> — in the example above that is{' '}
                                        <code>103.157.194.50:3128:black:Secure@Pass1</code>.
                                    </p>
                                </div>

                                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-100">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
                                    <p>
                                        Proxies are not virtual machines, so <code>POST /orders/manage</code> power
                                        actions do not apply to them. Catalogue proxy plans can renew like a VPS.
                                        Slot IP packages cannot — buy a new package when one expires.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="errors" className="space-y-4">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Status codes
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Every error response includes a human-readable <code>message</code>
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {[
                                    { code: '200', text: 'Request succeeded', tone: 'ok' },
                                    { code: '201', text: 'Order created', tone: 'ok' },
                                    { code: '400', text: 'Bad request — invalid product or memory option', tone: 'warn' },
                                    { code: '401', text: 'Unauthorized — missing or incorrect API key or secret', tone: 'bad' },
                                    { code: '402', text: 'Insufficient wallet balance', tone: 'bad' },
                                    { code: '403', text: 'Reseller account is inactive or suspended', tone: 'bad' },
                                    { code: '404', text: 'Order or product not found', tone: 'muted' },
                                    { code: '409', text: 'Product is out of stock', tone: 'warn' },
                                    { code: '429', text: 'Rate limit exceeded — slow down your requests', tone: 'warn' },
                                    { code: '500', text: 'Internal server error', tone: 'bad' },
                                ].map((row) => (
                                    <div
                                        key={row.code}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
                                    >
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'font-mono text-[11px]',
                                                row.tone === 'ok' &&
                                                    'border-emerald-500/30 text-emerald-700 bg-emerald-500/10 dark:text-emerald-200',
                                                row.tone === 'warn' &&
                                                    'border-amber-500/30 text-amber-700 bg-amber-500/10 dark:text-amber-200',
                                                row.tone === 'bad' &&
                                                    'border-red-500/30 text-red-700 bg-red-500/10 dark:text-red-300',
                                                row.tone === 'muted' && 'border-border text-muted-foreground',
                                            )}
                                        >
                                            {row.code}
                                        </Badge>
                                        <span className="text-sm premium-dashboard-subtitle text-right">
                                            {row.text}
                                        </span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="examples" className="space-y-4">
                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Node.js — end-to-end integration
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Check the wallet, buy a server, wait for the IP, then confirm it is online
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <CodeBlock
                                    code={`const axios = require('axios');

const client = axios.create({
  baseURL: '${baseUrl}',
  headers: {
    'x-api-key': process.env.OCEAN_RESELLER_KEY,
    'x-api-secret': process.env.OCEAN_RESELLER_SECRET,
  },
});

async function sellServer(customerEmail) {
  const wallet = await client.get('/wallet');
  console.log('Balance:', wallet.data.balance);

  const { data: catalog } = await client.get('/products');
  const product = catalog.products.find((p) => p.memoryOptions['4GB']);

  const { data: purchase } = await client.post('/orders', {
    productId: product._id,
    memoryOption: '4GB',
    userEmail: customerEmail,
    os: 'Ubuntu 22',
  });
  const orderId = purchase.order.id;

  let order;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const res = await client.get('/orders/' + orderId);
    order = res.data.order;
    if (order.ipAddress) break;
  }

  const status = await client.post('/orders/manage', { orderId, action: 'status' });
  console.log('Power state:', status.data.data.powerState);

  return order;
}`}
                                />
                            </CardContent>
                        </Card>

                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    Node.js — selling a proxy
                                </CardTitle>
                                <CardDescription className="premium-dashboard-subtitle">
                                    Pick an IP range from the catalogue and return the formatted credentials
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <CodeBlock
                                    code={`async function sellProxy(customerEmail, preferredRange) {
  const { data: catalog } = await client.get('/products');
  const proxy = catalog.products.find((p) => p.productType === 'proxy');
  const range = preferredRange || proxy.groupTags[0];

  const { data: purchase } = await client.post('/orders', {
    productId: proxy._id,
    memoryOption: range,
    userEmail: customerEmail,
  });

  let order = purchase.order;
  for (let i = 0; i < 30 && !order.ipAddress; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const res = await client.get('/orders/' + order.id);
    order = res.data.order;
  }

  return \`\${order.ipAddress}:\${order.username}:\${order.password}\`;
}`}
                                />
                            </CardContent>
                        </Card>

                        <Card className={softCard}>
                            <CardHeader>
                                <CardTitle className="text-base sm:text-lg premium-dashboard-title">
                                    PHP — cURL
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CodeBlock
                                    code={`<?php
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
print_r(json_decode($response, true));`}
                                />
                            </CardContent>
                        </Card>

                        <Card className={softCard}>
                            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                                <p className="text-sm premium-dashboard-subtitle">
                                    Need your keys or want to check your balance?
                                </p>
                                <Button variant="outline" size="sm" asChild className="premium-btn-outline">
                                    <Link href="/dashboard/reseller-wallet">
                                        Open Reseller Console
                                        <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
