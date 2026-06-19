"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Shield,
  ShieldOff,
  Edit,
  CreditCard,
  Server,
  AlertCircle,
  CheckCircle,
  FileText,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { toast } from 'sonner';
import { useParams, useRouter } from 'next/navigation';
import Link from "next/link";
import {
  AdminManagedOrder,
  AdminOrderManageDialog,
  AdminOrderTransferDialog,
  AdminOrderRowActions,
  runOrderProvision,
} from '@/components/admin/AdminOrderTools';

interface UserDetails {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserStats {
  totalOrders: number;
  totalSpent: number;
  activeServices: number;
  pendingOrders: number;
  failedOrders: number;
  lastOrderDate: string | null;
  avgOrderValue: number;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
  confirmed: { color: 'bg-blue-100 text-blue-800', label: 'Confirmed' },
  active: { color: 'bg-green-100 text-green-800', label: 'Active' },
  completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
  failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
  cancelled: { color: 'bg-gray-100 text-gray-800', label: 'Cancelled' },
};

const provisioningConfig: Record<string, { color: string; label: string }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
  provisioning: { color: 'bg-blue-100 text-blue-800', label: 'Provisioning' },
  active: { color: 'bg-green-100 text-green-800', label: 'Active' },
  failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
  suspended: { color: 'bg-orange-100 text-orange-800', label: 'Suspended' },
  terminated: { color: 'bg-gray-100 text-gray-800', label: 'Terminated' },
};

export default function UserDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [orders, setOrders] = useState<AdminManagedOrder[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [editOrder, setEditOrder] = useState<AdminManagedOrder | null>(null);
  const [transferOrder, setTransferOrder] = useState<AdminManagedOrder | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);

  useEffect(() => {
    fetchUserDetails();
  }, [params.userId]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/users/${params.userId}`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setOrders(data.orders || []);
        setStats(data.stats);
      } else if (response.status === 404) {
        toast.error('User not found');
        router.push('/admin/users');
      } else {
        toast.error('Failed to fetch user details');
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      toast.error('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async (action: string, data?: Record<string, unknown>) => {
    if (!user) return;

    setActionLoading(action);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: user._id, action, data }),
      });

      if (response.ok) {
        toast.success(`User ${action} successful`);
        fetchUserDetails();
      } else {
        const error = await response.json();
        toast.error(error.message || `Failed to ${action} user`);
      }
    } catch (error) {
      console.error(`Error ${action} user:`, error);
      toast.error(`Failed to ${action} user`);
    } finally {
      setActionLoading(null);
    }
  };

  const downloadInvoice = (orderId: string) => {
    window.open(`/api/admin/users/${params.userId}/orders/${orderId}/invoice`, '_blank');
  };

  const handleProvision = async (order: AdminManagedOrder) => {
    setProvisioningId(order._id);
    await runOrderProvision(order._id, fetchUserDetails);
    setProvisioningId(null);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading user details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">User Not Found</h2>
          <p className="text-muted-foreground mb-8">The user you&apos;re looking for doesn&apos;t exist.</p>
          <Link href="/admin/users">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Users
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">User Details</h1>
            <p className="text-muted-foreground">Manage user profile and their orders</p>
          </div>
        </div>
        <Button onClick={fetchUserDetails} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center space-x-2 mb-2 flex-wrap">
                  <h2 className="text-2xl font-bold">{user.name}</h2>
                  {user.isVerified ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                  )}
                  <Badge variant={user.role === 'Admin' ? 'destructive' : 'default'}>
                    {user.role || 'User'}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <Mail className="w-4 h-4 mr-2" />
                    {user.email}
                  </div>
                  {user.phone && (
                    <div className="flex items-center">
                      <Phone className="w-4 h-4 mr-2" />
                      {user.phone}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.isVerified ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUserAction('unverify')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'unverify' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldOff className="w-4 h-4 mr-1" />}
                  Unverify
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUserAction('verify')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'verify' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
                  Verify
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUserAction('changeRole', { role: user.role === 'Admin' ? 'User' : 'Admin' })}
                disabled={!!actionLoading}
              >
                {actionLoading === 'changeRole' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Edit className="w-4 h-4 mr-1" />}
                Change Role
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.totalOrders}</p><p className="text-sm text-muted-foreground">Total Orders</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">₹{stats.totalSpent.toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Spent</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.activeServices}</p><p className="text-sm text-muted-foreground">Active Services</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.pendingOrders}</p><p className="text-sm text-muted-foreground">Pending Orders</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.failedOrders}</p><p className="text-sm text-muted-foreground">Failed Orders</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">₹{Math.round(stats.avgOrderValue).toLocaleString()}</p><p className="text-sm text-muted-foreground">Avg Order Value</p></CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Order management
              </CardTitle>
              <CardDescription>
                Manage opens the full server panel (start / stop / format). Use Edit for quick credential fixes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order._id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg border"
                  >
                    <div className="flex items-start space-x-4 min-w-0">
                      <Server className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h4 className="font-medium">{order.productName}</h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                          <span>RAM: {order.memory}</span>
                          <span>OS: {order.os}</span>
                          <span className="font-mono">IP: {order.ipAddress || 'Pending'}</span>
                          <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                          {order.expiryDate && (
                            <span>Expires: {new Date(order.expiryDate).toLocaleDateString()}</span>
                          )}
                        </div>
                        {(order.username || order.password) && (
                          <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                            {order.username ? `User: ${order.username}` : ''}
                            {order.password ? ' · Password set' : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-medium">₹{order.price.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                          {order.transactionId || order.clientTxnId || order._id}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge className={statusConfig[order.status]?.color || 'bg-gray-100 text-gray-800'}>
                          {statusConfig[order.status]?.label || order.status}
                        </Badge>
                        <Badge className={provisioningConfig[order.provisioningStatus || 'pending']?.color || 'bg-gray-100 text-gray-800'}>
                          {provisioningConfig[order.provisioningStatus || 'pending']?.label || order.provisioningStatus}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AdminOrderRowActions
                          order={order}
                          onEdit={setEditOrder}
                          onTransfer={setTransferOrder}
                          onProvision={handleProvision}
                          provisioningId={provisioningId}
                          manageReturnUserId={String(params.userId)}
                        />
                        <Button variant="outline" size="sm" className="h-8" onClick={() => downloadInvoice(order._id)}>
                          <FileText className="w-4 h-4 mr-1" />
                          Invoice
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {orders.length === 0 && (
                  <div className="text-center py-8">
                    <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium mb-2">No orders found</h3>
                    <p className="text-muted-foreground text-sm">This user hasn&apos;t placed any orders yet.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle>Activity Log</CardTitle></CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">Activity tracking coming soon</h3>
                <p className="text-muted-foreground text-sm">User activity logs will be available in a future update.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AdminOrderManageDialog
        order={editOrder}
        open={!!editOrder}
        onOpenChange={(open) => !open && setEditOrder(null)}
        onSaved={fetchUserDetails}
        customerName={user.name}
        customerEmail={user.email}
      />

      <AdminOrderTransferDialog
        order={transferOrder}
        open={!!transferOrder}
        onOpenChange={(open) => !open && setTransferOrder(null)}
        onTransferred={fetchUserDetails}
        currentOwnerEmail={user.email}
      />
    </div>
  );
}
