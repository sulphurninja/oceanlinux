'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Loader2,
  Trash2,
  Clock,
  Pencil,
  RefreshCw,
  Package,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TRIAL_VPS_PLAN_CATEGORIES,
  trialVpsPlanCategoryLabel,
  formatTrialVpsMemoryGb,
  trialVpsPlanUsesMemoryTier,
  normalizeTrialVpsPlanCategory,
} from '@/lib/trialVpsCatalog';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const MEMORY_GB_PRESETS = [2, 4, 6, 8, 12, 16, 32];

type ExpiredPlanCategory = 'linux' | 'windows' | 'premium_proxy';

const EXPIRED_IP_GROUPS: { key: ExpiredPlanCategory; label: string }[] = [
  { key: 'linux', label: 'Linux' },
  { key: 'windows', label: 'Windows VPS' },
  { key: 'premium_proxy', label: 'Premium IP Proxy' },
];

function expiredListLine(row: { ipAddress: string; ipLine: string; planCategory?: string }): string {
  const cat = normalizeTrialVpsPlanCategory(row.planCategory);
  if (cat === 'premium_proxy') {
    return String(row.ipLine || row.ipAddress || '').trim();
  }
  return String(row.ipAddress || row.ipLine || '').split(':')[0].trim();
}

/** Radix Select portals outside Dialog — block mistaken "outside" dismiss so Type/RAM stick. */
function preventDialogDismissForSelectPortal(e: Event) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (
    target.closest('[data-radix-select-content]') ||
    target.closest('[data-radix-select-viewport]') ||
    target.closest('[data-radix-popper-content-wrapper]') ||
    target.closest('[role="listbox"]')
  ) {
    e.preventDefault();
  }
}

interface TrialSlot {
  _id: string;
  ipAddress: string;
  port?: string;
  username: string;
  password: string;
  os: string;
  allocated: boolean;
  orderId?: string | null;
  allocatedAt?: string | null;
  soldAt?: string | null;
}

interface ExpiredTrialRow {
  ipAddress: string;
  ipLine: string;
  planCategory?: string;
}

interface IpStockManageOption {
  _id: string;
  name: string;
  tags?: string[];
  provider?: string;
  defaultConfigurations?: Record<string, unknown>;
}

interface CompanyAdminOption {
  _id: string;
  name: string;
  virtualizors?: unknown[];
  virtualizor?: { host?: string; apiKey?: string };
  resellerApi?: { enabled?: boolean };
  netbayApi?: { enabled?: boolean };
  kurohostApi?: { enabled?: boolean };
  joyApi?: { enabled?: boolean };
  hostdzireApi?: { enabled?: boolean };
}

interface TrialPackage {
  _id: string;
  name: string;
  description: string;
  trialDays: number;
  memoryGb?: number;
  planCategory?: string;
  price: number;
  available: boolean;
  manageCompanyId?: string | null;
  manageIpStockId?: string | null;
  slots: TrialSlot[];
  totalCount: number;
  availableCount: number;
  allocatedCount: number;
}

function companyHasPanelApi(c: CompanyAdminOption): boolean {
  if (Array.isArray(c.virtualizors) && c.virtualizors.length > 0) return true;
  if (c.virtualizor?.host || c.virtualizor?.apiKey) return true;
  if (c.resellerApi?.enabled) return true;
  if (c.netbayApi?.enabled) return true;
  if (c.kurohostApi?.enabled) return true;
  if (c.joyApi?.enabled) return true;
  if (c.hostdzireApi?.enabled) return true;
  return false;
}

function companyLabelById(id: string | null | undefined, companies: CompanyAdminOption[]): string | null {
  if (!id) return null;
  return companies.find((c) => c._id === id)?.name ?? null;
}

function stockTagsLower(stock: IpStockManageOption): string[] {
  return (stock.tags || []).map((t) => String(t).toLowerCase());
}

function isTrialManageAdvpsStock(stock: IpStockManageOption): boolean {
  const tags = stockTagsLower(stock);
  if (tags.includes('advps') || tags.includes('flex')) return true;
  if (String(stock.provider || '').toLowerCase() === 'advps') return true;
  if (String(stock.name || '').startsWith('⚡')) return true;
  if (stock.defaultConfigurations?.advps) return true;
  return false;
}

