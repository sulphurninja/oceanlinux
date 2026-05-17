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
import {
  Building2, Plus, Trash2, Copy, ExternalLink, Loader2, Eye, EyeOff,
  Server, ShieldCheck, ShieldAlert, CheckCircle2, XCircle,
  ChevronDown, ChevronUp,
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
                <TableHead>Virtualizor</TableHead>
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
                            {enabledArr.length === 1 ? enabledArr[0]?.host : `${enabledArr.length} panels`}
                          </Badge>
                        );
                      }
                      const legacy = c.virtualizor;
                      if (legacy?.enabled && legacy?.host) {
                        return (
                          <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200">
                            <ShieldCheck className="h-3 w-3" />
                            {legacy.host}
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
