'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cloud, Loader2, RefreshCw, Save, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ResellerZonePicker,
  type PanelZoneOption,
} from '@/components/admin/ResellerZonePicker';

export interface CompanyStockZoneRow {
  _id: string;
  name: string;
  serverType: string;
  resellerZones?: {
    configured?: boolean;
    zoneId?: number | null;
    zoneIds?: number[];
    zoneName?: string | null;
  };
}

type Props = {
  stocks: CompanyStockZoneRow[];
  resellerLabel: string;
  hasLiveStockSync: boolean;
  onStockUpdated: (stock: CompanyStockZoneRow) => void;
};

export default function CompanyPanelZonesTab({
  stocks,
  resellerLabel,
  hasLiveStockSync,
  onStockUpdated,
}: Props) {
  const [selectedStockId, setSelectedStockId] = useState('');
  const [panelZones, setPanelZones] = useState<PanelZoneOption[]>([]);
  const [zoneIdsDraft, setZoneIdsDraft] = useState<number[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedStock = useMemo(
    () => stocks.find((s) => s._id === selectedStockId) || null,
    [stocks, selectedStockId],
  );

  useEffect(() => {
    if (!selectedStockId && stocks.length > 0) {
      setSelectedStockId(stocks[0]._id);
    }
  }, [stocks, selectedStockId]);

  useEffect(() => {
    if (!selectedStock) {
      setZoneIdsDraft([]);
      return;
    }
    setZoneIdsDraft(selectedStock.resellerZones?.zoneIds || []);
  }, [selectedStock?._id, selectedStock?.resellerZones?.zoneIds?.join(',')]);

  useEffect(() => {
    if (!panelZones.length || zoneIdsDraft.length === 0) return;
    const valid = new Set(panelZones.map((z) => Number(z.id)));
    const filtered = zoneIdsDraft.filter((id) => valid.has(Number(id)));
    if (filtered.length !== zoneIdsDraft.length) {
      const removed = zoneIdsDraft.filter((id) => !valid.has(Number(id)));
      setZoneIdsDraft(filtered);
      toast.warning(
        `Purane region ID panel par nahi: ${removed.join(', ')}. Sahi region select karke Save regions dabao.`,
      );
    }
  }, [panelZones, zoneIdsDraft.length, selectedStock?._id]);

  const fetchPanelZones = async (silent = false) => {
    setZonesLoading(true);
    try {
      const res = await fetch('/api/company/reseller-zones', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load regions');
      setPanelZones(Array.isArray(data.zones) ? data.zones : []);
      if (!silent) toast.success(`${data.zones?.length || 0} region(s) loaded`);
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Region fetch failed');
      setPanelZones([]);
    } finally {
      setZonesLoading(false);
    }
  };

  useEffect(() => {
    if (stocks.length > 0) {
      void fetchPanelZones(true);
    }
  }, [stocks.length]);

  const saveZones = async () => {
    if (!selectedStockId) return;
    if (zoneIdsDraft.length === 0) {
      toast.error('Pehle kam se kam 1 region select karo');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setResellerZones',
          stockId: selectedStockId,
          zoneIds: zoneIdsDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      if (data.stock) onStockUpdated(data.stock);
      if (Array.isArray(data.removedStaleZoneIds) && data.removedStaleZoneIds.length) {
        toast.warning(`Purane region ID save se hata diye: ${data.removedStaleZoneIds.join(', ')}`);
      }
      toast.success('Panel regions saved — ab is plan par API se buy hoga');
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (stocks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No IP stocks assigned yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-sky-200/60 dark:border-sky-900/40">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="h-4 w-4 text-sky-600" />
              Panel regions ({resellerLabel})
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              IP stock choose karo, panel se region select karo, save karo — manageIpStock me search karne ki zaroorat nahi.
              {hasLiveStockSync ? ' Live stock bhi sync ho jayega.' : ''}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={zonesLoading}
            onClick={() => void fetchPanelZones(false)}
          >
            {zonesLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync regions
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label className="text-sm">IP Stock</Label>
            <Select value={selectedStockId} onValueChange={setSelectedStockId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select IP stock" />
              </SelectTrigger>
              <SelectContent>
                {stocks.map((stock) => (
                  <SelectItem key={stock._id} value={stock._id}>
                    <span className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 opacity-60" />
                      {stock.name}
                      {stock.resellerZones?.configured && stock.resellerZones.zoneName ? (
                        <span className="text-muted-foreground">
                          · {stock.resellerZones.zoneName}
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStock?.resellerZones?.configured ? (
            <Badge variant="outline" className="text-xs h-7 px-2.5 self-start sm:self-auto">
              Zone set: {selectedStock.resellerZones.zoneName || `ID ${selectedStock.resellerZones.zoneId}`}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs h-7 px-2.5 self-start sm:self-auto">
              Zone not set
            </Badge>
          )}
        </div>

        <div className="rounded-lg border border-sky-200/50 dark:border-sky-900/40 bg-sky-50/40 dark:bg-sky-950/10 p-4">
          <ResellerZonePicker
            zones={panelZones}
            zoneIds={zoneIdsDraft}
            onChange={setZoneIdsDraft}
            loading={zonesLoading}
            disabled={zonesLoading || panelZones.length === 0}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            className={cn('gap-2', 'bg-sky-600 hover:bg-sky-700')}
            disabled={saving || !selectedStockId || zoneIdsDraft.length === 0}
            onClick={() => void saveZones()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save regions for this stock
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
