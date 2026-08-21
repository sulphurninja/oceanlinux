"use client";

import { Button } from "@/components/ui/button";
import {
    DollarSign,
    Server,
    Zap,
    Shield,
    Clock,
    CheckCircle,
    Star,
    Globe,
    HardDrive,
    Cpu,
    MemoryStick,
    Network,
    Gauge,
    Heart,
    RefreshCw,
    Rocket,
    Crown
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import PublicPageHero from "@/components/landing/PublicPageHero";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";
import Tilt3DCard from "@/components/landing/Tilt3DCard";
import { stripEmojis } from "@/lib/stripEmojis";

interface PopularPlan {
    name: string;
    orderCount: number;
    avgPrice: number;
    totalRevenue: number;
    rank: number;
}

interface HostingPlan {
    name: string;
    description: string;
    price: number;
    originalPrice: number;
    popular: boolean;
    icon: any;
    features: string[];
    specs: {
        cpu: string;
        ram: string;
        storage: string;
        bandwidth: string;
        ip: string;
    };
    ideal: string;
}

const fallbackHostingPlans: HostingPlan[] = [
    {
        name: "🔄 Premium Gold Series",
        description: "Premium rotating Linux servers with high-quality IP ranges. Perfect for businesses needing reliable, rotating IP solutions at affordable prices.",
        price: 599,
        originalPrice: 999,
        popular: true,
        icon: RefreshCw,
        features: [
            "🔄 Premium rotating IP addresses",
            "⚡ High-speed NVMe SSD storage",
            "🔒 Advanced DDoS protection",
            "🛡️ Enterprise-grade security",
            "📧 24/7 email & chat support",
            "🔧 Full root access & control",
            "💬 cPanel management included",
            "📊 99.9% uptime guarantee"
        ],
        specs: {
            cpu: "4 vCPU Cores",
            ram: "8GB DDR4 RAM",
            storage: "100GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "103.183.xx • 103.187.xx"
        },
        ideal: "Rotating IP Business Solutions"
    },
    {
        name: "🚀 Nova Linux VPS",
        description: "High-performance Linux VPS servers designed for speed and reliability. Get premium performance at the most affordable prices in the market.",
        price: 799,
        originalPrice: 1299,
        popular: false,
        icon: Rocket,
        features: [
            "🚀 Optimized for high performance",
            "⚡ Ultra-fast NVMe SSD storage",
            "💪 Enhanced CPU performance",
            "🔒 Multi-layer security protection",
            "📱 Advanced control panel",
            "🛠️ One-click app installations",
            "📈 Scalable resources on demand",
            "🔧 SSH & FTP access included"
        ],
        specs: {
            cpu: "6 vCPU Cores",
            ram: "12GB DDR4 RAM",
            storage: "150GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "163.227.xx"
        },
        ideal: "High-Performance Applications"
    },
    {
        name: "🔋 Power Linux VPS",
        description: "Maximum power and control for demanding applications. Enterprise-grade Linux hosting at budget-friendly prices with premium features included.",
        price: 899,
        originalPrice: 1499,
        popular: false,
        icon: Zap,
        features: [
            "🔋 Maximum processing power",
            "⚡ Premium NVMe SSD performance",
            "🚀 High-speed network connectivity",
            "🛡️ Advanced security suite",
            "📞 Priority support access",
            "🔧 Advanced server management",
            "📊 Comprehensive monitoring",
            "🌐 Content delivery optimization"
        ],
        specs: {
            cpu: "8 vCPU Cores",
            ram: "16GB DDR4 RAM",
            storage: "200GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "149.13.xx"
        },
        ideal: "Resource-Intensive Applications"
    },
    {
        name: "🔰 Titan Series Enterprise",
        description: "Our flagship enterprise Linux hosting solution. Premium hardware, advanced features, and dedicated support for mission-critical applications.",
        price: 1299,
        originalPrice: 1999,
        popular: false,
        icon: Crown,
        features: [
            "🔰 Enterprise-grade hardware",
            "⚡ Flagship performance servers",
            "🏆 Premium support priority",
            "🛡️ Maximum security features",
            "📞 Dedicated account manager",
            "🔧 Custom server configurations",
            "📊 Advanced analytics dashboard",
            "🌍 Global load balancing"
        ],
        specs: {
            cpu: "12 vCPU Cores",
            ram: "32GB DDR4 RAM",
            storage: "500GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "103.15.xx"
        },
        ideal: "Mission-Critical Enterprise Systems"
    }
];

export default function AffordableHosting() {
    const [popularPlans, setPopularPlans] = useState<PopularPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [displayPlans, setDisplayPlans] = useState<HostingPlan[]>([]);

    useEffect(() => {
        const fetchPopularPlans = async () => {
            try {
                const response = await fetch('/api/popular-plans');
                const data = await response.json();
                
                if (data.success && data.plans.length > 0) {
                    setPopularPlans(data.plans);
                    // Convert popular plans to display format
                    const icons = [RefreshCw, Rocket, Zap, Crown];
                    const plansToDisplay = data.plans.slice(0, 4).map((plan: PopularPlan, index: number) => ({
                        name: plan.name,
                        description: `One of our most popular Linux VPS hosting plans. ${plan.orderCount} customers chose this in the last 7 days for its reliability and performance.`,
                        price: plan.avgPrice,
                        originalPrice: Math.round(plan.avgPrice * 1.67), // Calculate ~40% discount
                        popular: index === 0,
                        icon: icons[index % icons.length],
                        specs: {
                            cpu: "High Performance vCPU",
                            ram: "Premium DDR4 RAM",
                            storage: "NVMe SSD Storage",
                            bandwidth: "Unlimited",
                            ip: "Premium IP Range"
                        },
                        features: [
                            "🚀 High-speed NVMe SSD storage",
                            "🔒 Advanced DDoS protection",
                            "🛡️ Enterprise-grade security",
                            "📧 24/7 email & chat support",
                            "🔧 Full root access & control",
                            "💬 Easy management panel",
                            "📊 99.9% uptime guarantee",
                            "🌐 Global network access"
                        ],
                        ideal: `Trusted by ${plan.orderCount} customers this week`
                    }));
                    setDisplayPlans(plansToDisplay);
                }
            } catch (error) {
                console.error('Error fetching popular plans:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPopularPlans();
    }, []);

    // Use fallback plans if no popular plans available
    const plansToShow = displayPlans.length > 0 ? displayPlans : fallbackHostingPlans;

    // Update page metadata dynamically when popular plans load
    useEffect(() => {
        if (displayPlans.length > 0) {
            // Update document title
            document.title = `${displayPlans[0].name} from ₹${displayPlans[0].price}/mo | Affordable Linux VPS Hosting | OceanLinux`;
            
            // Update meta description
            const metaDescription = document.querySelector('meta[name="description"]');
            if (metaDescription) {
                metaDescription.setAttribute('content', 
                    `Best affordable Linux VPS hosting plans. Most popular: ${displayPlans[0].name} with ${popularPlans[0]?.orderCount || 0} orders this week. Starting at ₹${displayPlans[0].price}/month with enterprise features.`
                );
            }
        }
    }, [displayPlans, popularPlans]);

    // Generate structured data for popular plans
    const generateStructuredData = () => {
        if (displayPlans.length === 0) return null;

        return {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "Popular Linux VPS Hosting Plans",
            "description": "Most popular Linux VPS hosting plans chosen by our customers",
            "numberOfItems": displayPlans.length,
            "itemListElement": displayPlans.map((plan, index) => ({
                "@type": "ListItem",
                "position": index + 1,
                "item": {
                    "@type": "Product",
                    "name": plan.name,
                    "description": plan.description,
                    "brand": {
                        "@type": "Brand",
                        "name": "OceanLinux"
                    },
                    "offers": {
                        "@type": "Offer",
                        "url": `https://oceanlinux.com/get-started`,
                        "priceCurrency": "INR",
                        "price": plan.price,
                        "availability": "https://schema.org/InStock",
                        "priceValidUntil": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    },
                    "aggregateRating": {
                        "@type": "AggregateRating",
                        "ratingValue": "4.9",
                        "reviewCount": popularPlans[index]?.orderCount || 100,
                        "bestRating": "5",
                        "worstRating": "1"
                    }
                }
            }))
        };
    };

    return (
        <>
            {/* Add structured data for SEO */}
            {displayPlans.length > 0 && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(generateStructuredData())
                    }}
                />
            )}
            <PublicPageHero
                eyebrow="Affordable Hosting"
                title="Premium Linux VPS"
                titleAccent="at Unbeatable Prices"
                description="Get enterprise-grade Linux hosting without breaking the bank. From rotating premium IPs to enterprise-grade power — professional features at the most affordable prices."
                badge={
                    <span className="premium-chip inline-flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Most Affordable · Premium Quality · No Compromises
                    </span>
                }
            >
                <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
                    <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Made for Everyone</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">No Hidden Costs</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm">Premium Features</span>
                    </div>
                </div>
            </PublicPageHero>

            {/* Pricing Plans */}
            <section className="premium-page-section">
                <div className="container mx-auto container-padding">
                    <PremiumSectionHeader
                        eyebrow="Pricing"
                        title={displayPlans.length > 0 ? "Most Popular Plans" : "Choose Your Server Series"}
                        titleAccent="This Week"
                        description={displayPlans.length > 0
                            ? "Real customers, real choices — these are the hosting plans our customers love most."
                            : "All plans include premium features at prices designed to be accessible for everyone."}
                    />

                    {loading ? (
                        <div className="text-center py-16">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                            <p className="text-muted-foreground mt-4">Loading popular hosting plans...</p>
                        </div>
                    ) : (
                        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 max-w-6xl mx-auto">
                            {plansToShow.map((plan, index) => (
                            <Tilt3DCard
                                key={index}
                                maxTilt={5}
                                scale={1.015}
                                innerClassName={`premium-glass-card h-full p-7 sm:p-8 ${plan.popular ? "ring-1 ring-emerald-400/30" : ""}`}
                            >
                                {plan.popular && (
                                    <div className="mb-4">
                                        <span className="premium-tag inline-flex items-center gap-1">
                                            <Star className="w-3 h-3" />
                                            Most Popular
                                        </span>
                                    </div>
                                )}
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="premium-icon-box w-14 h-14 shrink-0">
                                            <plan.icon className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-xl font-semibold text-white mb-2">{stripEmojis(plan.name)}</h3>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="premium-price text-3xl">₹{plan.price}</span>
                                                <span className="text-sm text-white/40 line-through">₹{plan.originalPrice}</span>
                                                <span className="text-sm text-white/45">/month</span>
                                            </div>
                                            <p className="text-xs text-emerald-400/80 font-medium">
                                                Save ₹{plan.originalPrice - plan.price}/month ({Math.round((1 - plan.price / plan.originalPrice) * 100)}% off)
                                            </p>
                                        </div>
                                    </div>

                                    <p className="text-sm text-white/50 mb-6 leading-relaxed">
                                        {plan.description}
                                    </p>

                                    <div className="premium-inner-card mb-6 space-y-2">
                                        <h4 className="font-semibold text-[10px] uppercase tracking-wider text-white/40 mb-3">
                                            Server Specifications
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-white/45">CPU:</span>
                                                <span className="text-white/80 font-medium">{plan.specs.cpu}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-white/45">RAM:</span>
                                                <span className="text-white/80 font-medium">{plan.specs.ram}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-white/45">Storage:</span>
                                                <span className="text-white/80 font-medium">{plan.specs.storage}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-white/45">Bandwidth:</span>
                                                <span className="text-white/80 font-medium">{plan.specs.bandwidth}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-white/40 pt-2 border-t border-white/[0.06]">
                                            IP Range: {plan.specs.ip}
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-6">
                                        {plan.features.slice(0, 6).map((feature, idx) => (
                                            <div key={idx} className="premium-spec-row">
                                                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                                                <span>{stripEmojis(feature)}</span>
                                            </div>
                                        ))}
                                        {plan.features.length > 6 && (
                                            <div className="text-xs text-white/40">
                                                +{plan.features.length - 6} more features included
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-4 border-t border-white/[0.06] mb-4">
                                        <span className="text-sm text-white/45">Ideal for: </span>
                                        <span className="text-sm text-white/80 font-medium">{plan.ideal}</span>
                                    </div>

                                    <Link href="/get-started" className="block">
                                        <Button className={plan.popular ? "premium-btn-primary w-full h-12" : "premium-btn-outline w-full h-12"}>
                                            {plan.popular ? "Get Started Now" : "Choose This Plan"} — ₹{plan.price}/mo
                                        </Button>
                                    </Link>
                            </Tilt3DCard>
                            ))}
                        </div>
                    )}

                    <div className="text-center mt-12">
                        <p className="text-sm text-white/50 mb-4">
                            Need help choosing the right plan? Our experts are here to help you find the perfect fit.
                        </p>
                        <Link href="/contact-us">
                            <Button variant="outline" size="lg" className="premium-btn-outline px-8 w-auto inline-flex">
                                Talk to Our Linux Experts
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            <section className="premium-page-section premium-page-section--alt">
                <div className="container mx-auto container-padding">
                    <PremiumSectionHeader
                        eyebrow="Value"
                        title="Why Choose Our"
                        titleAccent="Affordable Hosting?"
                        description="Premium hosting shouldn't cost a fortune. Here's how we deliver exceptional value."
                    />

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: DollarSign, title: "Transparent Pricing", desc: "No hidden fees, no surprise charges. What you see is what you pay." },
                            { icon: Server, title: "Premium Hardware", desc: "Latest generation servers with NVMe SSD and high-performance CPUs." },
                            { icon: Shield, title: "24/7 Support", desc: "Expert support when you need it, included at no extra cost." },
                            { icon: Gauge, title: "99.9% Uptime", desc: "Reliable infrastructure with industry-leading uptime guarantee." },
                        ].map((item) => (
                            <div key={item.title} className="premium-stat-card text-center">
                                <div className="premium-icon-box w-12 h-12 mx-auto mb-4">
                                    <item.icon className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                                <p className="text-sm text-white/45">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>        </>
    );
}
