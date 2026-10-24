'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function inspectAllowed(pathname: string) {
  return pathname.startsWith('/admin') || pathname.startsWith('/company');
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
}

function makeProbeData() {
  const row: Record<string, string> = {};
  for (let i = 0; i < 500; i++) row[String(i)] = String(i);
  return Array.from({ length: 50 }, () => row);
}

/**
 * console.table takes well under 1ms with DevTools closed and 60ms+ when open,
 * so require a large absolute time, not only a ratio (sub-ms timings are noise).
 */
function createDevtoolsProbe() {
  const data = makeProbeData();
  return () => {
    const t0 = performance.now();
    console.table(data);
    const tableTime = performance.now() - t0;
    const t1 = performance.now();
    console.log(data);
    const logTime = performance.now() - t1;
    console.clear();
    return tableTime > 20 && tableTime > logTime * 10;
  };
}

function leavePage() {
  window.location.replace('about:blank');
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

    let timer: number | undefined;
    if (!isTouchDevice()) {
      const probe = createDevtoolsProbe();
      let hits = 0;
      const check = () => {
        hits = probe() ? hits + 1 : 0;
        // Two hits in a row so one slow frame never kicks a real customer out.
        if (hits >= 2) leavePage();
      };
      check();
      timer = window.setInterval(check, 1000);
    }

    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown', blockKeys, true);
      if (timer) window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}
