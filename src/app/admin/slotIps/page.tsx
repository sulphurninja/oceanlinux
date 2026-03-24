'use client';

import React, { useEffect, useState } from 'react';
import {
  Plus, Package, Trash2, Edit, Loader2, Upload, Tag, Eye, EyeOff,
  ChevronDown, ChevronRight, Server, AlertCircle, CheckCircle, RefreshCw,
  Sparkles, Info
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SlotIP {
  _id: string;
  proxy: string;
  ip: string;
  port: number;
  username: string;
  password: string;
  allocated: boolean;
  orderId: string | null;
  allocatedAt: string | null;
}

interface PromoCode {
  code: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  isActive: boolean;
}

interface SlotIPPackage {
  _id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  ips: SlotIP[];
  promoCodes: PromoCode[];
  totalCount: number;
  availableCount: number;
  allocatedCount: number;
  createdAt: string;
}

export default function AdminSlotIpsPage() {
  const [packages, setPackages] = useState<SlotIPPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddIpsDialog, setShowAddIpsDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<SlotIPPackage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [bulkIps, setBulkIps] = useState('');
  const [available, setAvailable] = useState(true);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoDiscount, setNewPromoDiscount] = useState('');
  const [newPromoType, setNewPromoType] = useState<'percentage' | 'fixed'>('fixed');

  // Add IPs form
  const [addIpsBulk, setAddIpsBulk] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editAvailable, setEditAvailable] = useState(true);
  const [editPromoCodes, setEditPromoCodes] = useState<PromoCode[]>([]);
  const [editNewPromoCode, setEditNewPromoCode] = useState('');
  const [editNewPromoDiscount, setEditNewPromoDiscount] = useState('');
  const [editNewPromoType, setEditNewPromoType] = useState<'percentage' | 'fixed'>('fixed');

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/slot-ips');
      const data = await res.json();
      setPackages(data);
    } catch {
      toast.error('Failed to load slot IP packages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPackages(); }, []);

  const handleCreate = async () => {
    if (!name || !price || !bulkIps.trim()) {
      toast.error('Please fill in name, price, and bulk IPs');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/slot-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description, price: parseFloat(price),
          available, bulkIps,
          promoCodes: promoCodes.length > 0 ? promoCodes : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Package created with ${data.parsed} IPs`);
        if (data.errors?.length > 0) {
          toast.warning(`${data.errors.length} lines had invalid format and were skipped`);
        }
        resetCreateForm();
        setShowCreateDialog(false);
        fetchPackages();
      } else {
        toast.error(data.error || 'Failed to create package');
      }
    } catch {
      toast.error('Failed to create package');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddIps = async () => {
    if (!selectedPackage || !addIpsBulk.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/slot-ips/${selectedPackage._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addIps: addIpsBulk }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Added ${data.added} IPs to ${selectedPackage.name}`);
        setShowAddIpsDialog(false);
        setAddIpsBulk('');
        fetchPackages();
      } else {
        toast.error(data.error || 'Failed to add IPs');
      }
    } catch {
      toast.error('Failed to add IPs');
    } finally {
      setSubmitting(false);
    }
  };

  const addEditPromoCode = () => {
    if (!editNewPromoCode || !editNewPromoDiscount) return;
    setEditPromoCodes(prev => [...prev, {
      code: editNewPromoCode.toUpperCase(),
      discount: parseFloat(editNewPromoDiscount),
      discountType: editNewPromoType,
      isActive: true,
    }]);
    setEditNewPromoCode('');
    setEditNewPromoDiscount('');
  };

  const handleEdit = async () => {
    if (!selectedPackage) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/slot-ips/${selectedPackage._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName, description: editDescription,
          price: parseFloat(editPrice), available: editAvailable,
          promoCodes: editPromoCodes,
        }),
      });

      if (res.ok) {
        toast.success('Package updated');
        setShowEditDialog(false);
        fetchPackages();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update package');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pkg: SlotIPPackage) => {
    if (!confirm(`Delete "${pkg.name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/slot-ips/${pkg._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success('Package deleted');
        fetchPackages();
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete package');
    }
  };

  const addPromoCode = () => {
    if (!newPromoCode || !newPromoDiscount) return;
    setPromoCodes(prev => [...prev, {
      code: newPromoCode.toUpperCase(),
      discount: parseFloat(newPromoDiscount),
      discountType: newPromoType,
      isActive: true,
    }]);
    setNewPromoCode('');
    setNewPromoDiscount('');
  };

  const resetCreateForm = () => {
    setName('');
    setDescription('');
    setPrice('');
    setBulkIps('');
    setAvailable(true);
    setPromoCodes([]);
  };

  const openEdit = (pkg: SlotIPPackage) => {
    setSelectedPackage(pkg);
    setEditName(pkg.name);
    setEditDescription(pkg.description);
    setEditPrice(pkg.price.toString());
    setEditAvailable(pkg.available);
    setEditPromoCodes(pkg.promoCodes || []);
    setEditNewPromoCode('');
    setEditNewPromoDiscount('');
    setShowEditDialog(true);
  };

  const openAddIps = (pkg: SlotIPPackage) => {
    setSelectedPackage(pkg);
    setAddIpsBulk('');
    setShowAddIpsDialog(true);
  };

  const ipLineCount = bulkIps.split('\n').filter(l => l.trim()).length;
  const addIpLineCount = addIpsBulk.split('\n').filter(l => l.trim()).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Slot IP Packages</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage slot IP packages for customers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPackages} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Package
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{packages.length}</div>
            <p className="text-xs text-muted-foreground">Total Packages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {packages.reduce((sum, p) => sum + (p.availableCount || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Available IPs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">
              {packages.reduce((sum, p) => sum + (p.allocatedCount || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Allocated IPs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {packages.reduce((sum, p) => sum + (p.totalCount || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total IPs</p>
          </CardContent>
        </Card>
      </div>

      {/* Packages List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : packages.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Slot IP Packages</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first slot IP package to get started.
            </p>
            <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Create Package
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <PackageRow
              key={pkg._id}
              pkg={pkg}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddIps={openAddIps}
            />
          ))}
        </div>
      )}

      {/* Create Package Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Create Slot IP Package
            </DialogTitle>
            <DialogDescription>
              Upload bulk slot IPs and create a package for customers to buy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Package Name *</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Slot IP - Power Series"
                />
              </div>
              <div className="space-y-2">
                <Label>Price per IP (₹) *</Label>
                <Input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="99"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="High-speed proxy IPs for everyday use"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={available} onCheckedChange={setAvailable} />
              <Label>Available for purchase</Label>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bulk IPs *</Label>
                <Badge variant="outline" className="text-xs">
                  {ipLineCount} {ipLineCount === 1 ? 'IP' : 'IPs'}
                </Badge>
              </div>
              <Textarea
                value={bulkIps}
                onChange={e => setBulkIps(e.target.value)}
                placeholder={`Paste IPs, one per line:\n103.212.135.132:3128:user1:pass1\n103.212.135.133:3128:user2:pass2\n103.212.135.134:3128:user3:pass3`}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Format: ip:port:username:password (one per line)
              </p>
            </div>

            <Separator />

            {/* Promo Codes */}
            <div className="space-y-3">
              <Label>Promo Codes (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={newPromoCode}
                  onChange={e => setNewPromoCode(e.target.value)}
                  placeholder="SAVE50"
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={newPromoDiscount}
                  onChange={e => setNewPromoDiscount(e.target.value)}
                  placeholder="50"
                  className="w-24"
                />
                <select
                  value={newPromoType}
                  onChange={e => setNewPromoType(e.target.value as 'percentage' | 'fixed')}
                  className="px-2 border rounded-md text-sm bg-background"
                >
                  <option value="fixed">₹</option>
                  <option value="percentage">%</option>
                </select>
                <Button variant="outline" size="sm" onClick={addPromoCode}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {promoCodes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {promoCodes.map((promo, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      <Tag className="h-3 w-3" />
                      {promo.code}: {promo.discountType === 'fixed' ? `₹${promo.discount}` : `${promo.discount}%`}
                      <button
                        onClick={() => setPromoCodes(prev => prev.filter((_, idx) => idx !== i))}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Create Package ({ipLineCount} IPs)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add IPs Dialog */}
      <Dialog open={showAddIpsDialog} onOpenChange={setShowAddIpsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add IPs to {selectedPackage?.name}</DialogTitle>
            <DialogDescription>
              Paste additional slot IPs to add to this package.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Bulk IPs</Label>
              <Badge variant="outline" className="text-xs">
                {addIpLineCount} new IPs
              </Badge>
            </div>
            <Textarea
              value={addIpsBulk}
              onChange={e => setAddIpsBulk(e.target.value)}
              placeholder={`103.212.135.140:3128:user10:pass10\n103.212.135.141:3128:user11:pass11`}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIpsDialog(false)}>Cancel</Button>
            <Button onClick={handleAddIps} disabled={submitting || addIpLineCount === 0}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add {addIpLineCount} IPs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Package Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Package</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Package Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Price per IP (₹)</Label>
                <Input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editAvailable} onCheckedChange={setEditAvailable} />
              <Label>Available for purchase</Label>
            </div>

            <Separator />

            {/* Promo Codes */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Promo Codes
              </Label>

              {editPromoCodes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {editPromoCodes.map((promo, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 py-1">
                      <Tag className="h-3 w-3" />
                      {promo.code}: {promo.discountType === 'fixed' ? `₹${promo.discount}` : `${promo.discount}%`}
                      {!promo.isActive && <span className="text-muted-foreground">(inactive)</span>}
                      <button
                        onClick={() => setEditPromoCodes(prev => prev.filter((_, idx) => idx !== i))}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={editNewPromoCode}
                  onChange={e => setEditNewPromoCode(e.target.value)}
                  placeholder="SAVE50"
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={editNewPromoDiscount}
                  onChange={e => setEditNewPromoDiscount(e.target.value)}
                  placeholder="50"
                  className="w-24"
                />
                <select
                  value={editNewPromoType}
                  onChange={e => setEditNewPromoType(e.target.value as 'percentage' | 'fixed')}
                  className="px-2 border rounded-md text-sm bg-background"
                >
                  <option value="fixed">₹</option>
                  <option value="percentage">%</option>
                </select>
                <Button variant="outline" size="sm" onClick={addEditPromoCode}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add promo codes that customers can use when purchasing from this package.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackageRow({
  pkg,
  onEdit,
  onDelete,
  onAddIps,
}: {
  pkg: SlotIPPackage;
  onEdit: (pkg: SlotIPPackage) => void;
  onDelete: (pkg: SlotIPPackage) => void;
  onAddIps: (pkg: SlotIPPackage) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showIps, setShowIps] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Package className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{pkg.name}</h3>
            {pkg.available ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Disabled</Badge>
            )}
            {pkg.promoCodes?.length > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Tag className="h-3 w-3" />
                {pkg.promoCodes.length} promo{pkg.promoCodes.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {pkg.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{pkg.description}</p>
          )}
        </div>

        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-right">
            <p className="font-bold text-lg">₹{pkg.price}</p>
            <p className="text-[10px] text-muted-foreground">per IP</p>
          </div>

          <div className="flex gap-4 text-center">
            <div>
              <p className="text-lg font-bold text-green-600">{pkg.availableCount}</p>
              <p className="text-[10px] text-muted-foreground">Available</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-600">{pkg.allocatedCount}</p>
              <p className="text-[10px] text-muted-foreground">Sold</p>
            </div>
            <div>
              <p className="text-lg font-bold">{pkg.totalCount}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </div>

          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/10 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => onAddIps(pkg)}>
              <Plus className="h-4 w-4 mr-1" />
              Add IPs
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(pkg)}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowIps(!showIps)}>
              {showIps ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              {showIps ? 'Hide' : 'Show'} IPs
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(pkg)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>

          {showIps && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Proxy</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.ips.map((ip, i) => (
                    <tr key={ip._id} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-mono text-xs">{ip.proxy}</td>
                      <td className="p-2">
                        {ip.allocated ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Sold
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                            <Server className="h-3 w-3" />
                            Available
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Created: {new Date(pkg.createdAt).toLocaleDateString('en-US', {
              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
