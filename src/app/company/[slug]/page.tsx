'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2,
  Server,
  Package,
  Loader2,
  LogOut,
  Lock,
  Save,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Stock {
  _id: string;
  name: string;
  available: boolean;
  serverType: string;
  tags: string[];
}

interface Order {
  _id: string;
  productName: string;
  memory: string;
  ipAddress: string;
  username: string;
  password: string;
  os?: string;
  status: string;
  provisioningStatus?: string;
  customerName?: string;
  customerEmail?: string;
  createdAt: string;
  expiryDate?: string;
  stockName: string;
}

export default function CompanyDashboard() {
  const params = useParams();
  const slug = params.slug as string;

  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<'stocks' | 'orders'>('stocks');
  const [togglingStock, setTogglingStock] = useState<string | null>(null);

  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editIp, setEditIp] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editOs, setEditOs] = useState('');
  const [saving, setSaving] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/company/me');
      if (res.ok) {
        const data = await res.json();
        if (data.slug === slug) {
          setAuthed(true);
          setCompanyName(data.name);
          loadData();
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoginLoading(true);
    try {
      const res = await fetch('/api/company/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setAuthed(true);
        setCompanyName(data.name);
        toast.success(`Welcome, ${data.name}`);
        loadData();
      } else {
        toast.error(data.error || 'Invalid credentials');
      }
    } catch {
      toast.error('Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const loadData = async () => {
    const [stockRes, orderRes] = await Promise.all([
      fetch('/api/company/stocks'),
      fetch('/api/company/orders'),
    ]);
    if (stockRes.ok) setStocks(await stockRes.json());
    if (orderRes.ok) setOrders(await orderRes.json());
  };

  const toggleStock = async (stockId: string, available: boolean) => {
    setTogglingStock(stockId);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, available }),
      });
      if (res.ok) {
        setStocks(prev => prev.map(s => s._id === stockId ? { ...s, available } : s));
        toast.success(available ? 'Stock enabled' : 'Stock disabled');
      } else {
        toast.error('Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setTogglingStock(null);
    }
  };

  const openEditOrder = (order: Order) => {
    setEditOrder(order);
    setEditIp(order.ipAddress || '');
    setEditUsername(order.username || '');
    setEditPassword(order.password || '');
    setEditOs(order.os || '');
  };

  const saveOrderCreds = async () => {
    if (!editOrder) return;
    setSaving(true);
    try {
      const res = await fetch('/api/company/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: editOrder._id,
          ipAddress: editIp,
          username: editUsername,
          password: editPassword,
          os: editOs,
        }),
      });
      if (res.ok) {
        toast.success('Credentials updated');
        setOrders(prev => prev.map(o =>
          o._id === editOrder._id ? { ...o, ipAddress: editIp, username: editUsername, password: editPassword, os: editOs, status: 'active', provisioningStatus: 'active' } : o
        ));
        setEditOrder(null);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    document.cookie = 'company_session=; path=/; max-age=0';
    setAuthed(false);
    setPassword('');
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Company Portal</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your password to access the <span className="font-medium text-foreground">{slug}</span> dashboard.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Enter company password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="mt-1.5"
              />
            </div>
            <Button className="w-full gap-2" onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">{companyName}</h1>
                <p className="text-xs text-muted-foreground">Company Dashboard</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Stocks</p>
              <p className="text-2xl font-bold">{stocks.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="text-2xl font-bold text-green-600">{stocks.filter(s => s.available).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Unavailable</p>
              <p className="text-2xl font-bold text-red-500">{stocks.filter(s => !s.available).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Active Orders</p>
              <p className="text-2xl font-bold">{orders.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setTab('stocks')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
              tab === 'stocks' ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            <Server className="h-4 w-4" />
            IP Stocks
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{stocks.length}</Badge>
          </button>
          <button
            onClick={() => setTab('orders')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
              tab === 'orders' ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            <Package className="h-4 w-4" />
            Orders
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{orders.length}</Badge>
          </button>
        </div>

        {/* Stock Management */}
        {tab === 'stocks' && (
          <div className="space-y-2">
            {stocks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Server className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No IP stocks assigned to your company yet.</p>
                </CardContent>
              </Card>
            ) : (
              stocks.map((stock) => (
                <Card key={stock._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-9 w-9 rounded-lg flex items-center justify-center',
                          stock.available ? 'bg-green-500/10' : 'bg-red-500/10'
                        )}>
                          <Server className={cn('h-4 w-4', stock.available ? 'text-green-600' : 'text-red-500')} />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">{stock.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] h-4">{stock.serverType}</Badge>
                            {stock.tags?.map(t => (
                              <Badge key={t} variant="secondary" className="text-[10px] h-4">{t}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn('text-xs font-medium', stock.available ? 'text-green-600' : 'text-red-500')}>
                          {stock.available ? 'Available' : 'Unavailable'}
                        </span>
                        <Switch
                          checked={stock.available}
                          onCheckedChange={(checked) => toggleStock(stock._id, checked)}
                          disabled={togglingStock === stock._id}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Orders Management */}
        {tab === 'orders' && (
          <div className="space-y-2">
            {orders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No active orders for your stocks yet.</p>
                </CardContent>
              </Card>
            ) : (
              orders.map((order) => (
                <Card key={order._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm">{order.productName}</h3>
                          <Badge variant="outline" className="text-[10px] h-4">{order.memory}</Badge>
                          <Badge variant="secondary" className="text-[10px] h-4">{order.stockName}</Badge>
                          <Badge
                            variant={order.status === 'active' ? 'default' : 'destructive'}
                            className="text-[10px] h-4"
                          >
                            {order.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                          {order.customerName && <span>{order.customerName}</span>}
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            <span className={order.ipAddress ? 'text-foreground font-mono' : 'text-amber-500'}>
                              {order.ipAddress || 'Not set'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <KeyRound className="h-3 w-3" />
                            {order.password ? (
                              <span className="font-mono flex items-center gap-1">
                                {visiblePasswords.has(order._id) ? order.password : '••••••'}
                                <button onClick={() => togglePasswordVisibility(order._id)} className="hover:text-foreground">
                                  {visiblePasswords.has(order._id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                              </span>
                            ) : (
                              <span className="text-amber-500">Not set</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => openEditOrder(order)}>
                        <Save className="h-3.5 w-3.5" />
                        Update
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Edit Order Dialog */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Credentials</DialogTitle>
          </DialogHeader>
          {editOrder && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium">{editOrder.productName} — {editOrder.memory}</p>
                {editOrder.customerName && <p className="text-xs text-muted-foreground mt-0.5">{editOrder.customerName} ({editOrder.customerEmail})</p>}
              </div>
              <div>
                <Label>IP Address</Label>
                <Input value={editIp} onChange={(e) => setEditIp(e.target.value)} placeholder="e.g. 103.87.204.100" className="mt-1.5" />
              </div>
              <div>
                <Label>Username</Label>
                <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="e.g. root" className="mt-1.5" />
              </div>
              <div>
                <Label>Password</Label>
                <Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Server password" className="mt-1.5" />
              </div>
              <div>
                <Label>Operating System</Label>
                <Select value={editOs} onValueChange={setEditOs}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select OS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ubuntu 22">Ubuntu 22</SelectItem>
                    <SelectItem value="CentOS 7">CentOS 7</SelectItem>
                    <SelectItem value="Windows 2022 64">Windows 2022</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
            <Button onClick={saveOrderCreds} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
