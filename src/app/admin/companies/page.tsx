'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import {
  Building2, Plus, Trash2, Copy, ExternalLink, Loader2, Eye, EyeOff,
  Server, ShieldCheck, ShieldAlert, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Cloud, Zap, BookOpen, Package, Sparkles, Globe,
} from 'lucide-react';

interface CompanyVirtualizor {
  _id?: string;
  enabled: boolean;
  label: string;
  host: string;
  port: number;
  apiKey: string;
  apiPassword: string;
  protocol: 'http' | 'https';
}

interface CompanyResellerApi {
  enabled: boolean;
  label: string;
  baseUrl: string;
  resellerDomain: string;
  email: string;
  password: string;
  useLiveStockApi?: boolean;
  /** Hostheaven upstream coupon on API auto-buy (fallback for other RAM sizes). */
  couponCode?: string;
  couponByMemory?: Record<string, string>;
}

interface CompanyNetbayApi {
  enabled: boolean;
  label: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  useLiveStockApi?: boolean;
  /** Fallback coupon when no 4GB/8GB/16GB code is set. */
  couponCode?: string;
  couponByMemory?: Record<string, string>;
}

interface CompanyKurohostApi {
  enabled: boolean;
  label: string;
  baseUrl: string;
  apiKey: string;
  useLiveStockApi?: boolean;
}

interface CompanyJoyApi {
  enabled: boolean;
  label: string;
  baseUrl: string;
  apiToken: string;
  apiKey: string;
}

interface Company {
  _id: string;
  name: string;
  slug: string;
  password: string;
  isActive: boolean;
  createdAt: string;
  virtualizors?: Partial<CompanyVirtualizor>[];
  /** Deprecated single-config field; loaded as a fallback. */
  virtualizor?: Partial<CompanyVirtualizor>;
  resellerApi?: Partial<CompanyResellerApi> | null;
  netbayApi?: Partial<CompanyNetbayApi> | null;
  kurohostApi?: Partial<CompanyKurohostApi> | null;
  joyApi?: Partial<CompanyJoyApi> | null;
}

const NEW_VIRT_ENTRY = (): CompanyVirtualizor => ({
  enabled: true,
  label: '',
  host: '',
  port: 4083,
  apiKey: '',
  apiPassword: '',
  protocol: 'https',
});

const EMPTY_RESELLER_API = (): CompanyResellerApi => ({
  enabled: true,
  label: '',
  baseUrl: '',
  resellerDomain: '',
  email: '',
  password: '',
  useLiveStockApi: false,
  couponCode: '',
  couponByMemory: {},
});

// Defaults pre-filled into the dialog when a company has no saved reseller
// API config yet. Mirrors the server-side fallback in
// `lib/companyResellerApi.js` so admins see what the company will actually
// authenticate with — credentials can still be overridden per-company.
const RESELLER_API_DIALOG_DEFAULTS: CompanyResellerApi = {
  enabled: true,
  label: 'Hostheaven',
  baseUrl: 'https://vps.hostheaven.in',
  resellerDomain: 'vps.hostheaven.in',
  email: 'raftare3t5@gmail.com',
  password: 'Umesh@2113',
  couponCode: 'OCEAN199',
  couponByMemory: { '4GB': 'OCEAN199', '8GB': 'OCEAN199' },
};

const EMPTY_NETBAY_API = (): CompanyNetbayApi => ({
  enabled: false,
  label: '',
  baseUrl: '',
  apiKey: '',
  apiSecret: '',
  useLiveStockApi: false,
  couponCode: '',
  couponByMemory: {},
});

// Defaults pre-filled when a company has no Netbay config saved yet — only
// the documented base URL is filled; apiKey/apiSecret must come from the
// company's own Netbay dashboard.
const NETBAY_API_DIALOG_DEFAULTS: CompanyNetbayApi = {
  enabled: false,
  label: 'Netbay',
  baseUrl: 'https://api.netbayhosts.in',
  apiKey: '',
  apiSecret: '',
  useLiveStockApi: false,
  couponCode: '',
  couponByMemory: {},
};

const EMPTY_KUROHOST_API = (): CompanyKurohostApi => ({
  enabled: false,
  label: '',
  baseUrl: '',
  apiKey: '',
  useLiveStockApi: false,
});

const KUROHOST_API_DIALOG_DEFAULTS: CompanyKurohostApi = {
  enabled: false,
  label: 'KuroHost Cloud',
  baseUrl: 'https://kurohost.com/api/cloud/v1',
  apiKey: '',
  useLiveStockApi: false,
};

function companyHasKurohostEnabled(company: Pick<Company, 'kurohostApi'> | null | undefined) {
  return company?.kurohostApi?.enabled === true;
}

function companyHasNetbayEnabled(company: Pick<Company, 'netbayApi'> | null | undefined) {
  return company?.netbayApi?.enabled === true;
}

function companyHasResellerEnabled(company: Pick<Company, 'resellerApi'> | null | undefined) {
  const r = company?.resellerApi;
  return !!(r?.enabled && r?.baseUrl && r?.email && r?.password);
}

const EMPTY_JOY_API = (): CompanyJoyApi => ({
  enabled: false,
  label: '',
  baseUrl: '',
  apiToken: '',
  apiKey: '',
});

// Defaults pre-filled when a company has no Joy config yet — only the
// documented base URL is set; token/key come from the Joy dashboard.
const JOY_API_DIALOG_DEFAULTS: CompanyJoyApi = {
  enabled: false,
  label: 'Joy Services',
  baseUrl: 'https://api.joy.services',
  apiToken: '',
  apiKey: '',
};

interface VirtTestState {
  loading: boolean;
  result: { success: boolean; message: string } | null;
}

interface CompanyStock {
  _id: string;
  name: string;
  available: boolean;
  stockCount: number;
  usesStockCount?: boolean;
  netbayLiveStock?: boolean;
  resellerLiveStock?: boolean;
  serverType: string;
  tags: string[];
  memorySizes: string[];
}

