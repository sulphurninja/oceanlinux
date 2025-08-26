import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Server, 
    Cpu, 
    MemoryStick, 
    HardDrive, 
    Network, 
    Shield, 
    Zap,
    CheckCircle,
    Monitor,
    Database,
    Globe,
    Terminal,
    Settings
} from "lucide-react";
import Link from "next/link";

const vpsFeatures = [
    {
        title: "Full Root Access",
        description: "Complete control over your Linux environment",
        icon: Terminal
    },
    {
        title: "Multiple Distros",
        description: "Ubuntu, CentOS, Debian, and more",
        icon: Settings
    },
    {
        title: "NVMe SSD Storage", 
        description: "Lightning-fast storage for optimal performance",
        icon: HardDrive
    },
    {
        title: "DDoS Protection",
        description: "Advanced protection against attacks",
        icon: Shield
    },
    {
        title: "99.9% Uptime SLA",
        description: "Reliable infrastructure you can count on",
        icon: Monitor
    },
    {
        title: "24/7 Monitoring",
        description: "Proactive monitoring and alerts",
        icon: Database
    }
];

export default function LinuxVPS() {
    return (
        <>
            <Header />
            
            {/* Hero Section */}
            <section className="section-padding gradient- relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
                </div>
                
                <div className="container mx-auto container-padding relative z-10 text-center">
                    <div className="max-w-4xl mx-auto animate-slide-up">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
                            <Server className="w-4 h-4 mr-2 text-blue-400" />
                            <span className="text-sm font-medium text-white">Enterprise Grade • Full Control • Linux Powered</span>
                        </div>
                        
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            🚀 Linux VPS & Servers
                            <span className="text-gradient block">Powerful Virtual Private Servers</span>
                        </h1>
                        
                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Deploy scalable Linux VPS with full root access, premium hardware, and enterprise-grade security. 
                            Perfect for developers, businesses, and high-traffic applications.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <Cpu className="w-4 h-4" />
                                <span className="text-sm">High Performance</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span className="text-sm">Enterprise Security</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4" />
                                <span className="text-sm">Instant Deploy</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* VPS Features */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Why Choose OceanLinux VPS?</h2>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Built for performance, designed for reliability, and optimized for your success.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {vpsFeatures.map((feature, index) => (
                            <Card key={index}>
                                <CardContent className="p-6">
                                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                                        <feature.icon className="w-6 h-6 text-primary" />
                                    </div>
                                    <h3 className="font-bold mb-2">{feature.title}</h3>
                                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* Server Specifications */}
            <section className="py-16 bg-muted/30">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Server Specifications</h2>
                        <p className="text-muted-foreground">
                            Enterprise-grade hardware specifications for maximum performance
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <Card>
                            <CardContent className="p-6 text-center">
                                <Cpu className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                                <h3 className="font-bold mb-2">CPU Performance</h3>
                                <ul className="text-sm text-muted-foreground space-y-1">
                                    <li>Intel Xeon Processors</li>
                                    <li>Up to 16 vCPU Cores</li>
                                    <li>3.0+ GHz Base Clock</li>
                                    <li>Hardware Virtualization</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 text-center">
                                <MemoryStick className="w-12 h-12 text-green-500 mx-auto mb-4" />
                                <h3 className="font-bold mb-2">Memory & RAM</h3>
                                <ul className="text-sm text-muted-foreground space-y-1">
                                    <li>DDR4 ECC Memory</li>
                                    <li>Up to 32GB RAM</li>
                                    <li>Guaranteed Resources</li>
                                    <li>Memory Overcommit Protection</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 text-center">
                                <HardDrive className="w-12 h-12 text-purple-500 mx-auto mb-4" />
                                <h3 className="font-bold mb-2">Storage</h3>
                                <ul className="text-sm text-muted-foreground space-y-1">
                                    <li>NVMe SSD Storage</li>
                                    <li>Up to 1TB Disk Space</li>
                                    <li>RAID Protection</li>
                                    <li>Automated Backups</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 text-center">
                                <Network className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                                <h3 className="font-bold mb-2">Network</h3>
                                <ul className="text-sm text-muted-foreground space-y-1">
                                    <li>1Gbps Port Speed</li>
                                    <li>Premium Bandwidth</li>
                                    <li>Global Data Centers</li>
                                    <li>IPv4 & IPv6 Support</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Linux Distributions */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Supported Linux Distributions</h2>
                        <p className="text-muted-foreground">
                            Choose from popular Linux distributions, all optimized for VPS hosting
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        {[
                            { name: "Ubuntu 22.04 LTS", desc: "Most popular, beginner-friendly" },
                            { name: "CentOS 7", desc: "Enterprise-ready, stable" },
                            { name: "Debian 11", desc: "Lightweight, secure" },
                            { name: "CentOS Stream", desc: "Latest features, rolling release" },
                            { name: "Rocky Linux", desc: "CentOS successor, enterprise-grade" },
                            { name: "AlmaLinux", desc: "Community-driven, RHEL compatible" }
                        ].map((distro, index) => (
                            <div key={index} className="p-4 bg-muted/50 rounded-lg border">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                                        <Terminal className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{distro.name}</h3>
                                        <p className="text-xs text-muted-foreground">{distro.desc}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-16 bg-gradient-to-br from-primary/5 to-secondary/5">
                <div className="container mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold mb-4">Ready to Deploy Your Linux VPS?</h2>
                    <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                        Get started with our affordable Linux VPS hosting today. Deploy in minutes, scale as you grow.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/hosting">
                            <Button size="lg" className="px-8">
                                <Server className="w-4 h-4 mr-2" />
                                View VPS Plans
                            </Button>
                        </Link>
                        <Link href="/contact-us">
                            <Button size="lg" variant="outline" className="px-8">
                                Talk to Expert
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}