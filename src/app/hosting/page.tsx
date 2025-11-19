"use client";

import Footer from "@/components/landing/Footer";
import Header from "@/components/landing/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
            
            <Header />

            {/* Hero Section */}
            <section className="section-padding gradient- bg-background relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
                </div>

                <div className="container mx-auto container-padding relative z-10 text-center">
                    <div className="max-w-4xl mx-auto animate-slide-up">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
                            <DollarSign className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium text-white">Most Affordable • Premium Quality • No Compromises</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white">
                            💰 Affordable Hosting
                            <span className="text-primary block">Premium Linux VPS at Unbeatable Prices</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Get enterprise-grade Linux hosting without breaking the bank. From rotating premium IPs to
                            enterprise-grade power - all our server series offer professional features at the most affordable prices.
                        </p>

                        <div className="flex items-center justify-center gap-6 text-white/70">
                            <div className="flex items-center gap-2">
                                <Heart className="w-4 h-4" />
                                <span className="text-sm">Made for Everyone</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span className="text-sm">No Hidden Costs</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Star className="w-4 h-4" />
                                <span className="text-sm">Premium Features</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Plans */}
            <section className="py-16 bg-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">
                            {displayPlans.length > 0 ? 'Most Popular Hosting Plans This Week' : 'Choose Your Perfect Linux Server Series'}
                        </h2>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            {displayPlans.length > 0 
                                ? 'Real customers, real choices - these are the hosting plans our customers love most.'
                                : 'All plans include our premium features at prices designed to be accessible for everyone.'
                            }
                        </p>
                    </div>

                    {loading ? (
                        <div className="text-center py-16">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                            <p className="text-muted-foreground mt-4">Loading popular hosting plans...</p>
                        </div>
                    ) : (
                        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
                            {plansToShow.map((plan, index) => (
                            <Card key={index} className={`relative ${plan.popular ? 'border dark:borde shadow-lg scale-105' : ''}`}>
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                        <Badge className="bg-primary text-primary-foreground px-4 py-1">
                                            <Star className="w-3 h-3 mr-1" />
                                            Most Popular
                                        </Badge>
                                    </div>
                                )}
                                <CardContent className="p-8">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <plan.icon className="w-8 h-8 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-3xl font-bold text-green-500">₹{plan.price}</span>
                                                <span className="text-lg text-muted-foreground line-through">₹{plan.originalPrice}</span>
                                                <span className="text-sm text-muted-foreground">/month</span>
                                            </div>
                                            <p className="text-xs text-green-600 font-medium">
                                                Save ₹{plan.originalPrice - plan.price}/month ({Math.round((1 - plan.price / plan.originalPrice) * 100)}% off)
                                            </p>
                                        </div>
                                    </div>

                                    <p className="text-muted-foreground mb-6 leading-relaxed">
                                        {plan.description}
                                    </p>

                                    {/* Specifications */}
                                    <div className="space-y-3 p-4 bg-muted/50 rounded-lg mb-6">
                                        <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">
                                            Server Specifications
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">CPU:</span>
                                                <span className="font-medium">{plan.specs.cpu}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">RAM:</span>
                                                <span className="font-medium">{plan.specs.ram}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Storage:</span>
                                                <span className="font-medium">{plan.specs.storage}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Bandwidth:</span>
                                                <span className="font-medium">{plan.specs.bandwidth}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground pt-2  dark:bord  dark:border-none dark:bor/50">
                                            IP Range: {plan.specs.ip}
                                        </div>
                                    </div>

                                    {/* Features */}
                                    <div className="space-y-3 mb-6">
                                        <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                                            Features Included
                                        </h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {plan.features.slice(0, 6).map((feature, idx) => (
                                                <div key={idx} className="flex items-center gap-3">
                                                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                                    <span className="text-sm">{feature}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {plan.features.length > 6 && (
                                            <div className="text-xs text-muted-foreground">
                                                +{plan.features.length - 6} more features included
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border dark:border-none-t dark:border-none">
                                        <div className="text-sm">
                                            <span className="text-muted-foreground">Ideal for:</span>
                                            <span className="font-medium ml-1">{plan.ideal}</span>
                                        </div>
                                    </div>

                                    <Link href="/get-started" className="w-full mt-4 block">
                                        <Button className={`w-full ${plan.popular ? 'btn-primary' : ''}`} variant={plan.popular ? 'default' : 'outline'}>
                                            {plan.popular ? '🚀 Get Started Now' : '📋 Choose This Plan'} - ₹{plan.price}/mo
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                            ))}
                        </div>
                    )}

                    <div className="text-center mt-12">
                        <p className="text-sm text-muted-foreground mb-4">
                            💡 Need help choosing the right plan? Our experts are here to help you find the perfect fit.
                        </p>
                        <Link href="/contact-us">
                            <Button variant="outline" size="lg" className="px-8">
                                💬 Talk to Our Linux Experts
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Why Affordable */}
            <section className="py-16 bg-background /30">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Why Choose Our Affordable Hosting?</h2>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            We believe premium hosting shouldn't cost a fortune. Here's how we deliver exceptional value.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <Card>
                            <CardContent className="p-6 text-center">
                                <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                                    <DollarSign className="w-6 h-6 text-green-500" />
                                </div>
                                <h3 className="font-bold mb-2">Transparent Pricing</h3>
                                <p className="text-sm text-muted-foreground">
                                    No hidden fees, no surprise charges. What you see is what you pay.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 text-center">
                                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                                    <Server className="w-6 h-6 text-blue-500" />
                                </div>
                                <h3 className="font-bold mb-2">Premium Hardware</h3>
                                <p className="text-sm text-muted-foreground">
                                    Latest generation servers with NVMe SSD and high-performance CPUs.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 text-center">
                                <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                                    <Shield className="w-6 h-6 text-purple-500" />
                                </div>
                                <h3 className="font-bold mb-2">24/7 Support</h3>
                                <p className="text-sm text-muted-foreground">
                                    Expert support when you need it, included at no extra cost.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-6 text-center">
                                <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                                    <Gauge className="w-6 h-6 text-orange-500" />
                                </div>
                                <h3 className="font-bold mb-2">99.9% Uptime</h3>
                                <p className="text-sm text-muted-foreground">
                                    Reliable infrastructure with industry-leading uptime guarantee.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            <Footer />
        </>
    );
}
