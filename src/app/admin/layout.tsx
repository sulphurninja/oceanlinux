'use client'

import AdminSidebar from '@/components/component/adminsidebar'
import React, { useEffect, useState } from 'react'

type Props = { children: React.ReactNode }

export default function Layout({ children }: Props) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const response = await fetch('/api/users/me', {
          credentials: 'include'
        });
        const data = await response.json();
        setRole(data?.role || '');
      } catch {
        setRole('');
      }
    };
    fetchMe();
  }, []);

  if (role === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {role === 'Admin' ? (
        <div className="flex min-h-screen">
          <AdminSidebar />
          <main className="flex-1 lg:pl-80">
            <div className="lg:hidden pt-16"> {/* Add padding top for mobile header */}
              {children}
            </div>
            <div className="hidden lg:block">
              {children}
            </div>
          </main>
        </div>
      ) : (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">Access Denied</h1>
            <p className="text-muted-foreground">You're not authorized to access the Admin Panel</p>
          </div>
        </div>
      )}
    </div>
  )
}
