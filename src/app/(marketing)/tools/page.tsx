import Link from 'next/link';
import { Terminal, Zap, Server, ArrowRight, Wrench, CheckCircle, Globe } from 'lucide-react';
import { Button } from "@/components/ui/button";
import type { Metadata } from 'next';
import PublicPageHero from '@/components/landing/PublicPageHero';
import Tilt3DCard from '@/components/landing/Tilt3DCard';

export const metadata: Metadata = {
  title: 'Free Linux Server Tools | OceanLinux',
  description: 'Free tools for Linux VPS management. Proxy setup, server configuration, and more. No technical knowledge required.',
  keywords: [
    'linux tools',
    'vps tools',
    'server tools',
    'proxy setup',
    'free linux tools',
    'oceanlinux tools'
  ],
  openGraph: {
    title: 'Free Linux Server Tools | OceanLinux',
    description: 'Free tools for Linux VPS management. Proxy setup, server configuration, and more.',
    url: 'https://oceanlinux.com/tools',
    siteName: 'OceanLinux',
  },
};

const tools = [
  {
    title: "Proxy Setup Tool",
    description: "One-click Squid proxy server installation on your Linux VPS. Works with Ubuntu, CentOS, Debian.",
    icon: Terminal,
    href: "/tools/proxy-setup",
    badge: "Popular",
    features: ["One-click setup", "Port 3128", "User authentication", "2-minute install"]
  },
  {
    title: "Proxy IP Checker",
    description: "Test if your HTTP proxy works on Google, IRCTC, YouTube, Amazon and more. Paste ip:port:user:pass.",
    icon: Globe,
    href: "/tools/proxy-checker",
    badge: "New",
    features: ["Multi-site test", "IRCTC & Google", "Live status", "Free & instant"]
  },
  {
    title: "Dedicated IP Checker",
    description: "Paste one proxy or a list. Working means it opens IRCTC.",
    icon: Zap,
    href: "/tools/ip-checker",
    badge: "Live",
    features: ["IRCTC check", "Bulk list", "Outgoing IP", "Download working"]
  }
];

export default function ToolsPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Free Tools"
        title="Linux Server"
        titleAccent="Tools"
        description="Free tools to help you manage and configure your Linux VPS. No technical knowledge required."
        badge={
          <span className="premium-chip inline-flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            No install required
          </span>
        }
      />

      <section className="premium-page-section">
        <div className="container mx-auto container-padding">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {tools.map((tool) => (
              <Tilt3DCard
                key={tool.href}
                maxTilt={6}
                scale={1.015}
                className="h-full"
                innerClassName="premium-glass-card h-full p-6 sm:p-7 flex flex-col"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="premium-icon-box w-14 h-14">
                    <tool.icon className="h-7 w-7 text-emerald-400" />
                  </div>
                  {tool.badge && (
                    <span className="premium-tag">{tool.badge}</span>
                  )}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{tool.title}</h3>
                <p className="text-sm text-white/55 mb-5 leading-relaxed">{tool.description}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {tool.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-white/50">
                      <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button asChild className="premium-btn-primary w-full gap-2">
                  <Link href={tool.href}>
                    Use Tool
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Tilt3DCard>
            ))}

            <Tilt3DCard
              maxTilt={4}
              scale={1.01}
              className="h-full"
              innerClassName="premium-glass-card h-full p-6 sm:p-7 flex flex-col items-center justify-center text-center border border-dashed border-white/10"
            >
              <div className="premium-icon-box w-14 h-14 mb-4 opacity-60">
                <Server className="h-7 w-7 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">More Tools Coming</h3>
              <p className="text-sm text-white/50">
                We&apos;re working on more free tools to help you manage your servers.
              </p>
            </Tilt3DCard>
          </div>
        </div>
      </section>

      <section className="premium-page-section premium-page-section--alt">
        <div className="container mx-auto container-padding">
          <div className="premium-cta-box">
            <div className="premium-icon-box w-12 h-12 mx-auto mb-4 rounded-full">
              <Zap className="w-5 h-5" />
            </div>
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-4">
              Need a Linux VPS?
            </h2>
            <p className="text-sm text-white/50 mb-6 max-w-2xl mx-auto">
              Get affordable premium Linux VPS hosting from OceanLinux.
              Starting at just ₹599/month with 99.9% uptime guarantee.
            </p>
            <Button asChild size="lg" className="premium-btn-primary gap-2">
              <Link href="/hosting">
                <Server className="h-4 w-4" />
                View Hosting Plans
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
