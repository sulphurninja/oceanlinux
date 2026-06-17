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
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {options.destructive && <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />}
            {options.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{options.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>
            {options.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              options.destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
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
