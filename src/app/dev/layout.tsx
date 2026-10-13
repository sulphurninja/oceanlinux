'use client';

import { useEffect } from 'react';

export default function DevLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('premium-dashboard-active');
    return () => {
      document.documentElement.classList.remove('premium-dashboard-active');
    };
  }, []);

  return <div className="premium-dashboard min-h-screen">{children}</div>;
}
