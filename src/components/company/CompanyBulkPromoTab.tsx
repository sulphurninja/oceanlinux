'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Save, Search, Server, Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CompanyStockPromoRow {
  _id: string;
  name: string;
  serverType: string;
  promoCodes?: Array<{
    code: string;
    discount: number;
    discountType?: 'percentage' | 'fixed';
    isActive?: boolean;
  }>;
}

type PromoDraft = {
  id: string;
  code: string;
  discount: string;
  discountType: 'fixed' | 'percentage';
};

type Props = {
  stocks: CompanyStockPromoRow[];
  onStocksUpdated: (stocks: CompanyStockPromoRow[]) => void;
};

const MAX_PROMO_ROWS = 8;

function newPromoRow(): PromoDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: '',
    discount: '',
    discountType: 'fixed',
  };
}

function parsePromoRows(rows: PromoDraft[]) {
  const promos: Array<{ code: string; discount: number; discountType: 'fixed' | 'percentage' }> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (!code) continue;

    const discount = parseFloat(row.discount);
    if (!Number.isFinite(discount) || discount < 0) {
      return { error: `Invalid discount for ${code || 'promo'}` as const, promos: [] };
    }
    if (row.discountType === 'percentage' && discount > 100) {
      return { error: `${code}: percentage 100 se zyada nahi ho sakta` as const, promos: [] };
    }
    if (seen.has(code)) {
      return { error: `Duplicate code: ${code}` as const, promos: [] };
    }

    seen.add(code);
    promos.push({ code, discount, discountType: row.discountType });
  }

  return { error: null as string | null, promos };
}

export default function CompanyBulkPromoTab({ stocks, onStocksUpdated }: Props) {
  const [promoRows, setPromoRows] = useState<PromoDraft[]>([
    newPromoRow(),
    newPromoRow(),
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredStocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stocks;
    return stocks.filter((s) => s.name.toLowerCase().includes(q));
  }, [stocks, search]);

  const filledPromoCount = promoRows.filter((r) => r.code.trim() && r.discount.trim()).length;

  const allFilteredSelected =
    filteredStocks.length > 0 && filteredStocks.every((s) => selectedIds.has(s._id));

  const toggleStock = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const stock of filteredStocks) {
        if (checked) next.add(stock._id);
        else next.delete(stock._id);
      }
      return next;
    });
  };

  const updatePromoRow = (id: string, patch: Partial<PromoDraft>) => {
    setPromoRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addPromoRow = () => {
    if (promoRows.length >= MAX_PROMO_ROWS) {
      toast.error(`Maximum ${MAX_PROMO_ROWS} promos ek saath`);
      return;
    }
    setPromoRows((prev) => [...prev, newPromoRow()]);
  };

  const removePromoRow = (id: string) => {
    setPromoRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const applyPromos = async () => {
    const { error, promos } = parsePromoRows(promoRows);
    if (error) {
      toast.error(error);
      return;
    }
    if (promos.length === 0) {
      toast.error('Kam se kam 1 promo bharo');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Kam se kam 1 IP stock select karo');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/company/stocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulkApplyPromo',
          stockIds: Array.from(selectedIds),
          promos: promos.map((p) => ({ ...p, isActive: true })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');

      if (Array.isArray(data.stocks)) {
        onStocksUpdated(data.stocks);
      }
      toast.success(data.message || `${promos.length} promo selected stocks par lag gaye`);
    } catch (err: any) {
      toast.error(err.message || 'Apply failed');
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
    <Card className="border-violet-200/60 dark:border-violet-900/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4 text-violet-600" />
          Bulk promo apply
        </CardTitle>
        <CardDescription className="max-w-2xl">
          3–4 promo ek saath banao (OCEAN50, WELCOME10, …), stocks select karo — har stock par wahi saare promos lag
          jayenge. Purane promos replace ho jayenge is list se.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Promo list ({filledPromoCount} filled)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={promoRows.length >= MAX_PROMO_ROWS}
              onClick={addPromoRow}
            >
              <Plus className="h-3.5 w-3.5" />
              Add promo
            </Button>
          </div>

          <div className="space-y-2">
            {promoRows.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] items-end rounded-lg border bg-muted/20 p-3"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Promo {index + 1}</Label>
                  <Input
                    value={row.code}
                    onChange={(e) => updatePromoRow(row.id, { code: e.target.value.toUpperCase() })}
                    placeholder="e.g. OCEAN50"
                    className="font-mono uppercase h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Discount</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.discount}
                    onChange={(e) => updatePromoRow(row.id, { discount: e.target.value })}
                    placeholder={row.discountType === 'fixed' ? '50' : '10'}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select
                    value={row.discountType}
                    onValueChange={(v) => updatePromoRow(row.id, { discountType: v as 'fixed' | 'percentage' })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed (₹)</SelectItem>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={promoRows.length <= 1}
                  onClick={() => removePromoRow(row.id)}
                  title="Remove row"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-promo-stocks"
                checked={allFilteredSelected}
                onCheckedChange={(v) => toggleSelectAllFiltered(v === true)}
              />
              <Label htmlFor="select-all-promo-stocks" className="text-sm cursor-pointer">
                Select all {search.trim() ? 'filtered' : ''} ({filteredStocks.length})
              </Label>
              {selectedIds.size > 0 ? (
                <Badge variant="secondary" className="text-xs">
                  {selectedIds.size} selected
                </Badge>
              ) : null}
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search IP stock..."
                className="pl-8 h-9"
              />
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto space-y-1 pr-1">
            {filteredStocks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No stocks match search.</p>
            ) : (
              filteredStocks.map((stock) => {
                const checked = selectedIds.has(stock._id);
                const activePromos = (stock.promoCodes || []).filter((p) => p.isActive !== false);
                return (
                  <label
                    key={stock._id}
                    className={cn(
                      'flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                      checked ? 'border-violet-400/50 bg-violet-50/50 dark:bg-violet-950/20' : 'hover:bg-muted/50',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleStock(stock._id, v === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Server className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="text-sm font-medium truncate">{stock.name}</span>
                        <Badge variant="outline" className="text-[10px] h-5">
                          {stock.serverType}
                        </Badge>
                      </div>
                      {activePromos.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {activePromos.map((p) => (
                            <Badge key={p.code} variant="secondary" className="text-[10px] h-5 font-mono">
                              {p.code}
                              {p.discountType === 'percentage' ? (
                                <span className="ml-1 opacity-70">{p.discount}%</span>
                              ) : (
                                <span className="ml-1 opacity-70">₹{p.discount}</span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">No promo yet</p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            className={cn('gap-2', 'bg-violet-600 hover:bg-violet-700')}
            disabled={saving || selectedIds.size === 0 || filledPromoCount === 0}
            onClick={() => void applyPromos()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Apply {filledPromoCount || 0} promo(s) to {selectedIds.size || 0} stock
            {selectedIds.size === 1 ? '' : 's'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
