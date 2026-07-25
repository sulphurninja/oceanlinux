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
import { ArrowLeft, Copy, Globe, Loader2, RefreshCw, Search } from 'lucide-react';

interface KurohostZone {
  id: string;
  name?: string;
  slug?: string;
  status?: string;
}

interface KurohostFlavor {
  id: string;
  name?: string;
  vcpus?: number;
  memoryMb?: number;
  diskGb?: number;
}

interface KurohostOsTemplate {
  id: string;
  name?: string;
  isWindows?: boolean;
}

interface CatalogResponse {
  success?: boolean;
  baseUrl?: string;
  label?: string;
  zones?: KurohostZone[];
  flavors?: KurohostFlavor[];
  osTemplates?: KurohostOsTemplate[];
  zonesError?: string | null;
  flavorsError?: string | null;
  osError?: string | null;
  error?: string;
}

export default function KurohostCatalogPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');

  const fetchCatalog = async (cloudZoneId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = cloudZoneId ? `?cloudZoneId=${encodeURIComponent(cloudZoneId)}` : '';
      const res = await fetch(`/api/admin/companies/${id}/kurohost-catalog${qs}`);
      const body = await res.json();
      if (!res.ok || body.error) {
        setError(body.error || 'Failed to load KuroHost catalog');
        setData(null);
      } else {
        setData(body);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCatalog(zoneFilter || undefined); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value)
      .then(() => toast.success(`Copied ${label}`))
      .catch(() => toast.error('Copy failed'));
  };

  const filterRows = <T extends { id?: string; name?: string }>(rows: T[] = []) => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      String(r.id || '').toLowerCase().includes(q) ||
      String(r.name || '').toLowerCase().includes(q)
    );
  };

  const zones = filterRows(data?.zones);
  const flavors = filterRows(data?.flavors);
  const osTemplates = filterRows(data?.osTemplates);

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/companies">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Companies
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-violet-600" />
          <h1 className="text-xl font-semibold">KuroHost Catalog</h1>
        </div>
        {data?.label && <Badge variant="outline">{data.label}</Badge>}
        <Button variant="outline" size="sm" onClick={() => fetchCatalog(zoneFilter || undefined)} disabled={loading} className="gap-2 ml-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {!error && data && (
        <>
          <p className="text-sm text-muted-foreground">
            Base URL: <code>{data.baseUrl}</code> — copy IDs into /admin/manageIpStock KuroHost section.
          </p>

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Input
              placeholder="Zone ID (reload OS templates)"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="max-w-xs font-mono text-xs"
            />
            <Button variant="secondary" size="sm" onClick={() => fetchCatalog(zoneFilter || undefined)}>
              Load OS for zone
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Zones ({zones.length})</CardTitle>
              {data.zonesError && <p className="text-xs text-red-600">{data.zonesError}</p>}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map((z) => (
                    <TableRow key={z.id}>
                      <TableCell className="font-mono text-xs">{z.id}</TableCell>
                      <TableCell>{z.name || z.slug || '—'}</TableCell>
                      <TableCell>{z.status || '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(z.id, 'zone ID')}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!zones.length && !loading && (
                    <TableRow><TableCell colSpan={4} className="text-muted-foreground text-sm">No zones</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Flavors ({flavors.length})</CardTitle>
              {data.flavorsError && <p className="text-xs text-red-600">{data.flavorsError}</p>}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>vCPU</TableHead>
                    <TableHead>RAM</TableHead>
                    <TableHead>Disk</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flavors.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.id}</TableCell>
                      <TableCell>{f.name || '—'}</TableCell>
                      <TableCell>{f.vcpus ?? '—'}</TableCell>
                      <TableCell>{f.memoryMb ? `${Math.round(f.memoryMb / 1024)} GB` : '—'}</TableCell>
                      <TableCell>{f.diskGb ? `${f.diskGb} GB` : '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(f.id, 'flavor ID')}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!flavors.length && !loading && (
                    <TableRow><TableCell colSpan={6} className="text-muted-foreground text-sm">No flavors</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">OS Templates ({osTemplates.length})</CardTitle>
              {data.osError && <p className="text-xs text-red-600">{data.osError}</p>}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Windows</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {osTemplates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.id}</TableCell>
                      <TableCell>{t.name || '—'}</TableCell>
                      <TableCell>{t.isWindows ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(t.id, 'OS template ID')}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!osTemplates.length && !loading && (
                    <TableRow><TableCell colSpan={4} className="text-muted-foreground text-sm">No OS templates</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
