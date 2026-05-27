'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { ArrowLeft, Copy, Loader2, RefreshCw, Search, Zap } from 'lucide-react';

interface NetbayPlan {
  id: string;
  name: string;
  cpuCores?: number;
  ramGb?: number;
  osCategory?: string;
  pricePerMonth?: number;
}

interface NetbayOs {
  id: string;
  name: string;
  category?: string;
  storageGb?: number;
}

interface CatalogResponse {
  success?: boolean;
  baseUrl?: string;
  label?: string;
  plans?: NetbayPlan[];
  os?: NetbayOs[];
  plansError?: string | null;
  osError?: string | null;
  error?: string;
}

export default function NetbayCatalogPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/companies/${id}/netbay-catalog`);
      const body = await res.json();
      if (!res.ok || body.error) {
        setError(body.error || 'Failed to load Netbay catalog');
        setData(null);
      } else {
        setData(body);
      }
    } catch (err: any) {
      setError(err?.message || 'Request failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCatalog(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value)
      .then(() => toast.success(`Copied ${label}`))
      .catch(() => toast.error('Copy failed'));
  };

  const filterPlans = (plans: NetbayPlan[] = []) => {
    if (!search.trim()) return plans;
    const q = search.trim().toLowerCase();
    return plans.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.id || '').toLowerCase().includes(q) ||
      String(p.osCategory || '').toLowerCase().includes(q),
    );
  };

  const filterOs = (os: NetbayOs[] = []) => {
    if (!search.trim()) return os;
    const q = search.trim().toLowerCase();
    return os.filter(o =>
      String(o.name || '').toLowerCase().includes(q) ||
      String(o.id || '').toLowerCase().includes(q) ||
      String(o.category || '').toLowerCase().includes(q),
    );
  };

  const plans = filterPlans(data?.plans || []);
  const os = filterOs(data?.os || []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href="/admin/companies">
              <ArrowLeft className="h-4 w-4" />
              Companies
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-amber-500" />
              Netbay Catalog
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Plan IDs and OS template names — copy these into your IP Stock
              configuration in <Link href="/admin/manageIpStock" className="text-blue-600 hover:underline">/admin/manageIpStock</Link>.
            </p>
            {data?.baseUrl && (
              <p className="text-xs text-muted-foreground mt-1">
                Source: <code>{data.baseUrl}</code>{data.label ? ` — ${data.label}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by name / id / category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-[280px]"
            />
          </div>
          <Button onClick={fetchCatalog} variant="outline" size="sm" className="gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-600 font-medium">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Make sure Netbay API is enabled for this company in /admin/companies and that the API key + secret are valid.
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Plans
                <Badge variant="outline">{plans.length}{search ? ` of ${data.plans?.length || 0}` : ''}</Badge>
              </CardTitle>
              {data.plansError && (
                <span className="text-xs text-red-600">{data.plansError}</span>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {plans.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No plans match your filter.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>OS Category</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>RAM</TableHead>
                      <TableHead className="text-right">Copy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.id}</code>
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          {p.osCategory ? (
                            <Badge variant="secondary">{p.osCategory}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{p.cpuCores ? `${p.cpuCores} vCPU` : '—'}</TableCell>
                        <TableCell>{p.ramGb ? `${p.ramGb} GB` : '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5"
                            onClick={() => copyToClipboard(p.id, 'plan ID')}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            ID
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                OS Templates
                <Badge variant="outline">{os.length}{search ? ` of ${data.os?.length || 0}` : ''}</Badge>
              </CardTitle>
              {data.osError && (
                <span className="text-xs text-red-600">{data.osError}</span>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {os.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No OS templates match your filter.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>OS ID (reference)</TableHead>
                      <TableHead className="text-right">Copy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {os.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>
                          {o.category ? <Badge variant="secondary">{o.category}</Badge> : '—'}
                        </TableCell>
                        <TableCell>{o.storageGb ? `${o.storageGb} GB` : '—'}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{o.id}</code>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5"
                            onClick={() => copyToClipboard(o.name, 'OS name')}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Name
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How to use these values</p>
            <ul className="space-y-1 list-disc pl-4">
              <li>
                Copy the <strong>Plan ID</strong> for each RAM tier you sell and paste it into the
                {' '}<strong>Netbay Plan ID</strong> field for that memory option in your IP Stock
                (under <Link href="/admin/manageIpStock" className="text-blue-600 hover:underline">/admin/manageIpStock</Link>).
              </li>
              <li>
                The OS template <strong>Name</strong> is what Netbay's purchase / rebuild endpoints expect
                (e.g. <code>Ubuntu 22.04</code>). The auto-provisioner picks Ubuntu for Linux products and
                Windows Server 2022 for Windows products by default — use the Default OS overrides on the
                IP Stock if you need different defaults.
              </li>
              <li>
                <strong>Group Tag</strong> (location filter, e.g. <code>103.157</code>) goes on the IP Stock
                itself, not per-RAM. It's optional — leave blank to let Netbay pick any available IP.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