function isTrialManageSmartVpsStock(stock: IpStockManageOption): boolean {
  if (isTrialManageAdvpsStock(stock)) return false;
  const tags = stockTagsLower(stock);
  if (tags.includes('smartvps') || tags.includes('ocean linux')) return true;
  if (String(stock.provider || '').toLowerCase() === 'smartvps') return true;
  if (String(stock.name || '').startsWith('🌊')) return true;
  if (stock.defaultConfigurations?.smartvps) return true;
  return false;
}

function parseManageApiSource(value: string): { manageCompanyId: string | null; manageIpStockId: string | null } {
  if (!value) return { manageCompanyId: null, manageIpStockId: null };
  if (value.startsWith('company:')) return { manageCompanyId: value.slice(8), manageIpStockId: null };
  if (value.startsWith('stock:')) return { manageCompanyId: null, manageIpStockId: value.slice(6) };
  return { manageCompanyId: null, manageIpStockId: null };
}

function packManageApiSource(pkg: Pick<TrialPackage, 'manageCompanyId' | 'manageIpStockId'>): string {
  if (pkg.manageCompanyId) return `company:${String(pkg.manageCompanyId)}`;
  if (pkg.manageIpStockId) return `stock:${String(pkg.manageIpStockId)}`;
  return '';
}

function ipStockLabelById(id: string | null | undefined, stocks: IpStockManageOption[]): string | null {
  if (!id) return null;
  return stocks.find((s) => s._id === id)?.name ?? null;
}

function packageStock(pkg: Pick<TrialPackage, 'totalCount' | 'availableCount' | 'allocatedCount' | 'slots'>) {
  const total = pkg.totalCount ?? pkg.slots?.length ?? 0;
  const sold = pkg.allocatedCount ?? pkg.slots?.filter((s) => s.allocated).length ?? 0;
  const left = pkg.availableCount ?? Math.max(0, total - sold);
  return { total, sold, left };
}

function memorySelectOptions(current: string) {
  const base = MEMORY_GB_PRESETS.map(String);
  if (current && !base.includes(current)) base.unshift(current);
  return base;
}

