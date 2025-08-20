"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Zap } from "lucide-react";
import Link from "next/link";

interface Plan {
    name: string;
    description: string;
    price: number;
    originalPrice?: number;
    badge?: string;
    features: string[];
    popular?: boolean;
    specs: {
        cpu: string;
        ram: string;
        storage: string;
        bandwidth: string;
        ip: string;
    }
}

const plans: Plan[] = [
    {
        name: "🔄 Premium Gold Series",
        description: "Premium rotating Linux servers with high-quality IP ranges. Perfect for businesses needing reliable, rotating IP solutions at affordable prices.",
        price: 599,
        originalPrice: 999,
        badge: "Most Popular",
        popular: true,
        specs: {
            cpu: "4 vCPU Cores",
            ram: "8GB DDR4 RAM",
            storage: "100GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "103.183.xx • 103.187.xx"
        },
        features: [
            "🔄 Premium rotating IP addresses",
            "⚡ High-speed NVMe SSD storage",
            "🔒 Advanced DDoS protection",
            "🛡️ Enterprise-grade security",
            "📧 24/7 email & chat support",
            "🔧 Full root access & control",
            "💬 cPanel management included",
            "📊 99.9% uptime guarantee",
            "🔄 IP rotation capabilities",
            "🌐 Global network access"
        ]
    },
    {
        name: "🚀 Nova Linux VPS",
        description: "High-performance Linux VPS servers designed for speed and reliability. Get premium performance at the most affordable prices in the market.",
        price: 799,
        originalPrice: 1299,
        badge: "Best Performance",
        specs: {
            cpu: "6 vCPU Cores",
            ram: "12GB DDR4 RAM",
            storage: "150GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "163.227.xx"
        },
        features: [
            "🚀 Optimized for high performance",
            "⚡ Ultra-fast NVMe SSD storage",
            "💪 Enhanced CPU performance",
            "🔒 Multi-layer security protection",
            "📱 Advanced control panel",
            "🛠️ One-click app installations",
            "📈 Scalable resources on demand",
            "🔧 SSH & FTP access included",
            "📊 Real-time monitoring tools",
            "🌍 Low-latency global network"
        ]
    },
    {
        name: "🔋 Power Linux VPS",
        description: "Maximum power and control for demanding applications. Enterprise-grade Linux hosting at budget-friendly prices with premium features included.",
        price: 899,
        originalPrice: 1499,
        badge: "Maximum Power",
        specs: {
            cpu: "8 vCPU Cores",
            ram: "16GB DDR4 RAM",
            storage: "200GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "149.13.xx"
        },
        features: [
            "🔋 Maximum processing power",
            "⚡ Premium NVMe SSD performance",
            "🚀 High-speed network connectivity",
            "🛡️ Advanced security suite",
            "📞 Priority support access",
            "🔧 Advanced server management",
            "📊 Comprehensive monitoring",
            "🌐 Content delivery optimization",
            "🔄 Automatic backup solutions",
            "💼 Business-grade reliability"
        ]
    },
    {
        name: "🔰 Titan Series Enterprise",
        description: "Our flagship enterprise Linux hosting solution. Premium hardware, advanced features, and dedicated support for mission-critical applications.",
        price: 1299,
        originalPrice: 1999,
        badge: "Enterprise",
        specs: {
            cpu: "12 vCPU Cores",
            ram: "32GB DDR4 RAM",
            storage: "500GB NVMe SSD",
            bandwidth: "Unlimited",
            ip: "103.15.xx"
        },
        features: [
            "🔰 Enterprise-grade hardware",
            "⚡ Flagship performance servers",
            "🏆 Premium support priority",
            "🛡️ Maximum security features",
            "📞 Dedicated account manager",
            "🔧 Custom server configurations",
            "📊 Advanced analytics dashboard",
            "🌍 Global load balancing",
            "🔄 Automated scaling options",
            "💎 White-glove service included"
        ]
    }
];

