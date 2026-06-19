"use client";

import { Button } from "@/components/ui/button";
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

const PLAN_PRICE_COLORS = ["text-emerald-400", "text-emerald-300", "text-emerald-400"] as const;

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
    <section
      ref={heroRef}
      className="section-padding hero-premium-bg relative overflow-hidden min-w-0 w-full lg:min-h-0"
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
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-w-0">
          {/* Left — copy & features */}
          <div className="text-white min-w-0">
            <div
              className={cn(
                "hero-premium-badge mb-6 w-full max-w-full sm:w-fit text-white/90",
                mounted && "animate-slide-up opacity-0 stagger-1 [animation-fill-mode:forwards]"
              )}
            >
              <span className="hero-premium-badge-dot" aria-hidden />
              <IndianRupee className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              <span className="leading-snug text-balance">
                <span className="sm:hidden">Most Affordable Linux VPS</span>
                <span className="hidden sm:inline">Most Affordable Linux VPS · Premium Quality</span>
                <span className="sm:hidden block text-white/75">Premium Quality</span>
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
                "hero-premium-divider",
                mounted && "animate-slide-up opacity-0 stagger-2 [animation-fill-mode:forwards]"
              )}
              aria-hidden
            >
              <span>◆</span>
            </div>

            <p
              className={cn(
                "hero-premium-lead mb-8 mt-4",
                mounted && "animate-slide-up opacity-0 stagger-3 [animation-fill-mode:forwards]"
              )}
            >
              Get professional Linux hosting at unbeatable prices. Choose from our premium rotating
              servers, nova series, and power-packed options. Perfect for businesses that want quality
              without breaking the bank.
            </p>

            <div
              className={cn(
                "grid sm:grid-cols-2 gap-3 sm:gap-4 mb-8",
                mounted && "animate-slide-up opacity-0 stagger-3 [animation-fill-mode:forwards]"
              )}
            >
              {FEATURES.map((feature, i) => (
                <div
                  key={feature}
                  className="hero-feature-item hero-feature-3d"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {/* Most Popular — horizontal ticker on mobile/desktop */}
            <div
              className={cn(
                "hero-premium-glass backdrop-blur-md rounded-2xl p-4 sm:p-5 mb-8",
                mounted && "animate-slide-up opacity-0 stagger-4 [animation-fill-mode:forwards]"
              )}
            >
              <h3 className="text-sm sm:text-base font-semibold mb-3 text-white/95 flex items-center gap-2 tracking-wide">
                <span className="text-emerald-300">◆</span>
                {popularPlans.length > 0 ? "Most Popular This Week" : "Popular Linux Series"}:
              </h3>
              {loading ? (
                <div className="text-center text-white/60 py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/60 mx-auto" />
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
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/85 text-xs sm:text-sm shrink-0 max-w-[280px] sm:max-w-xs hover:bg-white/10 hover:border-primary/40 transition-all duration-300"
                      >
                        <span className="line-clamp-1">{stripEmojis(plan.name)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-white/60 text-sm text-center py-2">
                  Check out our premium Linux VPS plans in the pricing section below
                </p>
              )}
            </div>

            {/* CTAs */}
            <div
              className={cn(
                "flex flex-col sm:flex-row gap-4 mb-10",
                mounted && "animate-slide-up opacity-0 stagger-5 [animation-fill-mode:forwards]"
              )}
            >
              <Link href="/get-started" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="btn-primary w-full sm:w-auto px-8 py-4 text-sm md:text-lg font-semibold hover:scale-[1.03] active:scale-[0.98] transition-transform"
                >
                  Get Started
                </Button>
              </Link>
              <Link href="/live-chat" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 backdrop-blur-sm px-8 py-4 text-base lg:text-lg font-semibold w-full sm:w-auto hover:scale-[1.03] active:scale-[0.98] transition-transform"
                >
                  Chat for Best Price
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-white/50 text-sm">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-400" />
                <span>Best Value Pricing</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Enterprise Security</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Managed VPS Service</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-emerald-400" />
                <span>4.9/5 Rating</span>
              </div>
            </div>
          </div>

          {/* Right — pricing card (3D tilt) */}
          <div
            className={cn(
              "hero-pricing-card-wrap relative w-full min-w-0 max-w-full mx-auto lg:max-w-none lg:mx-0 overflow-hidden",
              mounted && "animate-fade-in opacity-0 stagger-4 [animation-fill-mode:forwards]"
            )}
          >
            <Tilt3DCard
              maxTilt={8}
              scale={1.01}
              float
              className="relative z-10 w-full min-w-0 max-w-full"
              innerClassName="rounded-2xl p-[1px] bg-gradient-to-br from-white/25 via-emerald-400/20 to-white/5 w-full min-w-0 max-w-full overflow-hidden"
            >
              <div className="glass rounded-2xl p-3 sm:p-5 border-0 bg-[rgba(8,20,14,0.85)] min-w-0 w-full overflow-hidden">
              <div className="bg-gradient-to-br from-[rgba(255,255,255,0.06)] to-transparent rounded-xl p-3 sm:p-5 border border-white/10 min-w-0 w-full overflow-hidden">
                <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm sm:text-lg font-semibold text-white leading-tight">Most Affordable Plans</h3>
                    <p className="text-[11px] sm:text-sm text-white/55 mt-0.5 leading-snug">
                      Premium quality, budget-friendly prices
                    </p>
                  </div>
                  <div className="flex space-x-1.5 flex-shrink-0 pt-0.5">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 rounded-full" />
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-yellow-500 rounded-full" />
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full animate-pulse" />
                  </div>
                </div>

                <div className="space-y-2 sm:space-y-3 w-full min-w-0">
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">Loading popular plans...</p>
                    </div>
                  ) : popularPlans.length > 0 ? (
                    popularPlans.slice(0, 3).map((plan, index) => (
                      <Link key={plan.name} href="/get-started" className="block min-w-0 w-full">
                        <div className="hero-plan-row group">
                          <div className="min-w-0 flex-1 w-full">
                            <span
                              className="hero-plan-row-name"
                              title={plan.name}
                            >
                              {stripEmojis(plan.name)}
                            </span>
                            <div className="hero-plan-row-meta sm:block">
                              {plan.orderCount} orders
                            </div>
                          </div>
                          <div className="hero-plan-row-price">
                            <span className="text-[10px] sm:hidden text-muted-foreground">Avg. price</span>
                            <div className="text-right">
                              <span
                                className={cn(
                                  "hero-plan-row-amount",
                                  PLAN_PRICE_COLORS[index % PLAN_PRICE_COLORS.length]
                                )}
                              >
                                ₹{plan.avgPrice}/mo
                              </span>
                              <div className="hero-plan-row-price-label hidden sm:block">
                                Avg. price
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">
                        Browse our affordable Linux VPS plans below
                      </p>
                    </div>
                  )}
                </div>

                <div className="hero-pricing-stats">
                  <div className="hero-pricing-stat hover:bg-white/5 transition-colors">
                    <div className="hero-pricing-stat-value text-emerald-300">40%</div>
                    <div className="hero-pricing-stat-label">Cost Savings</div>
                  </div>
                  <div className="hero-pricing-stat hover:bg-white/5 transition-colors">
                    <div className="hero-pricing-stat-value text-emerald-300/90">99.99%</div>
                    <div className="hero-pricing-stat-label">Uptime</div>
                  </div>
                  <div className="hero-pricing-stat hover:bg-white/5 transition-colors">
                    <div className="hero-pricing-stat-value text-emerald-300/80">24/7</div>
                    <div className="hero-pricing-stat-label">Support</div>
                  </div>
                </div>
              </div>
              </div>
            </Tilt3DCard>

            <div
              className="absolute -top-6 -right-6 w-24 h-24 bg-primary/25 rounded-full blur-xl animate-hero-glow pointer-events-none transition-transform duration-300 hidden sm:block"
              style={{ transform: `translate3d(${offset.x * 2}px, ${offset.y * 2}px, 0)` }}
            />
            <div
              className="absolute -bottom-6 -left-6 w-32 h-32 bg-secondary/20 rounded-full blur-xl pointer-events-none transition-transform duration-300 hidden sm:block"
              style={{ transform: `translate3d(${offset.x * -1.5}px, ${offset.y * -1.5}px, 0)` }}
            />
          </div>
        </div>

        {/* Bottom trust bar */}
        <div className="mt-12 lg:mt-16 pt-8 lg:pt-12 border-t border-white/10 animate-fade-in">
          <div className="text-center text-white/80 mb-6 px-2">
            <p className="text-base sm:text-lg font-medium">
              Join thousands of satisfied customers who chose affordability without compromise
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center items-center gap-6 sm:gap-8 text-white/60">
            {[
              { value: "5000+", label: "Happy Customers" },
              { value: "99.9%", label: "Uptime Guaranteed" },
              { value: "24/7", label: "Expert Support" },
              { value: "40%", label: "Lower Costs" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col sm:flex-row items-center text-center sm:text-left hero-stat-3d p-3 rounded-xl"
              >
                <span className="text-xl sm:text-2xl font-bold sm:mr-2">{stat.value}</span>
                <span className="text-xs sm:text-sm">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
