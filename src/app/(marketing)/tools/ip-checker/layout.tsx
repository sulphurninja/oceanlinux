import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dedicated IP Checker | OceanLinux',
  description: 'Test dedicated proxies with a 3-point check: outgoing IP tunnel, web gateway, and mobile API.',
};

export default function IpCheckerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
