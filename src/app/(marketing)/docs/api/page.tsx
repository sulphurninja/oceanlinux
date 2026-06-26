'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen,
  Key,
  Server,
  CreditCard,
  Shield,
  Code,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  Zap,
  AlertTriangle,
  Globe,
  Lock
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import PublicPageHero from '@/components/landing/PublicPageHero';

const APIDocsPage = () => {
  const [copiedCode, setCopiedCode] = React.useState<string>('');
  const [apiBase, setApiBase] = React.useState('https://oceanlinux.com/api/v1');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiBase(`${window.location.origin}/api/v1`);
    }
  }, []);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const CodeBlock = ({ code, language, id }: { code: string; language: string; id: string }) => (
    <div className="relative">
      <div className="flex items-center justify-between bg-white/5 p-3 rounded-t-lg border border-white/10">
        <Badge className="premium-tag text-xs">{language}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copyToClipboard(code, id)}
          className="h-7 w-7 p-0 text-white/60 hover:text-white"
        >
          {copiedCode === id ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="bg-black/30 p-4 rounded-b-lg overflow-x-auto text-sm border border-t-0 border-white/10">
        <code className="text-emerald-100/90">{code}</code>
      </pre>
    </div>
  );

  return (
    <>
      <PublicPageHero
        eyebrow="Developer API"
        title="OceanLinux"
        titleAccent="REST API Documentation"
        description="Integrate VPS provisioning, wallet management, and order automation into your applications with our REST API."
        badge={
          <span className="premium-chip inline-flex items-center gap-2">
            <Code className="w-4 h-4" />
            REST API · JSON · Bearer Auth
          </span>
        }
      />
      <div className="premium-page-section">
        <div className="container mx-auto container-padding py-6 sm:py-8 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            <Card className="premium-glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="premium-icon-box w-8 h-8">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Base URL</p>
                    <p className="text-xs text-white/45">{apiBase.replace('https://', '').replace('http://', '')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="premium-glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="premium-icon-box w-8 h-8">
                    <Key className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Authentication</p>
                    <p className="text-xs text-white/45">Bearer Token</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="premium-glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="premium-icon-box w-8 h-8">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Rate Limit</p>
                    <p className="text-xs text-white/45">1000/month</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="premium-glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="premium-icon-box w-8 h-8">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Security</p>
                    <p className="text-xs text-white/45">HTTPS Only</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8 min-w-0">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1 h-full min-w-0">
            <Card className="premium-glass-card border-0 shadow-none lg:sticky lg:top-24">
              <CardHeader>
                <CardTitle className="text-lg text-white">Quick Navigation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {[
                  ["#getting-started", "Getting Started"],
                  ["#authentication", "Authentication"],
                  ["#wallet", "Wallet Management"],
                  ["#servers", "Server Operations"],
                  ["#errors", "Error Handling"],
                  ["#examples", "Code Examples"],
                ].map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className="block px-3 py-2 rounded-lg text-sm text-white/60 hover:text-emerald-300 hover:bg-emerald-400/10 transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8 min-w-0">
            {/* Getting Started */}
            <section id="getting-started">
              <Card className="premium-glass-card border-0 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Zap className="h-5 w-5 text-emerald-400" />
                    Getting Started
                  </CardTitle>
                  <CardDescription className="text-white/50">
                    Learn how to quickly get started with the OceanLinux API
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-3">1. Get Your API Key</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      First, you need to create an API key from your dashboard.
                    </p>
                    <Button asChild className="premium-btn-primary w-auto h-10 px-5">
                      <Link href="/dashboard/api-keys">
                        <Key className="h-4 w-4 mr-2" />
                        Create API Key
                      </Link>
                    </Button>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">2. Set Up Authentication</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Include your API key in the Authorization header of every request.
                    </p>
                    <CodeBlock
                      id="auth-example"
                      language="bash"
                      code={`curl -H "Authorization: Bearer YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     ${apiBase}/wallet`}
                    />
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">3. Check Your Wallet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Before purchasing servers, ensure you have sufficient wallet balance.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Authentication */}
            <section id="authentication">
              <Card className="premium-glass-card border-0 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Authentication
                  </CardTitle>
                  <CardDescription>
                    Secure your API requests with proper authentication
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-3">API Key Authentication</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      All API requests must include a valid API key in the Authorization header using Bearer token format.
                    </p>
                    <CodeBlock
                      id="auth-header"
                      language="http"
                      code={`Authorization: Bearer ol_1234567890abcdef...`}
                    />
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">Permissions</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      API keys can have different permission levels:
                    </p>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <p className="font-medium">servers:read</p>
                          <p className="text-xs text-muted-foreground">View server information</p>
                        </div>
                        <Badge variant="outline">Read</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <p className="font-medium">servers:write</p>
                          <p className="text-xs text-muted-foreground">Purchase and manage servers</p>
                        </div>
                        <Badge variant="outline">Write</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <p className="font-medium">wallet:read</p>
                          <p className="text-xs text-muted-foreground">View wallet balance</p>
                        </div>
                        <Badge variant="outline">Read</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Wallet Management */}
            <section id="wallet">
              <Card className="premium-glass-card border-0 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Wallet Management
                  </CardTitle>
                  <CardDescription>
                    Manage your wallet balance for API-based server purchases
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Tabs defaultValue="balance" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="balance">Check Balance</TabsTrigger>
                      <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    </TabsList>

                    <TabsContent value="balance" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">GET /v1/wallet</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Retrieve your current wallet balance and recent transactions.
                        </p>
                        <CodeBlock
                          id="wallet-get"
                          language="bash"
                          code={`curl -H "Authorization: Bearer YOUR_API_KEY" \\
     ${apiBase}/wallet`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Response</h4>
                        <CodeBlock
                          id="wallet-response"
                          language="json"
                          code={`{
  "balance": 2500.00,
  "currency": "INR",
  "totalCredits": 5000.00,
  "totalDebits": 2500.00,
  "transactions": [
    {
      "_id": "64f8a5b2c1234567890abcde",
      "type": "debit",
      "amount": 1200.00,
      "description": "Server purchase - Mumbai",
      "balanceBefore": 3700.00,
      "balanceAfter": 2500.00,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "isActive": true
}`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="transactions" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Transaction Types</h4>
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                            <span className="font-medium">credit</span>
                            <Badge className="bg-green-100 text-green-800">Money Added</Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                            <span className="font-medium">debit</span>
                            <Badge className="bg-red-100 text-red-800">Money Spent</Badge>
                          </div>
                          <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                            <span className="font-medium">refund</span>
                            <Badge className="bg-blue-100 text-blue-800">Money Refunded</Badge>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Server Operations */}
            <section id="servers">
              <Card className="premium-glass-card border-0 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Server Operations
                  </CardTitle>
                  <CardDescription>
                    Purchase and manage servers using your wallet balance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Tabs defaultValue="list" className="w-full">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto gap-1">
                      <TabsTrigger value="list">List Servers</TabsTrigger>
                      <TabsTrigger value="purchase">Purchase</TabsTrigger>
                      <TabsTrigger value="manage">Manage</TabsTrigger>
                    </TabsList>

                    <TabsContent value="list" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">GET /v1/servers</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          List all available servers for purchase.
                        </p>
                        <CodeBlock
                          id="servers-list"
                          language="bash"
                          code={`curl -H "Authorization: Bearer YOUR_API_KEY" \\
     ${apiBase}/servers`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Query Parameters</h4>
                        <div className="space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 border border-primary/30 rounded text-sm">
                            <code>location</code>
                            <span className="text-muted-foreground">Filter by location</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 border border-primary/30 rounded text-sm">
                            <code>min_ram</code>
                            <span className="text-muted-foreground">Minimum RAM (GB)</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 border border-primary/30 rounded text-sm">
                            <code>max_price</code>
                            <span className="text-muted-foreground">Maximum price</span>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="purchase" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">POST /v1/servers/purchase</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Purchase a server using wallet balance.
                        </p>
                        <CodeBlock
                          id="server-purchase"
                          language="bash"
                          code={`curl -X POST \\
     -H "Authorization: Bearer YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{
       "serverId": "PRODUCT_ID_FROM_LIST",
       "memory": "4GB",
       "duration": 1,
       "specifications": {
         "os": "Ubuntu 22"
       }
     }' \\
     ${apiBase}/servers/purchase`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Request Body</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 border border-primary/30 rounded">
                            <code>serverId</code>
                            <span className="text-muted-foreground">Required — product id from GET /servers</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 border border-primary/30 rounded">
                            <code>memory</code>
                            <span className="text-muted-foreground">Required — plan key (e.g. 4GB)</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 border border-primary/30 rounded">
                            <code>duration</code>
                            <span className="text-muted-foreground">Optional — months (default 1)</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 border border-primary/30 rounded">
                            <code>specifications.os</code>
                            <span className="text-muted-foreground">Ubuntu 22, CentOS 7, or Windows 2022 64</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Success Response</h4>
                        <CodeBlock
                          id="purchase-success"
                          language="json"
                          code={`{
  "success": true,
  "message": "Server purchased successfully",
  "order": {
    "id": "64f8a5b2c1234567890abcde",
    "productName": "Mumbai - 8GB RAM, 4 CPU",
    "amount": 3600.00,
    "originalAmount": 4000.00,
    "discount": 400.00,
    "duration": 3,
    "server": {
      "ip": "103.45.67.89",
      "location": "Mumbai",
      "specs": {
        "ram": "8GB",
        "cpu": "4 Cores",
        "storage": "160GB SSD"
      }
    },
    "status": "confirmed",
    "estimatedDeployment": "5-10 minutes"
  },
  "wallet": {
    "previousBalance": 5000.00,
    "newBalance": 1400.00,
    "transactionId": "64f8a5b2c1234567890abcdf"
  }
}`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="manage" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">GET /v1/servers/my-servers</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          List your active servers.
                        </p>
                        <CodeBlock
                          id="my-servers"
                          language="bash"
                          code={`curl -H "Authorization: Bearer YOUR_API_KEY" \\
     ${apiBase}/servers/my-servers`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">{`POST /v1/servers/{orderId}/reboot`}</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Reboot your server using the order id from my-servers.
                        </p>
                        <CodeBlock
                          id="server-reboot"
                          language="bash"
                          code={`curl -X POST \\
     -H "Authorization: Bearer YOUR_API_KEY" \\
     ${apiBase}/servers/ORDER_ID/reboot`}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Error Handling */}
            <section id="errors">
              <Card className="premium-glass-card border-0 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Error Handling
                  </CardTitle>
                  <CardDescription>
                    Understanding API error responses and status codes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-3">HTTP Status Codes</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <Badge className="bg-green-100 text-green-800">200</Badge>
                          <span className="ml-2">Success</span>
                        </div>
                        <span className="text-sm text-muted-foreground">Request successful</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <Badge className="bg-red-100 text-red-800">400</Badge>
                          <span className="ml-2">Bad Request</span>
                        </div>
                        <span className="text-sm text-muted-foreground">Invalid request parameters</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <Badge className="bg-red-100 text-red-800">401</Badge>
                          <span className="ml-2">Unauthorized</span>
                        </div>
                        <span className="text-sm text-muted-foreground">Invalid or missing API key</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <Badge className="bg-red-100 text-red-800">403</Badge>
                          <span className="ml-2">Forbidden</span>
                        </div>
                        <span className="text-sm text-muted-foreground">Insufficient permissions</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-primary/30 rounded">
                        <div>
                          <Badge className="bg-yellow-100 text-yellow-800">429</Badge>
                          <span className="ml-2">Rate Limited</span>
                        </div>
                        <span className="text-sm text-muted-foreground">API rate limit exceeded</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">Error Response Format</h3>
                    <CodeBlock
                      id="error-format"
                      language="json"
                      code={`{
  "error": "Insufficient wallet balance",
  "message": "Your wallet balance (₹500) is insufficient for this purchase (₹1200)",
  "code": "INSUFFICIENT_BALANCE",
  "required": 1200.00,
  "available": 500.00,
  "timestamp": "2024-01-15T10:30:00Z"
}`}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Code Examples */}
            <section id="examples">
              <Card className="premium-glass-card border-0 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Code Examples
                  </CardTitle>
                  <CardDescription>
                    Ready-to-use code snippets in different languages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-muted-foreground">
                      Complete examples for common API operations
                    </p>
                    <Button asChild variant="outline">
                      <Link href="/docs/api/examples">
                        View All Examples
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>

                  <Tabs defaultValue="javascript" className="w-full">
                    <TabsList>
                      <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                      <TabsTrigger value="python">Python</TabsTrigger>
                      <TabsTrigger value="php">PHP</TabsTrigger>
                    </TabsList>

                    <TabsContent value="javascript" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Purchase Server (Node.js)</h4>
                        <CodeBlock
                          id="js-example"
                          language="javascript"
                          code={`const axios = require('axios');

const API_KEY = 'your_api_key_here';
const BASE_URL = '${apiBase}';

async function purchaseServer() {
  try {
    // Check wallet balance first
    const wallet = await axios.get(\`\${BASE_URL}/wallet\`, {
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Wallet Balance:', wallet.data.balance);

    // Purchase server
    const purchase = await axios.post(\`\${BASE_URL}/servers/purchase\`, {
      serverId: 'PRODUCT_ID_FROM_LIST',
      memory: '4GB',
      duration: 1,
      specifications: {
        os: 'Ubuntu 22',
        hostname: 'my-api-server'
      }
    }, {
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Purchase successful:', purchase.data);
    return purchase.data;

  } catch (error) {
    if (error.response?.status === 400) {
      console.error('Insufficient balance:', error.response.data);
    } else {
      console.error('Purchase failed:', error.message);
    }
    throw error;
  }
}

purchaseServer();`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="python" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Purchase Server (Python)</h4>
                        <CodeBlock
                          id="python-example"
                          language="python"
                          code={`import requests
import json

API_KEY = 'your_api_key_here'
BASE_URL = '${apiBase}'

def purchase_server():
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }

    try:
        # Check wallet balance
        wallet_response = requests.get(f'{BASE_URL}/wallet', headers=headers)
        wallet_response.raise_for_status()

        wallet_data = wallet_response.json()
        print(f"Wallet Balance: ₹{wallet_data['balance']}")

        # Purchase server
        purchase_data = {
            'serverId': 'PRODUCT_ID_FROM_LIST',
            'memory': '4GB',
            'duration': 1,
            'specifications': {
                'os': 'Ubuntu 22',
                'hostname': 'my-api-server'
            }
        }

        purchase_response = requests.post(
            f'{BASE_URL}/servers/purchase',
            headers=headers,
            json=purchase_data
        )
        purchase_response.raise_for_status()

        result = purchase_response.json()
        print(f"Purchase successful: {result}")
        return result

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 400:
            error_data = e.response.json()
            print(f"Insufficient balance: {error_data}")
        else:
            print(f"Purchase failed: {e}")
        raise e

if __name__ == "__main__":
    purchase_server()`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="php" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Purchase Server (PHP)</h4>
                        <CodeBlock
                          id="php-example"
                          language="php"
                          code={`<?php

class OceanLinuxAPI {
    private $apiKey;
    private $baseUrl = '${apiBase}';

    public function __construct($apiKey) {
        $this->apiKey = $apiKey;
    }

    private function makeRequest($method, $endpoint, $data = null) {
        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json'
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->baseUrl . $endpoint);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        if ($method === 'POST' && $data) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decodedResponse = json_decode($response, true);

        if ($httpCode >= 400) {
            throw new Exception("API Error: " . $decodedResponse['error']);
        }

        return $decodedResponse;
    }

    public function getWalletBalance() {
        return $this->makeRequest('GET', '/wallet');
    }

    public function purchaseServer($serverId, $memory, $duration = 1, $specifications = []) {
        $data = [
            'serverId' => $serverId,
            'memory' => $memory,
            'duration' => $duration,
            'specifications' => $specifications
        ];

        return $this->makeRequest('POST', '/servers/purchase', $data);
    }
}

// Usage
try {
    $api = new OceanLinuxAPI('your_api_key_here');

    // Check wallet balance
    $wallet = $api->getWalletBalance();
    echo "Wallet Balance: ₹" . $wallet['balance'] . "\\n";

    // Purchase server
    $result = $api->purchaseServer(
        'PRODUCT_ID_FROM_LIST',
        '4GB',
        1,
        [
            'os' => 'Ubuntu 22',
            'hostname' => 'my-api-server'
        ]
    );

    echo "Purchase successful: " . json_encode($result, JSON_PRETTY_PRINT) . "\\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\\n";
}

?>`}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
        </div>
      </div>
    </>
  );
};

export default APIDocsPage;
