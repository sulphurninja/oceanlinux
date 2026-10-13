"use client";

import Link from "next/link";
import { Check, Shield, Globe, IndianRupee, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useHeroParallax } from "@/hooks/useTilt3D";
import Hero3DScene from "@/components/landing/Hero3DScene";
import Tilt3DCard from "@/components/landing/Tilt3DCard";
import { stripEmojis } from "@/lib/stripEmojis";

interface PopularPlan {
  name: string;
  orderCount: number;
  avgPrice: number;
  totalRevenue: number;
  rank: number;
}

const FEATURES = [
  "Best Prices in the Market",
  "Premium Rotating IP Servers",
  "Nova & Power Linux Series",
  "Full Root Access & Control",
  "Enterprise-Grade Security",
  "Instant Setup & Deployment",
];

const PLAN_PRICE_COLOR = "text-emerald-300";

export default function Hero() {
  const [popularPlans, setPopularPlans] = useState<PopularPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const fetchPopularPlans = async () => {
      try {
        const response = await fetch("/api/popular-plans");
        const data = await response.json();
        if (data.success && data.plans.length > 0) {
          setPopularPlans(data.plans.slice(0, 4));
        }
      } catch (error) {
        console.error("Error fetching popular plans:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPopularPlans();
  }, []);

  const marqueePlans =
    popularPlans.length > 1 ? [...popularPlans, ...popularPlans] : popularPlans;

  const { ref: heroRef, offset } = useHeroParallax(22);

  return (
    <>
    <section
      ref={heroRef}
      className="hero-premium-bg relative overflow-hidden min-w-0 w-full pt-8 pb-10 sm:pt-12 sm:pb-14 lg:pt-16 lg:pb-20"
    >
      <Hero3DScene parallaxX={offset.x} parallaxY={offset.y} />

      {/* Animated background */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div
          className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center transition-transform duration-300 ease-out"
          style={{ transform: `translate3d(${offset.x * 0.15}px, ${offset.y * 0.15}px, 0)` }}
        />
      </div>
      <div
        className="absolute -top-24 -left-24 w-48 h-48 sm:w-72 sm:h-72 bg-primary/30 rounded-full blur-3xl animate-hero-glow pointer-events-none transition-transform duration-300 hidden sm:block"
        style={{ transform: `translate3d(${offset.x * 1.8}px, ${offset.y * 1.8}px, 0)` }}
      />
      <div
        className="absolute top-1/3 -right-32 w-64 h-64 md:w-96 md:h-96 bg-emerald-500/20 rounded-full blur-3xl animate-hero-glow pointer-events-none [animation-delay:1.5s] transition-transform duration-300 hidden md:block"
        style={{ transform: `translate3d(${offset.x * -1.2}px, ${offset.y * 1.2}px, 0)` }}
      />
      <div
        className="absolute bottom-0 left-1/3 w-64 h-64 bg-teal-400/15 rounded-full blur-3xl animate-pulse pointer-events-none transition-transform duration-300"
        style={{ transform: `translate3d(${offset.x}px, ${offset.y * -0.8}px, 0)` }}
      />

      <div className="container mx-auto container-padding relative z-10 min-w-0">
        <div className="grid gap-8 md:grid-cols-2 md:gap-10 lg:gap-14 xl:gap-16 md:items-center">
          <div className="text-white min-w-0 text-center md:text-left md:col-start-1 md:row-start-1">
            <div
              className={cn(
                "hero-premium-badge mb-5 sm:mb-6 w-fit max-w-full mx-auto md:mx-0 text-white",
                mounted && "animate-slide-up opacity-0 stagger-1 [animation-fill-mode:forwards]"
              )}
            >
              <span className="hero-premium-badge-dot" aria-hidden />
              <IndianRupee className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              <span className="leading-snug text-balance">
                <span className="sm:hidden">Most Affordable Linux VPS</span>
                <span className="hidden sm:inline">Most Affordable Linux VPS · Premium Quality</span>
                <span className="sm:hidden block text-white/70">Premium Quality</span>
              </span>
            </div>

            <p
              className={cn(
                "hero-premium-eyebrow",
                mounted && "animate-slide-up opacity-0 stagger-1 [animation-fill-mode:forwards]"
              )}
            >
              Enterprise-grade hosting
            </p>

            <h1
              className={cn(
                "hero-premium-headline mb-2",
                mounted && "animate-slide-up opacity-0 stagger-2 [animation-fill-mode:forwards]"
              )}
            >
              <span className="hero-premium-line-light">Most Affordable</span>
              <span className="hero-premium-line-accent">
                <em>Premium</em> Linux VPS Hosting
              </span>
            </h1>

            <div
              className={cn(
                "hero-premium-divider mx-auto md:mx-0",
                mounted && "animate-slide-up opacity-0 stagger-2 [animation-fill-mode:forwards]"
              )}
              aria-hidden
            >
              <span>◆</span>
            </div>

            <p
              className={cn(
                "hero-premium-lead mb-6 sm:mb-8 mt-4 mx-auto md:mx-0",
                mounted && "animate-slide-up opacity-0 stagger-3 [animation-fill-mode:forwards]"
              )}
            >
              Get professional Linux hosting at unbeatable prices. Choose from our premium rotating
              servers, nova series, and power-packed options. Perfect for businesses that want quality
              without breaking the bank.
            </p>

            <div
              className={cn(
                "flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 justify-center md:justify-start",
                mounted && "animate-slide-up opacity-0 stagger-4 [animation-fill-mode:forwards]"
              )}
            >
              <Link href="/get-started" className="w-full sm:w-auto">
                <button type="button" className="premium-btn-primary w-full sm:w-auto px-8">
                  Get Started
                </button>
              </Link>
              <Link href="/live-chat" className="w-full sm:w-auto">
                <button type="button" className="premium-btn-outline w-full sm:w-auto px-8">
                  Chat for Best Price
                </button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-white/70 text-sm">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-300" />
                <span>Best Value Pricing</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-300" />
                <span>Enterprise Security</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-300" />
                <span>Managed VPS Service</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-emerald-300" />
                <span>4.9/5 Rating</span>
              </div>
            </div>
          </div>

          <div className="min-w-0 w-full md:col-start-2 md:row-start-1 md:row-span-2">
            <Tilt3DCard
              maxTilt={4}
              scale={1.01}
              className="relative z-10 w-full min-w-0"
              innerClassName="rounded-2xl p-px bg-gradient-to-br from-white/10 via-emerald-400/10 to-white/0 w-full min-w-0"
            >
              <div className="rounded-2xl hero-premium-glass backdrop-blur-md p-4 sm:p-6 min-w-0 !bg-emerald-950/70">
                <h2 id="affordable-plans-heading" className="text-lg sm:text-xl font-semibold text-white leading-tight">
                  Most Affordable Plans
                </h2>
                <p className="text-sm text-white/70 mt-1">
                  Premium quality, budget-friendly prices
                </p>

                <div className="space-y-3 mt-5 w-full min-w-0">
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-300 mx-auto" />
                      <p className="text-sm text-white/70 mt-2">Loading popular plans...</p>
                    </div>
                  ) : popularPlans.length > 0 ? (
                    popularPlans.slice(0, 3).map((plan) => (
                      <Link key={plan.name} href="/get-started" className="block min-w-0 w-full">
                        <div className="hero-plan-row group">
                          <div className="min-w-0 flex-1 w-full">
                            <span className="hero-plan-row-name" title={plan.name}>
                              {stripEmojis(plan.name)}
                            </span>
                            <div className="hero-plan-row-meta">
                              {plan.orderCount} orders
                            </div>
                          </div>
                          <div className="hero-plan-row-price">
                            <span className={cn("hero-plan-row-amount", PLAN_PRICE_COLOR)}>
                              ₹{plan.avgPrice}/mo
                            </span>
                            <div className="hero-plan-row-price-label">Avg. price</div>
                          </div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-white/70 text-center py-8">
                      Browse our affordable Linux VPS plans below
                    </p>
                  )}
                </div>

                <div className="hero-pricing-stats">
                  <div className="hero-pricing-stat">
                    <div className="hero-pricing-stat-value text-emerald-300">40%</div>
                    <div className="hero-pricing-stat-label">Cost Savings</div>
                  </div>
                  <div className="hero-pricing-stat">
                    <div className="hero-pricing-stat-value text-emerald-300">99.99%</div>
                    <div className="hero-pricing-stat-label">Uptime</div>
                  </div>
                  <div className="hero-pricing-stat">
                    <div className="hero-pricing-stat-value text-emerald-300">24/7</div>
                    <div className="hero-pricing-stat-label">Support</div>
                  </div>
                </div>
              </div>
            </Tilt3DCard>
          </div>

          <div className="min-w-0 md:col-start-1 md:row-start-2 space-y-6">
            <div className="grid sm:grid-cols-2 gap-3 text-left">
              {FEATURES.map((feature) => (
                <div key={feature} className="hero-feature-item">
                  <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div
              className={cn(
                "hero-premium-glass backdrop-blur-md rounded-2xl p-4 sm:p-5 text-left",
                mounted && "animate-slide-up opacity-0 stagger-5 [animation-fill-mode:forwards]"
              )}
            >
              <h2 className="text-base font-semibold mb-3 text-white flex items-center justify-center md:justify-start gap-2">
                <span className="text-emerald-300" aria-hidden="true">◆</span>
                {popularPlans.length > 0 ? "Most Popular This Week" : "Popular Linux Series"}
              </h2>
              {loading ? (
                <div className="text-center text-white/70 py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/70 mx-auto" />
                  <p className="text-sm mt-2">Loading popular plans...</p>
                </div>
              ) : popularPlans.length > 0 ? (
                <div className="relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[rgba(0,0,0,0.35)] to-transparent z-10 pointer-events-none" />
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[rgba(0,0,0,0.35)] to-transparent z-10 pointer-events-none" />
                  <div
                    className={cn(
                      "flex gap-3 w-max",
                      popularPlans.length > 2 && "animate-marquee hover:[animation-play-state:paused]"
                    )}
                  >
                    {(popularPlans.length > 2 ? marqueePlans : popularPlans).map((plan, index) => (
                      <div
                        key={`${plan.name}-${index}`}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm shrink-0 max-w-[16rem] sm:max-w-xs hover:bg-white/10 transition-all duration-300"
                      >
                        <span className="truncate" title={plan.name}>{stripEmojis(plan.name)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-white/70 text-sm text-center py-2">
                  Check out our premium Linux VPS plans in the pricing section below
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Bottom trust bar */}
        <div className="mt-10 lg:mt-14">
          <p className="text-center text-sm sm:text-base text-white/70 mb-4">
            Join thousands of customers who chose affordability without compromise
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { value: "5000+", label: "Happy Customers" },
              { value: "99.9%", label: "Uptime Guaranteed" },
              { value: "24/7", label: "Expert Support" },
              { value: "40%", label: "Lower Costs" },
            ].map((stat) => (
              <div key={stat.label} className="hero-trust-stat">
                <span className="text-xl sm:text-2xl font-bold text-white">{stat.value}</span>
                <span className="text-sm text-white/70">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
    </>
  );
}
