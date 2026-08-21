import { Button } from "@/components/ui/button";
import {
    Server,
    Cpu,
    MemoryStick,
    HardDrive,
    Network,
    Shield,
    Zap,
    Monitor,
    Database,
    Terminal,
    Settings,
} from "lucide-react";
import Link from "next/link";
import PublicPageHero from "@/components/landing/PublicPageHero";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard";
import Tilt3DCard from "@/components/landing/Tilt3DCard";

const vpsFeatures = [
    { title: "Full Root Access", description: "Complete control over your Linux environment", icon: Terminal },
    { title: "Multiple Distros", description: "Ubuntu, CentOS, Debian, and more", icon: Settings },
    { title: "NVMe SSD Storage", description: "Lightning-fast storage for optimal performance", icon: HardDrive },
    { title: "DDoS Protection", description: "Advanced protection against attacks", icon: Shield },
    { title: "99.9% Uptime SLA", description: "Reliable infrastructure you can count on", icon: Monitor },
    { title: "24/7 Monitoring", description: "Proactive monitoring and alerts", icon: Database },
];

const specs = [
    {
        icon: Cpu,
        title: "CPU Performance",
        items: ["Intel Xeon Processors", "Up to 16 vCPU Cores", "3.0+ GHz Base Clock", "Hardware Virtualization"],
    },
    {
        icon: MemoryStick,
        title: "Memory & RAM",
        items: ["DDR4 ECC Memory", "Up to 32GB RAM", "Guaranteed Resources", "Memory Overcommit Protection"],
    },
    {
        icon: HardDrive,
        title: "Storage",
        items: ["NVMe SSD Storage", "Up to 1TB Disk Space", "RAID Protection", "Automated Backups"],
    },
    {
        icon: Network,
        title: "Network",
        items: ["1Gbps Port Speed", "Premium Bandwidth", "Provider-Sourced VPS", "IPv4 & IPv6 Support"],
    },
];

const distros = [
    { name: "Ubuntu 22.04 LTS", desc: "Most popular, beginner-friendly" },
    { name: "CentOS 7", desc: "Enterprise-ready, stable" },
    { name: "Debian 11", desc: "Lightweight, secure" },
    { name: "CentOS Stream", desc: "Latest features, rolling release" },
    { name: "Rocky Linux", desc: "CentOS successor, enterprise-grade" },
    { name: "AlmaLinux", desc: "Community-driven, RHEL compatible" },
];

export default function LinuxVPS() {
    return (
        <>
            <PublicPageHero
                eyebrow="Linux VPS"
                title="Linux VPS & Servers"
                titleAccent="Powerful Virtual Private Servers"
                description="Deploy scalable Linux VPS with full root access, premium hardware, and enterprise-grade security. Perfect for developers, businesses, and high-traffic applications."
                badge={
                    <span className="premium-chip inline-flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        Enterprise Grade · Full Control · Linux Powered
                    </span>
                }
            >
                <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
                    <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">High Performance</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Enterprise Security</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Instant Deploy</span>
                    </div>
                </div>
            </PublicPageHero>

            <section className="premium-page-section">
                <div className="container mx-auto container-padding">
                    <PremiumSectionHeader
                        eyebrow="Why OceanLinux"
                        title="Built for Performance,"
                        titleAccent="Designed for Reliability"
                        description="Enterprise-grade VPS sourced from trusted providers, fully managed and supported by OceanLinux."
                    />
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                        {vpsFeatures.map((feature) => (
                            <PremiumFeatureCard
                                key={feature.title}
                                icon={<feature.icon className="w-5 h-5" />}
                                title={feature.title}
                                description={feature.description}
                            />
                        ))}
                    </div>
                </div>
            </section>

            <section className="premium-page-section premium-page-section--alt">
                <div className="container mx-auto container-padding">
                    <PremiumSectionHeader
                        eyebrow="Hardware"
                        title="Server"
                        titleAccent="Specifications"
                        description="Enterprise-grade hardware specifications for maximum performance."
                    />
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {specs.map((spec) => (
                            <Tilt3DCard
                                key={spec.title}
                                maxTilt={5}
                                scale={1.02}
                                innerClassName="premium-glass-card h-full p-6 text-center"
                            >
                                <div className="premium-icon-box w-12 h-12 mx-auto mb-4">
                                    <spec.icon className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-white mb-4">{spec.title}</h3>
                                <ul className="text-sm text-white/50 space-y-2">
                                    {spec.items.map((item) => (
                                        <li key={item} className="flex items-center gap-2 justify-center">
                                            <span className="premium-spec-dot" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </Tilt3DCard>
                        ))}
                    </div>
                </div>
            </section>

            <section className="premium-page-section">
                <div className="container mx-auto container-padding">
                    <PremiumSectionHeader
                        eyebrow="Distributions"
                        title="Supported Linux"
                        titleAccent="Distributions"
                        description="Choose from popular Linux distributions, all optimized for VPS hosting."
                    />
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
                        {distros.map((distro) => (
                            <div key={distro.name} className="premium-inner-card flex items-center gap-3 p-4">
                                <div className="premium-icon-box w-10 h-10 shrink-0">
                                    <Terminal className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white text-sm">{distro.name}</h3>
                                    <p className="text-xs text-white/45">{distro.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="premium-page-section premium-page-section--alt">
                <div className="container mx-auto container-padding">
                    <div className="premium-cta-box max-w-3xl mx-auto">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                            Ready to Deploy Your Linux VPS?
                        </h2>
                        <p className="text-white/50 mb-8 max-w-xl mx-auto">
                            Get started with affordable Linux VPS hosting today. Deploy in minutes, scale as you grow.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/hosting">
                                <Button className="premium-btn-primary w-full sm:w-auto px-8 h-12">
                                    <Server className="w-4 h-4 mr-2" />
                                    View VPS Plans
                                </Button>
                            </Link>
                            <Link href="/contact-us">
                                <Button variant="outline" className="premium-btn-outline w-full sm:w-auto px-8 h-12">
                                    Talk to Expert
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
