'use client';

import { Computer } from 'lucide-react';
import { cn } from '@/lib/utils';

export function isWindowsOsName(name: string): boolean {
  const t = (name || '').toLowerCase().replace(/[_\s]+/g, '-');
  return (
    t.includes('windows') ||
    t.includes('win-server') ||
    t.includes('window20') ||
    t.includes('primevm-win') ||
    t.includes('primevm_win') ||
    /\bwin-?\d{2}\b/.test(t) ||
    /\bwin-\d/.test(t) ||
    /[_-]win\d{2}\b/.test(t) ||
    t.includes('rdp')
  );
}

export function isUbuntuOsName(name: string): boolean {
  const t = (name || '').toLowerCase();
  return t.includes('ubuntu') || t.includes('primevm-ubuntu') || t.includes('primevm_ubuntu');
}

export function isCentosOsName(name: string): boolean {
  const t = (name || '').toLowerCase();
  return t.includes('centos') || t.includes('rocky') || t.includes('alma');
}

const OS_LOGOS = {
  windows: '/windows.png',
  ubuntu: '/ubuntu.png',
  centos: '/centos.png',
} as const;

function BrandLogo({
  src,
  alt,
  className = 'h-8 w-8',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn(className, 'rounded-lg flex items-center justify-center shadow-sm shrink-0 overflow-hidden')}>
      <img src={src} className={cn(className, 'rounded-lg object-cover')} alt={alt} draggable={false} />
    </div>
  );
}

function pickOsHint(os?: string, productName?: string): string {
  const o = (os || '').trim();
  if (o) return o;
  return (productName || '').trim();
}

export function OsIcon({
  os,
  productName,
  className = 'h-8 w-8',
}: {
  os?: string;
  productName?: string;
  className?: string;
}) {
  const hints = [pickOsHint(os, productName), productName || ''].filter(Boolean);

  for (const hint of hints) {
    if (isUbuntuOsName(hint)) {
      return <BrandLogo src={OS_LOGOS.ubuntu} alt="Ubuntu" className={className} />;
    }
    if (isCentosOsName(hint)) {
      return <BrandLogo src={OS_LOGOS.centos} alt="CentOS" className={className} />;
    }
    if (isWindowsOsName(hint)) {
      return <BrandLogo src={OS_LOGOS.windows} alt="Windows" className={className} />;
    }
  }

  return (
    <div
      className={cn(
        className,
        'rounded-lg flex items-center justify-center bg-gray-500 text-white shadow-sm shrink-0'
      )}
    >
      <Computer className="h-5 w-5" />
    </div>
  );
}

export function humanizeOsLabel(name: unknown, productName?: string): string {
  const primary = humanizeOsLabelFromString(String(name || '').trim());
  if (primary && primary !== 'Linux') return primary;

  const fromProduct = humanizeOsLabelFromString(String(productName || '').trim());
  if (fromProduct && fromProduct !== 'Linux') return fromProduct;

  return primary || 'Linux';
}

function humanizeOsLabelFromString(name: string): string {
  if (!name) return 'Linux';

  const raw = name.toLowerCase().replace(/[_\s]+/g, '-');

  const known: Record<string, string> = {
    'win-22': 'Windows Server 2022',
    win22: 'Windows Server 2022',
    window2022: 'Windows Server 2022',
    window2025: 'Windows Server 2025',
    'win-25': 'Windows Server 2025',
    'primevm-win22': 'Windows Server 2022',
    primevm_win22: 'Windows Server 2022',
    'primevm-ubuntu22': 'Ubuntu 22.04',
    primevm_ubuntu22: 'Ubuntu 22.04',
    ubuntu22: 'Ubuntu 22.04',
    ubuntu24: 'Ubuntu 24.04',
    'ubuntu-22': 'Ubuntu 22.04',
    'ubuntu-24': 'Ubuntu 24.04',
  };
  if (known[raw]) return known[raw];

  const primeWin = raw.match(/^primevm[_-]?win(\d{2})$/);
  if (primeWin) return `Windows Server 20${primeWin[1]}`;

  const primeUbuntu = raw.match(/^primevm[_-]?ubuntu(\d{2})$/);
  if (primeUbuntu) return `Ubuntu ${primeUbuntu[1]}.04`;

  const winYear = raw.match(/^win-?(\d{2})$/);
  if (winYear) return `Windows Server 20${winYear[1]}`;

  if (isWindowsOsName(name)) return 'Windows Server';
  if (isUbuntuOsName(name)) return 'Ubuntu';
  if (isCentosOsName(name)) return 'CentOS';

  return name.trim() || 'Linux';
}
