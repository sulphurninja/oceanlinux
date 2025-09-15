import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Check, Zap, Shield, Globe, DollarSign, Star, IndianRupee } from "lucide-react"

export default function Hero() {
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
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm morder dark:morder-none morder dark:morder-none-white/20 mb-6">
                            <IndianRupee className="w-4 h-4 mr-2 text-green-400" />
                            <span className="text-sm font-medium">Most Affordable Linux VPS • Premium Quality</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                            Most Affordable
                            <span className="text-gradient block"> Premium Linux VPS Hosting</span>
                        </h1>

                        <p className="text-xl text-white/90 mb-8 max-w-2xl">
                            Get professional Linux hosting at unbeatable prices. Choose from our premium rotating servers,
                            nova series, and power-packed options. Perfect for businesses that want quality without breaking the bank.
                        </p>

                        {/* Feature List */}
                        <div className="grid sm:grid-cols-2 gap-4 mb-8">
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>💰 Best Prices in the Market</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>🔄 Premium Rotating IP Servers</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>🚀 Nova & Power Linux Series</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>🛠️ Full Root Access & Control</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>🔒 Enterprise-Grade Security</span>
                            </div>
                            <div className="flex items-center text-white/90">
                                <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                                <span>⚡ Instant Setup & Deployment</span>
                            </div>
                        </div>

                        {/* Popular Products Showcase */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 mb-8 morder dark:morder-none morder dark:morder-none-white/10">
                            <h3 className="text-lg font-semibold mb-3 text-white">🔥 Popular Linux Series:</h3>
                            <div className="grid sm:grid-cols-2 gap-3 text-sm">
                                <div className="flex items-center text-white/80">
                                    <Star className="w-4 h-4 text-yellow-400 mr-2" />
                                    <span>Gold Series (103.183.xx) - Premium Rotating</span>
                                </div>
                                <div className="flex items-center text-white/80">
                                    <Star className="w-4 h-4 text-yellow-400 mr-2" />
                                    <span>Nova Linux (163.227) - High Performance</span>
                                </div>
                                <div className="flex items-center text-white/80">
                                    <Star className="w-4 h-4 text-yellow-400 mr-2" />
                                    <span>Power Linux (149.13) - Maximum Power</span>
                                </div>
                                <div className="flex items-center text-white/80">
                                    <Star className="w-4 h-4 text-yellow-400 mr-2" />
                                    <span>Titan Series (103.15.xx) - Enterprise Grade</span>
                                </div>
                            </div>
                        </div>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row gap-4 mb-12">
                            <Link href="/get-started">
                                <Button size="lg" className="btn-primary px-8 py-4 text-lg font-semibold w-full sm:w-auto">
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
                    <div className="relative animate-fade-in">
                        <div className="relative z-10 glass rounded-2xl p-6 morder dark:morder-none morder dark:morder-none-white/20">
                            <div className="bg-gradient-to-br from-card to-muted rounded-xl p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-lg font-semibold">Most Affordable Plans</h3>
                                        <p className="text-sm text-muted-foreground">Premium quality, budget-friendly prices</p>
                                    </div>
                                    <div className="flex space-x-1">
                                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                    </div>
                                </div>

                                {/* Server Options Preview */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg hover:bg-background/70 transition-colors">
                                        <div>
                                            <span className="text-sm font-medium">🔄 Gold Series Premium</span>
                                            <div className="text-xs text-muted-foreground">103.183.xx • Rotating IP</div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-green-400 font-bold">₹599/mo</span>
                                            <div className="text-xs line-through text-muted-foreground">₹999</div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg hover:bg-background/70 transition-colors">
                                        <div>
                                            <span className="text-sm font-medium">🚀 Nova Linux</span>
                                            <div className="text-xs text-muted-foreground">163.227 • High Performance</div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-blue-400 font-bold">₹799/mo</span>
                                            <div className="text-xs line-through text-muted-foreground">₹1299</div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg hover:bg-background/70 transition-colors">
                                        <div>
                                            <span className="text-sm font-medium">🔋 Power Linux</span>
                                            <div className="text-xs text-muted-foreground">149.13 • Maximum Power</div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-purple-400 font-bold">₹899/mo</span>
                                            <div className="text-xs line-through text-muted-foreground">₹1499</div>
                                        </div>
                                    </div>
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
