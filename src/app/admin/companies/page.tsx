'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
  ChevronDown, ChevronUp, Cloud, Zap, BookOpen,
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
}

interface CompanyNetbayApi {
  enabled: boolean;
  label: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
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
};

const EMPTY_NETBAY_API = (): CompanyNetbayApi => ({
  enabled: true,
  label: '',
  baseUrl: '',
  apiKey: '',
  apiSecret: '',
});

// Defaults pre-filled when a company has no Netbay config saved yet — only
// the documented base URL is filled; apiKey/apiSecret must come from the
// company's own Netbay dashboard.
const NETBAY_API_DIALOG_DEFAULTS: CompanyNetbayApi = {
  enabled: true,
  label: 'Netbay',
  baseUrl: 'https://api.netbayhosts.in',
  apiKey: '',
  apiSecret: '',
};

interface VirtTestState {
  loading: boolean;
  result: { success: boolean; message: string } | null;
}

export default function CompaniesPage() {
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
  const [showResellerPassword, setShowResellerPassword] = useState(false);

  // Netbay API dialog state
  const [netbayCompany, setNetbayCompany] = useState<Company | null>(null);
  const [netbayForm, setNetbayForm] = useState<CompanyNetbayApi>(EMPTY_NETBAY_API());
  const [netbaySaving, setNetbaySaving] = useState(false);
  const [netbayTesting, setNetbayTesting] = useState(false);
  const [netbayTestResult, setNetbayTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showNetbaySecret, setShowNetbaySecret] = useState(false);

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
    if (!confirm(`Delete "${companyName}"? This cannot be undone.`)) return;
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

  const handleSaveResellerApi = async () => {
    if (!resellerCompany) return;
    // Empty fields are intentionally accepted here — the backend fills any
    // blanks with the hardcoded Hostheaven defaults from
    // `lib/companyResellerApi.js`.
    setResellerSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${resellerCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resellerApi: resellerForm }),
      });
      if (res.ok) {
        toast.success('Reseller API configuration saved');
        setResellerCompany(null);
        setResellerForm(EMPTY_RESELLER_API());
        setResellerTestResult(null);
        setShowResellerPassword(false);
        fetchCompanies();
      } else {
        const data = await res.json().catch(() => ({}));
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
    if (!confirm(`Clear reseller API config for "${resellerCompany.name}"?`)) return;
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
    const hasAny = !!(r && (r.baseUrl || r.apiKey || r.apiSecret));
    if (!hasAny) {
      setNetbayForm({ ...NETBAY_API_DIALOG_DEFAULTS });
    } else {
      setNetbayForm({
        enabled: typeof r?.enabled === 'boolean' ? r.enabled : !!r,
        label: r?.label || '',
        baseUrl: r?.baseUrl || '',
        apiKey: r?.apiKey || '',
        apiSecret: r?.apiSecret || '',
      });
    }
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

  const updateNetbayField = <K extends keyof CompanyNetbayApi>(key: K, value: CompanyNetbayApi[K]) => {
    setNetbayForm(prev => ({ ...prev, [key]: value }));
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
    if (netbayForm.enabled && (!netbayForm.apiKey.trim() || !netbayForm.apiSecret.trim())) {
      toast.error('API Key and API Secret are required when Netbay is enabled.');
      return;
    }
    setNetbaySaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${netbayCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ netbayApi: netbayForm }),
      });
      if (res.ok) {
        toast.success('Netbay API configuration saved');
        setNetbayCompany(null);
        setNetbayForm(EMPTY_NETBAY_API());
        setNetbayTestResult(null);
        setShowNetbaySecret(false);
        fetchCompanies();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setNetbaySaving(false);
    }
  };

  const handleClearNetbayApi = async () => {
    if (!netbayCompany) return;
    if (!confirm(`Clear Netbay API config for "${netbayCompany.name}"?`)) return;
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
            Manage partner companies that can update their stock availability and order credentials.
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
                        return (
                          <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200">
                            <Cloud className="h-3 w-3" />
                            Reseller API: {host}
                          </Badge>
                        );
                      }
                      const n = c.netbayApi;
                      if (n?.enabled && n?.apiKey && n?.apiSecret) {
                        let host = n.baseUrl || 'api.netbayhosts.in';
                        try { if (n.baseUrl) host = new URL(n.baseUrl).host; } catch { /* keep as-is */ }
                        return (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200">
                            <Zap className="h-3 w-3" />
                            Netbay: {host}
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
                    <div className="flex items-center justify-end gap-1">
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
                      {c.netbayApi?.enabled && c.netbayApi?.apiKey && c.netbayApi?.apiSecret && (
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild>
                          <Link href={`/admin/companies/${c._id}/netbay-catalog`}>
                            <BookOpen className="h-3.5 w-3.5" />
                            Catalog
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
                  disabled={resellerTesting || resellerSaving}
                  className="gap-2"
                >
                  {resellerTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Test Login
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
                {netbayCompany.netbayApi?.enabled && netbayCompany.netbayApi?.apiKey && netbayCompany.netbayApi?.apiSecret && (
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
                <Switch
                  checked={netbayForm.enabled}
                  onCheckedChange={(c) => updateNetbayField('enabled', c)}
                />
              </div>

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
    </div>
  );
}
