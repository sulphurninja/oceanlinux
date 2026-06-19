'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import { Settings2, ArrowRightLeft, Edit2, Loader2, Play, AlertCircle, Save, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const ADMIN_ORDER_STATUSES = ['pending', 'confirmed', 'active'] as const;

export type AdminManagedOrder = {
  _id: string;
  productName: string;
  memory: string;
  price: number;
  status: string;
  provisioningStatus?: string;
  provisioningError?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  os?: string;
  provider?: string;
  autoProvisioned?: boolean;
  advpsServiceId?: string;
  advpsOrderId?: string;
  hostycareServiceId?: string;
  smartvpsServiceId?: string;
  transactionId?: string;
  clientTxnId?: string;
  createdAt: string;
  expiryDate?: string;
  user?: { name?: string; email?: string };
};

function normalizeAdminOrderStatus(status?: string): string {
  const value = String(status ?? '').trim().toLowerCase();
  if (value === 'paid' || value === 'completed') return 'confirmed';
  if ((ADMIN_ORDER_STATUSES as readonly string[]).includes(value)) return value;
  return 'pending';
}

function canAutoProvision(order: AdminManagedOrder): boolean {
  const status = normalizeAdminOrderStatus(order.status);
  return (
    ((status === 'confirmed') && !order.autoProvisioned) ||
    order.provisioningStatus === 'failed' ||
    ((order.provider === 'hostycare' || order.provider === 'smartvps') &&
      status === 'confirmed' &&
      !order.ipAddress)
  );
}

function startEdit(o: AdminManagedOrder): AdminManagedOrder {
  return { ...o, status: normalizeAdminOrderStatus(o.status) };
}

type ManageDialogProps = {
  order: AdminManagedOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  customerName?: string;
  customerEmail?: string;
};

