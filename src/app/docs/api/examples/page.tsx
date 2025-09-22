'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Code,
  Copy,
  Check,
  Download,
  ExternalLink,
  Server,
  CreditCard,
  Settings,
  Monitor
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

const APIExamplesPage = () => {
  const [copiedCode, setCopiedCode] = React.useState<string>('');

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const CodeBlock = ({ code, language, id, title }: { code: string; language: string; id: string; title?: string }) => (
    <div className="relative">
      <div className="flex items-center justify-between bg-muted p-3 rounded-t-lg border border-primary/10">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {language}
          </Badge>
          {title && <span className="text-sm font-medium">{title}</span>}
        </div>
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
      <pre className="bg-muted/50 p-4 rounded-b-lg overflow-x-auto text-sm max-h-96">
        <code className="text-foreground">{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border border-primary/10 -b bg-card">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <Code className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">API Code Examples</h1>
                <p className="text-muted-foreground">
                  Ready-to-use code snippets for OceanLinux API integration
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/docs/api">
                <ExternalLink className="h-4 w-4 mr-2" />
                Back to Docs
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Examples</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="#wallet-operations" className="block p-2 rounded hover:bg-muted transition-colors">
                  <CreditCard className="h-4 w-4 inline mr-2" />
                  Wallet Operations
                </Link>
                <Link href="#server-management" className="block p-2 rounded hover:bg-muted transition-colors">
                  <Server className="h-4 w-4 inline mr-2" />
                  Server Management
                </Link>
                <Link href="#monitoring" className="block p-2 rounded hover:bg-muted transition-colors">
                  <Monitor className="h-4 w-4 inline mr-2" />
                  Monitoring
                </Link>
                <Link href="#automation" className="block p-2 rounded hover:bg-muted transition-colors">
                  <Settings className="h-4 w-4 inline mr-2" />
                  Automation Scripts
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {/* Wallet Operations */}
            <section id="wallet-operations">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Wallet Operations
                  </CardTitle>
                  <CardDescription>
                    Examples for managing wallet balance and transactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="check-balance" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="check-balance">Check Balance</TabsTrigger>
                      <TabsTrigger value="auto-recharge">Auto Recharge</TabsTrigger>
                      <TabsTrigger value="spending-alerts">Spending Alerts</TabsTrigger>
                    </TabsList>

                    <TabsContent value="check-balance" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Simple Balance Check (JavaScript)</h4>
                        <CodeBlock
                          id="balance-check-js"
                          language="javascript"
                          code={`async function checkWalletBalance() {
  const response = await fetch('https://api.oceanlinux.com/v1/wallet', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + process.env.OCEANLINUX_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }

  const data = await response.json();

  console.log(\`Current Balance: ₹\${data.balance}\`);
  console.log(\`Total Credits: ₹\${data.totalCredits}\`);
  console.log(\`Total Debits: ₹\${data.totalDebits}\`);

  // Check if balance is low
  if (data.balance < 1000) {
    console.warn('Warning: Low wallet balance!');
  }

  return data;
}

// Usage
checkWalletBalance().catch(console.error);`}
                        />
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Balance Check with Error Handling (Python)</h4>
                        <CodeBlock
                          id="balance-check-python"
                          language="python"
                          code={`import requests
import os
from datetime import datetime

def check_wallet_balance():
    """Check wallet balance with comprehensive error handling"""

    api_key = os.getenv('OCEANLINUX_API_KEY')
    if not api_key:
        raise ValueError("API key not found in environment variables")

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }

    try:
        response = requests.get(
            'https://api.oceanlinux.com/v1/wallet',
            headers=headers,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()

        # Log balance information
        print(f"[{datetime.now()}] Current Balance: ₹{data['balance']}")
        print(f"Total Credits: ₹{data['totalCredits']}")
        print(f"Total Debits: ₹{data['totalDebits']}")

        # Recent transactions
        if data.get('transactions'):
            print("\\nRecent Transactions:")
            for txn in data['transactions'][:5]:
                print(f"  {txn['type'].upper()}: ₹{txn['amount']} - {txn['description']}")

        # Balance alerts
        balance = data['balance']
        if balance < 500:
            print("⚠️  CRITICAL: Wallet balance very low!")
        elif balance < 1000:
            print("⚠️  WARNING: Wallet balance is low")
        else:
            print("✅ Wallet balance is healthy")

        return data

    except requests.exceptions.RequestException as e:
        print(f"Error checking wallet balance: {e}")
        raise
    except KeyError as e:
        print(f"Unexpected response format: {e}")
        raise

if __name__ == "__main__":
    check_wallet_balance()`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="auto-recharge" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Auto-Recharge Monitor (Python)</h4>
                        <CodeBlock
                          id="auto-recharge"
                          language="python"
                        code={`import requests
import time
import smtplib
from email.mime.text import MimeText
from datetime import datetime
import os

class WalletMonitor:
    def __init__(self, api_key, min_balance=1000, recharge_amount=5000):
        self.api_key = api_key
        self.min_balance = min_balance
        self.recharge_amount = recharge_amount
        self.base_url = 'https://api.oceanlinux.com/v1'

    def get_wallet_balance(self):
        """Get current wallet balance"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }

        response = requests.get(f'{self.base_url}/wallet', headers=headers)
        response.raise_for_status()
        return response.json()

    def send_alert(self, subject, message):
        """Send email alert for low balance"""
        try:
            smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
            smtp_port = int(os.getenv('SMTP_PORT', '587'))
            email_user = os.getenv('EMAIL_USER')
            email_pass = os.getenv('EMAIL_PASS')
            email_to = os.getenv('ALERT_EMAIL')

            if not all([email_user, email_pass, email_to]):
                print("Email credentials not configured")
                return

            msg = MimeText(message)
            msg['Subject'] = subject
            msg['From'] = email_user
            msg['To'] = email_to

            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()
            server.login(email_user, email_pass)
            server.send_message(msg)
            server.quit()

            print(f"Alert sent: {subject}")

        except Exception as e:
            print(f"Failed to send alert: {e}")

    def monitor_balance(self, check_interval=300):  # 5 minutes
        """Monitor wallet balance and send alerts"""
        print(f"Starting wallet monitor... (min balance: ₹{self.min_balance})")

        while True:
            try:
                wallet_data = self.get_wallet_balance()
                current_balance = wallet_data['balance']

                print(f"[{datetime.now()}] Current balance: ₹{current_balance}")

                if current_balance < self.min_balance:
                    alert_message = f"""
                    ⚠️ WALLET BALANCE ALERT ⚠️

                    Your OceanLinux wallet balance is running low:
                    Current Balance: ₹{current_balance}
                    Minimum Threshold: ₹{self.min_balance}

                    Please recharge your wallet to avoid service interruptions.
                    Recommended recharge: ₹{self.recharge_amount}

                    Recent transactions:
                    """

                    for txn in wallet_data.get('transactions', [])[:3]:
                        alert_message += f"
                    - {txn['type'].upper()}: ₹{txn['amount']} - {txn['description']}"

                    self.send_alert(
                        f"⚠️ Low Wallet Balance Alert - ₹{current_balance}",
                        alert_message
                    )

                time.sleep(check_interval)

            except Exception as e:
                print(f"Error monitoring wallet: {e}")
                time.sleep(60)  # Wait 1 minute before retrying

# Usage
if __name__ == "__main__":
    api_key = os.getenv('OCEANLINUX_API_KEY')
    monitor = WalletMonitor(api_key, min_balance=1000, recharge_amount=5000)
    monitor.monitor_balance()`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="spending-alerts" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Daily Spending Report (Node.js)</h4>
                        <CodeBlock
                          id="spending-report"
                          language="javascript"
                          code={`const axios = require('axios');
const cron = require('node-cron');

class SpendingTracker {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.oceanlinux.com/v1';
        this.headers = {
            'Authorization': \`Bearer \${apiKey}\`,
            'Content-Type': 'application/json'
        };
    }

    async getWalletData() {
        try {
            const response = await axios.get(\`\${this.baseUrl}/wallet\`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            throw new Error(\`Failed to fetch wallet data: \${error.message}\`);
        }
    }

    filterTransactionsByDate(transactions, days = 1) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        return transactions.filter(txn => {
            const txnDate = new Date(txn.createdAt);
            return txnDate >= cutoffDate;
        });
    }

    generateSpendingReport(transactions) {
        const totalSpent = transactions
            .filter(txn => txn.type === 'debit')
            .reduce((sum, txn) => sum + txn.amount, 0);

        const categorizedSpending = transactions
            .filter(txn => txn.type === 'debit')
            .reduce((acc, txn) => {
                const category = this.categorizeTransaction(txn.description);
                acc[category] = (acc[category] || 0) + txn.amount;
                return acc;
            }, {});

        return {
            totalSpent,
            categorizedSpending,
            transactionCount: transactions.filter(txn => txn.type === 'debit').length,
            transactions: transactions.filter(txn => txn.type === 'debit')
        };
    }

    categorizeTransaction(description) {
        if (description.includes('Server purchase')) return 'Servers';
        if (description.includes('API usage')) return 'API Calls';
        if (description.includes('Storage')) return 'Storage';
        if (description.includes('Bandwidth')) return 'Bandwidth';
        return 'Other';
    }

    async generateDailyReport() {
        try {
            console.log('\\n📊 Generating Daily Spending Report...');

            const walletData = await this.getWalletData();
            const dailyTransactions = this.filterTransactionsByDate(walletData.transactions, 1);
            const report = this.generateSpendingReport(dailyTransactions);

            console.log(\`\\n💰 Current Balance: ₹\${walletData.balance}\`);
            console.log(\`💸 Daily Spending: ₹\${report.totalSpent}\`);
            console.log(\`📝 Transactions Today: \${report.transactionCount}\`);

            if (Object.keys(report.categorizedSpending).length > 0) {
                console.log('\\n📋 Spending Breakdown:');
                Object.entries(report.categorizedSpending).forEach(([category, amount]) => {
                    console.log(\`  \${category}: ₹\${amount}\`);
                });
            }

            if (report.transactions.length > 0) {
                console.log('\\n📋 Recent Transactions:');
                report.transactions.slice(0, 5).forEach(txn => {
                    console.log(\`  • ₹\${txn.amount} - \${txn.description}\`);
                });
            }

            // Alerts
            if (report.totalSpent > 2000) {
                console.log('\\n⚠️  HIGH SPENDING ALERT: Daily spending exceeded ₹2000');
            }

            const spendingRate = report.totalSpent;
            const daysRemaining = Math.floor(walletData.balance / spendingRate);

            if (daysRemaining < 10) {
                console.log(\`\\n⚠️  BALANCE WARNING: At current spending rate, balance will last ~\${daysRemaining} days\`);
            }

            return report;

        } catch (error) {
            console.error('Error generating daily report:', error.message);
        }
    }

    startDailyReports() {
        // Run daily at 9:00 AM
        cron.schedule('0 9 * * *', () => {
            this.generateDailyReport();
        });

        // Run immediately for testing
        this.generateDailyReport();
    }
}

// Usage
const apiKey = process.env.OCEANLINUX_API_KEY;
const tracker = new SpendingTracker(apiKey);
tracker.startDailyReports();`}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Server Management */}
            <section id="server-management">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Server Management
                  </CardTitle>
                  <CardDescription>
                    Complete examples for server lifecycle management
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="purchase-flow" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="purchase-flow">Smart Purchase</TabsTrigger>
                      <TabsTrigger value="bulk-operations">Bulk Operations</TabsTrigger>
                      <TabsTrigger value="lifecycle">Lifecycle Management</TabsTrigger>
                    </TabsList>

                    <TabsContent value="purchase-flow" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Smart Server Purchase with Validation (Python)</h4>
                        <CodeBlock
                          id="smart-purchase"
                          language="python"
                          code={`import requests
import time
from typing import Dict, List, Optional

class ServerManager:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = 'https://api.oceanlinux.com/v1'
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def get_available_servers(self, filters: Dict = None) -> List[Dict]:
        """Get list of available servers with optional filters"""
        params = {}
        if filters:
            if 'location' in filters:
                params['location'] = filters['location']
            if 'min_ram' in filters:
                params['min_ram'] = filters['min_ram']
            if 'max_price' in filters:
                params['max_price'] = filters['max_price']

        response = requests.get(
            f'{self.base_url}/servers',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json().get('servers', [])

    def calculate_total_cost(self, server: Dict, duration: int) -> Dict:
        """Calculate total cost with discounts"""
        base_cost = server['price'] * duration
        discount = 0

        if duration >= 12:
            discount = base_cost * 0.15  # 15% yearly discount
        elif duration >= 6:
            discount = base_cost * 0.10  # 10% semi-annual discount
        elif duration >= 3:
            discount = base_cost * 0.05  # 5% quarterly discount

        return {
            'base_cost': base_cost,
            'discount': discount,
            'final_cost': base_cost - discount,
            'savings': discount
        }

    def check_wallet_balance(self) -> Dict:
        """Check current wallet balance"""
        response = requests.get(f'{self.base_url}/wallet', headers=self.headers)
        response.raise_for_status()
        return response.json()

    def find_best_server(self, requirements: Dict) -> Optional[Dict]:
        """Find the best server based on requirements"""
        servers = self.get_available_servers()

        # Filter servers based on requirements
        suitable_servers = []

        for server in servers:
            if not server.get('available'):
                continue

            # Check RAM requirement
            if requirements.get('min_ram'):
                server_ram = int(server['specs']['ram'].replace('GB', ''))
                if server_ram < requirements['min_ram']:
                    continue

            # Check location preference
            if requirements.get('preferred_locations'):
                if server['location'] not in requirements['preferred_locations']:
                    continue

            # Check budget
            if requirements.get('max_budget'):
                cost_info = self.calculate_total_cost(server, requirements.get('duration', 1))
                if cost_info['final_cost'] > requirements['max_budget']:
                    continue

            suitable_servers.append(server)

        if not suitable_servers:
            return None

        # Sort by price (ascending) or other criteria
        sort_by = requirements.get('sort_by', 'price')
        if sort_by == 'price':
            suitable_servers.sort(key=lambda x: x['price'])
        elif sort_by == 'ram':
            suitable_servers.sort(key=lambda x: int(x['specs']['ram'].replace('GB', '')), reverse=True)

        return suitable_servers[0]

    def purchase_server_smart(self, requirements: Dict) -> Dict:
        """Smart server purchase with validation and optimization"""

        print("🔍 Finding the best server for your requirements...")

        # Find best server
        best_server = self.find_best_server(requirements)
        if not best_server:
            raise Exception("No suitable servers found matching your requirements")

        duration = requirements.get('duration', 1)
        cost_info = self.calculate_total_cost(best_server, duration)

        print(f"✅ Found suitable server: {best_server['location']} - {best_server['specs']['ram']} RAM")
        print(f"💰 Cost breakdown:")
        print(f"   Base cost: ₹{cost_info['base_cost']}")
        if cost_info['discount'] > 0:
            print(f"   Discount: -₹{cost_info['discount']}")
        print(f"   Final cost: ₹{cost_info['final_cost']}")

        # Check wallet balance
        wallet = self.check_wallet_balance()
        if wallet['balance'] < cost_info['final_cost']:
            raise Exception(
                f"Insufficient wallet balance. Required: ₹{cost_info['final_cost']}, "
                f"Available: ₹{wallet['balance']}"
            )

        print(f"💳 Wallet balance: ₹{wallet['balance']} (sufficient)")

        # Confirm purchase
        if requirements.get('auto_confirm', False):
            confirm = True
        else:
            confirm = input("\\nProceed with purchase? (y/N): ").lower() == 'y'

        if not confirm:
            print("❌ Purchase cancelled by user")
            return {'status': 'cancelled'}

        # Make purchase
        purchase_data = {
            'serverId': best_server['_id'],
            'duration': duration,
            'specifications': requirements.get('specifications', {})
        }

        print("🚀 Processing purchase...")

        response = requests.post(
            f'{self.base_url}/servers/purchase',
            headers=self.headers,
            json=purchase_data
        )

        if response.status_code == 200:
            result = response.json()
            print("✅ Server purchased successfully!")
            print(f"🖥️  Server IP: {result['order']['server']['ip']}")
            print(f"📍 Location: {result['order']['server']['location']}")
            print(f"⏱️  Deployment: {result['order']['estimatedDeployment']}")
            return result
        else:
            error_data = response.json()
            raise Exception(f"Purchase failed: {error_data.get('error', 'Unknown error')}")

# Usage example
if __name__ == "__main__":
    api_key = "your_api_key_here"
    manager = ServerManager(api_key)

    # Define requirements
    requirements = {
        'min_ram': 8,  # Minimum 8GB RAM
        'duration': 6,  # 6 months
        'preferred_locations': ['Mumbai', 'Bangalore'],
        'max_budget': 8000,  # Maximum ₹8000
        'sort_by': 'price',  # Sort by price
        'specifications': {
            'os': 'Ubuntu 22.04',
            'hostname': 'my-production-server'
        },
        'auto_confirm': False  # Ask for confirmation
    }

    try:
        result = manager.purchase_server_smart(requirements)
        print(f"\\n🎉 Purchase completed: {result}")
    except Exception as e:
        print(f"❌ Error: {e}")`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="bulk-operations" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Bulk Server Purchase (JavaScript)</h4>
                        <CodeBlock
                          id="bulk-purchase"
                          language="javascript"
                          code={`class BulkServerManager {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.oceanlinux.com/v1';
        this.headers = {
            'Authorization': \`Bearer \${apiKey}\`,
            'Content-Type': 'application/json'
        };
    }

    async getAvailableServers() {
        const response = await fetch(\`\${this.baseUrl}/servers\`, {
            headers: this.headers
        });

        if (!response.ok) {
            throw new Error(\`Failed to fetch servers: \${response.status}\`);
        }

        const data = await response.json();
        return data.servers.filter(server => server.available);
    }

    async checkWalletBalance() {
        const response = await fetch(\`\${this.baseUrl}/wallet\`, {
            headers: this.headers
        });

        if (!response.ok) {
            throw new Error(\`Failed to fetch wallet: \${response.status}\`);
        }

        return response.json();
    }

    async purchaseServer(serverId, duration, specs = {}) {
        const response = await fetch(\`\${this.baseUrl}/servers/purchase\`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                serverId,
                duration,
                specifications: specs
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Purchase failed');
        }

        return data;
    }

    async bulkPurchase(purchaseRequests, options = {}) {
        const {
            maxConcurrent = 3,
            delayBetweenPurchases = 2000,
            dryRun = false
        } = options;

        console.log(\`🚀 Starting bulk purchase of \${purchaseRequests.length} servers...\`);

        if (dryRun) {
            console.log('🧪 DRY RUN MODE - No actual purchases will be made');
        }

        // Check available servers
        const availableServers = await this.getAvailableServers();
        const availableServerIds = new Set(availableServers.map(s => s._id));

        // Validate all requests first
        const validRequests = [];
        let totalCost = 0;

        for (const request of purchaseRequests) {
            if (!availableServerIds.has(request.serverId)) {
                console.warn(\`⚠️  Server \${request.serverId} is not available - skipping\`);
                continue;
            }

            const server = availableServers.find(s => s._id === request.serverId);
            const cost = server.price * request.duration;
            totalCost += cost;

            validRequests.push({
                ...request,
                estimatedCost: cost,
                serverInfo: server
            });
        }

        console.log(\`✅ \${validRequests.length} valid requests found\`);
        console.log(\`💰 Estimated total cost: ₹\${totalCost}\`);

        // Check wallet balance
        const wallet = await this.checkWalletBalance();
        if (wallet.balance < totalCost) {
            throw new Error(
                \`Insufficient wallet balance. Required: ₹\${totalCost}, Available: ₹\${wallet.balance}\`
            );
        }

        console.log(\`✅ Wallet balance sufficient: ₹\${wallet.balance}\`);

        if (dryRun) {
            console.log('🧪 Dry run completed successfully');
            return { dryRun: true, validRequests, totalCost };
        }

        // Process purchases
        const results = [];
        const errors = [];

        for (let i = 0; i < validRequests.length; i += maxConcurrent) {
            const batch = validRequests.slice(i, i + maxConcurrent);

            console.log(\`📦 Processing batch \${Math.floor(i / maxConcurrent) + 1}/\${Math.ceil(validRequests.length / maxConcurrent)}\`);

            const batchPromises = batch.map(async (request) => {
                try {
                    console.log(\`🛒 Purchasing: \${request.serverInfo.location} - \${request.serverInfo.specs.ram} RAM\`);

                    const result = await this.purchaseServer(
                        request.serverId,
                        request.duration,
                        request.specifications
                    );

                    console.log(\`✅ Success: \${result.order.server.ip} - \${result.order.productName}\`);

                    return {
                        status: 'success',
                        request,
                        result
                    };
                } catch (error) {
                    console.error(\`❌ Failed: \${request.serverInfo.location} - \${error.message}\`);

                    return {
                        status: 'error',
                        request,
                        error: error.message
                    };
                }
            });

            const batchResults = await Promise.allSettled(batchPromises);

            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    if (result.value.status === 'success') {
                        results.push(result.value);
                    } else {
                        errors.push(result.value);
                    }
                } else {
                    errors.push({
                        status: 'error',
                        error: result.reason.message
                    });
                }
            });

            // Delay between batches
            if (i + maxConcurrent < validRequests.length) {
                console.log(\`⏱️  Waiting \${delayBetweenPurchases}ms before next batch...\`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenPurchases));
            }
        }

        console.log(\`\\n📊 Bulk purchase completed:\`);
        console.log(\`✅ Successful: \${results.length}\`);
        console.log(\`❌ Failed: \${errors.length}\`);

        if (results.length > 0) {
            console.log(\`\\n🖥️  Purchased Servers:\`);
            results.forEach(({ result }) => {
                console.log(\`  • \${result.order.server.ip} - \${result.order.productName}\`);
            });
        }

        if (errors.length > 0) {
            console.log(\`\\n❌ Errors:\`);
            errors.forEach(({ request, error }) => {
                console.log(\`  • \${request?.serverInfo?.location || 'Unknown'}: \${error}\`);
            });
        }

        return {
            successful: results,
            failed: errors,
            summary: {
                total: validRequests.length,
                successful: results.length,
                failed: errors.length
            }
        };
    }
}

// Usage example
async function example() {
    const manager = new BulkServerManager('your_api_key_here');

    const purchaseRequests = [
        {
            serverId: '64f8a5b2c1234567890abcde',
            duration: 3,
            specifications: {
                os: 'Ubuntu 22.04',
                hostname: 'web-server-1'
            }
        },
        {
            serverId: '64f8a5b2c1234567890abcdf',
            duration: 6,
            specifications: {
                os: 'CentOS 8',
                hostname: 'db-server-1'
            }
        },
        {
            serverId: '64f8a5b2c1234567890abce0',
            duration: 12,
            specifications: {
                os: 'Ubuntu 20.04',
                hostname: 'cache-server-1'
            }
        }
    ];

    try {
        // First run in dry-run mode
        console.log('Running dry run...');
        await manager.bulkPurchase(purchaseRequests, { dryRun: true });

        // If dry run succeeds, run actual purchase
        console.log('\\nProceeding with actual purchase...');
        const result = await manager.bulkPurchase(purchaseRequests, {
            maxConcurrent: 2,
            delayBetweenPurchases: 3000
        });

        console.log('\\n🎉 Bulk purchase completed:', result.summary);

    } catch (error) {
        console.error('❌ Bulk purchase failed:', error.message);
    }
}

// Run the example
// example();`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="lifecycle" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Complete Server Lifecycle Management (Python)</h4>
                        <CodeBlock
                          id="lifecycle-management"
                          language="python"
                          code={`import requests
import time
import json
from datetime import datetime, timedelta
from typing import Dict, List
import logging

class ServerLifecycleManager:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = 'https://api.oceanlinux.com/v1'
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

        # Setup logging
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    def get_my_servers(self) -> List[Dict]:
        """Get all user's active servers"""
        response = requests.get(f'{self.base_url}/servers/my-servers', headers=self.headers)
        response.raise_for_status()
        return response.json().get('servers', [])

    def get_server_details(self, server_id: str) -> Dict:
        """Get detailed information about a specific server"""
        response = requests.get(f'{self.base_url}/servers/{server_id}', headers=self.headers)
        response.raise_for_status()
        return response.json()

    def reboot_server(self, server_id: str) -> Dict:
        """Reboot a server"""
        response = requests.post(f'{self.base_url}/servers/{server_id}/reboot', headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_server_metrics(self, server_id: str, period: str = '1h') -> Dict:
        """Get server performance metrics"""
        params = {'period': period}
        response = requests.get(
            f'{self.base_url}/servers/{server_id}/metrics',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()

    def check_server_health(self, server: Dict) -> Dict:
        """Check server health status"""
        server_id = server['_id']

        try:
            # Get current metrics
            metrics = self.get_server_metrics(server_id)

            health_status = {
                'server_id': server_id,
                'ip': server['ip'],
                'status': 'healthy',
                'issues': [],
                'metrics': metrics
            }

            # Check CPU usage
            if metrics.get('cpu_usage', 0) > 90:
                health_status['issues'].append('High CPU usage')
                health_status['status'] = 'warning'

            # Check memory usage
            if metrics.get('memory_usage', 0) > 85:
                health_status['issues'].append('High memory usage')
                health_status['status'] = 'warning'

            # Check disk usage
            if metrics.get('disk_usage', 0) > 90:
                health_status['issues'].append('High disk usage')
                health_status['status'] = 'critical'

            # Check uptime
            uptime_hours = metrics.get('uptime', 0) / 3600
            if uptime_hours < 1:
                health_status['issues'].append('Recently restarted')
                health_status['status'] = 'warning'

            return health_status

        except Exception as e:
            return {
                'server_id': server_id,
                'ip': server['ip'],
                'status': 'error',
                'issues': [f'Cannot fetch metrics: {str(e)}'],
                'metrics': {}
            }

    def auto_scale_check(self, server: Dict) -> Dict:
        """Check if server needs scaling recommendations"""
        try:
            metrics = self.get_server_metrics(server['_id'], '24h')

            recommendations = []

            # CPU scaling recommendations
            avg_cpu = metrics.get('avg_cpu_usage', 0)
            if avg_cpu > 80:
                recommendations.append({
                    'type': 'cpu_upgrade',
                    'reason': f'Average CPU usage: {avg_cpu}%',
                    'recommendation': 'Consider upgrading to higher CPU plan'
                })

            # Memory scaling recommendations
            avg_memory = metrics.get('avg_memory_usage', 0)
            if avg_memory > 85:
                recommendations.append({
                    'type': 'memory_upgrade',
                    'reason': f'Average memory usage: {avg_memory}%',
                    'recommendation': 'Consider upgrading RAM'
                })

            # Cost optimization recommendations
            if avg_cpu < 20 and avg_memory < 30:
                recommendations.append({
                    'type': 'downgrade',
                    'reason': f'Low resource usage - CPU: {avg_cpu}%, Memory: {avg_memory}%',
                    'recommendation': 'Consider downgrading to save costs'
                })

            return {
                'server_id': server['_id'],
                'recommendations': recommendations,
                'current_usage': {
                    'cpu': avg_cpu,
                    'memory': avg_memory,
                    'disk': metrics.get('avg_disk_usage', 0)
                }
            }

        except Exception as e:
            return {
                'server_id': server['_id'],
                'recommendations': [],
                'error': str(e)
            }

    def maintenance_mode(self, server_id: str, enable: bool = True) -> Dict:
        """Enable/disable maintenance mode for a server"""
        response = requests.post(
            f'{self.base_url}/servers/{server_id}/maintenance',
            headers=self.headers,
            json={'enabled': enable}
        )
        response.raise_for_status()
        return response.json()

    def backup_server(self, server_id: str, backup_name: str = None) -> Dict:
        """Create a backup of the server"""
        backup_name = backup_name or f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        response = requests.post(
            f'{self.base_url}/servers/{server_id}/backup',
            headers=self.headers,
            json={'name': backup_name}
        )
        response.raise_for_status()
        return response.json()

    def run_health_check_all(self) -> Dict:
        """Run health check on all servers"""
        self.logger.info("Starting comprehensive health check...")

        servers = self.get_my_servers()
        health_results = []
        critical_issues = []

        for server in servers:
            self.logger.info(f"Checking health for {server['ip']} ({server.get('location', 'Unknown')})")

            health_status = self.check_server_health(server)
            health_results.append(health_status)

            if health_status['status'] == 'critical':
                critical_issues.append(health_status)

            # Add scaling recommendations
            scale_check = self.auto_scale_check(server)
            health_status['scaling'] = scale_check

        # Summary
        total_servers = len(servers)
        healthy_count = len([h for h in health_results if h['status'] == 'healthy'])
        warning_count = len([h for h in health_results if h['status'] == 'warning'])
        critical_count = len([h for h in health_results if h['status'] == 'critical'])

        summary = {
            'total_servers': total_servers,
            'healthy': healthy_count,
            'warnings': warning_count,
            'critical': critical_count,
            'health_results': health_results,
            'critical_issues': critical_issues
        }

        self.logger.info(f"Health check complete: {healthy_count}/{total_servers} healthy")

        return summary

    def auto_remediation(self, server_health: Dict) -> Dict:
        """Automatically fix common server issues"""
        server_id = server_health['server_id']
        actions_taken = []

        try:
            # High memory usage - restart services
            if 'High memory usage' in server_health['issues']:
                self.logger.info(f"Attempting to restart services on {server_health['ip']}")
                # In a real implementation, you'd have specific service restart endpoints
                actions_taken.append("Restarted memory-intensive services")

            # Recently restarted - might be unstable
            if 'Recently restarted' in server_health['issues']:
                self.logger.info(f"Server {server_health['ip']} recently restarted, monitoring...")
                time.sleep(30)  # Wait and recheck
                actions_taken.append("Extended monitoring period")

            # High disk usage - cleanup
            if 'High disk usage' in server_health['issues']:
                self.logger.info(f"Attempting disk cleanup on {server_health['ip']}")
                # Trigger cleanup endpoint
                actions_taken.append("Initiated disk cleanup")

            return {
                'server_id': server_id,
                'actions_taken': actions_taken,
                'status': 'remediation_attempted'
            }

        except Exception as e:
            return {
                'server_id': server_id,
                'actions_taken': actions_taken,
                'status': 'remediation_failed',
                'error': str(e)
            }

    def scheduled_maintenance(self, maintenance_schedule: List[Dict]) -> Dict:
        """Perform scheduled maintenance on servers"""
        maintenance_results = []

        for maintenance in maintenance_schedule:
            server_id = maintenance['server_id']
            tasks = maintenance.get('tasks', [])

            self.logger.info(f"Starting maintenance for server {server_id}")

            try:
                # Enable maintenance mode
                self.maintenance_mode(server_id, True)

                task_results = []

                for task in tasks:
                    if task == 'backup':
                        backup_result = self.backup_server(server_id)
                        task_results.append(f"Backup created: {backup_result.get('backup_id')}")

                    elif task == 'reboot':
                        reboot_result = self.reboot_server(server_id)
                        task_results.append(f"Server rebooted: {reboot_result.get('status')}")
                        time.sleep(60)  # Wait for reboot

                    elif task == 'update':
                        # In real implementation, trigger system updates
                        task_results.append("System updates initiated")

                # Disable maintenance mode
                self.maintenance_mode(server_id, False)

                maintenance_results.append({
                    'server_id': server_id,
                    'status': 'completed',
                    'tasks_completed': task_results
                })

                self.logger.info(f"Maintenance completed for server {server_id}")

            except Exception as e:
                maintenance_results.append({
                    'server_id': server_id,
                    'status': 'failed',
                    'error': str(e)
                })

                self.logger.error(f"Maintenance failed for server {server_id}: {e}")

        return {
            'maintenance_results': maintenance_results,
            'summary': {
                'total': len(maintenance_schedule),
                'completed': len([r for r in maintenance_results if r['status'] == 'completed']),
                'failed': len([r for r in maintenance_results if r['status'] == 'failed'])
            }
        }

# Usage example
if __name__ == "__main__":
    api_key = "your_api_key_here"
    manager = ServerLifecycleManager(api_key)

    # Run comprehensive health check
    health_summary = manager.run_health_check_all()
    print(f"Health Summary: {health_summary['summary']}")

    # Auto-remediation for critical issues
    for critical_issue in health_summary['critical_issues']:
        remediation_result = manager.auto_remediation(critical_issue)
        print(f"Remediation: {remediation_result}")

    # Schedule maintenance
    maintenance_schedule = [
        {
            'server_id': 'server_123',
            'tasks': ['backup', 'update', 'reboot']
        },
        {
            'server_id': 'server_456',
            'tasks': ['backup', 'reboot']
        }
    ]

    maintenance_result = manager.scheduled_maintenance(maintenance_schedule)
    print(f"Maintenance Summary: {maintenance_result['summary']}")
`}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Monitoring & Automation */}
            <section id="monitoring">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Monitoring & Alerting
                  </CardTitle>
                  <CardDescription>
                    Advanced monitoring and alerting examples
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="real-time" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="real-time">Real-time Monitoring</TabsTrigger>
                      <TabsTrigger value="alerting">Smart Alerting</TabsTrigger>
                    </TabsList>

                    <TabsContent value="real-time" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Real-time Server Monitoring Dashboard (Node.js)</h4>
                        <CodeBlock
                          id="realtime-monitoring"
                          language="javascript"
                          code={`const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

class ServerMonitoringDashboard extends EventEmitter {
    constructor(apiKey) {
        super();
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.oceanlinux.com/v1';
        this.headers = {
            'Authorization': \`Bearer \${apiKey}\`,
            'Content-Type': 'application/json'
        };
        this.servers = new Map();
        this.monitoringInterval = null;
    }

    async getMyServers() {
        try {
            const response = await axios.get(\`\${this.baseUrl}/servers/my-servers\`, {
                headers: this.headers
            });
            return response.data.servers;
        } catch (error) {
            console.error('Failed to fetch servers:', error.message);
            return [];
        }
    }

    async getServerMetrics(serverId) {
        try {
            const response = await axios.get(
                \`\${this.baseUrl}/servers/\${serverId}/metrics\`,
                { headers: this.headers }
            );
            return response.data;
        } catch (error) {
            console.error(\`Failed to fetch metrics for \${serverId}:\`, error.message);
            return null;
        }
    }

    calculateHealthScore(metrics) {
        let score = 100;

        // Deduct points for high resource usage
        if (metrics.cpu_usage > 90) score -= 30;
        else if (metrics.cpu_usage > 80) score -= 20;
        else if (metrics.cpu_usage > 70) score -= 10;

        if (metrics.memory_usage > 90) score -= 30;
        else if (metrics.memory_usage > 80) score -= 20;
        else if (metrics.memory_usage > 70) score -= 10;

        if (metrics.disk_usage > 95) score -= 40;
        else if (metrics.disk_usage > 85) score -= 20;
        else if (metrics.disk_usage > 75) score -= 10;

        // Check network connectivity
        if (metrics.network_latency > 200) score -= 15;
        else if (metrics.network_latency > 100) score -= 10;

        return Math.max(0, score);
    }

    async updateServerMetrics() {
        const servers = await this.getMyServers();
        const updates = [];

        for (const server of servers) {
            const metrics = await this.getServerMetrics(server._id);

            if (metrics) {
                const previousData = this.servers.get(server._id) || {};
                const healthScore = this.calculateHealthScore(metrics);

                const serverData = {
                    ...server,
                    metrics,
                    healthScore,
                    status: healthScore > 80 ? 'healthy' : healthScore > 60 ? 'warning' : 'critical',
                    lastUpdated: new Date().toISOString()
                };

                this.servers.set(server._id, serverData);

                // Check for significant changes
                const previousScore = previousData.healthScore || 100;
                const scoreDiff = Math.abs(healthScore - previousScore);

                if (scoreDiff > 20) {
                    this.emit('healthScoreChange', {
                        server: serverData,
                        previousScore,
                        currentScore: healthScore,
                        change: healthScore - previousScore
                    });
                }

                // Check for threshold breaches
                if (metrics.cpu_usage > 90 && !previousData.highCpuAlert) {
                    this.emit('alert', {
                        type: 'high_cpu',
                        server: serverData,
                        value: metrics.cpu_usage,
                        threshold: 90
                    });
                    serverData.highCpuAlert = true;
                }

                if (metrics.memory_usage > 85 && !previousData.highMemoryAlert) {
                    this.emit('alert', {
                        type: 'high_memory',
                        server: serverData,
                        value: metrics.memory_usage,
                        threshold: 85
                    });
                    serverData.highMemoryAlert = true;
                }

                updates.push(serverData);
            }
        }

        return updates;
    }

    startMonitoring(interval = 30000) {
        console.log('🚀 Starting real-time server monitoring...');

        // Initial load
        this.updateServerMetrics();

        // Set up periodic updates
        this.monitoringInterval = setInterval(async () => {
            try {
                const updates = await this.updateServerMetrics();
                this.emit('metricsUpdate', updates);
            } catch (error) {
                console.error('Monitoring update failed:', error.message);
                this.emit('error', error);
            }
        }, interval);

        return this;
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('⏹️  Server monitoring stopped');
        }
    }

    getDashboardData() {
        const servers = Array.from(this.servers.values());

        return {
            summary: {
                total: servers.length,
                healthy: servers.filter(s => s.status === 'healthy').length,
                warning: servers.filter(s => s.status === 'warning').length,
                critical: servers.filter(s => s.status === 'critical').length,
                averageHealthScore: servers.length > 0
                    ? Math.round(servers.reduce((sum, s) => sum + s.healthScore, 0) / servers.length)
                    : 0
            },
            servers: servers.sort((a, b) => {
                // Sort by health score (worst first)
                return a.healthScore - b.healthScore;
            }),
            lastUpdated: new Date().toISOString()
        };
    }

    printDashboard() {
        const data = this.getDashboardData();

        console.clear();
        console.log('\\n🖥️  OceanLinux Server Dashboard');
        console.log('═'.repeat(50));

        // Summary
        console.log(\`📊 Summary: \${data.summary.total} servers | \${data.summary.healthy} healthy | \${data.summary.warning} warnings | \${data.summary.critical} critical\`);
        console.log(\`🏥 Average Health Score: \${data.summary.averageHealthScore}%\\n\`);

        // Server details
        data.servers.forEach(server => {
            const statusIcon = server.status === 'healthy' ? '✅' :
                              server.status === 'warning' ? '⚠️' : '❌';

            console.log(\`\${statusIcon} \${server.ip} (\${server.location}) - Health: \${server.healthScore}%\`);
            console.log(\`   CPU: \${server.metrics.cpu_usage}% | RAM: \${server.metrics.memory_usage}% | Disk: \${server.metrics.disk_usage}%\`);
            console.log(\`   Uptime: \${Math.round(server.metrics.uptime / 3600)}h | Load: \${server.metrics.load_average}\\n\`);
        });

        console.log(\`Last updated: \${new Date(data.lastUpdated).toLocaleTimeString()}\`);
    }
}

// Usage example
const monitor = new ServerMonitoringDashboard('your_api_key_here');

// Set up event listeners
monitor.on('alert', (alertData) => {
    console.log(\`🚨 ALERT: \${alertData.type.toUpperCase()} on \${alertData.server.ip}\`);
    console.log(\`   Value: \${alertData.value}% | Threshold: \${alertData.threshold}%\`);

    // Here you could send notifications, emails, Slack messages, etc.
});

monitor.on('healthScoreChange', (changeData) => {
    const trend = changeData.change > 0 ? '📈' : '📉';
    console.log(\`\${trend} Health score change for \${changeData.server.ip}:\`);
    console.log(\`   \${changeData.previousScore}% → \${changeData.currentScore}% (\${changeData.change > 0 ? '+' : ''}\${changeData.change})\`);
});

monitor.on('metricsUpdate', (updates) => {
    monitor.printDashboard();
});

monitor.on('error', (error) => {
    console.error('❌ Monitoring error:', error.message);
});

// Start monitoring with 30-second intervals
monitor.startMonitoring(30000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\\n⏹️  Shutting down monitoring...');
    monitor.stopMonitoring();
    process.exit(0);
});`}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="alerting" className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Smart Alerting System (Python)</h4>
                        <CodeBlock
                          id="smart-alerting"
                          language="python"
                          code={`import requests
import smtplib
import json
import time
from datetime import datetime, timedelta
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart
from dataclasses import dataclass
from typing import Dict, List, Optional
import logging

@dataclass
class AlertRule:
    name: str
    metric: str
    threshold: float
    operator: str  # '>', '<', '==', '!='
    severity: str  # 'info', 'warning', 'critical'
    cooldown_minutes: int = 15
    enabled: bool = True

@dataclass
class AlertEvent:
    rule_name: str
    server_id: str
    server_ip: str
    metric: str
    value: float
    threshold: float
    severity: str
    timestamp: datetime
    message: str

class SmartAlertingSystem:
    def __init__(self, api_key: str, config: Dict):
        self.api_key = api_key
        self.base_url = 'https://api.oceanlinux.com/v1'
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

        # Alert configuration
        self.config = config
        self.alert_history = []
        self.cooldown_tracker = {}

        # Setup logging
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

        # Default alert rules
        self.alert_rules = [
            AlertRule(
                name="High CPU Usage",
                metric="cpu_usage",
                threshold=85.0,
                operator=">",
                severity="warning",
                cooldown_minutes=10
            ),
            AlertRule(
                name="Critical CPU Usage",
                metric="cpu_usage",
                threshold=95.0,
                operator=">",
                severity="critical",
                cooldown_minutes=5
            ),
            AlertRule(
                name="High Memory Usage",
                metric="memory_usage",
                threshold=90.0,
                operator=">",
                severity="warning",
                cooldown_minutes=15
            ),
            AlertRule(
                name="Critical Disk Space",
                metric="disk_usage",
                threshold=95.0,
                operator=">",
                severity="critical",
                cooldown_minutes=30
            ),
            AlertRule(
                name="High Network Latency",
                metric="network_latency",
                threshold=500.0,
                operator=">",
                severity="warning",
                cooldown_minutes=20
            ),
            AlertRule(
                name="Server Down",
                metric="uptime",
                threshold=60.0,  # Less than 1 minute uptime
                operator="<",
                severity="critical",
                cooldown_minutes=1
            )
        ]

    async def get_server_metrics(self, server_id: str) -> Dict:
        """Get current server metrics"""
        try:
            response = requests.get(
                f'{self.base_url}/servers/{server_id}/metrics',
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            self.logger.error(f"Failed to get metrics for {server_id}: {e}")
            return {}

    def evaluate_rule(self, rule: AlertRule, metrics: Dict) -> bool:
        """Evaluate if an alert rule is triggered"""
        if not rule.enabled or rule.metric not in metrics:
            return False

        value = metrics[rule.metric]
        threshold = rule.threshold

        if rule.operator == '>':
            return value > threshold
        elif rule.operator == '<':
            return value < threshold
        elif rule.operator == '==':
            return value == threshold
        elif rule.operator == '!=':
            return value != threshold

        return False

    def is_in_cooldown(self, rule_name: str, server_id: str) -> bool:
        """Check if alert is in cooldown period"""
        key = f"{rule_name}_{server_id}"

        if key in self.cooldown_tracker:
            last_alert_time = self.cooldown_tracker[key]
            rule = next((r for r in self.alert_rules if r.name == rule_name), None)

            if rule:
                cooldown_period = timedelta(minutes=rule.cooldown_minutes)
                return datetime.now() - last_alert_time < cooldown_period

        return False

    def create_alert_event(self, rule: AlertRule, server: Dict, metrics: Dict) -> AlertEvent:
        """Create an alert event"""
        value = metrics.get(rule.metric, 0)

        message = self.generate_alert_message(rule, server, value)

        return AlertEvent(
            rule_name=rule.name,
            server_id=server['_id'],
            server_ip=server['ip'],
            metric=rule.metric,
            value=value,
            threshold=rule.threshold,
            severity=rule.severity,
            timestamp=datetime.now(),
            message=message
        )

    def generate_alert_message(self, rule: AlertRule, server: Dict, value: float) -> str:
        """Generate human-readable alert message"""
        location = server.get('location', 'Unknown')

        messages = {
            "High CPU Usage": f"Server {server['ip']} ({location}) is experiencing high CPU usage: {value}%",
            "Critical CPU Usage": f"CRITICAL: Server {server['ip']} ({location}) CPU usage is critically high: {value}%",
            "High Memory Usage": f"Server {server['ip']} ({location}) memory usage is high: {value}%",
            "Critical Disk Space": f"CRITICAL: Server {server['ip']} ({location}) is running out of disk space: {value}%",
            "High Network Latency": f"Server {server['ip']} ({location}) has high network latency: {value}ms",
            "Server Down": f"CRITICAL: Server {server['ip']} ({location}) appears to be down (uptime: {value/60:.1f} minutes)"
        }

        return messages.get(rule.name, f"Alert for {server['ip']}: {rule.metric} = {value}")

    async def send_email_alert(self, alert: AlertEvent):
        """Send email alert"""
        try:
            smtp_config = self.config.get('email', {})

            if not all(key in smtp_config for key in ['smtp_server', 'username', 'password', 'recipients']):
                self.logger.warning("Email configuration incomplete")
                return

            msg = MimeMultipart()
            msg['From'] = smtp_config['username']
            msg['To'] = ', '.join(smtp_config['recipients'])
            msg['Subject'] = f"[{alert.severity.upper()}] OceanLinux Alert - {alert.rule_name}"

            body = f"""
            Alert Details:
            =============
            Server: {alert.server_ip}
            Rule: {alert.rule_name}
            Severity: {alert.severity.upper()}
            Metric: {alert.metric}
            Current Value: {alert.value}
            Threshold: {alert.threshold}
            Time: {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}

            Message: {alert.message}

            Please check your OceanLinux dashboard for more details.

            ---
            OceanLinux Monitoring System
            """

            msg.attach(MimeText(body, 'plain'))

            server = smtplib.SMTP(smtp_config['smtp_server'], smtp_config.get('port', 587))
            server.starttls()
            server.login(smtp_config['username'], smtp_config['password'])
            server.send_message(msg)
            server.quit()

            self.logger.info(f"Email alert sent for {alert.rule_name} on {alert.server_ip}")

        except Exception as e:
            self.logger.error(f"Failed to send email alert: {e}")

    async def send_slack_alert(self, alert: AlertEvent):
        """Send Slack alert"""
        try:
            slack_config = self.config.get('slack', {})
            webhook_url = slack_config.get('webhook_url')

            if not webhook_url:
                return

            # Choose color based on severity
            color_map = {
                'info': '#36a64f',
                'warning': '#ff9500',
                'critical': '#ff0000'
            }

            color = color_map.get(alert.severity, '#808080')

            slack_message = {
                "attachments": [
                    {
                        "color": color,
                        "title": f"{alert.severity.upper()}: {alert.rule_name}",
                        "text": alert.message,
                        "fields": [
                            {
                                "title": "Server",
                                "value": alert.server_ip,
                                "short": True
                            },
                            {
                                "title": "Metric",
                                "value": f"{alert.metric}: {alert.value}",
                                "short": True
                            },
                            {
                                "title": "Threshold",
                                "value": str(alert.threshold),
                                "short": True
                            },
                            {
                                "title": "Time",
                                "value": alert.timestamp.strftime('%H:%M:%S'),
                                "short": True
                            }
                        ],
                        "footer": "OceanLinux Monitoring",
                        "ts": int(alert.timestamp.timestamp())
                    }
                ]
            }

            response = requests.post(webhook_url, json=slack_message)
            response.raise_for_status()

            self.logger.info(f"Slack alert sent for {alert.rule_name} on {alert.server_ip}")

        except Exception as e:
            self.logger.error(f"Failed to send Slack alert: {e}")

    async def process_alerts(self, servers: List[Dict]):
        """Process alerts for all servers"""
        new_alerts = []

        for server in servers:
            metrics = await self.get_server_metrics(server['_id'])

            if not metrics:
                continue

            for rule in self.alert_rules:
                if self.evaluate_rule(rule, metrics):
                    # Check cooldown
                    if self.is_in_cooldown(rule.name, server['_id']):
                        continue

                    # Create alert
                    alert = self.create_alert_event(rule, server, metrics)
                    new_alerts.append(alert)

                    # Update cooldown tracker
                    cooldown_key = f"{rule.name}_{server['_id']}"
                    self.cooldown_tracker[cooldown_key] = datetime.now()

                    # Send notifications
                    if self.config.get('email', {}).get('enabled', False):
                        await self.send_email_alert(alert)

                    if self.config.get('slack', {}).get('enabled', False):
                        await self.send_slack_alert(alert)

                    self.logger.warning(f"Alert triggered: {alert.message}")

        # Store alerts in history
        self.alert_history.extend(new_alerts)

        # Keep only last 1000 alerts
        if len(self.alert_history) > 1000:
            self.alert_history = self.alert_history[-1000:]

        return new_alerts

    def get_alert_summary(self, hours: int = 24) -> Dict:
        """Get alert summary for the last N hours"""
        cutoff_time = datetime.now() - timedelta(hours=hours)

        recent_alerts = [
            alert for alert in self.alert_history
            if alert.timestamp > cutoff_time
        ]

        summary = {
            'total_alerts': len(recent_alerts),
            'by_severity': {},
            'by_server': {},
            'by_rule': {},
            'recent_alerts': recent_alerts[-10:]  # Last 10 alerts
        }

        for alert in recent_alerts:
            # By severity
            summary['by_severity'][alert.severity] = summary['by_severity'].get(alert.severity, 0) + 1

            # By server
            summary['by_server'][alert.server_ip] = summary['by_server'].get(alert.server_ip, 0) + 1

            # By rule
            summary['by_rule'][alert.rule_name] = summary['by_rule'].get(alert.rule_name, 0) + 1

        return summary

# Usage example
if __name__ == "__main__":
    config = {
        'email': {
            'enabled': True,
            'smtp_server': 'smtp.gmail.com',
            'port': 587,
'username': 'your-email@gmail.com',
            'password': 'your-app-password',
            'recipients': ['admin@yourcompany.com']
        },
        'slack': {
            'enabled': True,
            'webhook_url': 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
        }
    }

    alerting = SmartAlertingSystem('your_api_key_here', config)

    # Get servers and process alerts
    servers = await alerting.get_my_servers()
    new_alerts = await alerting.process_alerts(servers)

    print(f"Processed {len(new_alerts)} new alerts")

    # Get summary
    summary = alerting.get_alert_summary(24)
    print(f"Alert summary (24h): {summary}")`}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Automation Scripts */}
            <section id="automation">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Automation Scripts
                  </CardTitle>
                  <CardDescription>
                    Complete automation workflows and scripts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Auto-scaling Script (Python)</h4>
                      <CodeBlock
                        id="auto-scaling"
                        language="python"
                        code={`#!/usr/bin/env python3
"""
Auto-scaling script for OceanLinux servers
Monitors server load and automatically scales up/down based on demand
"""

import requests
import time
from datetime import datetime
import os

class AutoScaler:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = 'https://api.oceanlinux.com/v1'
        self.headers = {'Authorization': f'Bearer {api_key}'}

    def get_wallet_balance(self):
        response = requests.get(f'{self.base_url}/wallet', headers=self.headers)
        return response.json()['balance']

    def should_scale_up(self, metrics):
        return (metrics['cpu_usage'] > 80 and
                metrics['memory_usage'] > 75 and
                metrics['load_average'] > 2.0)

    def should_scale_down(self, metrics):
        return (metrics['cpu_usage'] < 30 and
                metrics['memory_usage'] < 40 and
                metrics['load_average'] < 0.5)

    def auto_scale(self):
        servers = requests.get(f'{self.base_url}/servers/my-servers',
                             headers=self.headers).json()['servers']

        for server in servers:
            metrics = requests.get(
                f'{self.base_url}/servers/{server["_id"]}/metrics',
                headers=self.headers
            ).json()

            print(f"Server {server['ip']}: CPU {metrics['cpu_usage']}%, RAM {metrics['memory_usage']}%")

            if self.should_scale_up(metrics):
                print(f"🔼 Scaling up server {server['ip']}")
                # Implement scale-up logic

            elif self.should_scale_down(metrics):
                print(f"🔽 Scaling down server {server['ip']}")
                # Implement scale-down logic

# Run every 5 minutes
if __name__ == "__main__":
    scaler = AutoScaler(os.getenv('OCEANLINUX_API_KEY'))

    while True:
        try:
            scaler.auto_scale()
            time.sleep(300)  # 5 minutes
        except KeyboardInterrupt:
            print("Auto-scaler stopped")
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(60)  # Wait 1 minute on error`}
                      />
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Backup Automation (Shell Script)</h4>
                      <CodeBlock
                        id="backup-automation"
                        language="bash"
                        code={`#!/bin/bash

# OceanLinux Backup Automation Script
# Creates daily backups of all servers

API_KEY="your_api_key_here"
BASE_URL="https://api.oceanlinux.com/v1"
LOG_FILE="/var/log/oceanlinux-backup.log"

log() {
    echo "$(date): $1" | tee -a "$LOG_FILE"
}

create_backup() {
    local server_id=$1
    local server_ip=$2

    log "Creating backup for server $server_ip ($server_id)"

    backup_name="auto-backup-$(date +%Y%m%d-%H%M%S)"

    response=$(curl -s -X POST \\
        -H "Authorization: Bearer $API_KEY" \\
        -H "Content-Type: application/json" \\
        -d "{\\"name\\": \\"$backup_name\\"}" \\
        "$BASE_URL/servers/$server_id/backup")

    if echo "$response" | grep -q '"success":true'; then
        log "✅ Backup created successfully for $server_ip"
        return 0
    else
        log "❌ Backup failed for $server_ip: $response"
        return 1
    fi
}

main() {
    log "Starting backup process"

    # Get all servers
    servers=$(curl -s -H "Authorization: Bearer $API_KEY" \\
                  "$BASE_URL/servers/my-servers")

    if [ $? -ne 0 ]; then
        log "❌ Failed to fetch servers"
        exit 1
    fi

    # Extract server IDs and IPs using jq
    echo "$servers" | jq -r '.servers[] | "\\(.._id) \\(.ip)"' | \\
    while read -r server_id server_ip; do
        create_backup "$server_id" "$server_ip"
        sleep 5  # Wait 5 seconds between backups
    done

    log "Backup process completed"
}

# Run main function
main`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* SDK Information */}
            <Card>
              <CardHeader>
                <CardTitle>Official SDKs & Libraries</CardTitle>
                <CardDescription>
                  Use our official SDKs for easier integration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-primary/10 rounded p-4">
                    <h4 className="font-semibold mb-2">Node.js SDK</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Official JavaScript/TypeScript SDK
                    </p>
                    <CodeBlock
                      id="nodejs-install"
                      language="bash"
                      code="npm install @oceanlinux/api-sdk"
                    />
                  </div>

                  <div className="border border-primary/10 rounded p-4">
                    <h4 className="font-semibold mb-2">Python SDK</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Official Python library
                    </p>
                    <CodeBlock
                      id="python-install"
                      language="bash"
                      code="pip install oceanlinux-api"
                    />
                  </div>

                  <div className="border border-primary/10 rounded p-4">
                    <h4 className="font-semibold mb-2">PHP SDK</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Official PHP package
                    </p>
                    <CodeBlock
                      id="php-install"
                      language="bash"
                      code="composer require oceanlinux/api-client"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APIExamplesPage;
