import Link from 'next/link';
import { Terminal, Shield, Zap, Server, ArrowRight, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import FloatingSupport from "@/components/component/floating-support";
import type { Metadata } from 'next';

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
    badgeColor: "bg-green-500/10 text-green-500 border-green-500/20",
    features: ["One-click setup", "Port 3128", "User authentication", "2-minute install"]
  }
];

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      {/* Hero Section */}
      <section className="relative py-16 lg:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
              <Wrench className="h-3 w-3 mr-1" />
              Free Tools
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Linux Server Tools
            </h1>
            <p className="text-lg text-muted-foreground">
              Free tools to help you manage and configure your Linux VPS. 
              No technical knowledge required.
            </p>
          </div>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {tools.map((tool) => (
              <Card key={tool.href} className="border-border hover:shadow-lg transition-all duration-300 group">
                <CardHeader>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <tool.icon className="h-7 w-7 text-primary" />
                    </div>
                    {tool.badge && (
                      <Badge variant="outline" className={tool.badgeColor}>
                        {tool.badge}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl">{tool.title}</CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {tool.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Zap className="h-4 w-4 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="w-full gap-2">
                    <Link href={tool.href}>
                      Use Tool
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}

            {/* Coming Soon Card */}
            <Card className="border-dashed border-2 border-muted-foreground/20">
              <CardContent className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
                  <Server className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">More Tools Coming</h3>
                <p className="text-sm text-muted-foreground">
                  We're working on more free tools to help you manage your servers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-8 md:p-12 text-center">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl md:text-3xl font-bold mb-4">
                  Need a Linux VPS?
                </h2>
                <p className="text-muted-foreground mb-6">
                  Get affordable premium Linux VPS hosting from OceanLinux. 
                  Starting at just ₹599/month with 99.9% uptime guarantee.
                </p>
                <Button asChild size="lg" className="gap-2">
                  <Link href="/hosting">
                    <Server className="h-4 w-4" />
                    View Hosting Plans
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
      <FloatingSupport />
    </div>
  );
}
