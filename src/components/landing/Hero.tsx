"use client";

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Check, Zap, Shield, Globe, DollarSign, Star, IndianRupee } from "lucide-react"
import { useEffect, useState } from "react"

interface PopularPlan {
    name: string;
    orderCount: number;
    avgPrice: number;
    totalRevenue: number;
    rank: number;
}

export default function Hero() {
    const [popularPlans, setPopularPlans] = useState<PopularPlan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPopularPlans = async () => {
            try {
                const response = await fetch('/api/popular-plans');
                const data = await response.json();
                if (data.success && data.plans.length > 0) {
                    setPopularPlans(data.plans.slice(0, 4)); // Top 4 plans
                }
            } catch (error) {
                console.error('Error fetching popular plans:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPopularPlans();
    }, []);
    return (
        <section className="section-padding gradient- relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
            </div>

            <div className="container mx-auto container-padding relative z-10">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    {/* Content */}
                    <div className="text-white animate-slide-up">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm morder dark:morder-none morder dark:morder-none-white/20 mb-6 w-fit text-xs md:text-sm">
                            <IndianRupee className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-xs md:text-sm font-medium">Most Affordable Linux VPS • Premium Quality</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                            Most Affordable
                            <span className="text-primary block"> Premium Linux VPS Hosting</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-2xl">
                            Get professional Linux hosting at unbeatable prices. Choose from our premium rotating servers,
                            nova series, and power-packed options. Perfect for businesses that want quality without breaking the bank.
                        </p>

                        {/* Feature List */}
                        <div className="grid sm:grid-cols-2 gap-4 mb-8">
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span> Best Prices in the Market</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>Premium Rotating IP Servers</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>Nova & Power Linux Series</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>Full Root Access & Control</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>Enterprise-Grade Security</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>Instant Setup & Deployment</span>
                            </div>
                        </div>

                        {/* Popular Products Showcase */}
                        <div className="bg-white/5 mx-4 backdrop-blur-sm rounded-xl p-4 mb-8 morder dark:morder-none morder dark:morder-none-white/10">
                            <h3 className="text-lg font-semibold mb-3 text-white">
                                🔥 {popularPlans.length > 0 ? 'Most Popular This Week' : 'Popular Linux Series'}:
                            </h3>
                            {loading ? (
                                <div className="text-center text-white/60 py-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/60 mx-auto"></div>
                                    <p className="text-sm mt-2">Loading popular plans...</p>
                                </div>
                            ) : popularPlans.length > 0 ? (
                                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                                    {popularPlans.map((plan, index) => (
                                        <div key={index} className="flex items-center text-white/80">
                                            {/* <Star className="w-4 h-4 text-yellow-400 mr-2 flex-shrink-0" /> */}
                                            <span className="line-clamp-1">{plan.name}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-white/60 text-sm text-center py-2">
                                    Check out our premium Linux VPS plans in the pricing section below
                                </p>
                            )}
                        </div>

                        {/* CTA Buttons */}
                        <div className="flex md:grid flex-col sm:flex-row md:justify-start justify-center gap-4 mb-12">
                            <Link href="/get-started">
                                <Button size="lg" className="btn-primary md:ml-0 ml-4 px-8 py-4 text-sm md:text-lg font-semibold md:w-fit w-fit sm:w-auto">
                                    🚀 Get Most Affordable VPS Now
                                </Button>
                            </Link>
                            <Link href="/live-chat">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="morder dark:morder-none-white/30 text-white hover:bg-white/10 backdrop-blur-sm px-8 py-4 text-lg font-semibold w-full sm:w-auto"
                                >
                                    💬 Chat for Best Price
                                </Button>
                            </Link>
                        </div>

                        {/* Trust Indicators */}
                        <div className="flex flex-wrap items-center gap-6 text-white/70">
                            <div className="flex items-center">
                                <IndianRupee className="w-5 h-5 mr-2 text-green-400" />
                                <span className="text-sm font-medium">Best Value Guarantee</span>
                            </div>
                            <div className="flex items-center">
                                <Shield className="w-5 h-5 mr-2 text-blue-400" />
                                <span className="text-sm font-medium">Enterprise Security</span>
                            </div>
                            <div className="flex items-center">
                                <Globe className="w-5 h-5 mr-2 text-purple-400" />
                                <span className="text-sm font-medium">Global Network</span>
                            </div>
                            <div className="flex items-center">
                                <span className="text-sm font-medium">⭐ 4.9/5 Customer Rating</span>
                            </div>
                        </div>
                    </div>

                    {/* Hero Visual/Dashboard */}
                    <div className="relative -ml-1 animate-fade-in">
                        <div className="relative z-10 glass rounded-2xl  p-4 sm:p-6 morder dark:morder-none morder dark:morder-none-white/20">
                            <div className="bg-gradient-to-br from-card to-muted rounded-xl p-4 sm:p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="min-w-0 flex-1 pr-2">
                                        <h3 className="text-base sm:text-lg font-semibold truncate">Most Affordable Plans</h3>
                                        <p className="text-xs sm:text-sm text-muted-foreground truncate">Premium quality, budget-friendly prices</p>
                                    </div>
                                    <div className="flex space-x-1 flex-shrink-0">
                                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                    </div>
                                </div>

                                {/* Server Options Preview */}
                                <div className="space-y-3 w-64  md:w-full">
                                    {loading ? (
                                        <div className="text-center py-8">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                                            <p className="text-sm text-muted-foreground mt-2">Loading popular plans...</p>
                                        </div>
                                    ) : popularPlans.length > 0 ? (
                                        popularPlans.slice(0, 3).map((plan, index) => {
                                            const colors = ['green', 'blue', 'purple', 'orange'];
                                            const color = colors[index % colors.length];
                                            return (
                                                <div key={index} className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-background/50 rounded-lg hover:bg-background/70 transition-colors">
                                                    <div className="flex-1 min-w-0 overflow-hidden">
                                                        <span className="text-xs sm:text-sm font-medium block truncate" title={plan.name}>
                                                            {plan.name}
                                                        </span>
                                                        <div className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                                                            {plan.orderCount} orders
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 min-w-[70px] sm:min-w-[80px]">
                                                        <span className={`text-xs sm:text-sm font-bold block text-${color}-400 whitespace-nowrap`}>
                                                            ₹{plan.avgPrice}/mo
                                                        </span>
                                                        <div className="text-[9px] sm:text-xs text-muted-foreground whitespace-nowrap">Avg. price</div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center py-8">
                                            <p className="text-sm text-muted-foreground">
                                                Browse our affordable Linux VPS plans below
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Quick Stats */}
                                <div className="grid grid-cols-3 gap-4 mt-6 pt-4 morder dark:morder-none-t morder dark:morder-none-morder dark:morder-none/50">
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-green-400">40%</div>
                                        <div className="text-xs text-muted-foreground">Cost Savings</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-blue-400">99.99%</div>
                                        <div className="text-xs text-muted-foreground">Uptime</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-purple-400">24/7</div>
                                        <div className="text-xs text-muted-foreground">Support</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating Elements */}
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-secondary/20 rounded-full blur-xl"></div>
                    </div>
                </div>

                {/* Bottom Trust Bar */}
                <div className="mt-16 pt-12 morder dark:morder-none-t morder dark:morder-none-white/10 animate-fade-in">
                    <div className="text-center text-white/80 mb-6">
                        <p className="text-lg font-medium">Join thousands of satisfied customers who chose affordability without compromise</p>
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-8 text-white/60">
                        <div className="flex items-center">
                            <span className="text-2xl font-bold mr-2">5000+</span>
                            <span className="text-sm">Happy Customers</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-2xl font-bold mr-2">99.9%</span>
                            <span className="text-sm">Uptime Guaranteed</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-2xl font-bold mr-2">24/7</span>
                            <span className="text-sm">Expert Support</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-2xl font-bold mr-2">40%</span>
                            <span className="text-sm">Lower Costs</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
