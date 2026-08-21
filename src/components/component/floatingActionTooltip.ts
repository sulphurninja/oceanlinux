import { cn } from '@/lib/utils';

/** Hover label for floating WhatsApp / support buttons — avoids `.text-white` (broken in dashboard light mode). */
export function floatingActionTooltip(visible: boolean) {
  return cn(
    'absolute bottom-16 right-0 z-10 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg shadow-lg',
    'transition-all duration-200 transform whitespace-nowrap border',
    'bg-popover text-popover-foreground border-border shadow-black/10',
    'dark:bg-slate-900 dark:text-slate-50 dark:border-slate-700 dark:shadow-black/30',
    "before:content-[''] before:absolute before:top-full before:right-4 before:border-4 before:border-transparent",
    'before:border-t-[hsl(var(--popover))] dark:before:border-t-slate-900',
    visible
      ? 'opacity-100 translate-y-0 pointer-events-auto'
      : 'opacity-0 translate-y-2 pointer-events-none',
  );
}