function StockBar({ sold, left, total }: { sold: number; left: number; total: number }) {
  const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
  return (
    <div className="space-y-1.5 min-w-[160px] sm:min-w-[200px] flex-1">
      <p className="text-[11px] text-muted-foreground tabular-nums">
        Added <strong className="text-foreground">{total}</strong>
        {' · '}
        Sold <strong className="text-emerald-600 dark:text-emerald-400">{sold}</strong>
        {' · '}
        Free <strong className="text-violet-600 dark:text-violet-400">{left}</strong>
      </p>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

/** Full bulk line as stored (proxy: ip:port:user:pass · VPS: ip:user:pass). */
function slotInventoryLine(slot: TrialSlot, planCategory?: string): string {
  const ip = String(slot.ipAddress || '').trim().split(':')[0].trim();
  const cat = normalizeTrialVpsPlanCategory(planCategory);
  if (cat === 'premium_proxy') {
    const port = String(slot.port || '').trim() || '8000';
    const user = String(slot.username || '').trim();
    const pass = String(slot.password || '').trim();
    return `${ip}:${port}:${user}:${pass}`;
  }
  const user = String(slot.username || 'root').trim();
  const pass = String(slot.password || '').trim();
  return `${ip}:${user}:${pass}`;
}

type InventoryFilter = 'all' | 'sold' | 'free';

function PackageInventoryPanel({
  slots,
  planCategory,
  compact,
  packageId,
  onSlotsChange,
  onConfirmRemove,
}: {
  slots: TrialSlot[];
  planCategory?: string;
  compact?: boolean;
  packageId?: string;
  onSlotsChange?: (slots: TrialSlot[]) => void;
  onConfirmRemove?: (line: string) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const cat = normalizeTrialVpsPlanCategory(planCategory);
  const lineLabel = cat === 'premium_proxy' ? 'Proxy' : 'VPS';

  const sold = slots.filter((s) => s.allocated);
  const free = slots.filter((s) => !s.allocated);
  const total = slots.length;

  const filtered = useMemo(() => {
    const sorted = [...slots];
    if (filter === 'sold') return sorted.filter((s) => s.allocated);
    if (filter === 'free') return sorted.filter((s) => !s.allocated);
    return sorted;
  }, [slots, filter]);

  const copyText = async (text: string, message: string) => {
    if (!text.trim()) {
      toast.message('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error('Copy failed');
    }
  };

  const copyAllFiltered = () => {
    const lines = filtered.map((s) => slotInventoryLine(s, planCategory));
    void copyText(lines.join('\n'), `Copied ${lines.length} line(s)`);
  };

  const removeFreeSlot = async (slot: TrialSlot) => {
    if (!packageId || slot.allocated) return;
    const line = slotInventoryLine(slot, planCategory);
    if (onConfirmRemove) {
      const ok = await onConfirmRemove(line);
      if (!ok) return;
    }
    setRemovingId(slot._id);
    try {
      const res = await fetch(`/api/trial-vps/${packageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ removeSlotIds: [slot._id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');
      const nextSlots = Array.isArray(data.package?.slots) ? data.package.slots : [];
      onSlotsChange?.(nextSlots);
      toast.success('Free line removed');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setRemovingId(null);
    }
  };

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No rows yet — paste bulk lines when creating or editing.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="tabular-nums">
            Added {total}
          </Badge>
          <Badge variant="secondary" className="tabular-nums bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30">
            Sold {sold.length}
          </Badge>
          <Badge variant="outline" className="tabular-nums border-violet-500/40 text-violet-700 dark:text-violet-300">
            Free {free.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'sold', 'free'] as const).map((key) => (
            <Button
              key={key}
              type="button"
              variant={filter === key ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs capitalize"
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? 'All' : key === 'sold' ? 'Sold' : 'Free'}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1 ml-1" onClick={copyAllFiltered}>
            <Copy className="h-3 w-3" />
            Copy list
          </Button>
        </div>
      </div>

      <div className={cn('rounded-md border', compact ? 'max-h-[min(280px,50vh)]' : 'max-h-[min(420px,65vh)]', 'overflow-auto')}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-xs">#</TableHead>
              <TableHead className="text-xs">{lineLabel}</TableHead>
              <TableHead className="w-20 text-xs">Status</TableHead>
              <TableHead className="w-16 text-xs text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((slot, idx) => {
              const line = slotInventoryLine(slot, planCategory);
              return (
                <TableRow key={slot._id}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums py-2">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-[11px] sm:text-xs py-2 break-all">{line}</TableCell>
                  <TableCell className="py-2">
                    <Badge
                      variant={slot.allocated ? 'secondary' : 'outline'}
                      className={cn(
                        'text-[10px] h-5',
                        slot.allocated
                          ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                          : 'border-violet-500/40 text-violet-700 dark:text-violet-300'
                      )}
                    >
                      {slot.allocated ? 'Sold' : 'Free'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Copy line"
                        onClick={() => void copyText(line, 'Line copied')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {!slot.allocated && packageId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete free line"
                          disabled={removingId === slot._id}
                          onClick={() => void removeFreeSlot(slot)}
                        >
                          {removingId === slot._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type PackageFormProps = {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  planCategory: string;
  setPlanCategory: (v: string) => void;
  memoryGb: string;
  setMemoryGb: (v: string) => void;
  trialDays: string;
  setTrialDays: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  available: boolean;
  setAvailable: (v: boolean) => void;
  bulkLines?: string;
  setBulkLines?: (v: string) => void;
  bulkLabel?: string;
  showBulk?: boolean;
  /** Unique prefix for inputs (create vs edit dialogs both mount in DOM). */
  formId?: string;
  manageApiSource?: string;
  setManageApiSource?: (v: string) => void;
  companyOptions?: CompanyAdminOption[];
  smartvpsStockOptions?: IpStockManageOption[];
  advpsStockOptions?: IpStockManageOption[];
};

function PackageFormFields(props: PackageFormProps) {
  const {
    name,
    setName,
    description,
    setDescription,
    planCategory,
    setPlanCategory,
    memoryGb,
    setMemoryGb,
    trialDays,
    setTrialDays,
    price,
    setPrice,
    available,
    setAvailable,
    bulkLines,
    setBulkLines,
    bulkLabel = 'VPS list (one per line)',
    showBulk = false,
    formId = 'trial-vps-form',
    manageApiSource = '',
    setManageApiSource,
    companyOptions = [],
    smartvpsStockOptions = [],
    advpsStockOptions = [],
  } = props;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Package</p>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input
            id={`${formId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Windows 8GB Trial"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-desc`}>Description (optional)</Label>
          <Input
            id={`${formId}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short note for admin"
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Store display</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2 min-w-0">
            <Label htmlFor={`${formId}-type`}>Type</Label>
            <select
              id={`${formId}-type`}
              value={planCategory}
              onChange={(e) => setPlanCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {TRIAL_VPS_PLAN_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {trialVpsPlanUsesMemoryTier(planCategory) ? (
            <div className="space-y-2">
              <Label htmlFor={`${formId}-ram`}>RAM</Label>
              <Select value={memoryGb} onValueChange={setMemoryGb} modal={false}>
                <SelectTrigger id={`${formId}-ram`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]" position="popper">
                  {memorySelectOptions(memoryGb).map((gb) => (
                    <SelectItem key={gb} value={gb}>
                      {gb} GB
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground sm:col-span-2 rounded-md border border-dashed px-3 py-2">
              Premium IP Proxy trials have no RAM tier — only VPS/RDP packages use RAM.
            </p>
          )}
          <div className="space-y-2">
            <Label>Trial days</Label>
            <Input type="number" min={1} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Price (₹)</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Visible on store</p>
            <p className="text-xs text-muted-foreground">Off = hidden from customers</p>
          </div>
          <Switch checked={available} onCheckedChange={setAvailable} />
        </div>
      </section>

      {showBulk && setBulkLines && bulkLines !== undefined && (
        <>
          <Separator />
          <section className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trial VPS inventory</p>
            {planCategory !== 'premium_proxy' && setManageApiSource ? (
              <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3">
                <Label htmlFor={`${formId}-manage-api`}>Manage system — API source</Label>
                <select
                  id={`${formId}-manage-api`}
                  value={manageApiSource}
                  onChange={(e) => setManageApiSource(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">None — sirf login (no start/stop in panel)</option>
                  {companyOptions.length > 0 ? (
                    <optgroup label="Company (SiteWorx, Prime, Virtualizor…)">
                  {companyOptions.map((c) => (
                    <option key={c._id} value={`company:${String(c._id)}`}>
                      {c.name}
                    </option>
                  ))}
                    </optgroup>
                  ) : null}
                  {smartvpsStockOptions.length > 0 ? (
                    <optgroup label="SmartVPS API (Manage IP Stock plan)">
                      {smartvpsStockOptions.map((s) => (
                        <option key={s._id} value={`stock:${s._id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {advpsStockOptions.length > 0 ? (
                    <optgroup label="ADVPS API (Manage IP Stock plan)">
                      {advpsStockOptions.map((s) => (
                        <option key={s._id} value={`stock:${s._id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong>Company</strong> ={' '}
                  <a href="/admin/companies" className="text-primary underline-offset-2 hover:underline">
                    Admin → Companies
                  </a>{' '}
                  wala API. <strong>SmartVPS / ADVPS</strong> = wahi plan jo{' '}
                  <strong>Manage IP Stock</strong> me tags/config se linked hai — global API pehle se panel me laga hua
                  hai. Trial VPS ki IP us provider par honi chahiye.
                </p>
                {companyOptions.length === 0 &&
                smartvpsStockOptions.length === 0 &&
                advpsStockOptions.length === 0 ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Koi API source nahi mila — Companies par API configure karo ya IP Stock me SmartVPS/ADVPS plan banao.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Label>{bulkLabel}</Label>
            <Textarea
              className="font-mono text-xs min-h-[140px] resize-y"
              placeholder={
                planCategory === 'premium_proxy'
                  ? '203.0.113.10:8000:proxyuser:secretpass'
                  : '162.4.12.207:Administrator:YourPass\n103.1.2.3,root,pass123'
              }
              value={bulkLines}
              onChange={(e) => setBulkLines(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {planCategory === 'premium_proxy' ? (
                <>
                  Proxy: <code className="text-[10px]">ip:8000:username:password</code> or{' '}
                  <code className="text-[10px]">ip,8000,user,pass</code>
                </>
              ) : (
                <>
                  VPS/RDP: <code className="text-[10px]">ip:username:password</code> (e.g. Administrator)
                </>
              )}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default function AdminTrialVpsPage() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [packages, setPackages] = useState<TrialPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [trialDays, setTrialDays] = useState('2');
  const [bulkVps, setBulkVps] = useState('');
  const [available, setAvailable] = useState(true);
  const [planCategory, setPlanCategory] = useState('linux');
  const [memoryGb, setMemoryGb] = useState('4');
  const [manageApiSource, setManageApiSource] = useState('');
  const [companyOptions, setCompanyOptions] = useState<CompanyAdminOption[]>([]);
  const [allCompanies, setAllCompanies] = useState<CompanyAdminOption[]>([]);
  const [allIpStocks, setAllIpStocks] = useState<IpStockManageOption[]>([]);

  const [showEdit, setShowEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('0');
  const [editTrialDays, setEditTrialDays] = useState('2');
  const [editPlanCategory, setEditPlanCategory] = useState('linux');
  const [editMemoryGb, setEditMemoryGb] = useState('4');
  const [editAvailable, setEditAvailable] = useState(true);
  const [editAddVps, setEditAddVps] = useState('');
  const [editManageApiSource, setEditManageApiSource] = useState('');
  const [editSlots, setEditSlots] = useState<TrialSlot[]>([]);
  const [inventoryPackage, setInventoryPackage] = useState<TrialPackage | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const [expiredItems, setExpiredItems] = useState<ExpiredTrialRow[]>([]);
  const [expiredLoading, setExpiredLoading] = useState(true);

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trial-vps', { credentials: 'include' });
      const data = await res.json();
      setPackages(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load trial packages');
    } finally {
      setLoading(false);
    }
  };

  const fetchExpired = async () => {
    setExpiredLoading(true);
    try {
      const res = await fetch('/api/trial-vps/expired', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load expired trials');
      setExpiredItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load expired trials');
      setExpiredItems([]);
    } finally {
      setExpiredLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchPackages(), fetchExpired()]);
  };

  const applyPackageSlotsFromApi = (pkgId: string, slots: TrialSlot[]) => {
    setPackages((prev) =>
      prev.map((p) =>
        p._id === pkgId
          ? {
              ...p,
              slots,
              totalCount: slots.length,
              availableCount: slots.filter((s) => !s.allocated).length,
              allocatedCount: slots.filter((s) => s.allocated).length,
            }
          : p
      )
    );
    setInventoryPackage((prev) => (prev && prev._id === pkgId ? { ...prev, slots } : prev));
    if (editingId === pkgId) setEditSlots(slots);
  };

  const confirmRemoveFreeLine = async (line: string) =>
    confirm({
      title: 'Remove free line?',
      description: (
        <span className="font-mono text-xs break-all block mt-1">{line}</span>
      ),
      confirmLabel: 'Delete',
      destructive: true,
    });

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/companies', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/ipstock?includeHidden=1', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([companiesRaw, stocksRaw]) => {
        const companies = Array.isArray(companiesRaw) ? companiesRaw : [];
        const stocks = Array.isArray(stocksRaw) ? stocksRaw : [];
        setAllCompanies(companies);
        setCompanyOptions(companies.filter((c: CompanyAdminOption) => companyHasPanelApi(c)));
        setAllIpStocks(stocks);
      })
      .catch(() => {
        setAllCompanies([]);
        setCompanyOptions([]);
        setAllIpStocks([]);
      });
  }, []);

  const smartvpsStockOptions = useMemo(
    () => allIpStocks.filter(isTrialManageSmartVpsStock),
    [allIpStocks]
  );
  const advpsStockOptions = useMemo(() => allIpStocks.filter(isTrialManageAdvpsStock), [allIpStocks]);

  const totals = useMemo(() => {
    let total = 0;
    let sold = 0;
    for (const p of packages) {
      const s = packageStock(p);
      total += s.total;
      sold += s.sold;
    }
    return { packages: packages.length, total, sold, left: Math.max(0, total - sold) };
  }, [packages]);

  const expiredListsByType = useMemo(() => {
    const buckets: Record<ExpiredPlanCategory, string[]> = {
      linux: [],
      windows: [],
      premium_proxy: [],
    };
    const seen = new Set<string>();

    for (const row of expiredItems) {
      const cat = normalizeTrialVpsPlanCategory(row.planCategory) as ExpiredPlanCategory;
      const line = expiredListLine(row);
      if (!line) continue;
      const dedupeKey = `${cat}|${line}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (buckets[cat]) buckets[cat].push(line);
    }

    return {
      linux: buckets.linux.join('\n'),
      windows: buckets.windows.join('\n'),
      premium_proxy: buckets.premium_proxy.join('\n'),
    };
  }, [expiredItems]);

  const expiredTotalCount = useMemo(
    () =>
      EXPIRED_IP_GROUPS.reduce(
        (n, g) => n + (expiredListsByType[g.key] ? expiredListsByType[g.key].split('\n').filter(Boolean).length : 0),
        0
      ),
    [expiredListsByType]
  );

  const copyExpiredList = async (text: string, label: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} list copied`);
    } catch {
      toast.error('Copy failed — select text manually');
    }
  };

  const resetCreateForm = () => {
    setName('');
    setDescription('');
    setPrice('0');
    setTrialDays('2');
    setBulkVps('');
    setAvailable(true);
    setPlanCategory('linux');
    setMemoryGb('4');
    setManageApiSource('');
  };

  const openCreateDialog = () => {
    resetCreateForm();
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !bulkVps.trim()) {
      toast.error('Name and at least one VPS line required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/trial-vps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description,
          price: parseFloat(price) || 0,
          trialDays: parseInt(trialDays, 10) || 2,
          memoryGb: trialVpsPlanUsesMemoryTier(planCategory) ? parseInt(memoryGb, 10) || 4 : 0,
          planCategory: planCategory || 'linux',
          available,
          bulkVps,
          ...parseManageApiSource(manageApiSource),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      const savedType = trialVpsPlanCategoryLabel(data.package?.planCategory ?? planCategory);
      toast.success(`Created · ${data.parsed} VPS · ${savedType}`);
      setShowCreate(false);
      resetCreateForm();
      refreshAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openInventory = async (pkg: TrialPackage) => {
    setInventoryPackage(pkg);
    if (Array.isArray(pkg.slots) && pkg.slots.length > 0) return;
    setInventoryLoading(true);
    try {
      const res = await fetch(`/api/trial-vps/${pkg._id}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load inventory');
      setInventoryPackage({ ...pkg, ...data, slots: data.slots || [] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load inventory');
      setInventoryPackage(null);
    } finally {
      setInventoryLoading(false);
    }
  };

  const openEdit = async (pkg: TrialPackage) => {
    setEditingId(pkg._id);
    setEditName(pkg.name);
    setEditDescription(pkg.description || '');
    setEditPrice(String(pkg.price));
    setEditTrialDays(String(pkg.trialDays ?? 2));
    setEditPlanCategory(pkg.planCategory || 'linux');
    setEditMemoryGb(String(pkg.memoryGb ?? 4));
    setEditAvailable(pkg.available !== false);
    setEditAddVps('');
    setEditManageApiSource(packManageApiSource(pkg));
    let slots = Array.isArray(pkg.slots) ? pkg.slots : [];
    if (!slots.length) {
      try {
        const res = await fetch(`/api/trial-vps/${pkg._id}`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok && Array.isArray(data.slots)) slots = data.slots;
      } catch {
        /* keep empty */
      }
    }
    setEditSlots(slots);
    setShowEdit(true);
  };

  const editStock = useMemo(
    () =>
      packageStock({
        totalCount: editSlots.length,
        availableCount: editSlots.filter((s) => !s.allocated).length,
        allocatedCount: editSlots.filter((s) => s.allocated).length,
        slots: editSlots,
      }),
    [editSlots]
  );

  const handleEdit = async () => {
    if (!editingId || !editName.trim()) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        description: editDescription,
        price: parseFloat(editPrice) || 0,
        trialDays: parseInt(editTrialDays, 10) || 2,
        memoryGb: trialVpsPlanUsesMemoryTier(editPlanCategory)
          ? parseInt(editMemoryGb, 10) || 4
          : 0,
        planCategory: editPlanCategory,
        available: editAvailable,
        ...parseManageApiSource(editManageApiSource),
      };
      if (editAddVps.trim()) body.addVps = editAddVps;

      const res = await fetch(`/api/trial-vps/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      toast.success(data.added ? `Saved · +${data.added} VPS` : 'Saved');
      setShowEdit(false);
      setEditingId(null);
      refreshAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pkg: TrialPackage) => {
    const ok = await confirm({
      title: 'Delete this package?',
      description: `"${pkg.name}" and all unused slots will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/trial-vps/${pkg._id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Delete failed');
      return;
    }
    toast.success('Deleted');
    refreshAll();
  };

  const expiredPanel = (
    <Card className="shadow-sm border-amber-500/30 lg:sticky lg:top-4">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">Expired trial IPs</h2>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Type ke hisaab se alag list — Linux / Windows VPS / Proxy. Copy karke bulk me dubara add karo.
            </p>
          </div>
        </div>
        {expiredLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : expiredTotalCount === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 rounded-md border border-dashed">
            Abhi koi expired IP nahi.
          </p>
        ) : (
          <div className="space-y-4 max-h-[min(75vh,560px)] overflow-y-auto pr-0.5">
            {EXPIRED_IP_GROUPS.map((group) => {
              const text = expiredListsByType[group.key];
              const count = text ? text.split('\n').filter(Boolean).length : 0;
              if (!count) return null;
              return (
                <div key={group.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">
                      {group.label}
                      <span className="font-normal text-muted-foreground ml-1.5 tabular-nums">({count})</span>
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] gap-1 shrink-0"
                      onClick={() => copyExpiredList(text, group.label)}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={text}
                    className="font-mono text-[11px] min-h-[72px] max-h-36 resize-y leading-relaxed"
                    onFocus={(e) => e.target.select()}
                  />
                  {group.key === 'premium_proxy' ? (
                    <p className="text-[10px] text-muted-foreground">Format: ip:port (proxy bulk upload jaisa)</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto w-full min-w-0 overflow-x-hidden">
      <ConfirmDialog />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_min(340px,100%)] lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
        <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Trial VPS</h1>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-md">
              Upload VPS, set trial days. No renew, no panel controls for customer.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refreshAll()}
            disabled={loading || expiredLoading}
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', (loading || expiredLoading) && 'animate-spin')} />
          </Button>
          <Button onClick={openCreateDialog} className="gap-2 flex-1 sm:flex-none">
            <Plus className="h-4 w-4" />
            <span className="truncate">New package</span>
          </Button>
        </div>
      </div>

      <div className="lg:hidden">{expiredPanel}</div>

      {/* Summary */}
      {!loading && packages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Packages', value: totals.packages },
            { label: 'Total VPS', value: totals.total },
            { label: 'Sold', value: totals.sold, accent: 'text-emerald-600' },
            { label: 'Remaining', value: totals.left, accent: 'text-violet-600' },
            {
              label: 'Expired IPs',
              value: expiredLoading ? '…' : expiredTotalCount,
              accent: expiredTotalCount ? 'text-amber-600' : undefined,
            },
          ].map((stat) => (
            <Card key={stat.label} className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={cn('text-2xl font-semibold tabular-nums mt-0.5', stat.accent)}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : packages.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-14 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-medium">No trial packages yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create one and paste VPS credentials in bulk.</p>
            <Button onClick={openCreateDialog} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Create first package
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {packages.map((pkg) => {
            const stock = packageStock(pkg);
            return (
              <li key={pkg._id}>
                <Card className="shadow-sm overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-semibold truncate">{pkg.name}</h2>
                          {!pkg.available && (
                            <Badge variant="secondary" className="text-[10px] h-5">
                              Hidden
                            </Badge>
                          )}
                          {(pkg.manageCompanyId || pkg.manageIpStockId) && pkg.planCategory !== 'premium_proxy' && (
                            <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                              Manage:{' '}
                              {pkg.manageCompanyId
                                ? companyLabelById(String(pkg.manageCompanyId), allCompanies) || 'Company'
                                : isTrialManageAdvpsStock(
                                      allIpStocks.find((s) => s._id === String(pkg.manageIpStockId)) || {
                                        _id: '',
                                        name: '',
                                      }
                                    )
                                  ? `ADVPS · ${ipStockLabelById(String(pkg.manageIpStockId), allIpStocks) || 'plan'}`
                                  : `SmartVPS · ${ipStockLabelById(String(pkg.manageIpStockId), allIpStocks) || 'plan'}`}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {trialVpsPlanCategoryLabel(pkg.planCategory)}
                          {trialVpsPlanUsesMemoryTier(pkg.planCategory)
                            ? ` · ${formatTrialVpsMemoryGb(pkg.memoryGb ?? 4, pkg.planCategory)}`
                            : ''}{' '}
                          ·{' '}
                          {pkg.trialDays}d trial · ₹{pkg.price}
                        </p>
                        {pkg.description ? (
                          <p className="text-xs text-muted-foreground/80 truncate">{pkg.description}</p>
                        ) : null}
                      </div>
                      <StockBar sold={stock.sold} left={stock.left} total={stock.total} />
                      <div className="flex sm:flex-col gap-1 shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 sm:flex-none gap-1.5"
                          onClick={() => void openInventory(pkg)}
                        >
                          <Package className="h-3.5 w-3.5" />
                          List ({stock.total})
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 sm:flex-none gap-1.5" onClick={() => void openEdit(pkg)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 sm:flex-none text-destructive hover:text-destructive gap-1.5"
                          onClick={() => handleDelete(pkg)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
        </div>

        <aside className="hidden lg:block min-w-0">{expiredPanel}</aside>
      </div>

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        {showCreate ? (
        <DialogContent
          className="max-w-md max-h-[90vh] overflow-y-auto sm:max-w-lg"
          onPointerDownOutside={preventDialogDismissForSelectPortal}
          onInteractOutside={preventDialogDismissForSelectPortal}
        >
          <DialogHeader>
            <DialogTitle>New trial package</DialogTitle>
            <DialogDescription>Customers get credentials for the trial period only.</DialogDescription>
          </DialogHeader>
          <PackageFormFields
            formId="trial-vps-create"
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            planCategory={planCategory}
            setPlanCategory={setPlanCategory}
            memoryGb={memoryGb}
            setMemoryGb={setMemoryGb}
            trialDays={trialDays}
            setTrialDays={setTrialDays}
            price={price}
            setPrice={setPrice}
            available={available}
            setAvailable={setAvailable}
            manageApiSource={manageApiSource}
            setManageApiSource={setManageApiSource}
            companyOptions={companyOptions}
            smartvpsStockOptions={smartvpsStockOptions}
            advpsStockOptions={advpsStockOptions}
            bulkLines={bulkVps}
            setBulkLines={setBulkVps}
            showBulk
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create package'}
            </Button>
          </DialogFooter>
        </DialogContent>
        ) : null}
      </Dialog>

      {/* Inventory only */}
      <Dialog
        open={!!inventoryPackage}
        onOpenChange={(open) => {
          if (!open) setInventoryPackage(null);
        }}
      >
        {inventoryPackage ? (
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{inventoryPackage.name}</DialogTitle>
              <DialogDescription>
                {trialVpsPlanCategoryLabel(inventoryPackage.planCategory)} — each row shows the full bulk line; Sold = customer already got it.
              </DialogDescription>
            </DialogHeader>
            {inventoryLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PackageInventoryPanel
                slots={inventoryPackage.slots || []}
                planCategory={inventoryPackage.planCategory}
                packageId={inventoryPackage._id}
                onConfirmRemove={confirmRemoveFreeLine}
                onSlotsChange={(slots) => applyPackageSlotsFromApi(inventoryPackage._id, slots)}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setInventoryPackage(null)}>
                Close
              </Button>
              <Button variant="secondary" onClick={() => void openEdit(inventoryPackage)}>
                Edit package
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* Edit */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        {showEdit ? (
        <DialogContent
          className="max-w-md max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          onPointerDownOutside={preventDialogDismissForSelectPortal}
          onInteractOutside={preventDialogDismissForSelectPortal}
        >
          <DialogHeader>
            <DialogTitle>Edit package</DialogTitle>
            <DialogDescription>
              Added {editStock.total} · Sold {editStock.sold} · Free {editStock.left}
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">VPS inventory</p>
            <PackageInventoryPanel
              slots={editSlots}
              planCategory={editPlanCategory}
              compact
              packageId={editingId || undefined}
              onConfirmRemove={confirmRemoveFreeLine}
              onSlotsChange={(slots) => {
                if (editingId) applyPackageSlotsFromApi(editingId, slots);
              }}
            />
          </section>

          <PackageFormFields
            formId="trial-vps-edit"
            name={editName}
            setName={setEditName}
            description={editDescription}
            setDescription={setEditDescription}
            planCategory={editPlanCategory}
            setPlanCategory={setEditPlanCategory}
            memoryGb={editMemoryGb}
            setMemoryGb={setEditMemoryGb}
            trialDays={editTrialDays}
            setTrialDays={setEditTrialDays}
            price={editPrice}
            setPrice={setEditPrice}
            available={editAvailable}
            setAvailable={setEditAvailable}
            manageApiSource={editManageApiSource}
            setManageApiSource={setEditManageApiSource}
            companyOptions={companyOptions}
            smartvpsStockOptions={smartvpsStockOptions}
            advpsStockOptions={advpsStockOptions}
            bulkLines={editAddVps}
            setBulkLines={setEditAddVps}
            bulkLabel="Add more VPS (optional)"
            showBulk
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
        ) : null}
      </Dialog>

    </div>
  );
}
