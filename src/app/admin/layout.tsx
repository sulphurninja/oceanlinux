'use client'

import AdminSidebar from '@/components/component/adminsidebar'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type Props = { children: React.ReactNode }

export default function Layout({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/admin/login';
  const [role, setRole] = useState<string | null>(null);
  const [gateChecked, setGateChecked] = useState(isLoginPage);

  useEffect(() => {
    document.documentElement.classList.add('premium-dashboard-active');
    return () => {
      document.documentElement.classList.remove('premium-dashboard-active');
    };
  }, []);

  useEffect(() => {
    if (isLoginPage) return;

    let cancelled = false;

    const verifyAccess = async () => {
      try {
        const gateRes = await fetch('/api/admin/gate', { credentials: 'include' });
        const gateData = await gateRes.json();
        if (cancelled) return;

        if (!gateData.authenticated) {
          const returnUrl = encodeURIComponent(pathname || '/admin/dashboard');
          router.replace(`/admin/login?returnUrl=${returnUrl}`);
          return;
        }

        const response = await fetch('/api/users/me', { credentials: 'include' });
        const data = await response.json();
        if (!cancelled) {
          setRole(data?.role || '');
          setGateChecked(true);
        }
      } catch {
        if (!cancelled) {
          setRole('');
          setGateChecked(true);
        }
      }
    };

    verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) {
    return <div className="premium-dashboard min-h-screen">{children}</div>;
  }

  if (!gateChecked || role === null) {
    return (
      <div className="premium-dashboard min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="premium-dashboard min-h-screen overflow-x-hidden">
      {role === 'Admin' ? (
        <div className="flex min-h-screen">
          <AdminSidebar />
          <main className="flex-1 min-w-0 w-full lg:pl-72">
            <div className="pt-16 lg:pt-0 w-full min-w-0 overflow-x-hidden">
              {children}
            </div>
          </main>
        </div>
      ) : (
        <div className="premium-dashboard min-h-screen flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">Access Denied</h1>
            <p className="text-muted-foreground">You're not authorized to access the Admin Panel</p>
          </div>
        </div>
      )}
    </div>
  )
}
