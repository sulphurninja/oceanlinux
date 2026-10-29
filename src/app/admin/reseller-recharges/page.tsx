'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Link2, Unlink, Wallet, Copy, CheckCircle2, Zap, CreditCard } from 'lucide-react';

interface RechargeItem {
  _id: string;
  amount: number;
  status: string;
  method: string;
  clientTxnId: string;
  createdAt: string;
  resellerInfo?: { businessName?: string; email?: string };
}

interface PaytmSettings {
  connected: boolean;
  mid: string;
  merchantKeyMasked: string;
  hasMerchantKey: boolean;
  environment: string;
  posId: string;
  displayName: string;
  connectedAt: string | null;
}

interface KwikUpiSettings {
  connected: boolean;
  apiKey: string;
  apiSecretMasked: string;
  hasApiSecret: boolean;
  displayName: string;
  connectedAt: string | null;
}

interface UpiGatewaySettings {
  connected: boolean;
  apiKeyMasked: string;
  hasApiKey: boolean;
  apiSecretMasked: string;
  hasApiSecret: boolean;
  displayName: string;
  connectedAt: string | null;
}

interface SettingsPayload {
  provider: string;
  paytm: PaytmSettings;
  kwikupi: KwikUpiSettings;
  upigateway?: UpiGatewaySettings;
  minAmount: number;
  maxAmount: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Paid & credited',
  failed: 'Failed',
};

