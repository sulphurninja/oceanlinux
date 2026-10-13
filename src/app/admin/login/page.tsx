'use client';

import { Suspense } from 'react';
import AdminLoginForm from './AdminLoginForm';

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="premium-dashboard min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading…</div>
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
