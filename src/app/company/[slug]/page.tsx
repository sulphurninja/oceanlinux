'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2, Server, Package, Loader2, LogOut, Lock, Save, Eye, EyeOff,
  Globe, KeyRound, Search, ArrowUpDown, CalendarDays, ClipboardList,
  Play, Square, RotateCcw, HardDriveIcon, CheckCircle, XCircle, Clock,
  MessageSquare,
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

interface ActionRequest {
  _id: string;
  orderId: string;
  userId: { _id: string; name: string; email: string };
  action: string;
  status: string;
  requestedAt: string;
  processedAt?: string;
  adminNotes?: string;
  orderSnapshot: {
    productName: string;
    ipAddress: string;
    customerEmail: string;
    customerName: string;
    os: string;
    memory: string;
  };
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  start: <Play className="h-3.5 w-3.5" />,
  stop: <Square className="h-3.5 w-3.5" />,
  restart: <RotateCcw className="h-3.5 w-3.5" />,
  format: <HardDriveIcon className="h-3.5 w-3.5" />,
};

function isToday(d: Date) { const t = new Date(); return d.toDateString() === t.toDateString(); }
function isYesterday(d: Date) { const t = new Date(); t.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString(); }
function isThisWeek(d: Date) { const now = new Date(); const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7); return d >= weekAgo; }
function isThisMonth(d: Date) { const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }

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
  const [actionRequests, setActionRequests] = useState<ActionRequest[]>([]);
  const [tab, setTab] = useState<'stocks' | 'orders' | 'requests'>('stocks');
  const [togglingStock, setTogglingStock] = useState<string | null>(null);

  // Order filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // Edit order
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editIp, setEditIp] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editOs, setEditOs] = useState('');
  const [saving, setSaving] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  // Action request processing
  const [processingRequest, setProcessingRequest] = useState<ActionRequest | null>(null);
  const [processAction, setProcessAction] = useState<'approve' | 'reject'>('approve');
  const [processNotes, setProcessNotes] = useState('');
  const [processNewPassword, setProcessNewPassword] = useState('');
  const [processingLoading, setProcessingLoading] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState('pending');

  useEffect(() => { checkSession(); }, []);

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
    } catch {} finally { setLoading(false); }
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
    } catch { toast.error('Login failed'); }
    finally { setLoginLoading(false); }
  };

  const loadData = async () => {
    const [stockRes, orderRes] = await Promise.all([
      fetch('/api/company/stocks'),
      fetch('/api/company/orders'),
    ]);
    if (stockRes.ok) setStocks(await stockRes.json());
    if (orderRes.ok) setOrders(await orderRes.json());
    loadActionRequests('pending');
  };

  const loadActionRequests = async (status: string) => {
    try {
      const res = await fetch(`/api/company/action-requests?status=${status}`);
      if (res.ok) setActionRequests(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (authed) loadActionRequests(requestStatusFilter);
  }, [requestStatusFilter]);

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
      } else toast.error('Failed to update');
    } catch { toast.error('Failed to update'); }
    finally { setTogglingStock(null); }
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
        body: JSON.stringify({ orderId: editOrder._id, ipAddress: editIp, username: editUsername, password: editPassword, os: editOs }),
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
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  };

  const handleProcessRequest = async () => {
    if (!processingRequest) return;
    setProcessingLoading(true);
    try {
      const res = await fetch('/api/company/action-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: processingRequest._id,
          action: processAction,
          adminNotes: processNotes,
          newPassword: (processingRequest.action === 'format' && processAction === 'approve' && processNewPassword) ? processNewPassword : undefined,
        }),
      });
      if (res.ok) {
        toast.success(`Request ${processAction === 'approve' ? 'approved' : 'rejected'}`);
        setProcessingRequest(null);
        setProcessNotes('');
        loadActionRequests(requestStatusFilter);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed');
      }
    } catch { toast.error('Failed to process'); }
    finally { setProcessingLoading(false); }
  };

  const handleLogout = () => {
    document.cookie = 'company_session=; path=/; max-age=0';
    setAuthed(false);
    setPassword('');
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filtered and sorted orders
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(o =>
        o.productName.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerEmail?.toLowerCase().includes(q) ||
        o.ipAddress?.toLowerCase().includes(q) ||
        o.stockName?.toLowerCase().includes(q) ||
        o.memory?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(o => o.status === statusFilter);
    }

    if (dateFilter !== 'all') {
      result = result.filter(o => {
        const d = new Date(o.createdAt);
        switch (dateFilter) {
          case 'today': return isToday(d);
          case 'yesterday': return isYesterday(d);
          case 'week': return isThisWeek(d);
          case 'month': return isThisMonth(d);
          default: return true;
        }
      });
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name': return a.productName.localeCompare(b.productName);
        case 'status': return a.status.localeCompare(b.status);
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [orders, searchTerm, statusFilter, dateFilter, sortBy]);

  const pendingRequestCount = useMemo(() => {
    if (requestStatusFilter === 'pending') return actionRequests.length;
    return 0;
  }, [actionRequests, requestStatusFilter]);

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
              <Input type="password" placeholder="Enter company password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="mt-1.5" />
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
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Stocks</p><p className="text-2xl font-bold">{stocks.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Available</p><p className="text-2xl font-bold text-green-600">{stocks.filter(s => s.available).length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Unavailable</p><p className="text-2xl font-bold text-red-500">{stocks.filter(s => !s.available).length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active Orders</p><p className="text-2xl font-bold">{orders.length}</p></CardContent></Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { id: 'stocks' as const, icon: <Server className="h-4 w-4" />, label: 'IP Stocks', count: stocks.length },
            { id: 'orders' as const, icon: <Package className="h-4 w-4" />, label: 'Orders', count: orders.length },
            { id: 'requests' as const, icon: <ClipboardList className="h-4 w-4" />, label: 'Action Requests', count: null },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all shrink-0',
                tab === t.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}>
              {t.icon}
              {t.label}
              {t.count !== null && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{t.count}</Badge>}
            </button>
          ))}
        </div>

        {/* ── Stocks Tab ── */}
        {tab === 'stocks' && (
          <div className="space-y-2">
            {stocks.length === 0 ? (
              <Card><CardContent className="py-12 text-center"><Server className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No IP stocks assigned to your company yet.</p></CardContent></Card>
            ) : stocks.map((stock) => (
              <Card key={stock._id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', stock.available ? 'bg-green-500/10' : 'bg-red-500/10')}>
                        <Server className={cn('h-4 w-4', stock.available ? 'text-green-600' : 'text-red-500')} />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">{stock.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] h-4">{stock.serverType}</Badge>
                          {stock.tags?.map(t => <Badge key={t} variant="secondary" className="text-[10px] h-4">{t}</Badge>)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('text-xs font-medium', stock.available ? 'text-green-600' : 'text-red-500')}>
                        {stock.available ? 'Available' : 'Unavailable'}
                      </span>
                      <Switch checked={stock.available} onCheckedChange={(c) => toggleStock(stock._id, c)} disabled={togglingStock === stock._id} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Orders Tab ── */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 max-w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search orders..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-28 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-28 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-28 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
                {(searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || sortBy !== 'newest') && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearchTerm(''); setStatusFilter('all'); setDateFilter('all'); setSortBy('newest'); }}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Results count */}
            <p className="text-xs text-muted-foreground">
              {filteredOrders.length} of {orders.length} orders
            </p>

            {/* Order cards */}
            <div className="space-y-2">
              {filteredOrders.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">{orders.length === 0 ? 'No orders yet.' : 'No orders match your filters.'}</p></CardContent></Card>
              ) : filteredOrders.map((order) => (
                <Card key={order._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm">{order.productName}</h3>
                          <Badge variant="outline" className="text-[10px] h-4">{order.memory}</Badge>
                          <Badge variant="secondary" className="text-[10px] h-4">{order.stockName}</Badge>
                          <Badge variant={order.status === 'active' ? 'default' : 'destructive'} className="text-[10px] h-4">{order.status}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          {order.customerName && <span>{order.customerName}</span>}
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            <span className={order.ipAddress ? 'text-foreground font-mono' : 'text-amber-500'}>{order.ipAddress || 'Not set'}</span>
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
                            ) : <span className="text-amber-500">Not set</span>}
                          </div>
                          <span className="hidden sm:inline">{new Date(order.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => openEditOrder(order)}>
                        <Save className="h-3.5 w-3.5" />
                        Update
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Action Requests Tab ── */}
        {tab === 'requests' && (
          <div className="space-y-4">
            {/* Status filter pills */}
            <div className="flex gap-2">
              {(['pending', 'approved', 'rejected'] as const).map(s => (
                <button key={s} onClick={() => setRequestStatusFilter(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-xs font-medium transition-all capitalize',
                    requestStatusFilter === s
                      ? s === 'pending' ? 'border-amber-500 bg-amber-500/10 text-amber-700' :
                        s === 'approved' ? 'border-green-500 bg-green-500/10 text-green-700' :
                        'border-red-500 bg-red-500/10 text-red-700'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}>
                  {s === 'pending' && <Clock className="h-3 w-3 inline mr-1" />}
                  {s === 'approved' && <CheckCircle className="h-3 w-3 inline mr-1" />}
                  {s === 'rejected' && <XCircle className="h-3 w-3 inline mr-1" />}
                  {s}
                  {s === 'pending' && actionRequests.length > 0 && requestStatusFilter === 'pending' && (
                    <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{actionRequests.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Request cards */}
            <div className="space-y-2">
              {actionRequests.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No {requestStatusFilter} action requests.</p></CardContent></Card>
              ) : actionRequests.map((req) => (
                <Card key={req._id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                            {ACTION_ICONS[req.action] || <ClipboardList className="h-3.5 w-3.5" />}
                          </div>
                          <h3 className="font-medium text-sm capitalize">{req.action}</h3>
                          <Badge variant={req.status === 'pending' ? 'secondary' : req.status === 'approved' ? 'default' : 'destructive'} className="text-[10px] h-4 capitalize">{req.status}</Badge>
                        </div>
                        <div className="mt-2 p-2.5 rounded-md bg-muted/50 text-xs space-y-0.5">
                          <p className="font-medium">{req.orderSnapshot.productName} — {req.orderSnapshot.memory}</p>
                          <p className="text-muted-foreground">{req.orderSnapshot.customerName} ({req.orderSnapshot.customerEmail})</p>
                          {req.orderSnapshot.ipAddress && <p className="font-mono text-muted-foreground">{req.orderSnapshot.ipAddress}</p>}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>By {req.userId?.name || 'Unknown'}</span>
                          <span>{new Date(req.requestedAt).toLocaleString()}</span>
                        </div>
                        {req.adminNotes && (
                          <div className="mt-2 p-2 rounded-md bg-muted/30 border text-xs">
                            <span className="font-medium">Notes:</span> {req.adminNotes}
                          </div>
                        )}
                      </div>
                      {req.status === 'pending' && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="gap-1 h-8 text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => { setProcessingRequest(req); setProcessAction('approve'); setProcessNotes(''); setProcessNewPassword(''); }}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 h-8 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => { setProcessingRequest(req); setProcessAction('reject'); setProcessNotes(''); setProcessNewPassword(''); }}>
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Order Dialog */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Order Credentials</DialogTitle></DialogHeader>
          {editOrder && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium">{editOrder.productName} — {editOrder.memory}</p>
                {editOrder.customerName && <p className="text-xs text-muted-foreground mt-0.5">{editOrder.customerName} ({editOrder.customerEmail})</p>}
              </div>
              <div><Label>IP Address</Label><Input value={editIp} onChange={(e) => setEditIp(e.target.value)} placeholder="e.g. 103.87.204.100" className="mt-1.5" /></div>
              <div><Label>Username</Label><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="e.g. root" className="mt-1.5" /></div>
              <div><Label>Password</Label><Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Server password" className="mt-1.5" /></div>
              <div>
                <Label>Operating System</Label>
                <Select value={editOs} onValueChange={setEditOs}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select OS" /></SelectTrigger>
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

      {/* Process Action Request Dialog */}
      <Dialog open={!!processingRequest} onOpenChange={(open) => !open && setProcessingRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{processAction} Request</DialogTitle>
          </DialogHeader>
          {processingRequest && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{processingRequest.action}</span>
                  <span className="text-muted-foreground">—</span>
                  <span>{processingRequest.orderSnapshot.productName}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {processingRequest.orderSnapshot.customerName} ({processingRequest.orderSnapshot.customerEmail})
                </p>
                <p className="text-xs font-mono text-muted-foreground">{processingRequest.orderSnapshot.ipAddress}</p>
              </div>
              {processingRequest?.action === 'format' && processAction === 'approve' && (
                <div>
                  <Label>New Server Password</Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Enter the new password after formatting. This will update the order&apos;s server password.
                  </p>
                  <Input value={processNewPassword} onChange={(e) => setProcessNewPassword(e.target.value)} placeholder="Enter new server password" />
                </div>
              )}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={processNotes} onChange={(e) => setProcessNotes(e.target.value)} placeholder="Add a note for the customer..." className="mt-1.5" rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessingRequest(null)}>Cancel</Button>
            <Button onClick={handleProcessRequest} disabled={processingLoading}
              className={cn('gap-2', processAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')}>
              {processingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : processAction === 'approve' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {processAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