export default function AdminResellerRechargesPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [items, setItems] = useState<RechargeItem[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [upiGatewayWebhookUrl, setUpiGatewayWebhookUrl] = useState('');
  const [minAmount, setMinAmount] = useState(100);
  const [maxAmount, setMaxAmount] = useState(100000);
  const [provider, setProvider] = useState('upigateway');
  const [customerPrimaryGateway, setCustomerPrimaryGateway] = useState<'upi' | 'razorpay'>('upi');
  const [savedPrimaryGateway, setSavedPrimaryGateway] = useState<'upi' | 'razorpay' | null>(null);
  const [savingPrimaryGateway, setSavingPrimaryGateway] = useState(false);

  const [paytmForm, setPaytmForm] = useState({
    mid: '',
    merchantKey: '',
    environment: 'production',
    posId: 'OCEAN001',
    displayName: 'OceanLinux',
  });

  const [upiGatewayForm, setUpiGatewayForm] = useState({
    apiKey: '',
    displayName: 'OceanLinux',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/reseller-recharges?status=all', { credentials: 'include' });
      const platformRes = await fetch('/api/admin/platform-payment', { credentials: 'include' });
      const data = await res.json();
      const platformData = platformRes.ok ? await platformRes.json() : null;
      if (!data.success) throw new Error(data.message || 'Failed to load');
      setItems(data.items || []);
      if (data.settings) {
        setSettings(data.settings);
        setProvider(data.settings.provider === 'paytm' ? 'paytm' : 'upigateway');
        if (data.settings.paytm) {
          setPaytmForm((f) => ({
            ...f,
            mid: data.settings.paytm.mid || '',
            environment: data.settings.paytm.environment || 'production',
            posId: data.settings.paytm.posId || 'OCEAN001',
            displayName: data.settings.paytm.displayName || 'OceanLinux',
          }));
        }
        if (data.settings.upigateway) {
          setUpiGatewayForm((f) => ({
            ...f,
            displayName: data.settings.upigateway?.displayName || 'OceanLinux',
          }));
        }
        setMinAmount(data.settings.minAmount ?? 100);
        setMaxAmount(data.settings.maxAmount ?? 100000);
      }
      setWebhookUrl(data.webhookUrl || '');
      setUpiGatewayWebhookUrl(data.upiGatewayWebhookUrl || '');
      if (platformData?.success && platformData.primaryGateway) {
        const pg = platformData.primaryGateway === 'razorpay' ? 'razorpay' : 'upi';
        setCustomerPrimaryGateway(pg);
        setSavedPrimaryGateway(pg);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const postAction = async (payload: Record<string, unknown>, successMsg: string) => {
    const res = await fetch('/api/admin/reseller-recharges', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Action failed');
    toast.success(data.message || successMsg);
    return data;
  };

  const connectPaytm = async () => {
    setConnecting(true);
    try {
      await postAction({ action: 'connect_paytm', ...paytmForm }, 'Paytm connected');
      setPaytmForm((f) => ({ ...f, merchantKey: '' }));
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(false);
    }
  };

  const connectUpiGateway = async () => {
    setConnecting(true);
    try {
      await postAction({ action: 'connect_upigateway', ...upiGatewayForm }, 'UPI Gateway connected');
      setUpiGatewayForm((f) => ({ ...f, apiKey: '' }));
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(false);
    }
  };

  type Provider = 'paytm' | 'upigateway';

  const testConnection = async (which: Provider) => {
    setTesting(true);
    try {
      await postAction({ action: `test_${which}` }, 'Connection OK');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async (which: Provider) => {
    try {
      await postAction({ action: `disconnect_${which}` }, 'Disconnected');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const saveLimits = async () => {
    try {
      await postAction(
        { action: 'save_settings', settings: { minAmount, maxAmount, provider } },
        'Settings saved'
      );
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const saveCustomerPrimaryGateway = async () => {
    setSavingPrimaryGateway(true);
    try {
      const res = await fetch('/api/admin/platform-payment', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryGateway: customerPrimaryGateway }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Save failed');
      const pg = data.primaryGateway === 'razorpay' ? 'razorpay' : 'upi';
      setSavedPrimaryGateway(pg);
      setCustomerPrimaryGateway(pg);
      toast.success(data.message || 'Customer payment priority updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingPrimaryGateway(false);
    }
  };

  const copyWebhook = (url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success('Webhook URL copied');
  };

  const upiGatewayConnected = settings?.upigateway?.connected;
  const paytmConnected = settings?.paytm?.connected;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            Reseller Wallet Recharge
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect payment provider — reseller pays QR, wallet auto-credits. No manual approve.
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Customer checkout — payment first
          </CardTitle>
          <CardDescription>
            Sab customers (wallet, buy, cart, renewal) ko pehle yahi gateway milega. Fail hone par dusra auto try hoga.
            {savedPrimaryGateway && (
              <span className="block mt-2 font-medium text-foreground">
                Abhi live: {savedPrimaryGateway === 'razorpay' ? 'Razorpay first' : 'UPI first'}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCustomerPrimaryGateway('upi')}
              className={`rounded-lg border p-4 text-left transition-all ${
                customerPrimaryGateway === 'upi'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <p className="font-semibold">UPI first</p>
              <p className="text-sm text-muted-foreground mt-1">
                Aaj sabko pehle UPI page — fail par Razorpay
              </p>
            </button>
            <button
              type="button"
              onClick={() => setCustomerPrimaryGateway('razorpay')}
              className={`rounded-lg border p-4 text-left transition-all ${
                customerPrimaryGateway === 'razorpay'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <p className="font-semibold">Razorpay first</p>
              <p className="text-sm text-muted-foreground mt-1">
                Kal jaisa switch — sabko pehle Razorpay, fail par UPI
              </p>
            </button>
          </div>
          <Button onClick={saveCustomerPrimaryGateway} disabled={savingPrimaryGateway}>
            {savingPrimaryGateway ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save for all customers'
            )}
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="upigateway">
        <TabsList>
          <TabsTrigger value="upigateway">UPI Gateway</TabsTrigger>
          <TabsTrigger value="paytm">Paytm Direct</TabsTrigger>
          <TabsTrigger value="history">Recharge history</TabsTrigger>
        </TabsList>

        <TabsContent value="upigateway" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                UPI Gateway
                {upiGatewayConnected && (
                  <Badge className="bg-emerald-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                merchant.upigateway.com ki API key. Naya reseller recharge isi se banega.
                Wallet tabhi credit hota hai jab status success ho aur amount match kare.{' '}
                <a href="https://merchant.upigateway.com" target="_blank" rel="noreferrer" className="underline">
                  merchant.upigateway.com
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    placeholder={settings?.upigateway?.hasApiKey ? settings.upigateway.apiKeyMasked : 'API key'}
                    value={upiGatewayForm.apiKey}
                    onChange={(e) => setUpiGatewayForm({ ...upiGatewayForm, apiKey: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Display name</Label>
                  <Input
                    value={upiGatewayForm.displayName}
                    onChange={(e) => setUpiGatewayForm({ ...upiGatewayForm, displayName: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={connectUpiGateway} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                  {upiGatewayConnected ? 'Update & Reconnect' : 'Connect UPI Gateway'}
                </Button>
                {upiGatewayConnected && (
                  <>
                    <Button variant="outline" onClick={() => testConnection('upigateway')} disabled={testing}>
                      {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Test connection
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => disconnect('upigateway')}>
                      <Unlink className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </>
                )}
              </div>

              {upiGatewayWebhookUrl && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                  <Label>Webhook URL (UPI Gateway dashboard mein paste karo)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={upiGatewayWebhookUrl} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copyWebhook(upiGatewayWebhookUrl)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Webhook na ho to bhi page payment status poll karke credit karega.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== Paytm ==================== */}
        <TabsContent value="paytm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Paytm Merchant Connect
                {paytmConnected && (
                  <Badge className="bg-emerald-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Isme <span className="font-medium">MID + Merchant Key dono</span> chahiye. Reseller recharge ke liye UPI Gateway use karo.{' '}
                <a href="https://dashboard.paytmpayments.com" target="_blank" rel="noreferrer" className="underline">
                  Paytm Dashboard
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Merchant ID (MID)</Label>
                  <Input
                    placeholder="INTEGR7769XXXXXX93833"
                    value={paytmForm.mid}
                    onChange={(e) => setPaytmForm({ ...paytmForm, mid: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Merchant Key</Label>
                  <Input
                    type="password"
                    placeholder={settings?.paytm?.hasMerchantKey ? settings.paytm.merchantKeyMasked : 'Enter merchant key'}
                    value={paytmForm.merchantKey}
                    onChange={(e) => setPaytmForm({ ...paytmForm, merchantKey: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Environment</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={paytmForm.environment}
                    onChange={(e) => setPaytmForm({ ...paytmForm, environment: e.target.value })}
                  >
                    <option value="production">Production (Live)</option>
                    <option value="staging">Staging (Test)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>POS ID</Label>
                  <Input
                    value={paytmForm.posId}
                    onChange={(e) => setPaytmForm({ ...paytmForm, posId: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Display name</Label>
                  <Input
                    value={paytmForm.displayName}
                    onChange={(e) => setPaytmForm({ ...paytmForm, displayName: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={connectPaytm} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                  {paytmConnected ? 'Update & Reconnect' : 'Connect Paytm'}
                </Button>
                {paytmConnected && (
                  <>
                    <Button variant="outline" onClick={() => testConnection('paytm')} disabled={testing}>
                      {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Test connection
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => disconnect('paytm')}>
                      <Unlink className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </>
                )}
              </div>

              {webhookUrl && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                  <Label>Paytm webhook URL (optional — polling bhi chalega)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copyWebhook(webhookUrl)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== History ==================== */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Auto recharge history</CardTitle>
              <CardDescription>All auto recharges — credited automatically on payment</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No recharges yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Reseller</th>
                        <th className="py-2 pr-3">Amount</th>
                        <th className="py-2 pr-3">Method</th>
                        <th className="py-2 pr-3">Order ID</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item._id} className="border-b">
                          <td className="py-3 pr-3">
                            <div className="font-medium">{item.resellerInfo?.businessName || '—'}</div>
                            <div className="text-xs text-muted-foreground">{item.resellerInfo?.email}</div>
                          </td>
                          <td className="py-3 pr-3 font-semibold">₹{item.amount.toLocaleString('en-IN')}</td>
                          <td className="py-3 pr-3">
                            <Badge variant="outline">
                              {item.method === 'upigateway'
                                ? 'UPI Gateway'
                                : item.method === 'kwikupi'
                                  ? 'KwikUPI'
                                  : item.method === 'vyapar'
                                    ? 'Vyapar'
                                    : 'Paytm'}
                            </Badge>
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs">{item.clientTxnId}</td>
                          <td className="py-3 pr-3">
                            <Badge variant={item.status === 'confirmed' ? 'default' : 'secondary'}>
                              {STATUS_LABEL[item.status] || item.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Limits card */}
      <Card>
        <CardHeader>
          <CardTitle>Recharge limits</CardTitle>
          <CardDescription>
            Active provider:{' '}
            <Badge variant="outline">
              {settings?.provider === 'upigateway'
                ? 'UPI Gateway'
                : settings?.provider === 'paytm'
                  ? 'Paytm'
                  : 'KwikUPI'}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Min recharge (₹)</Label>
              <Input type="number" value={minAmount} onChange={(e) => setMinAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Max recharge (₹)</Label>
              <Input type="number" value={maxAmount} onChange={(e) => setMaxAmount(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Active provider (reseller isse pay karega)</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="upigateway">UPI Gateway</option>
              <option value="paytm">Paytm Direct (MID + Merchant Key)</option>
            </select>
          </div>
          <Button variant="secondary" onClick={saveLimits}>Save limits & provider</Button>
        </CardContent>
      </Card>
    </div>
  );
}