export default function CompaniesPage() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  const [virtCompany, setVirtCompany] = useState<Company | null>(null);
  const [virtList, setVirtList] = useState<CompanyVirtualizor[]>([]);
  const [virtSaving, setVirtSaving] = useState(false);
  const [virtTestStates, setVirtTestStates] = useState<Record<number, VirtTestState>>({});
  const [showVirtPassword, setShowVirtPassword] = useState<Record<number, boolean>>({});
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  // Reseller API (Hostheaven / SomaniOne) dialog state
  const [resellerCompany, setResellerCompany] = useState<Company | null>(null);
  const [resellerForm, setResellerForm] = useState<CompanyResellerApi>(EMPTY_RESELLER_API());
  const [resellerSaving, setResellerSaving] = useState(false);
  const [resellerTesting, setResellerTesting] = useState(false);
  const [resellerTestResult, setResellerTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [resellerAuditing, setResellerAuditing] = useState(false);
  const [resellerAuditOpen, setResellerAuditOpen] = useState(false);
  const [resellerAuditData, setResellerAuditData] = useState<{
    hostheavenTotalVms: number;
    oceanlinuxOrdersWithIp: number;
    untrackedInOrdersCount: number;
    untrackedInOrders: Array<{
      ip: string;
      vmId: string;
      serverName: string;
      expiryDate: string | null;
      panelStatus: string;
      inCompanyInventory: boolean;
      inventoryStock: string | null;
    }>;
  } | null>(null);
  const [showResellerPassword, setShowResellerPassword] = useState(false);

  // Netbay API dialog state
  const [netbayCompany, setNetbayCompany] = useState<Company | null>(null);
  const [netbayForm, setNetbayForm] = useState<CompanyNetbayApi>(EMPTY_NETBAY_API());
  const [netbaySaving, setNetbaySaving] = useState(false);
  const [netbayTesting, setNetbayTesting] = useState(false);
  const [netbayTestResult, setNetbayTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showNetbaySecret, setShowNetbaySecret] = useState(false);

  // KuroHost API dialog state
  const [kurohostCompany, setKurohostCompany] = useState<Company | null>(null);
  const [kurohostForm, setKurohostForm] = useState<CompanyKurohostApi>(EMPTY_KUROHOST_API());
  const [kurohostSaving, setKurohostSaving] = useState(false);
  const [kurohostTesting, setKurohostTesting] = useState(false);
  const [kurohostTestResult, setKurohostTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showKurohostKey, setShowKurohostKey] = useState(false);

  // Joy Services API dialog state (manage-only)
  const [joyCompany, setJoyCompany] = useState<Company | null>(null);
  const [joyForm, setJoyForm] = useState<CompanyJoyApi>(EMPTY_JOY_API());
  const [joySaving, setJoySaving] = useState(false);
  const [joyTesting, setJoyTesting] = useState(false);
  const [joyTestResult, setJoyTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showJoyKey, setShowJoyKey] = useState(false);

  const [stocksCompany, setStocksCompany] = useState<Company | null>(null);
  const [companyStocks, setCompanyStocks] = useState<CompanyStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [savingBulkStock, setSavingBulkStock] = useState(false);
  const [bulkStockCount, setBulkStockCount] = useState('');
  const [stocksNetbayLiveApi, setStocksNetbayLiveApi] = useState(false);
  const [stocksResellerLiveApi, setStocksResellerLiveApi] = useState(false);

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/admin/companies');
      if (res.ok) {
        setCompanies(await res.json());
      }
    } catch {
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleCreate = async () => {
    if (!name.trim() || !password.trim()) {
      toast.error('Name and password are required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create');
        return;
      }
      toast.success('Company created');
      setName('');
      setPassword('');
      setShowCreate(false);
      fetchCompanies();
    } catch {
      toast.error('Failed to create company');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, companyName: string) => {
    const ok = await confirm({
      title: 'Delete Company',
      description: <>Delete <strong>{companyName}</strong>? This cannot be undone.</>,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/companies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Company deleted');
        fetchCompanies();
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) {
        toast.success(currentActive ? 'Company disabled' : 'Company enabled');
        fetchCompanies();
      }
    } catch {
      toast.error('Failed to update');
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openStocksDialog = async (company: Company) => {
    setStocksCompany(company);
    setCompanyStocks([]);
    setStocksLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${company._id}/stocks`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load stocks');
        setStocksCompany(null);
        return;
      }
      setCompanyStocks(data.stocks || []);
      setStocksNetbayLiveApi(!!data.netbayUseLiveStockApi);
      setStocksResellerLiveApi(!!data.resellerUseLiveStockApi);
      const counts = (data.stocks || []).map((s: CompanyStock) => s.stockCount ?? 0);
      const allSame = counts.length > 0 && counts.every((c: number) => c === counts[0]);
      setBulkStockCount(allSame ? String(counts[0]) : '');
    } catch {
      toast.error('Failed to load stocks');
      setStocksCompany(null);
    } finally {
      setStocksLoading(false);
    }
  };

  const closeStocksDialog = () => {
    setStocksCompany(null);
    setCompanyStocks([]);
    setStocksNetbayLiveApi(false);
    setSavingBulkStock(false);
    setBulkStockCount('');
  };

  const updateAllCompanyStockCounts = async () => {
    if (!stocksCompany) return;
    const stockCount = Math.max(0, Math.floor(Number(bulkStockCount) || 0));
    setSavingBulkStock(true);
    try {
      const res = await fetch(`/api/admin/companies/${stocksCompany._id}/stocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stockCount, applyToAll: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update stock');
        return;
      }
      setCompanyStocks(data.stocks || []);
      setBulkStockCount(String(data.stockCount ?? stockCount));
      toast.success(
        stockCount > 0
          ? `All ${data.updated ?? data.stocks?.length ?? 0} plans set to ${stockCount} units`
          : 'All plans marked out of stock'
      );
    } catch {
      toast.error('Failed to update stock');
    } finally {
      setSavingBulkStock(false);
    }
  };

  const copyLoginUrl = (slug: string) => {
    const url = `${window.location.origin}/company/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Login URL copied');
  };

  const openVirtualizorDialog = (c: Company) => {
    setVirtCompany(c);
    setVirtTestStates({});
    setShowVirtPassword({});

    const entries: CompanyVirtualizor[] = [];
    if (Array.isArray(c.virtualizors) && c.virtualizors.length > 0) {
      for (const v of c.virtualizors) {
        entries.push({
          _id: (v as { _id?: string })._id,
          enabled: typeof v?.enabled === 'boolean' ? v.enabled : true,
          label: v?.label || '',
          host: v?.host || '',
          port: typeof v?.port === 'number' ? v.port : 4083,
          apiKey: v?.apiKey || '',
          apiPassword: v?.apiPassword || '',
          protocol: v?.protocol === 'http' ? 'http' : 'https',
        });
      }
    } else if (c.virtualizor && (c.virtualizor.host || c.virtualizor.apiKey)) {
      entries.push({
        enabled: !!c.virtualizor.enabled,
        label: 'Legacy',
        host: c.virtualizor.host || '',
        port: typeof c.virtualizor.port === 'number' ? c.virtualizor.port : 4083,
        apiKey: c.virtualizor.apiKey || '',
        apiPassword: c.virtualizor.apiPassword || '',
        protocol: c.virtualizor.protocol === 'http' ? 'http' : 'https',
      });
    }

    setVirtList(entries);
    setExpandedEntry(entries.length === 0 ? null : 0);
  };

  const anyVirtTestRunning = Object.values(virtTestStates).some(s => s?.loading);

  const closeVirtualizorDialog = () => {
    if (virtSaving || anyVirtTestRunning) return;
    setVirtCompany(null);
    setVirtList([]);
    setVirtTestStates({});
    setShowVirtPassword({});
    setExpandedEntry(null);
  };

  const updateVirtEntry = (idx: number, patch: Partial<CompanyVirtualizor>) => {
    setVirtList(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
    setVirtTestStates(prev => ({ ...prev, [idx]: { loading: false, result: null } }));
  };

  const addVirtEntry = () => {
    setVirtList(prev => {
      const next = [...prev, NEW_VIRT_ENTRY()];
      setExpandedEntry(next.length - 1);
      return next;
    });
  };

  const removeVirtEntry = (idx: number) => {
    setVirtList(prev => prev.filter((_, i) => i !== idx));
    setVirtTestStates(prev => {
      const next: Record<number, VirtTestState> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const oldIdx = Number(k);
        if (oldIdx === idx) return;
        next[oldIdx > idx ? oldIdx - 1 : oldIdx] = v;
      });
      return next;
    });
    setExpandedEntry(curr => {
      if (curr === null) return null;
      if (curr === idx) return null;
      return curr > idx ? curr - 1 : curr;
    });
  };

  const moveVirtEntry = (idx: number, direction: -1 | 1) => {
    setVirtList(prev => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleTestVirtualizorEntry = async (idx: number) => {
    if (!virtCompany) return;
    const entry = virtList[idx];
    if (!entry || !entry.host.trim() || !entry.apiKey.trim() || !entry.apiPassword.trim()) {
      toast.error('Host, API key and API password are required to test');
      return;
    }
    setVirtTestStates(prev => ({ ...prev, [idx]: { loading: true, result: null } }));
    try {
      const res = await fetch(`/api/admin/companies/${virtCompany._id}/test-virtualizor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ virtualizor: entry }),
      });
      const data = await res.json();
      const result = res.ok && data.success
        ? { success: true, message: data.message || 'Connected' }
        : { success: false, message: data.error || 'Connection failed' };
      setVirtTestStates(prev => ({ ...prev, [idx]: { loading: false, result } }));
    } catch (err: any) {
      setVirtTestStates(prev => ({
        ...prev,
        [idx]: { loading: false, result: { success: false, message: err?.message || 'Request failed' } },
      }));
    }
  };

  const openResellerDialog = (c: Company) => {
    const r = c.resellerApi || null;
    const hasAny = !!(r && (r.baseUrl || r.email || r.password));
    if (!hasAny) {
      // No saved config yet — pre-fill the dialog with the hardcoded
      // Hostheaven defaults so the admin can just click Save.
      setResellerForm({ ...RESELLER_API_DIALOG_DEFAULTS });
    } else {
      setResellerForm({
        enabled: typeof r?.enabled === 'boolean' ? r.enabled : !!r,
        label: r?.label || '',
        baseUrl: r?.baseUrl || '',
        resellerDomain: r?.resellerDomain || '',
        email: r?.email || '',
        password: r?.password || '',
        useLiveStockApi: r?.useLiveStockApi === true,
        couponCode: r?.couponCode || '',
        couponByMemory: { ...(r?.couponByMemory || {}) },
      });
    }
    setResellerTestResult(null);
    setShowResellerPassword(false);
    setResellerCompany(c);
  };

  const closeResellerDialog = () => {
    if (resellerSaving || resellerTesting) return;
    setResellerCompany(null);
    setResellerForm(EMPTY_RESELLER_API());
    setResellerTestResult(null);
    setShowResellerPassword(false);
  };

  const updateResellerField = <K extends keyof CompanyResellerApi>(key: K, value: CompanyResellerApi[K]) => {
    setResellerForm(prev => ({ ...prev, [key]: value }));
    setResellerTestResult(null);
  };

  const updateResellerCouponForMemory = (memory: string, code: string) => {
    setResellerForm((prev) => ({
      ...prev,
      couponByMemory: {
        ...(prev.couponByMemory || {}),
        [memory]: code.trim().toUpperCase(),
      },
    }));
    setResellerTestResult(null);
  };

  const handleTestResellerApi = async () => {
    if (!resellerCompany) return;
    // Empty fields are accepted — the backend will substitute the hardcoded
    // Hostheaven defaults before performing the live login check.
    setResellerTesting(true);
    setResellerTestResult(null);
    try {
      const res = await fetch(`/api/admin/companies/${resellerCompany._id}/test-reseller-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resellerApi: resellerForm }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResellerTestResult({ success: true, message: data.message || 'Connected' });
      } else {
        setResellerTestResult({ success: false, message: data.error || 'Connection failed' });
      }
    } catch (err: any) {
      setResellerTestResult({ success: false, message: err?.message || 'Request failed' });
    } finally {
      setResellerTesting(false);
    }
  };

  const handleAuditResellerVms = async () => {
    if (!resellerCompany) return;
    setResellerAuditing(true);
    setResellerAuditData(null);
    try {
      const res = await fetch(`/api/admin/companies/${resellerCompany._id}/reseller-vm-audit`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Hostheaven audit failed');
        return;
      }
      setResellerAuditData(data);
      setResellerAuditOpen(true);
      toast.success(
        data.untrackedInOrdersCount === 0
          ? 'All panel VMs are linked to orders'
          : `${data.untrackedInOrdersCount} VM(s) on Hostheaven with no order`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Audit request failed');
    } finally {
      setResellerAuditing(false);
    }
  };

  const openStocksFromReseller = () => {
    if (!resellerCompany || resellerSaving || resellerTesting) return;
    const company = resellerCompany;
    closeResellerDialog();
    void openStocksDialog(company);
  };

  const handleSaveResellerApi = async () => {
    if (!resellerCompany) return;
    // Empty fields are intentionally accepted here — the backend fills any
    // blanks with the hardcoded Hostheaven defaults from
    // `lib/companyResellerApi.js`.
    setResellerSaving(true);
    try {
      const payload = {
        ...resellerForm,
        enabled: resellerForm.enabled === true || resellerForm.useLiveStockApi === true,
        useLiveStockApi:
          (resellerForm.enabled === true || resellerForm.useLiveStockApi === true) &&
          resellerForm.useLiveStockApi === true,
      };
      const res = await fetch(`/api/admin/companies/${resellerCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resellerApi: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const saved = data as Company;
        const liveOn = saved.resellerApi?.useLiveStockApi === true;
        setCompanies((prev) =>
          prev.map((c) => (String(c._id) === String(saved._id) ? saved : c))
        );
        openResellerDialog(saved);
        toast.success(
          liveOn
            ? 'Reseller API saved — Live stock ON (wallet + pricing se sync)'
            : 'Reseller API saved — Manual stock (Stocks button se units set karo)'
        );
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setResellerSaving(false);
    }
  };

  const handleClearResellerApi = async () => {
    if (!resellerCompany) return;
    const ok = await confirm({
      title: 'Clear Reseller API',
      description: <>Clear reseller API config for <strong>{resellerCompany.name}</strong>?</>,
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    setResellerSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${resellerCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resellerApi: null }),
      });
      if (res.ok) {
        toast.success('Reseller API configuration cleared');
        setResellerCompany(null);
        setResellerForm(EMPTY_RESELLER_API());
        setResellerTestResult(null);
        setShowResellerPassword(false);
        fetchCompanies();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to clear');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clear');
    } finally {
      setResellerSaving(false);
    }
  };

  // -------------------- Netbay API handlers --------------------
  const openNetbayDialog = (c: Company) => {
    const r = c.netbayApi || null;
    setNetbayForm({
      enabled: r?.enabled === true,
      label: r?.label || 'Netbay',
      baseUrl: r?.baseUrl || NETBAY_API_DIALOG_DEFAULTS.baseUrl,
      apiKey: r?.apiKey || '',
      apiSecret: r?.apiSecret || '',
      useLiveStockApi: r?.useLiveStockApi === true,
      couponCode: r?.couponCode || '',
      couponByMemory: { ...(r?.couponByMemory || {}) },
    });
    setNetbayTestResult(null);
    setShowNetbaySecret(false);
    setNetbayCompany(c);
  };

  const closeNetbayDialog = () => {
    if (netbaySaving || netbayTesting) return;
    setNetbayCompany(null);
    setNetbayForm(EMPTY_NETBAY_API());
    setNetbayTestResult(null);
    setShowNetbaySecret(false);
  };

  const openStocksFromNetbay = () => {
    if (!netbayCompany || netbaySaving || netbayTesting) return;
    const company = netbayCompany;
    closeNetbayDialog();
    void openStocksDialog(company);
  };

  const updateNetbayField = <K extends keyof CompanyNetbayApi>(key: K, value: CompanyNetbayApi[K]) => {
    setNetbayForm(prev => ({ ...prev, [key]: value }));
    setNetbayTestResult(null);
  };

  const updateNetbayCouponForMemory = (memory: string, code: string) => {
    setNetbayForm((prev) => ({
      ...prev,
      couponByMemory: {
        ...(prev.couponByMemory || {}),
        [memory]: code.trim().toUpperCase(),
      },
    }));
    setNetbayTestResult(null);
  };

  const handleTestNetbayApi = async () => {
    if (!netbayCompany) return;
    setNetbayTesting(true);
    setNetbayTestResult(null);
    try {
      const res = await fetch(`/api/admin/companies/${netbayCompany._id}/test-netbay-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ netbayApi: netbayForm }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNetbayTestResult({ success: true, message: data.message || 'Connected' });
      } else {
        setNetbayTestResult({ success: false, message: data.error || 'Connection failed' });
      }
    } catch (err: any) {
      setNetbayTestResult({ success: false, message: err?.message || 'Request failed' });
    } finally {
      setNetbayTesting(false);
    }
  };

  const handleSaveNetbayApi = async () => {
    if (!netbayCompany) return;
    // apiKey/apiSecret may legitimately be blank if the deployment relies on
    // the NETBAY_API_KEY / NETBAY_API_SECRET env vars as a global fallback —
    // the server-side resolver fills them in at runtime. We just nudge the
    // admin so they don't accidentally save an unusable empty config.
    if (
      netbayForm.enabled &&
      (!netbayForm.apiKey.trim() || !netbayForm.apiSecret.trim())
    ) {
      const ok = await confirm({
        title: 'Blank API Credentials',
        description: 'API Key / Secret are blank. The server will fall back to NETBAY_API_KEY / NETBAY_API_SECRET env vars. Continue?',
        confirmLabel: 'Continue',
      });
      if (!ok) return;
    }
    setNetbaySaving(true);
    try {
      const payload = {
        ...netbayForm,
        enabled: netbayForm.enabled === true || netbayForm.useLiveStockApi === true,
        useLiveStockApi:
          (netbayForm.enabled === true || netbayForm.useLiveStockApi === true) &&
          netbayForm.useLiveStockApi === true,
      };
      const res = await fetch(`/api/admin/companies/${netbayCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ netbayApi: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const saved = data as Company;
        const liveOn = saved.netbayApi?.useLiveStockApi === true;
        setCompanies((prev) =>
          prev.map((c) => (String(c._id) === String(saved._id) ? saved : c))
        );
        openNetbayDialog(saved);
        toast.success(
          liveOn
            ? 'Netbay saved — Live API stock ON (availability follows NetBay stock API)'
            : 'Netbay saved — Manual stock (set units in Stocks button)'
        );
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setNetbaySaving(false);
    }
  };

  // -------------------- KuroHost API handlers --------------------
  const openKurohostDialog = (c: Company) => {
    const r = c.kurohostApi || null;
    setKurohostForm({
      enabled: r?.enabled === true,
      label: r?.label || 'KuroHost Cloud',
      baseUrl: r?.baseUrl || KUROHOST_API_DIALOG_DEFAULTS.baseUrl,
      apiKey: r?.apiKey || '',
      useLiveStockApi: r?.useLiveStockApi === true,
    });
    setKurohostTestResult(null);
    setShowKurohostKey(false);
    setKurohostCompany(c);
  };

  const closeKurohostDialog = () => {
    if (kurohostSaving || kurohostTesting) return;
    setKurohostCompany(null);
    setKurohostForm(EMPTY_KUROHOST_API());
    setKurohostTestResult(null);
    setShowKurohostKey(false);
  };

  const openStocksFromKurohost = () => {
    if (!kurohostCompany || kurohostSaving || kurohostTesting) return;
    const company = kurohostCompany;
    closeKurohostDialog();
    void openStocksDialog(company);
  };

  const updateKurohostField = <K extends keyof CompanyKurohostApi>(key: K, value: CompanyKurohostApi[K]) => {
    setKurohostForm(prev => ({ ...prev, [key]: value }));
    setKurohostTestResult(null);
  };

  const handleTestKurohostApi = async () => {
    if (!kurohostCompany) return;
    setKurohostTesting(true);
    setKurohostTestResult(null);
    try {
      const res = await fetch(`/api/admin/companies/${kurohostCompany._id}/test-kurohost-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kurohostApi: kurohostForm }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKurohostTestResult({ success: true, message: data.message || 'Connected' });
      } else {
        setKurohostTestResult({ success: false, message: data.error || 'Connection failed' });
      }
    } catch (err: any) {
      setKurohostTestResult({ success: false, message: err?.message || 'Request failed' });
    } finally {
      setKurohostTesting(false);
    }
  };

  const handleSaveKurohostApi = async () => {
    if (!kurohostCompany) return;
    if (kurohostForm.enabled && !kurohostForm.apiKey.trim()) {
      const ok = await confirm({
        title: 'Save without API key?',
        description: <>No API key entered. Continue using global <code>KUROHOST_API_KEY</code> env var?</>,
        confirmLabel: 'Save anyway',
      });
      if (!ok) return;
    }
    setKurohostSaving(true);
    try {
      const payload = {
        ...kurohostForm,
        enabled: kurohostForm.enabled === true,
        useLiveStockApi: false,
      };
      const res = await fetch(`/api/admin/companies/${kurohostCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kurohostApi: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const saved = data as Company;
        setCompanies((prev) =>
          prev.map((c) => (String(c._id) === String(saved._id) ? saved : c))
        );
        openKurohostDialog(saved);
        toast.success('KuroHost saved — set zone/flavor IDs in manageIpStock, stock units via Stocks button');
      } else {
        toast.error((data as { error?: string }).error || 'Failed to save');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setKurohostSaving(false);
    }
  };

  const handleClearKurohostApi = async () => {
    if (!kurohostCompany) return;
    const ok = await confirm({
      title: 'Clear KuroHost API',
      description: <>Clear KuroHost API config for <strong>{kurohostCompany.name}</strong>?</>,
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    setKurohostSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${kurohostCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kurohostApi: null }),
      });
      if (res.ok) {
        toast.success('KuroHost API configuration cleared');
        setKurohostCompany(null);
        setKurohostForm(EMPTY_KUROHOST_API());
        setKurohostTestResult(null);
        fetchCompanies();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || 'Failed to clear');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clear');
    } finally {
      setKurohostSaving(false);
    }
  };

  const handleClearNetbayApi = async () => {
    if (!netbayCompany) return;
    const ok = await confirm({
      title: 'Clear Netbay API',
      description: <>Clear Netbay API config for <strong>{netbayCompany.name}</strong>?</>,
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    setNetbaySaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${netbayCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ netbayApi: null }),
      });
      if (res.ok) {
        toast.success('Netbay API configuration cleared');
        setNetbayCompany(null);
        setNetbayForm(EMPTY_NETBAY_API());
        setNetbayTestResult(null);
        setShowNetbaySecret(false);
        fetchCompanies();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to clear');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clear');
    } finally {
      setNetbaySaving(false);
    }
  };

  // -------------------- Joy Services API handlers --------------------
  const openJoyDialog = (c: Company) => {
    const r = c.joyApi || null;
    setJoyForm({
      enabled: r?.enabled === true,
      label: r?.label || 'Joy Services',
      baseUrl: r?.baseUrl || JOY_API_DIALOG_DEFAULTS.baseUrl,
      apiToken: r?.apiToken || '',
      apiKey: r?.apiKey || '',
    });
    setJoyTestResult(null);
    setShowJoyKey(false);
    setJoyCompany(c);
  };

  const closeJoyDialog = () => {
    if (joySaving || joyTesting) return;
    setJoyCompany(null);
    setJoyForm(EMPTY_JOY_API());
    setJoyTestResult(null);
    setShowJoyKey(false);
  };

  const updateJoyField = <K extends keyof CompanyJoyApi>(key: K, value: CompanyJoyApi[K]) => {
    setJoyForm(prev => ({ ...prev, [key]: value }));
    setJoyTestResult(null);
  };

  const handleTestJoyApi = async () => {
    if (!joyCompany) return;
    setJoyTesting(true);
    setJoyTestResult(null);
    try {
      const res = await fetch(`/api/admin/companies/${joyCompany._id}/test-joy-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joyApi: joyForm }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setJoyTestResult({ success: true, message: data.message || 'Connected' });
      } else {
        setJoyTestResult({ success: false, message: data.error || 'Connection failed' });
      }
    } catch (err: any) {
      setJoyTestResult({ success: false, message: err?.message || 'Request failed' });
    } finally {
      setJoyTesting(false);
    }
  };

  const handleSaveJoyApi = async () => {
    if (!joyCompany) return;
    if (joyForm.enabled && (!joyForm.apiToken.trim() || !joyForm.apiKey.trim())) {
      const ok = await confirm({
        title: 'Blank API Credentials',
        description: 'API Token / Key are blank. The server will fall back to JOY_API_TOKEN / JOY_API_KEY env vars. Continue?',
        confirmLabel: 'Continue',
      });
      if (!ok) return;
    }
    setJoySaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${joyCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joyApi: joyForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const saved = data as Company;
        setCompanies((prev) =>
          prev.map((c) => (String(c._id) === String(saved._id) ? saved : c))
        );
        openJoyDialog(saved);
        toast.success('Joy Services config saved');
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setJoySaving(false);
    }
  };

  const handleClearJoyApi = async () => {
    if (!joyCompany) return;
    const ok = await confirm({
      title: 'Clear Joy Services API',
      description: <>Clear Joy Services API config for <strong>{joyCompany.name}</strong>?</>,
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (!ok) return;
    setJoySaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${joyCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joyApi: null }),
      });
      if (res.ok) {
        toast.success('Joy Services API configuration cleared');
        setJoyCompany(null);
        setJoyForm(EMPTY_JOY_API());
        setJoyTestResult(null);
        setShowJoyKey(false);
        fetchCompanies();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to clear');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clear');
    } finally {
      setJoySaving(false);
    }
  };

  const handleSaveVirtualizor = async () => {
    if (!virtCompany) return;

    for (let i = 0; i < virtList.length; i++) {
      const e = virtList[i];
      if (e.enabled && (!e.host.trim() || !e.apiKey.trim() || !e.apiPassword.trim())) {
        toast.error(`Panel #${i + 1}: host, API key and API password are required when enabled`);
        setExpandedEntry(i);
        return;
      }
    }

    setVirtSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${virtCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ virtualizors: virtList }),
      });
      if (res.ok) {
        toast.success('Virtualizor configuration saved');
        setVirtCompany(null);
        setVirtList([]);
        setVirtTestStates({});
        setShowVirtPassword({});
        setExpandedEntry(null);
        fetchCompanies();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setVirtSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Companies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage partner companies that can update their stock availability, order credentials, and approve customer renewals.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Company
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No Companies Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create a company to let partners manage their stock and orders.</p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create First Company
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Automation</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c._id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.slug}</code>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {visiblePasswords.has(c._id) ? c.password : '••••••••'}
                      </code>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => togglePasswordVisibility(c._id)}>
                        {visiblePasswords.has(c._id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={c.isActive ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleActive(c._id, c.isActive)}
                    >
                      {c.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const arr = Array.isArray(c.virtualizors) ? c.virtualizors : [];
                      const enabledArr = arr.filter(v => v?.enabled && v?.host && v?.apiKey && v?.apiPassword);
                      if (enabledArr.length > 0) {
                        return (
                          <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200">
                            <ShieldCheck className="h-3 w-3" />
                            Virtualizor: {enabledArr.length === 1 ? enabledArr[0]?.host : `${enabledArr.length} panels`}
                          </Badge>
                        );
                      }
                      const legacy = c.virtualizor;
                      if (legacy?.enabled && legacy?.host) {
                        return (
                          <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200">
                            <ShieldCheck className="h-3 w-3" />
                            Virtualizor: {legacy.host}
                          </Badge>
                        );
                      }
                      const r = c.resellerApi;
                      if (r?.enabled && r?.baseUrl && r?.email && r?.password) {
                        let host = r.baseUrl;
                        try { host = new URL(r.baseUrl).host; } catch { /* keep as-is */ }
                        const stockMode = r.useLiveStockApi ? 'API stock' : 'Manual stock';
                        const c4 = r.couponByMemory?.['4GB'] || r.couponByMemory?.['4gb'];
                        const c8 = r.couponByMemory?.['8GB'] || r.couponByMemory?.['8gb'];
                        const panelCoupon = c4 || c8 || r.couponCode
                          ? ` · ${[c4 ? `4GB:${c4}` : '', c8 ? `8GB:${c8}` : '', (!c4 && !c8 && r.couponCode) ? r.couponCode : ''].filter(Boolean).join(' ')}`
                          : '';
                        return (
                          <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200">
                            <Cloud className="h-3 w-3" />
                            Reseller: {host} · {stockMode}{panelCoupon}
                          </Badge>
                        );
                      }
                      const n = c.netbayApi;
                      // Show the badge whenever Netbay is enabled — credentials
                      // may live in NETBAY_API_KEY / NETBAY_API_SECRET env vars
                      // rather than on the company doc, so we don't gate on them.
                      if (n?.enabled) {
                        let host = n.baseUrl || 'api.netbayhosts.in';
                        try { if (n.baseUrl) host = new URL(n.baseUrl).host; } catch { /* keep as-is */ }
                        const stockMode = n.useLiveStockApi ? 'API stock' : 'Manual stock';
                        const c4 = n.couponByMemory?.['4GB'] || n.couponByMemory?.['4gb'];
                        const c8 = n.couponByMemory?.['8GB'] || n.couponByMemory?.['8gb'];
                        const c16 = n.couponByMemory?.['16GB'] || n.couponByMemory?.['16gb'];
                        const promo = (c4 || c8 || c16 || n.couponCode)
                          ? ` · ${[c4 ? `4GB:${c4}` : '', c8 ? `8GB:${c8}` : '', c16 ? `16GB:${c16}` : '', (!c4 && !c8 && !c16 && n.couponCode) ? n.couponCode : ''].filter(Boolean).join(' ')}`
                          : '';
                        return (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200">
                            <Zap className="h-3 w-3" />
                            Netbay: {host} · {stockMode}{promo}
                          </Badge>
                        );
                      }
                      const kh = c.kurohostApi;
                      if (kh?.enabled) {
                        let host = kh.baseUrl || 'kurohost.com';
                        try { if (kh.baseUrl) host = new URL(kh.baseUrl).host; } catch { /* keep as-is */ }
                        return (
                          <Badge variant="outline" className="gap-1 text-violet-600 border-violet-200">
                            <Globe className="h-3 w-3" />
                            KuroHost: {host} · Zone API stock
                          </Badge>
                        );
                      }
                      const j = c.joyApi;
                      if (j?.enabled) {
                        let host = j.baseUrl || 'api.joy.services';
                        try { if (j.baseUrl) host = new URL(j.baseUrl).host; } catch { /* keep as-is */ }
                        return (
                          <Badge variant="outline" className="gap-1 text-fuchsia-600 border-fuchsia-200">
                            <Sparkles className="h-3 w-3" />
                            Joy: {host} · Manage
                          </Badge>
                        );
                      }
                      return (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <ShieldAlert className="h-3 w-3" />
                          Manual
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openStocksDialog(c)}>
                        <Package className="h-3.5 w-3.5" />
                        Stocks
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openVirtualizorDialog(c)}>
                        <Server className="h-3.5 w-3.5" />
                        Virtualizor
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openResellerDialog(c)}>
                        <Cloud className="h-3.5 w-3.5" />
                        Reseller API
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openNetbayDialog(c)}>
                        <Zap className="h-3.5 w-3.5" />
                        Netbay
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openKurohostDialog(c)}>
                        <Globe className="h-3.5 w-3.5" />
                        KuroHost
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openJoyDialog(c)}>
                        <Sparkles className="h-3.5 w-3.5" />
                        Joy
                      </Button>
                      {c.netbayApi?.enabled && (
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild>
                          <Link href={`/admin/companies/${c._id}/netbay-catalog`}>
                            <BookOpen className="h-3.5 w-3.5" />
                            Catalog
                          </Link>
                        </Button>
                      )}
                      {c.kurohostApi?.enabled && (
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild>
                          <Link href={`/admin/companies/${c._id}/kurohost-catalog`}>
                            <BookOpen className="h-3.5 w-3.5" />
                            KH Catalog
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => copyLoginUrl(c.slug)}>
                        <Copy className="h-3.5 w-3.5" />
                        URL
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild>
                        <a href={`/company/${c.slug}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(c._id, c.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!virtCompany} onOpenChange={(open) => !open && closeVirtualizorDialog()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Virtualizor Automation
            </DialogTitle>
          </DialogHeader>
          {virtCompany && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{virtCompany.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add one or more Virtualizor enduser panels. When a user runs an action,
                  panels are tried <span className="font-medium text-foreground">in the order shown</span>{' '}
                  until one is reachable and reports the VPS — so use the up/down arrows
                  to control fail-over priority. Disabled panels are skipped entirely.
                </p>
              </div>

              <div className="space-y-3">
                {virtList.length === 0 && (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No Virtualizor panels configured yet.
                    <br />
                    <span className="text-xs">Click &quot;Add Panel&quot; below to set one up.</span>
                  </div>
                )}

                {virtList.map((entry, idx) => {
                  const test = virtTestStates[idx];
                  const isExpanded = expandedEntry === idx;
                  const showPwd = !!showVirtPassword[idx];
                  return (
                    <div key={entry._id || idx} className="rounded-lg border bg-card">
                      <div
                        className="flex items-center justify-between gap-3 p-3 cursor-pointer"
                        onClick={() => setExpandedEntry(isExpanded ? null : idx)}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`h-7 w-7 rounded-md flex items-center justify-center text-xs font-semibold ${entry.enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                            #{idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {entry.label?.trim() || entry.host || 'New panel'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {entry.host
                                ? `${entry.protocol}://${entry.host}:${entry.port}`
                                : 'Not configured'}
                            </p>
                          </div>
                          {!entry.enabled && (
                            <Badge variant="outline" className="text-[10px] h-4">Disabled</Badge>
                          )}
                          {test?.result?.success && (
                            <Badge variant="outline" className="gap-1 text-[10px] h-4 text-emerald-600 border-emerald-200">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                            </Badge>
                          )}
                          {test?.result && !test.result.success && (
                            <Badge variant="outline" className="gap-1 text-[10px] h-4 text-red-600 border-red-200">
                              <XCircle className="h-2.5 w-2.5" /> Failed
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={idx === 0}
                            onClick={() => moveVirtEntry(idx, -1)}
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={idx === virtList.length - 1}
                            onClick={() => moveVirtEntry(idx, 1)}
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            onClick={() => removeVirtEntry(idx)}
                            title="Remove panel"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t p-3 space-y-3">
                          <div className="flex items-center justify-between rounded-md border p-2.5">
                            <div className="text-sm">
                              <p className="font-medium">Enabled in fail-over chain</p>
                              <p className="text-xs text-muted-foreground">
                                Disable to skip without removing.
                              </p>
                            </div>
                            <Switch
                              checked={entry.enabled}
                              onCheckedChange={(c) => updateVirtEntry(idx, { enabled: c })}
                            />
                          </div>

                          <div>
                            <Label className="text-xs">Label (optional)</Label>
                            <Input
                              placeholder="e.g. Mumbai DC"
                              value={entry.label}
                              onChange={(e) => updateVirtEntry(idx, { label: e.target.value })}
                              className="mt-1"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <Label className="text-xs">Host</Label>
                              <Input
                                placeholder="server.example.com"
                                value={entry.host}
                                onChange={(e) => updateVirtEntry(idx, { host: e.target.value })}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Port</Label>
                              <Input
                                type="number"
                                placeholder="4083"
                                value={entry.port}
                                onChange={(e) => updateVirtEntry(idx, { port: Number(e.target.value) || 4083 })}
                                className="mt-1"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs">Protocol</Label>
                              <Select
                                value={entry.protocol}
                                onValueChange={(v: 'http' | 'https') => updateVirtEntry(idx, { protocol: v })}
                              >
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="https">https</SelectItem>
                                  <SelectItem value="http">http</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="sm:col-span-2">
                              <Label className="text-xs">API Key</Label>
                              <Input
                                placeholder="VIRTUALIZOR_API_KEY"
                                value={entry.apiKey}
                                onChange={(e) => updateVirtEntry(idx, { apiKey: e.target.value })}
                                className="mt-1"
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs">API Password</Label>
                            <div className="relative mt-1">
                              <Input
                                type={showPwd ? 'text' : 'password'}
                                placeholder="VIRTUALIZOR_API_PASSWORD"
                                value={entry.apiPassword}
                                onChange={(e) => updateVirtEntry(idx, { apiPassword: e.target.value })}
                              />
                              <button
                                type="button"
                                onClick={() => setShowVirtPassword((s) => ({ ...s, [idx]: !s[idx] }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                tabIndex={-1}
                              >
                                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          {test?.result && (
                            <div
                              className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                                test.result.success
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-red-200 bg-red-50 text-red-700'
                              }`}
                            >
                              {test.result.success ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <XCircle className="h-4 w-4 mt-0.5" />}
                              <span>{test.result.message}</span>
                            </div>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestVirtualizorEntry(idx)}
                            disabled={test?.loading || virtSaving}
                            className="gap-2"
                          >
                            {test?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            Test This Panel
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                variant="outline"
                onClick={addVirtEntry}
                disabled={virtSaving}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Panel
              </Button>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeVirtualizorDialog} disabled={virtSaving || anyVirtTestRunning}>
              Cancel
            </Button>
            <Button onClick={handleSaveVirtualizor} disabled={virtSaving}>
              {virtSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resellerCompany} onOpenChange={(open) => !open && closeResellerDialog()}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Reseller API Automation
            </DialogTitle>
          </DialogHeader>
          {resellerCompany && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{resellerCompany.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use this to wire orders linked to this company up to an external
                  reseller hosting panel API (e.g.{' '}
                  <code className="text-foreground">https://vps.hostheaven.in</code>).
                  Power, reinstall and MAC reset will be driven through that API.
                  This is an alternative to Virtualizor — Virtualizor takes priority
                  if both are configured.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">Defaults:</span>{' '}
                  any blank field falls back to the built-in Hostheaven account.
                  Just toggle <span className="font-medium text-foreground">Enabled</span> and
                  click Save — credentials are optional.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div className="text-sm">
                  <p className="font-medium">Enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Disable to stop using the reseller API without losing the saved config.
                  </p>
                </div>
                <Switch
                  checked={resellerForm.enabled}
                  onCheckedChange={(c) => updateResellerField('enabled', c)}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div className="text-sm">
                  <p className="font-medium">Live stock API</p>
                  {!resellerForm.enabled && !resellerForm.useLiveStockApi ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Pehle <strong>Enabled</strong> ON karo, phir live stock ON kar sakte ho.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong>ON</strong> — panel wallet + pricing se auto sync (PrimeVPS / Hostheaven).
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong>OFF</strong> — manual units <strong>Stocks</strong> button se. Buy &amp; VM provision phir bhi panel se chalega.
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold uppercase tracking-wide min-w-[2rem] text-right ${
                    resellerForm.useLiveStockApi ? 'text-emerald-600' : 'text-muted-foreground'
                  }`}>
                    {resellerForm.useLiveStockApi ? 'ON' : 'OFF'}
                  </span>
                  <Switch
                    checked={!!resellerForm.useLiveStockApi}
                    onCheckedChange={(c) => {
                      setResellerForm((prev) => ({
                        ...prev,
                        ...(c ? { enabled: true } : {}),
                        useLiveStockApi: c,
                      }));
                      setResellerTestResult(null);
                    }}
                  />
                </div>
              </div>

              {resellerForm.enabled && !resellerForm.useLiveStockApi && (
                <div className="rounded-md border border-emerald-300/70 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800/50 p-3 space-y-2">
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                    Manual stock units
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ek hi number daalo (e.g. <strong>5</strong>) — saare linked plans par wahi stock dikhega.
                  </p>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={openStocksFromReseller}>
                    <Package className="h-4 w-4" />
                    Set units &amp; Save
                  </Button>
                </div>
              )}

              {resellerForm.enabled && resellerForm.useLiveStockApi && (
                <div className="rounded-md border border-amber-300/70 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-muted-foreground">
                  Live API stock ON — har IP Stock plan ka <strong>Zone ID</strong> set karo (1=103.20, 2=103.148, …).
                  Stock auto sync: zone <strong>ACTIVE</strong> = In stock, band = Out. Manual units ki zaroorat nahi.
                  Buy/renew ke liye primevm.in panel wallet balance chahiye.
                </div>
              )}

              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input
                  placeholder="e.g. Hostheaven"
                  value={resellerForm.label}
                  onChange={(e) => updateResellerField('label', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Base URL</Label>
                  <Input
                    placeholder="https://vps.hostheaven.in"
                    value={resellerForm.baseUrl}
                    onChange={(e) => updateResellerField('baseUrl', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">X-Reseller-Domain (optional)</Label>
                  <Input
                    placeholder="vps.hostheaven.in"
                    value={resellerForm.resellerDomain}
                    onChange={(e) => updateResellerField('resellerDomain', e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Leave blank to derive from base URL host.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    placeholder="reseller@example.com"
                    value={resellerForm.email}
                    onChange={(e) => updateResellerField('email', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showResellerPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={resellerForm.password}
                      onChange={(e) => updateResellerField('password', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResellerPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showResellerPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-sky-200/70 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-900/40 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-600 shrink-0" />
                  <Label className="text-sm font-medium">Panel coupon (auto-buy)</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">4GB coupon</Label>
                    <Input
                      placeholder="e.g. OCEAN199"
                      value={resellerForm.couponByMemory?.['4GB'] || ''}
                      onChange={(e) => updateResellerCouponForMemory('4GB', e.target.value)}
                      className="mt-1 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">8GB coupon</Label>
                    <Input
                      placeholder="e.g. OCEAN8GB"
                      value={resellerForm.couponByMemory?.['8GB'] || ''}
                      onChange={(e) => updateResellerCouponForMemory('8GB', e.target.value)}
                      className="mt-1 font-mono uppercase"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Fallback coupon (other sizes, optional)</Label>
                  <Input
                    placeholder="e.g. OCEAN199"
                    value={resellerForm.couponCode || ''}
                    onChange={(e) => updateResellerField('couponCode', e.target.value.toUpperCase())}
                    className="mt-1 font-mono uppercase"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hostheaven wallet discount per RAM tier on API VM purchase
                  (e.g. 4GB ₹1300 → ₹1100). Stock-level coupon overrides these if set on Manage IP Stock.
                </p>
              </div>

              {resellerTestResult && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                    resellerTestResult.success
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {resellerTestResult.success
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5" />
                    : <XCircle className="h-4 w-4 mt-0.5" />}
                  <span>{resellerTestResult.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestResellerApi}
                  disabled={resellerTesting || resellerSaving || resellerAuditing}
                  className="gap-2"
                >
                  {resellerTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Test Login
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAuditResellerVms}
                  disabled={resellerAuditing || resellerSaving || resellerTesting}
                  className="gap-2"
                >
                  {resellerAuditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
                  Untracked VMs
                </Button>
                {resellerCompany.resellerApi && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearResellerApi}
                    disabled={resellerSaving || resellerTesting}
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Config
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeResellerDialog} disabled={resellerSaving || resellerTesting}>
              Cancel
            </Button>
            <Button onClick={handleSaveResellerApi} disabled={resellerSaving}>
              {resellerSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resellerAuditOpen} onOpenChange={setResellerAuditOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Hostheaven VMs — not in any order
            </DialogTitle>
          </DialogHeader>
          {resellerAuditData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground text-xs">Panel total</p>
                  <p className="font-semibold">{resellerAuditData.hostheavenTotalVms}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground text-xs">Orders with IP</p>
                  <p className="font-semibold">{resellerAuditData.oceanlinuxOrdersWithIp}</p>
                </div>
                <div className="rounded-md border p-2 col-span-2">
                  <p className="text-muted-foreground text-xs">Untracked (panel only)</p>
                  <p className="font-semibold text-amber-600">{resellerAuditData.untrackedInOrdersCount}</p>
                </div>
              </div>
              {resellerAuditData.untrackedInOrdersCount === 0 ? (
                <p className="text-sm text-emerald-600">Every Hostheaven VM has a matching OceanLinux order IP.</p>
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const text = resellerAuditData.untrackedInOrders.map((r) => r.ip).join('\n');
                        void navigator.clipboard.writeText(text);
                        toast.success('IP list copied');
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy all IPs
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP</TableHead>
                        <TableHead>VM ID</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Inventory</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resellerAuditData.untrackedInOrders.map((row) => (
                        <TableRow key={row.ip}>
                          <TableCell className="font-mono text-xs">{row.ip}</TableCell>
                          <TableCell className="font-mono text-xs">{row.vmId}</TableCell>
                          <TableCell className="text-xs">{row.serverName || '—'}</TableCell>
                          <TableCell className="text-xs">
                            {row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell className="text-xs">{row.panelStatus || '—'}</TableCell>
                          <TableCell className="text-xs">
                            {row.inCompanyInventory
                              ? `Yes (${row.inventoryStock || 'stock'})`
                              : 'No'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResellerAuditOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!netbayCompany} onOpenChange={(open) => !open && closeNetbayDialog()}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Netbay API Automation
            </DialogTitle>
          </DialogHeader>
          {netbayCompany && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{netbayCompany.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Wire orders linked to this company up to the Netbay reseller
                  API (<code className="text-foreground">https://api.netbayhosts.in</code>).
                  Auto-provisioning, power actions and rebuilds will be driven
                  through that API. Generate the API key + secret pair from the
                  Netbay dashboard. Once enabled, link the company to your
                  IPStock entries and configure their per-RAM Plan IDs from
                  /admin/manageIpStock.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">API docs:</span>{' '}
                  <a
                    href="https://netbayhosts.in/api-docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    netbayhosts.in/api-docs
                  </a>
                  {' '}— generate key/secret from NetBay dashboard. Base URL:{' '}
                  <code>https://api.netbayhosts.in</code>
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">Env fallback:</span>{' '}
                  leave the API Key / Secret fields blank to use the global{' '}
                  <code>NETBAY_API_KEY</code> / <code>NETBAY_API_SECRET</code>{' '}
                  env vars. Per-company values always override env.
                </p>
                {netbayCompany.netbayApi?.enabled && (
                  <div className="mt-2">
                    <Link
                      href={`/admin/companies/${netbayCompany._id}/netbay-catalog`}
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                      target="_blank"
                    >
                      <BookOpen className="h-3 w-3" />
                      Browse plans &amp; OS templates
                    </Link>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div className="text-sm">
                  <p className="font-medium">Enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Disable to stop using Netbay API without losing the saved config.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold uppercase tracking-wide min-w-[2rem] text-right ${
                    netbayForm.enabled ? 'text-emerald-600' : 'text-muted-foreground'
                  }`}>
                    {netbayForm.enabled ? 'ON' : 'OFF'}
                  </span>
                  <Switch
                    checked={!!netbayForm.enabled}
                    onCheckedChange={(c) => {
                      setNetbayForm((prev) => ({
                        ...prev,
                        enabled: c,
                        ...(c ? {} : { useLiveStockApi: false }),
                      }));
                      setNetbayTestResult(null);
                    }}
                  />
                </div>
              </div>

              <div className={`flex items-center justify-between rounded-md border p-2.5 ${
                netbayForm.enabled
                  ? 'border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800/40'
                  : 'border-dashed opacity-80'
              }`}>
                <div className="text-sm pr-3">
                  <p className="font-medium">Live stock from NetBay API</p>
                  {!netbayForm.enabled && !netbayForm.useLiveStockApi && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                      Pehle upar <strong>Enabled</strong> ON karo, ya seedha yeh switch ON karo (Enabled auto ON ho jayega).
                    </p>
                  )}
                  {netbayForm.enabled && (
                    <>
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong>ON</strong> — stock NetBay API se auto sync (ADVPS jaisa). NetBay ke stock API fix
                        hone ke baad hi ON karna.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <strong>OFF (abhi)</strong> — manual units <strong>Stocks</strong> button se (e.g. 10).
                        Buy &amp; VM provision phir bhi NetBay se chalega.
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold uppercase tracking-wide min-w-[2rem] text-right ${
                    netbayForm.useLiveStockApi ? 'text-emerald-600' : 'text-muted-foreground'
                  }`}>
                    {netbayForm.useLiveStockApi ? 'ON' : 'OFF'}
                  </span>
                  <Switch
                    checked={!!netbayForm.useLiveStockApi}
                    onCheckedChange={(c) => {
                      setNetbayForm((prev) => ({
                        ...prev,
                        ...(c ? { enabled: true } : {}),
                        useLiveStockApi: c,
                      }));
                      setNetbayTestResult(null);
                    }}
                  />
                </div>
              </div>

              {netbayForm.enabled && !netbayForm.useLiveStockApi && (
                <div className="rounded-md border border-emerald-300/70 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800/50 p-3 space-y-2">
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                    Manual stock units
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ek hi number daalo (e.g. <strong>5</strong>) — saare linked plans par wahi stock dikhega.
                  </p>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={openStocksFromNetbay}>
                    <Package className="h-4 w-4" />
                    Set units &amp; Save
                  </Button>
                </div>
              )}

              {netbayForm.enabled && netbayForm.useLiveStockApi && (
                <div className="rounded-md border border-amber-300/70 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-muted-foreground">
                  Live API stock ON — customer ko stock sirf NetBay API se dikhega (manual units use nahi honge).
                  NetBay stock API abhi error de rahi hai, isliye plan Out of Stock dikh sakta hai jab tak NetBay fix na kare.
                </div>
              )}

              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input
                  placeholder="e.g. Netbay Production"
                  value={netbayForm.label}
                  onChange={(e) => updateNetbayField('label', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  placeholder="https://api.netbayhosts.in"
                  value={netbayForm.baseUrl}
                  onChange={(e) => updateNetbayField('baseUrl', e.target.value)}
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Defaults to <code>https://api.netbayhosts.in</code> when blank.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs">X-API-Key</Label>
                  <Input
                    placeholder="ak_…"
                    value={netbayForm.apiKey}
                    onChange={(e) => updateNetbayField('apiKey', e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">X-API-Secret</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showNetbaySecret ? 'text' : 'password'}
                      placeholder="sk_…"
                      value={netbayForm.apiSecret}
                      onChange={(e) => updateNetbayField('apiSecret', e.target.value)}
                      className="font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNetbaySecret((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showNetbaySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-amber-200/70 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                  <Label className="text-sm font-medium">Panel coupon (buy + renew)</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">4GB coupon</Label>
                    <Input
                      placeholder="e.g. NB4GB"
                      value={netbayForm.couponByMemory?.['4GB'] || ''}
                      onChange={(e) => updateNetbayCouponForMemory('4GB', e.target.value)}
                      className="mt-1 font-mono text-xs uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">8GB coupon</Label>
                    <Input
                      placeholder="e.g. NB8GB"
                      value={netbayForm.couponByMemory?.['8GB'] || ''}
                      onChange={(e) => updateNetbayCouponForMemory('8GB', e.target.value)}
                      className="mt-1 font-mono text-xs uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">16GB coupon</Label>
                    <Input
                      placeholder="e.g. NB16GB"
                      value={netbayForm.couponByMemory?.['16GB'] || ''}
                      onChange={(e) => updateNetbayCouponForMemory('16GB', e.target.value)}
                      className="mt-1 font-mono text-xs uppercase"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Fallback coupon (if RAM coupon empty)</Label>
                  <Input
                    placeholder="e.g. SAVE50"
                    value={netbayForm.couponCode || ''}
                    onChange={(e) => updateNetbayField('couponCode', e.target.value.toUpperCase())}
                    className="mt-1 font-mono text-xs uppercase"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  8GB order → 8GB code. Agar us RAM ka field khali hai to fallback use hota hai.
                  Sent as <code>couponCode</code> on purchase and renew.
                </p>
              </div>

              {netbayTestResult && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                    netbayTestResult.success
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {netbayTestResult.success
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5" />
                    : <XCircle className="h-4 w-4 mt-0.5" />}
                  <span>{netbayTestResult.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestNetbayApi}
                  disabled={netbayTesting || netbaySaving}
                  className="gap-2"
                >
                  {netbayTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Test Credentials
                </Button>
                {netbayCompany.netbayApi && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearNetbayApi}
                    disabled={netbaySaving || netbayTesting}
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Config
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeNetbayDialog} disabled={netbaySaving || netbayTesting}>
              Cancel
            </Button>
            <Button onClick={handleSaveNetbayApi} disabled={netbaySaving}>
              {netbaySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!kurohostCompany} onOpenChange={(open) => !open && closeKurohostDialog()}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              KuroHost Cloud API
            </DialogTitle>
          </DialogHeader>
          {kurohostCompany && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{kurohostCompany.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Wire orders to the KuroHost Cloud Platform API. Auto-buy VMs on payment,
                  then start/stop/reboot/sync via API. Generate your API key from the KuroHost
                  console under API &amp; IAM. Link this company to IPStock and set zone + flavor
                  IDs in /admin/manageIpStock.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">Docs:</span>{' '}
                  <a
                    href="https://kurohost.com/cloud/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    kurohost.com/cloud/docs
                  </a>
                  {' '}— Auth: <code>Authorization: Bearer kuro_…</code>
                </p>
                {kurohostCompany.kurohostApi?.enabled && (
                  <div className="mt-2">
                    <Link
                      href={`/admin/companies/${kurohostCompany._id}/kurohost-catalog`}
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                      target="_blank"
                    >
                      <BookOpen className="h-3 w-3" />
                      Browse zones, flavors &amp; OS templates
                    </Link>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div className="text-sm">
                  <p className="font-medium">Enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Disable to stop using KuroHost without losing saved config.
                  </p>
                </div>
                <Switch
                  checked={!!kurohostForm.enabled}
                  onCheckedChange={(c) => {
                    updateKurohostField('enabled', c);
                  }}
                />
              </div>

              {kurohostForm.enabled && (
                <div className="rounded-md border border-violet-300/70 bg-violet-50/50 dark:bg-violet-950/20 p-3 text-xs text-muted-foreground">
                  Stock automatically follows KuroHost <strong>GET /zones</strong>.
                  Har IP stock plan ko ek zone assign karo in manageIpStock — zone available = In Stock.
                </div>
              )}

              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input
                  placeholder="e.g. KuroHost Production"
                  value={kurohostForm.label}
                  onChange={(e) => updateKurohostField('label', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  placeholder="https://kurohost.com/api/cloud/v1"
                  value={kurohostForm.baseUrl}
                  onChange={(e) => updateKurohostField('baseUrl', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">API Key (Bearer kuro_…)</Label>
                <div className="relative mt-1">
                  <Input
                    type={showKurohostKey ? 'text' : 'password'}
                    placeholder="kuro_…"
                    value={kurohostForm.apiKey}
                    onChange={(e) => updateKurohostField('apiKey', e.target.value)}
                    className="font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKurohostKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKurohostKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Or leave blank to use global <code>KUROHOST_API_KEY</code> env var.
                </p>
              </div>

              {kurohostTestResult && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                    kurohostTestResult.success
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {kurohostTestResult.success
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5" />
                    : <XCircle className="h-4 w-4 mt-0.5" />}
                  <span>{kurohostTestResult.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestKurohostApi}
                  disabled={kurohostTesting || kurohostSaving}
                  className="gap-2"
                >
                  {kurohostTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Test Credentials
                </Button>
                {kurohostCompany.kurohostApi && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearKurohostApi}
                    disabled={kurohostSaving || kurohostTesting}
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Config
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeKurohostDialog} disabled={kurohostSaving || kurohostTesting}>
              Cancel
            </Button>
            <Button onClick={handleSaveKurohostApi} disabled={kurohostSaving}>
              {kurohostSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!joyCompany} onOpenChange={(open) => !open && closeJoyDialog()}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Joy Services (Manage)
            </DialogTitle>
          </DialogHeader>
          {joyCompany && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{joyCompany.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Wire orders linked to this company to the Joy Services instances
                  API (<code className="text-foreground">https://api.joy.services</code>).
                  This is a <strong>manage-only</strong> integration — customers get
                  power actions (start / stop / restart) and live status for their
                  machine. There is no buy/provision endpoint, so machines must be
                  created in the Joy panel and matched to orders by IP.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">API docs:</span>{' '}
                  <a
                    href="https://docs.joy.services/instance-api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    docs.joy.services/instance-api
                  </a>
                  {' '}— generate the token/key pair from the Joy dashboard.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">Env fallback:</span>{' '}
                  leave Token / Key blank to use the global{' '}
                  <code>JOY_API_TOKEN</code> / <code>JOY_API_KEY</code> env vars.
                  Per-company values always override env.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div className="text-sm">
                  <p className="font-medium">Enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Disable to stop using Joy without losing the saved config.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold uppercase tracking-wide min-w-[2rem] text-right ${
                    joyForm.enabled ? 'text-emerald-600' : 'text-muted-foreground'
                  }`}>
                    {joyForm.enabled ? 'ON' : 'OFF'}
                  </span>
                  <Switch
                    checked={!!joyForm.enabled}
                    onCheckedChange={(c) => {
                      setJoyForm((prev) => ({ ...prev, enabled: c }));
                      setJoyTestResult(null);
                    }}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input
                  placeholder="e.g. Joy Services Production"
                  value={joyForm.label}
                  onChange={(e) => updateJoyField('label', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  placeholder="https://api.joy.services"
                  value={joyForm.baseUrl}
                  onChange={(e) => updateJoyField('baseUrl', e.target.value)}
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Defaults to <code>https://api.joy.services</code> when blank.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs">x-api-token</Label>
                  <Input
                    placeholder="JOY-API-TOKEN#API"
                    value={joyForm.apiToken}
                    onChange={(e) => updateJoyField('apiToken', e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">x-api-key</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showJoyKey ? 'text' : 'password'}
                      placeholder="joy-…"
                      value={joyForm.apiKey}
                      onChange={(e) => updateJoyField('apiKey', e.target.value)}
                      className="font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowJoyKey((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showJoyKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {joyTestResult && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                    joyTestResult.success
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {joyTestResult.success
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5" />
                    : <XCircle className="h-4 w-4 mt-0.5" />}
                  <span>{joyTestResult.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestJoyApi}
                  disabled={joyTesting || joySaving}
                  className="gap-2"
                >
                  {joyTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Test Credentials
                </Button>
                {joyCompany.joyApi && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearJoyApi}
                    disabled={joySaving || joyTesting}
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Config
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeJoyDialog} disabled={joySaving || joyTesting}>
              Cancel
            </Button>
            <Button onClick={handleSaveJoyApi} disabled={joySaving}>
              {joySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stocksCompany} onOpenChange={(open) => !open && closeStocksDialog()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              IP Stock Availability
            </DialogTitle>
          </DialogHeader>
          {stocksCompany && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{stocksCompany.name}</p>
                {stocksNetbayLiveApi || stocksResellerLiveApi ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 rounded-md border border-amber-200/80 bg-amber-50/80 dark:bg-amber-950/30 p-2">
                    <strong>Live API ON</strong> — units yahan save nahi hote. Manual units ke liye{' '}
                    {stocksNetbayLiveApi ? 'Netbay' : 'Reseller'} dialog me Live stock{' '}
                    <strong>OFF</strong> karo aur Save karo.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 rounded-md border border-emerald-200/80 bg-emerald-50/80 dark:bg-emerald-950/30 p-2">
                    <strong>Manual stock</strong> — ek hi units number daalo; sab plans par wahi apply hoga.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {companyHasNetbayEnabled(stocksCompany) ? (
                    stocksNetbayLiveApi ? (
                      <>NetBay live API mode — stock NetBay se aata hai.</>
                    ) : (
                      <>NetBay manual mode — neeche units set karo.</>
                    )
                  ) : companyHasResellerEnabled(stocksCompany) ? (
                    stocksResellerLiveApi ? (
                      <>Reseller live API mode — stock panel wallet + pricing se aata hai.</>
                    ) : (
                      <>Reseller manual mode — neeche units set karo.</>
                    )
                  ) : (
                    <>
                      Set how many units customers can order for each IP stock linked to this company.
                      When the count reaches 0, the plan shows as out of stock and purchases are blocked.
                    </>
                  )}
                  {' '}Link stocks in{' '}
                  <Link href="/admin/manageIpStock" className="text-blue-600 hover:underline">
                    /admin/manageIpStock
                  </Link>.
                </p>
              </div>

              {stocksLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : companyStocks.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No IP stocks linked to this company yet.
                  <br />
                  <span className="text-xs">Assign a company when creating or editing stock in manageIpStock.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {!stocksNetbayLiveApi && !stocksResellerLiveApi && (
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-lg border border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="admin-bulk-stock">Units (sab plans ke liye)</Label>
                        <Input
                          id="admin-bulk-stock"
                          type="number"
                          min={0}
                          step={1}
                          placeholder="e.g. 5"
                          value={bulkStockCount}
                          onChange={(e) => setBulkStockCount(e.target.value)}
                          className="h-10"
                        />
                        <p className="text-xs text-muted-foreground">
                          {companyStocks.length} plan{companyStocks.length === 1 ? '' : 's'} — sab par same units set honge.
                        </p>
                      </div>
                      <Button
                        onClick={updateAllCompanyStockCounts}
                        disabled={savingBulkStock || bulkStockCount === ''}
                        className="sm:mb-0.5"
                      >
                        {savingBulkStock ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save all
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                  {companyStocks.map((stock) => {
                    const count = stock.stockCount ?? 0;
                    const inStock = count > 0;
                    return (
                    <div
                      key={stock._id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{stock.name}</p>
                          <Badge variant="outline" className="text-[10px] h-4">{stock.serverType}</Badge>
                          {stock.netbayLiveStock && (
                            <Badge variant="outline" className="text-[10px] h-4 text-amber-700 border-amber-200">
                              NetBay API stock
                            </Badge>
                          )}
                          {stock.resellerLiveStock && (
                            <Badge variant="outline" className="text-[10px] h-4 text-blue-700 border-blue-200">
                              Reseller API stock
                            </Badge>
                          )}
                          {inStock ? (
                            <Badge className="text-[10px] h-4 bg-emerald-500/10 text-emerald-700 border-emerald-200">
                              {count} in stock
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] h-4 bg-red-500/10 text-red-600 border-red-200">
                              Out of stock
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {stock.memorySizes.length > 0
                            ? `${stock.memorySizes.join(', ')}`
                            : 'No memory options configured'}
                        </p>
                      </div>
                    </div>
                  );})}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeStocksDialog}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Company Name</Label>
              <Input
                placeholder="e.g. Acme Hosting"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5"
              />
              {name.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  Dashboard URL: <code>/company/{name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}</code>
                </p>
              )}
            </div>
            <div>
              <Label>Password</Label>
              <Input
                placeholder="Dashboard login password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The company will use this password to access their dashboard.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
