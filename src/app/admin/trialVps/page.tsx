'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Loader2,
  Trash2,
  RefreshCw,
  Package,
  AlertTriangle,
  Copy,
  ChevronDown,
  Eye,
  EyeOff,
  Edit,
  CheckCircle,
  Server,
  Info,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
  createdAt?: string;
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddVpsDialog, setShowAddVpsDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<TrialPackage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addVpsBulk, setAddVpsBulk] = useState('');

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('0');
  const [editTrialDays, setEditTrialDays] = useState('2');
  const [editPlanCategory, setEditPlanCategory] = useState('linux');
  const [editMemoryGb, setEditMemoryGb] = useState('4');
  const [editAvailable, setEditAvailable] = useState(true);
  const [editManageApiSource, setEditManageApiSource] = useState('');

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
    setShowCreateDialog(true);
  };

  const openAddVps = (pkg: TrialPackage) => {
    setSelectedPackage(pkg);
    setAddVpsBulk('');
    setShowAddVpsDialog(true);
  };

  const handleAddVps = async () => {
    if (!selectedPackage || !addVpsBulk.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/trial-vps/${selectedPackage._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ addVps: addVpsBulk }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add lines');
      toast.success(`Added ${data.added ?? 0} line(s) to ${selectedPackage.name}`);
      setShowAddVpsDialog(false);
      setAddVpsBulk('');
      fetchPackages();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add lines');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSlot = async (pkg: TrialPackage, slot: TrialSlot) => {
    if (slot.allocated) return;
    const line = slotInventoryLine(slot, pkg.planCategory);
    const ok = await confirm({
      title: 'Delete line',
      description: (
        <>
          Remove this free line from <strong>{pkg.name}</strong>?
          <br />
          <span className="font-mono text-xs break-all">{line}</span>
        </>
      ),
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/trial-vps/${pkg._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ removeSlotIds: [slot._id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success('Line removed');
      fetchPackages();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
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
      setShowCreateDialog(false);
      resetCreateForm();
      refreshAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (pkg: TrialPackage) => {
    setSelectedPackage(pkg);
    setEditingId(pkg._id);
    setEditName(pkg.name);
    setEditDescription(pkg.description || '');
    setEditPrice(String(pkg.price));
    setEditTrialDays(String(pkg.trialDays ?? 2));
    setEditPlanCategory(pkg.planCategory || 'linux');
    setEditMemoryGb(String(pkg.memoryGb ?? 4));
    setEditAvailable(pkg.available !== false);
    setEditManageApiSource(packManageApiSource(pkg));
    setShowEditDialog(true);
  };

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
      const res = await fetch(`/api/trial-vps/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      toast.success('Package updated');
      setShowEditDialog(false);
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

  const bulkLineCount = bulkVps.split('\n').filter((l) => l.trim()).length;
  const addVpsLineCount = addVpsBulk.split('\n').filter((l) => l.trim()).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <ConfirmDialog />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Trial VPS Packages</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Bulk upload trial VPS / proxy lines — same flow as Slot IP packages.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowExpiredDialog(true)} disabled={expiredLoading}>
            <Clock className="h-4 w-4 mr-2" />
            Expired IPs{expiredTotalCount > 0 ? ` (${expiredTotalCount})` : ''}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refreshAll()} disabled={loading || expiredLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', (loading || expiredLoading) && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Create Package
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{packages.length}</div>
            <p className="text-xs text-muted-foreground">Total Packages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{totals.left}</div>
            <p className="text-xs text-muted-foreground">Available Lines</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{totals.sold}</div>
            <p className="text-xs text-muted-foreground">Sold</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{totals.total}</div>
            <p className="text-xs text-muted-foreground">Total Lines</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : packages.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Trial VPS Packages</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first trial package to get started.</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Package
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <TrialPackageRow
              key={pkg._id}
              pkg={pkg}
              allCompanies={allCompanies}
              allIpStocks={allIpStocks}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddVps={openAddVps}
              onDeleteSlot={handleDeleteSlot}
            />
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={preventDialogDismissForSelectPortal}
          onInteractOutside={preventDialogDismissForSelectPortal}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Create Trial VPS Package
            </DialogTitle>
            <DialogDescription>Upload bulk lines and set trial days / price.</DialogDescription>
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
          {bulkLineCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 -mt-2">
              <Info className="h-3 w-3" />
              {bulkLineCount} {bulkLineCount === 1 ? 'line' : 'lines'} in bulk paste
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddVpsDialog} onOpenChange={setShowAddVpsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add lines — {selectedPackage?.name}</DialogTitle>
            <DialogDescription>Paste one VPS/proxy line per row (same format as create).</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Bulk lines</Label>
              <Badge variant="outline" className="text-xs">
                {addVpsLineCount} {addVpsLineCount === 1 ? 'line' : 'lines'}
              </Badge>
            </div>
            <Textarea
              value={addVpsBulk}
              onChange={(e) => setAddVpsBulk(e.target.value)}
              rows={10}
              className="font-mono text-sm"
              placeholder={
                normalizeTrialVpsPlanCategory(selectedPackage?.planCategory) === 'premium_proxy'
                  ? '203.0.113.10:8000:user:pass'
                  : '162.4.12.207:Administrator:YourPass'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddVpsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddVps} disabled={submitting || !addVpsBulk.trim()}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add lines
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={preventDialogDismissForSelectPortal}
          onInteractOutside={preventDialogDismissForSelectPortal}
        >
          <DialogHeader>
            <DialogTitle>Edit package</DialogTitle>
            <DialogDescription>Name, trial days, price, manage API — inventory via Add lines / Show on the row.</DialogDescription>
          </DialogHeader>
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
            showBulk={false}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpiredDialog} onOpenChange={setShowExpiredDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Expired trial IPs
            </DialogTitle>
            <DialogDescription>Copy by type and paste into Add lines on a package.</DialogDescription>
          </DialogHeader>
          {expiredLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : expiredTotalCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No expired trial IPs right now.</p>
          ) : (
            <div className="space-y-4">
              {EXPIRED_IP_GROUPS.map((group) => {
                const text = expiredListsByType[group.key];
                const count = text ? text.split('\n').filter(Boolean).length : 0;
                if (!count) return null;
                return (
                  <div key={group.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {group.label} <span className="text-muted-foreground font-normal">({count})</span>
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={() => copyExpiredList(text, group.label)}>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <Textarea readOnly value={text} className="font-mono text-xs min-h-[80px]" onFocus={(e) => e.target.select()} />
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrialPackageRow({
  pkg,
  allCompanies,
  allIpStocks,
  onEdit,
  onDelete,
  onAddVps,
  onDeleteSlot,
}: {
  pkg: TrialPackage;
  allCompanies: CompanyAdminOption[];
  allIpStocks: IpStockManageOption[];
  onEdit: (pkg: TrialPackage) => void;
  onDelete: (pkg: TrialPackage) => void;
  onAddVps: (pkg: TrialPackage) => void;
  onDeleteSlot: (pkg: TrialPackage, slot: TrialSlot) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const slots = pkg.slots || [];
  const lineLabel =
    normalizeTrialVpsPlanCategory(pkg.planCategory) === 'premium_proxy' ? 'Proxy' : 'VPS';

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
              <Badge variant="secondary" className="text-xs">
                Hidden
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {trialVpsPlanCategoryLabel(pkg.planCategory)}
              {trialVpsPlanUsesMemoryTier(pkg.planCategory)
                ? ` · ${formatTrialVpsMemoryGb(pkg.memoryGb ?? 4, pkg.planCategory)}`
                : ''}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pkg.trialDays} day trial · {pkg.description || 'No description'}
          </p>
        </div>

        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-right">
            <p className="font-bold text-lg">₹{pkg.price}</p>
            <p className="text-[10px] text-muted-foreground">per trial</p>
          </div>

          <div className="flex gap-4 text-center">
            <div>
              <p className="text-lg font-bold text-green-600">{pkg.availableCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Available</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-600">{pkg.allocatedCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Sold</p>
            </div>
            <div>
              <p className="text-lg font-bold">{pkg.totalCount ?? slots.length}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </div>

          <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/10 space-y-4">
          {(pkg.manageCompanyId || pkg.manageIpStockId) && pkg.planCategory !== 'premium_proxy' && (
            <p className="text-xs text-muted-foreground">
              Manage API:{' '}
              {pkg.manageCompanyId
                ? companyLabelById(String(pkg.manageCompanyId), allCompanies) || 'Company'
                : isTrialManageAdvpsStock(
                      allIpStocks.find((s) => s._id === String(pkg.manageIpStockId)) || { _id: '', name: '' }
                    )
                  ? `ADVPS · ${ipStockLabelById(String(pkg.manageIpStockId), allIpStocks) || 'plan'}`
                  : `SmartVPS · ${ipStockLabelById(String(pkg.manageIpStockId), allIpStocks) || 'plan'}`}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onAddVps(pkg); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add lines
            </Button>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(pkg); }}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setShowLines(!showLines); }}>
              {showLines ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              {showLines ? 'Hide' : 'Show'} {lineLabel}s
            </Button>
            <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(pkg); }}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>

          {showLines && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">No lines yet — use Add lines.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">#</th>
                      <th className="text-left p-2 font-medium">{lineLabel}</th>
                      <th className="text-left p-2 font-medium">Status</th>
                      <th className="text-right p-2 font-medium w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot, i) => (
                      <tr key={slot._id} className="border-t border-border">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-mono text-xs break-all">{slotInventoryLine(slot, pkg.planCategory)}</td>
                        <td className="p-2">
                          {slot.allocated ? (
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
                        <td className="p-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={slot.allocated}
                            title={slot.allocated ? 'Cannot delete sold line' : 'Delete line'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSlot(pkg, slot);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {pkg.createdAt && (
            <div className="text-xs text-muted-foreground">
              Created:{' '}
              {new Date(pkg.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