export default function PricingSection() {
    return (
        <section className="section-padding bg-background">
            <div className="container mx-auto container-padding">
                {/* Header */}
                <div className="text-center mb-16 animate-fade-in">
                    <Badge variant="outline" className="mb-4 px-4 py-2 text-primary border-primary/20">
                        <Zap className="w-4 h-4 mr-2" />
                        Most Affordable Premium Linux VPS
                    </Badge>
                    <h2 className="text-4xl lg:text-5xl font-bold mb-6">
                        Choose Your Perfect 
                        <span className="text-gradient block">Linux Server Series</span>
                    </h2>
                    <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                        From rotating premium IPs to enterprise-grade power - all our Linux server series 
                        offer professional features at the most affordable prices in the industry.
                    </p>
                </div>

                {/* Pricing Cards */}
                <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-8 max-w-7xl mx-auto">
                    {plans.map((plan, index) => (
                        <Card 
                            key={index} 
                            className={`pricing-card relative ${plan.popular ? 'popular lg:scale-105' : ''} animate-scale-in`}
                            style={{ animationDelay: `${index * 0.1}s` }}
                        >
                            {plan.popular && (
                                <div className="absolute top-0 left-1/2 transform -translate-x-1/2">
                                    <Badge className="bg-primary text-primary-foreground px-4 py-1 text-sm font-semibold">
                                        <Star className="w-4 h-4 mr-1" />
                                        Most Popular
                                    </Badge>
                                </div>
                            )}
                            
                            <CardHeader className="text-center pb-6">
                                <div className="flex justify-center mb-4">
                                    <Badge variant="secondary" className="px-3 py-1">
                                        {plan.badge}
                                    </Badge>
                                </div>
                                
                                <CardTitle className="text-xl font-bold mb-2">{plan.name}</CardTitle>
                                <CardDescription className="text-muted-foreground text-sm mb-6">
                                    {plan.description}
                                </CardDescription>

                                {/* Pricing */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-center">
                                        {plan.originalPrice && (
                                            <span className="text-sm text-muted-foreground line-through mr-2">
                                                ₹{plan.originalPrice.toLocaleString("en-IN")}
                                            </span>
                                        )}
                                        <span className="text-3xl font-bold text-primary">
                                            ₹{plan.price.toLocaleString("en-IN")}
                                        </span>
                                        <span className="text-muted-foreground text-sm ml-1">/month</span>
                                    </div>
                                    {plan.originalPrice && (
                                        <div className="text-xs text-green-600 font-medium">
                                            Save ₹{(plan.originalPrice - plan.price).toLocaleString("en-IN")} per month
                                        </div>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-6">
                                {/* Specifications */}
                                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
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
                                    <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                                        IP Range: {plan.specs.ip}
                                    </div>
                                </div>

                                {/* Features */}
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                                        Features Included
                                    </h4>
                                    <ul className="space-y-2">
                                        {plan.features.slice(0, 6).map((feature, i) => (
                                            <li key={i} className="flex items-start text-sm">
                                                <Check className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="text-xs text-muted-foreground">
                                        +{plan.features.length - 6} more features included
                                    </div>
                                </div>

                                {/* CTA Button */}
                                <div className="pt-4">
                                    <Link href={`/get-started?plan=${plan.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`}>
                                        <Button 
                                            className={`w-full py-4 text-base font-semibold ${
                                                plan.popular 
                                                    ? 'btn-primary' 
                                                    : 'btn-outline hover:btn-primary'
                                            }`}
                                        >
                                            {plan.popular ? '🚀 Get Started Now' : '📋 Choose This Plan'}
                                        </Button>
                                    </Link>
                                    <p className="text-xs text-muted-foreground text-center mt-3">
                                        💰 30-day money-back guarantee • ⚡ Instant setup
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Bottom CTA */}
                <div className="text-center mt-16 animate-fade-in">
                    <div className="inline-flex items-center px-6 py-3 bg-muted/50 rounded-full mb-6">
                        <span className="text-sm text-muted-foreground">
                            💡 Need help choosing the right plan? Our experts are here to help you find the perfect fit.
                        </span>
                    </div>
                    <Link href="/contact-sales">
                        <Button variant="outline" size="lg" className="px-8">
                            💬 Talk to Our Linux Experts
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    )
}