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
import { cn } from '@/lib/utils';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';

const APIDocsPage = () => {
  const [copiedCode, setCopiedCode] = React.useState<string>('');

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const CodeBlock = ({ code, language, id }: { code: string; language: string; id: string }) => (
    <div className="relative">
      <div className="flex items-center justify-between bg-muted p-3 rounded-t-lg border border-primary/30">
        <Badge variant="secondary" className="text-xs">
          {language}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copyToClipboard(code, id)}
          className="h-7 w-7 p-0"
        >
          {copiedCode === id ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="bg-muted/50 p-4 rounded-b-lg overflow-x-auto text-sm">
        <code className="text-foreground">{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* <Header /> */}
      {/* Header */}
      <div className="border border-primary/30 -b bg-card">
        <div className="container mx-auto px-4 py-8">
          <div className='flex justify- mb-12'>
            <img src='/oceanlinux.png' className='h-20' />
            <div className='flex justify-center items-center space-x-1 opacity-80 hover:opacity-100 transition-opacity mt-2'>
              <img src='/backtick.png' className='h-4 w-auto dark:filter-none' alt="Backtick" />
              <p className="text-xs text-background/70 dark:text-muted-foreground">A Product of Backtick Labs</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-12 mb-4">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">API Documentation</h1>
              <p className="text-muted-foreground">
                Complete reference for OceanLinux API v1
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <Globe className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Base URL</p>
                    <p className="text-xs text-muted-foreground">oceanlinux.com/api/v1</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <Key className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Authentication</p>
                    <p className="text-xs text-muted-foreground">Bearer Token</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <Zap className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Rate Limit</p>
                    <p className="text-xs text-muted-foreground">1000/month</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                    <Lock className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Security</p>
                    <p className="text-xs text-muted-foreground">HTTPS Only</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1 h-full">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Quick Navigation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="#getting-started" className="block p-2 rounded hover:bg-muted transition-colors">
                  Getting Started
                </Link>
                <Link href="#authentication" className="block p-2 rounded hover:bg-muted transition-colors">
                  Authentication
                </Link>
                <Link href="#wallet" className="block p-2 rounded hover:bg-muted transition-colors">
                  Wallet Management
                </Link>
                <Link href="#servers" className="block p-2 rounded hover:bg-muted transition-colors">
                  Server Operations
                </Link>
                <Link href="#errors" className="block p-2 rounded hover:bg-muted transition-colors">
                  Error Handling
                </Link>
                <Link href="#examples" className="block p-2 rounded hover:bg-muted transition-colors">
                  Code Examples
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {/* Getting Started */}
            <section id="getting-started">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Getting Started
                  </CardTitle>
                  <CardDescription>
                    Learn how to quickly get started with the OceanLinux API
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-3">1. Get Your API Key</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      First, you need to create an API key from your dashboard.
                    </p>
                    <Button asChild>
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
     https://oceanlinux.com/api/v1/wallet`}
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
              <Card>
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
              <Card>
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
     https://oceanlinux.com/api/v1/wallet`}
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
              <Card>
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
                    <TabsList className="grid w-full grid-cols-3">
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
     https://oceanlinux.com/api/v1/servers`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Query Parameters</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-2 border border-primary/30 rounded text-sm">
                            <code>location</code>
                            <span className="text-muted-foreground">Filter by location</span>
                          </div>
                          <div className="flex items-center justify-between p-2 border border-primary/30 rounded text-sm">
                            <code>min_ram</code>
                            <span className="text-muted-foreground">Minimum RAM (GB)</span>
                          </div>
                          <div className="flex items-center justify-between p-2 border border-primary/30 rounded text-sm">
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
       "serverId": "64f8a5b2c1234567890abcde",
       "duration": 3,
       "specifications": {
         "os": "Ubuntu 22.04",
         "hostname": "my-server"
       }
     }' \\
     https://oceanlinux.com/api/v1/servers/purchase`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Request Body</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between p-2 border border-primary/30 rounded">
                            <code>serverId</code>
                            <span className="text-muted-foreground">Required - Server ID from listing</span>
                          </div>
                          <div className="flex items-center justify-between p-2 border border-primary/30 rounded">
                            <code>duration</code>
                            <span className="text-muted-foreground">Required - Duration in months</span>
                          </div>
                          <div className="flex items-center justify-between p-2 border border-primary/30 rounded">
                            <code>specifications</code>
                            <span className="text-muted-foreground">Optional - OS, hostname, etc.</span>
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
     https://oceanlinux.com/api/v1/servers/my-servers`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">{`POST /v1/servers/{serverId}/reboot`}</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Reboot a specific server.
                        </p>
                        <CodeBlock
                          id="server-reboot"
                          language="bash"
                          code={`curl -X POST \\
     -H "Authorization: Bearer YOUR_API_KEY" \\
     https://oceanlinux.com/api/v1/servers/64f8a5b2c1234567890abcde/reboot`}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Error Handling */}
            <section id="errors">
              <Card>
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
              <Card>
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
const BASE_URL = 'https://oceanlinux.com/api/v1';

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
      serverId: '64f8a5b2c1234567890abcde',
      duration: 3,
      specifications: {
        os: 'Ubuntu 22.04',
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
BASE_URL = 'https://oceanlinux.com/api/v1'

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
            'serverId': '64f8a5b2c1234567890abcde',
            'duration': 3,
            'specifications': {
                'os': 'Ubuntu 22.04',
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
    private $baseUrl = 'https://oceanlinux.com/api/v1';

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

    public function purchaseServer($serverId, $duration, $specifications = []) {
        $data = [
            'serverId' => $serverId,
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
        '64f8a5b2c1234567890abcde',
        3,
        [
            'os' => 'Ubuntu 22.04',
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
      <Footer />
    </div>
  );
};

export default APIDocsPage;
