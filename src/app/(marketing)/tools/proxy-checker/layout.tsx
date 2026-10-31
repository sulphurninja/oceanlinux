import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free Proxy IP Checker | IRCTC Proxy Test | OceanLinux',
  description:
    'Check if your proxy opens IRCTC. Paste one ip:port:username:password or a list and see working or dead.',
  keywords: [
    'proxy checker',
    'ip checker',
    'proxy test',
    'irctc proxy check',
    'http proxy checker',
    'proxy working test',
    'oceanlinux tools',
  ],
  openGraph: {
    title: 'Free Proxy IP Checker | OceanLinux',
    description: 'Test your proxy on IRCTC. Paste one proxy or a list.',
    url: 'https://oceanlinux.com/tools/proxy-checker',
    siteName: 'OceanLinux',
  },
  alternates: {
    canonical: 'https://oceanlinux.com/tools/proxy-checker',
  },
};

export default function ProxyCheckerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
