'use client';

import { ReactNode } from 'react';
import { SessionAlertProvider } from '@/components/session-alert';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionAlertProvider>
      {children}
    </SessionAlertProvider>
  );
}
