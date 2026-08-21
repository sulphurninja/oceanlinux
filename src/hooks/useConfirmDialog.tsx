'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConfirmDialogOptions = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

const DEFAULT_OPTIONS: ConfirmDialogOptions = {
  title: '',
  description: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  destructive: false,
};

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions>(DEFAULT_OPTIONS);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions({
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        destructive: false,
        ...opts,
      });
      setOpen(true);
    });
  }, []);

  const finish = (value: boolean) => {
    setOpen(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  };

  const ConfirmDialog = () => (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(false);
      }}
    >
      <AlertDialogContent className="premium-dashboard-alert sm:max-w-md rounded-2xl p-0 gap-0 overflow-hidden">
        <div className="h-0.5 w-full shrink-0 bg-gradient-to-r from-emerald-600/80 via-emerald-400 to-emerald-500/60" />
        <AlertDialogHeader className="premium-dashboard-dialog-header text-left">
          <AlertDialogTitle className="flex items-center gap-2 text-white text-lg">
            {options.destructive && <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />}
            {options.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-white/55 leading-relaxed">{options.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="premium-dashboard-dialog-footer flex-col-reverse sm:flex-row gap-2.5 sm:gap-3">
          <AlertDialogCancel
            onClick={() => finish(false)}
            className="premium-btn-outline h-10 sm:h-9 w-full sm:w-auto mt-0 border-white/12 bg-white/[0.04] text-white/70 hover:text-white"
          >
            {options.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              'h-10 sm:h-9 w-full sm:w-auto rounded-xl border-0 font-semibold',
              options.destructive
                ? 'bg-red-500/90 text-white hover:bg-red-500'
                : 'premium-btn-primary border-0 shadow-none'
            )}
            onClick={() => finish(true)}
          >
            {options.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
