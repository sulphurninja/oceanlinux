import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Zap, DollarSign, Clock, Star, IndianRupee } from "lucide-react"

export default function CTA() {
    return (
        <section className="section-padding gradient- text-center relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center"></div>
            </div>

            <div className="container mx-auto container-padding relative z-10">
                {/* Main CTA Content */}
                <div className="text-white animate-fade-in">
                    <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border dark:border-none border dark:border-none-white/20 mb-6">
                        <IndianRupee className="w-4 h-4 mr-2 text-green-400" />
                        <span className="text-sm font-medium">Most Affordable Premium Linux VPS Hosting</span>
                    </div>

                    <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                        Ready to Start Your
                        <span className="text-primary block"> Affordable Linux Journey?</span>
                    </h2>

                    <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto">
                        Join thousands of developers and businesses who chose quality over cost.
                        Experience premium Linux VPS hosting at prices that make sense for your budget.
                    </p>

                    {/* Value Propositions */}
                    <div className="grid sm:grid-cols-3 gap-6 mb-12 max-w-4xl mx-auto">
                        <div className="flex items-center justify-center text-white/90">
                            <Zap className="w-5 h-5 text-yellow-400 mr-3" />
                            <span> Instant Setup in 60 seconds</span>
                        </div>
                        <div className="flex items-center justify-center text-white/90">
                            <IndianRupee className="w-5 h-5 text-green-400 mr-3" />
                            <span> 30-Day Money-Back Guarantee</span>
                        </div>
                        <div className="flex items-center justify-center text-white/90">
                            <Clock className="w-5 h-5 text-blue-400 mr-3" />
                            <span> No Hidden Costs</span>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                        <Link href="/get-started">
                            <Button size="lg" className="btn-primary px-10 py-6 text-xl font-bold w-full sm:w-auto shadow-2xl">
                                🚀 Get Your Affordable VPS Now
                            </Button>
                        </Link>
                        <Link href="/pricing">
                            <Button
                                size="lg"
                                variant="outline"
                                className="border dark:border-none-white/30 text-white hover:bg-white/10 backdrop-blur-sm px-10 py-6 text-xl font-bold w-full sm:w-auto"
                            >
                                View All Plans & Pricing
                            </Button>
                        </Link>
                    </div>

                    {/* What You Get */}
                    <div className="glass rounded-2xl p-8 mb-12 max-w-4xl mx-auto">
                        <h3 className="text-2xl font-bold mb-6">🎯 What You Get With Every Plan</h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="text-center p-4 rounded-xl bg-background/20">
                                <div className="text-2xl font-bold text-green-400 mb-1">40%</div>
                                <div className="text-sm text-white/80">Lower Costs</div>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-background/20">
                                <div className="text-2xl font-bold text-blue-400 mb-1">FREE</div>
                                <div className="text-sm text-white/80">SSL Certificate</div>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-background/20">
                                <div className="text-2xl font-bold text-purple-400 mb-1">ROOT</div>
                                <div className="text-sm text-white/80">Full Access</div>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-background/20">
                                <div className="text-2xl font-bold text-yellow-400 mb-1">24/7</div>
                                <div className="text-sm text-white/80">Expert Support</div>
                            </div>
                        </div>
                    </div>

                    {/* Trust Signals */}
                    <div className="flex flex-wrap justify-center items-center gap-8 text-white/70">
                        <div className="flex items-center">
                            <Star className="w-5 h-5 text-yellow-400 mr-2" />
                            <span className="text-sm font-medium">4.9/5 Customer Rating</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-sm font-medium">🛡️ Enterprise Security</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-sm font-medium">⚡ 99.9% Uptime SLA</span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-sm font-medium">🌍 Global Data Centers</span>
                        </div>
                    </div>
                </div>

                {/* Floating Elements */}
                <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-secondary/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            </div>
        </section>
    )
}
