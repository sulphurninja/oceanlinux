'use client'

import AdminSidebar from '@/components/component/adminsidebar'
import React, { useEffect, useState } from 'react'

type Props = { children: React.ReactNode }

export default function Layout({ children }: Props) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const response = await fetch('/api/users/me');
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
        <div className="flex h-screen overflow-hidden">
          <AdminSidebar />
          <main className="flex-1 overflow-auto">
            <div className="h-full">
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
