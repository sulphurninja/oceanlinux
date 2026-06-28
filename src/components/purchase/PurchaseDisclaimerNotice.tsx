'use client';

import { Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export const PURCHASE_DISCLAIMER_TEXT =
  'Important: You are purchasing at your own discretion. OceanLinux does not guarantee that any IP, proxy, VPS, or server will remain unblocked, whitelisted, or unrestricted on third-party websites, apps, or platforms. We are not responsible for IP blocks, blacklisting, or access limits imposed by external services.';

export const PURCHASE_DISCLAIMER_INLINE =
  'I purchase at my own discretion. OceanLinux does not guarantee IPs, proxies, or servers stay unblocked on third-party platforms.';

type PurchaseDisclaimerNoticeProps = {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  requireAcceptance?: boolean;
  /** Single-row footer layout — no long paragraph, fits all screen sizes */
  compact?: boolean;
};

export function PurchaseDisclaimerNotice({
  className,
  checked = false,
  onCheckedChange,
  requireAcceptance = true,
  compact = false,
}: PurchaseDisclaimerNoticeProps) {
  if (compact) {
    return (
      <label
        className={cn(
          'group flex items-start gap-2.5 cursor-pointer rounded-lg border-2 p-2.5 sm:p-3 transition-colors touch-manipulation w-full min-w-0',
          checked
            ? 'border-emerald-500/50 bg-emerald-500/10'
            : 'border-amber-500/70 bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-400/25',
          className
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange?.(value === true)}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            checked
              ? 'border-emerald-600 bg-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600'
              : 'border-2 border-amber-600 bg-white dark:bg-amber-950'
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          {checked ? (
            <p className="text-[11px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5 shrink-0" />
              Accepted — you can pay now
            </p>
          ) : (
            <p className="text-[11px] sm:text-xs font-semibold text-amber-800 dark:text-amber-200">
              Required: tap to accept before payment
            </p>
          )}
          <p className="text-[10px] sm:text-[11px] leading-snug text-amber-950/90 dark:text-amber-50/85">
            {PURCHASE_DISCLAIMER_INLINE}
          </p>
          <details className="text-[10px] text-amber-800/80 dark:text-amber-100/70">
            <summary className="cursor-pointer select-none underline-offset-2 hover:underline">
              Read full notice
            </summary>
            <p className="mt-1 leading-snug">{PURCHASE_DISCLAIMER_TEXT}</p>
          </details>
        </div>
      </label>
    );
  }

  return (
    <div className={cn('rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 sm:p-4 space-y-3', className)}>
      <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-50 leading-relaxed">
        {PURCHASE_DISCLAIMER_TEXT}
      </p>
      {requireAcceptance && onCheckedChange && (
        <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border-2 border-amber-500/50 p-3">
          <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
          <span className="text-xs sm:text-sm">{PURCHASE_DISCLAIMER_INLINE}</span>
        </label>
      )}
    </div>
  );
}
