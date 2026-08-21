import { Button } from "@/components/ui/button";
import {
    RefreshCw,
    Rocket,
    Zap,
    Crown,
    Star,
    CheckCircle,
    ArrowRight,
    Shield,
    Server,
    Gauge,
} from "lucide-react";
import Link from "next/link";
import PublicPageHero from "@/components/landing/PublicPageHero";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";
import Tilt3DCard from "@/components/landing/Tilt3DCard";

const serverSeries = [
    {
        name: "Gold Series Rotating",
        icon: RefreshCw,
        tagline: "Smart Resource Rotation",
        description: "Perfect for applications with varying resource needs. Intelligent rotation ensures optimal performance while keeping costs low.",
        startingPrice: 299,
        features: [
            "Dynamic Resource Allocation",
            "Intelligent Load Balancing",
            "Auto-Scaling Capabilities",
            "Cost-Optimized Performance",
            "24/7 Automated Monitoring",
        ],
        ideal: "Variable Workloads",
        popular: false,
    },
    {
        name: "Nova Linux VPS",
        icon: Rocket,
        tagline: "Next-Gen Performance",
        description: "Our flagship VPS series with cutting-edge technology and blazing-fast performance for modern applications.",
        startingPrice: 599,
        features: [
            "Latest Intel Xeon CPUs",
            "NVMe SSD Storage",
            "DDR4 ECC Memory",
            "1Gbps Network Port",
            "Advanced Security Features",
        ],
        ideal: "High-Performance Apps",
        popular: true,
    },
    {
        name: "Power Linux VPS",
        icon: Zap,
        tagline: "Maximum Performance",
        description: "Unleash full potential with our most powerful VPS series for resource-intensive applications and high-traffic websites.",
        startingPrice: 999,
        features: [
            "High-Frequency CPUs",
            "Maximum RAM Allocation",
            "Premium NVMe Storage",
            "Dedicated Network Resources",
            "Priority Technical Support",
        ],
        ideal: "Enterprise Applications",
        popular: false,
    },
    {
        name: "Titan Series",
        icon: Crown,
        tagline: "Enterprise Excellence",
        description: "Premium enterprise-grade series with dedicated resources and white-glove support for mission-critical applications.",
        startingPrice: 1999,
        features: [
            "Dedicated CPU Cores",
            "Guaranteed Resources",
            "Enterprise SSD Arrays",
            "Private Network Access",
            "24/7 Phone Support",
        ],
        ideal: "Mission-Critical Systems",
        popular: false,
    },
];

export default function ServerSeries() {
    return (
        <>
            <PublicPageHero
                eyebrow="Server Series"
                title="Choose Your"
                titleAccent="Performance Tier"
                description="From intelligent resource rotation to enterprise-grade dedicated servers, find the perfect hosting solution tailored to your needs and budget."
                badge={
                    <span className="premium-chip inline-flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        4 Unique Series · Specialized Performance
                    </span>
                }
            >
                <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
                    <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Optimized Performance</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Enterprise Security</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Specialized Features</span>
                    </div>
                </div>
            </PublicPageHero>

            <section className="premium-page-section">
                <div className="container mx-auto container-padding">
                    <PremiumSectionHeader
                        eyebrow="Product Lines"
                        title="Our Server"
                        titleAccent="Series"
                        description="Each series is designed and optimized for different use cases and performance requirements."
                    />

                    <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 max-w-6xl mx-auto">
                        {serverSeries.map((series) => (
                            <Tilt3DCard
                                key={series.name}
                                maxTilt={5}
                                scale={1.015}
                                className={series.popular ? "lg:-mt-1" : undefined}
                                innerClassName={`premium-glass-card h-full p-7 sm:p-8 ${series.popular ? "ring-1 ring-emerald-400/30" : ""}`}
                            >
                                {series.popular && (
                                    <div className="mb-4">
                                        <span className="premium-tag inline-flex items-center gap-1">
                                            <Star className="w-3 h-3" />
                                            Most Popular
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-start gap-4 mb-5">
                                    <div className="premium-icon-box w-14 h-14 shrink-0">
                                        <series.icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-xl font-semibold text-white mb-1">{series.name}</h3>
                                        <p className="text-sm text-emerald-400/80 mb-2">{series.tagline}</p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="premium-price text-2xl">₹{series.startingPrice}</span>
                                            <span className="text-sm text-white/45">/month</span>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-sm text-white/50 mb-6 leading-relaxed">{series.description}</p>

                                <div className="space-y-2.5 mb-6">
                                    {series.features.map((feature) => (
                                        <div key={feature} className="premium-spec-row">
                                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                                            <span>{feature}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between pt-5 border-t border-white/[0.06]">
                                    <div className="text-sm">
                                        <span className="text-white/45">Ideal for: </span>
                                        <span className="text-white/80 font-medium">{series.ideal}</span>
                                    </div>
                                    <Link href="/hosting">
                                        <Button size="sm" className="premium-btn-primary w-auto px-5 h-10 text-xs">
                                            View Plans
                                            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                                        </Button>
                                    </Link>
                                </div>
                            </Tilt3DCard>
                        ))}
                    </div>
                </div>
            </section>

            <section className="premium-page-section premium-page-section--alt">
                <div className="container mx-auto container-padding">
                    <div className="premium-cta-box max-w-3xl mx-auto">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                            Can&apos;t Decide Which Series is Right?
                        </h2>
                        <p className="text-white/50 mb-8 max-w-xl mx-auto">
                            Our experts can help you choose the perfect server series for your requirements and budget.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/contact-us">
                                <Button className="premium-btn-primary w-full sm:w-auto px-8 h-12">
                                    Talk to Expert
                                </Button>
                            </Link>
                            <Link href="/hosting">
                                <Button variant="outline" className="premium-btn-outline w-full sm:w-auto px-8 h-12">
                                    Compare All Plans
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
