import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free Proxy IP Checker | Test Proxy on Google, IRCTC & More | OceanLinux',
  description:
    'Check if your HTTP proxy is working on Google, IRCTC, YouTube, Amazon and more. Paste ip:port:username:password and test multiple websites instantly.',
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
    description: 'Test your proxy on Google, IRCTC, YouTube and other sites in one click.',
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