export function AdminOrderManageDialog({
  order,
  open,
  onOpenChange,
  onSaved,
  customerName,
  customerEmail,
}: ManageDialogProps) {
  const [editing, setEditing] = useState<AdminManagedOrder | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      setEditing(startEdit(order));
    } else if (!open) {
      setEditing(null);
    }
  }, [open, order]);

  const current = editing;

  const handleSave = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const response = await fetch('/api/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderId: current._id,
          ipAddress: current.ipAddress,
          username: current.username,
          password: current.password,
          os: current.os,
          status: current.status,
          provider: current.provider,
          provisioningStatus: current.provisioningStatus,
          advpsServiceId: current.advpsServiceId || undefined,
          advpsOrderId: current.advpsOrderId || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.message || 'Failed to update order');
        return;
      }

      if (data.advpsNotes?.length) {
        data.advpsNotes.forEach((note: string) => {
          if (note.includes('Failed') || note.includes('manually')) {
            toast.warning(`ADVPS: ${note}`, { duration: 8000 });
          } else {
            toast.info(`ADVPS: ${note}`, { duration: 5000 });
          }
        });
      }

      toast.success('Order updated successfully');
      onOpenChange(false);
      setEditing(null);
      onSaved();
    } catch {
      toast.error('Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setEditing(null);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" key={order?._id}>
        <DialogHeader>
          <DialogTitle>Manage Order</DialogTitle>
          <DialogDescription>
            Deliver credentials, fix status, or link ADVPS — no seller login needed.
          </DialogDescription>
        </DialogHeader>

        {current && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{current.productName}</p>
              <p className="text-muted-foreground text-xs font-mono mt-1">{current._id}</p>
              {(customerName || customerEmail) && (
                <p className="text-muted-foreground text-xs mt-1">
                  Customer: {customerName || 'N/A'} ({customerEmail || 'N/A'})
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Order status</Label>
                <Select
                  value={current.status}
                  onValueChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, status: value } : prev))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provisioning status</Label>
                <Select
                  value={current.provisioningStatus || 'pending'}
                  onValueChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, provisioningStatus: value } : prev))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="provisioning">Provisioning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={current.provider || 'hostycare'}
                  onValueChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, provider: value } : prev))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hostycare">Hostycare</SelectItem>
                    <SelectItem value="smartvps">SmartVPS</SelectItem>
                    <SelectItem value="advps">ADVPS</SelectItem>
                    <SelectItem value="slotip">Slot IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operating system</Label>
                <Select
                  value={current.os || 'Ubuntu 22'}
                  onValueChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, os: value } : prev))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ubuntu 22">Ubuntu 22</SelectItem>
                    <SelectItem value="CentOS 7">CentOS 7</SelectItem>
                    <SelectItem value="Windows 2022 64">Windows 2022 64</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-semibold">Server credentials</h4>
              <div className="space-y-2">
                <Label>IP address</Label>
                <Input
                  value={current.ipAddress || ''}
                  onChange={(e) =>
                    setEditing((prev) => (prev ? { ...prev, ipAddress: e.target.value } : prev))
                  }
                  placeholder="103.151.44.189 or 103.151.44.189:49965"
                  className="font-mono"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={current.username || ''}
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, username: e.target.value } : prev))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    value={current.password || ''}
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, password: e.target.value } : prev))
                    }
                    className="font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-semibold">ADVPS (optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>ADVPS service ID</Label>
                  <Input
                    value={current.advpsServiceId || ''}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev
                          ? {
                              ...prev,
                              advpsServiceId: e.target.value,
                              provider: e.target.value ? 'advps' : prev.provider,
                            }
                          : prev
                      )
                    }
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>ADVPS order ID</Label>
                  <Input
                    value={current.advpsOrderId || ''}
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, advpsOrderId: e.target.value } : prev))
                    }
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {current.provisioningError && (
              <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {current.provisioningError}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/manageOrders" target="_blank">
              <ExternalLink className="h-4 w-4 mr-1" />
              Full order manager
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !current}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TransferDialogProps = {
  order: AdminManagedOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: () => void;
  currentOwnerEmail?: string;
};

export function AdminOrderTransferDialog({
  order,
  open,
  onOpenChange,
  onTransferred,
  currentOwnerEmail,
}: TransferDialogProps) {
  const [email, setEmail] = useState('');
  const [transferring, setTransferring] = useState(false);

  const handleTransfer = async () => {
    if (!order) return;
    const target = email.trim().toLowerCase();
    if (!target) {
      toast.error('Enter the target user email');
      return;
    }
    if (currentOwnerEmail?.toLowerCase() === target) {
      toast.error('Service is already on this account');
      return;
    }

    setTransferring(true);
    try {
      const response = await fetch('/api/admin/orders/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId: order._id, targetUserEmail: target }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        toast.error(data.message || 'Transfer failed');
        return;
      }
      toast.success(data.message || 'Service transferred');
      setEmail('');
      onOpenChange(false);
      onTransferred();
    } catch {
      toast.error('Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setEmail('');
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer service</DialogTitle>
          <DialogDescription>
            Move this VPS to another OceanLinux account. IP and credentials stay the same.
          </DialogDescription>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{order.productName}</p>
              <p className="text-muted-foreground">IP: {order.ipAddress || 'Pending'}</p>
            </div>
            <div className="space-y-2">
              <Label>Transfer to email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transferring}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} disabled={transferring}>
            {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-1" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type OrderActionsProps = {
  order: AdminManagedOrder;
  onEdit?: (order: AdminManagedOrder) => void;
  onTransfer: (order: AdminManagedOrder) => void;
  onProvision: (order: AdminManagedOrder) => void;
  provisioningId: string | null;
  /** When set, Manage opens full server control UI and returns here */
  manageReturnUserId?: string;
};

export function AdminOrderRowActions({
  order,
  onEdit,
  onTransfer,
  onProvision,
  provisioningId,
  manageReturnUserId,
}: OrderActionsProps) {
  const manageHref = manageReturnUserId
    ? `/admin/orders/${order._id}?userId=${manageReturnUserId}`
    : `/dashboard/order/${order._id}?returnTo=${encodeURIComponent('/admin/manageOrders')}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="default" asChild className="h-8">
        <Link href={manageHref}>
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          Manage
        </Link>
      </Button>
      {onEdit && (
        <Button size="sm" variant="outline" onClick={() => onEdit(order)} className="h-8">
          <Edit2 className="h-3.5 w-3.5 mr-1" />
          Edit
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => onTransfer(order)} className="h-8">
        <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
        Transfer
      </Button>
      {canAutoProvision(order) && (
        <Button
          size="sm"
          variant={order.provisioningStatus === 'failed' ? 'destructive' : 'default'}
          onClick={() => onProvision(order)}
          disabled={provisioningId === order._id}
          className="h-8"
        >
          {provisioningId === order._id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1" />
          )}
          Provision
        </Button>
      )}
    </div>
  );
}

export async function runOrderProvision(
  orderId: string,
  onDone: () => void
): Promise<boolean> {
  try {
    const response = await fetch('/api/orders/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ orderId }),
    });
    const result = await response.json();
    if (result.success) {
      toast.success('Provisioning started');
      onDone();
      return true;
    }
    toast.error(result.message || 'Provisioning failed');
    return false;
  } catch {
    toast.error('Failed to start provisioning');
    return false;
  }
}
