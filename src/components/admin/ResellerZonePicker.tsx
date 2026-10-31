'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildResellerZoneConfig } from '@/lib/resellerZoneConfig';

export type PanelZoneOption = {
  id: number;
  name: string;
  status: string;
  live: boolean;
};

export { buildResellerZoneConfig };

function moveZoneId(zoneIds: number[], index: number, direction: -1 | 1) {
  const next = [...zoneIds];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

type ResellerZonePickerProps = {
  zones: PanelZoneOption[];
  zoneIds: number[];
  onChange: (zoneIds: number[]) => void;
  disabled?: boolean;
  loading?: boolean;
};

export function ResellerZonePicker({
  zones,
  zoneIds,
  onChange,
  disabled = false,
  loading = false,
}: ResellerZonePickerProps) {
  const panelIdSet = new Set(zones.map((z) => Number(z.id)));
  const orphanIds = zoneIds.filter((id) => !panelIdSet.has(Number(id)));

  const toggleZone = (zoneId: number, checked: boolean) => {
    if (checked) {
      if (zoneIds.includes(zoneId)) return;
      onChange([...zoneIds, zoneId]);
      return;
    }
    onChange(zoneIds.filter((id) => id !== zoneId));
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground py-2">Loading regions…</p>;
  }

  if (zones.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Pehle Sync regions dabao.</p>;
  }

  return (
    <div className="space-y-2">
      {orphanIds.length > 0 && (
        <div className="rounded-md border border-amber-300/80 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <p className="font-medium">Purane region ID panel par nahi milte: {orphanIds.join(', ')}</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
            Inhe list me tick nahi kar sakte, lekin Priority 1 ban kar stock out kar dete hain. Hatao, phir sahi region
            select karke Save karo.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs"
            disabled={disabled}
            onClick={() => onChange(zoneIds.filter((id) => panelIdSet.has(Number(id))))}
          >
            Invalid regions hatao
          </Button>
        </div>
      )}
      <Label className="text-sm">Regions (priority 1 pehle — inactive ho to agla selected try hoga)</Label>
      <div className="rounded-md border divide-y max-h-[280px] overflow-y-auto bg-background/80">
        {zones.map((zone) => {
          const zoneId = Number(zone.id);
          const orderIndex = zoneIds.findIndex((id) => id === zoneId);
          const checked = orderIndex >= 0;

          return (
            <div
              key={zone.id}
              className={cn(
                'flex items-start gap-3 px-3 py-2.5',
                checked && 'bg-sky-500/5'
              )}
            >
              <Checkbox
                id={`zone-${zone.id}`}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => toggleZone(zoneId, value === true)}
                className="mt-0.5"
              />
              <label htmlFor={`zone-${zone.id}`} className="flex-1 min-w-0 cursor-pointer">
                <span className="font-mono text-xs">ID {zone.id}</span>
                {' — '}
                {zone.name}{' '}
                <span className={zone.live ? 'text-emerald-600' : 'text-red-500'}>
                  ({zone.live ? 'Available' : zone.status || 'Unavailable'})
                </span>
                {checked && (
                  <span className="ml-2 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                    Priority {orderIndex + 1}
                    {orderIndex === 0 ? ' · primary' : orderIndex === 1 ? ' · fallback 1' : ` · fallback ${orderIndex}`}
                  </span>
                )}
              </label>
              {checked && (
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={disabled || orderIndex === 0}
                    onClick={() => onChange(moveZoneId(zoneIds, orderIndex, -1))}
                    title="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={disabled || orderIndex === zoneIds.length - 1}
                    onClick={() => onChange(moveZoneId(zoneIds, orderIndex, 1))}
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {zoneIds.length > 0 && (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Selected {zoneIds.length} region{zoneIds.length === 1 ? '' : 's'}:{' '}
          {zoneIds
            .map((id, idx) => {
              const zone = zones.find((z) => Number(z.id) === Number(id));
              return `#${idx + 1} ID ${id}${zone?.name ? ` (${zone.name})` : ''}`;
            })
            .join(' → ')}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Store in stock tab dikhega jab koi bhi selected region panel par live ho. Order pehle Priority 1 par banega;
        wahan inactive / fail ho to sirf aapke select kiye 2, 3… region par try hoga — panel ke random zone par nahi.
        Alag subnet wale regions ek hi product par mat jodo (galat IP range ka risk).
      </p>
    </div>
  );
}
