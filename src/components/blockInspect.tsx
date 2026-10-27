'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function inspectAllowed(pathname: string) {
  return pathname.startsWith('/admin') || pathname.startsWith('/company');
}

export default function BlockInspect() {
  const pathname = usePathname() || '';

  useEffect(() => {
    if (inspectAllowed(pathname)) return;

    const blockContext = (event: Event) => {
      event.preventDefault();
    };

    const blockKeys = (event: KeyboardEvent) => {
      const key = String(event.key || '').toLowerCase();
      const shift = event.shiftKey;
      const alt = event.altKey;
      const ctrl = event.ctrlKey || event.metaKey;
      const devtoolsKey = key === 'i' || key === 'j' || key === 'c' || key === 'k';
      const blocked =
        key === 'f12' ||
        (ctrl && (shift || alt) && devtoolsKey) ||
        (ctrl && (key === 'u' || key === 's'));
      if (!blocked) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('contextmenu', blockContext);
    document.addEventListener('keydown', blockKeys, true);

    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown', blockKeys, true);
    };
  }, [pathname]);

  return null;
}
