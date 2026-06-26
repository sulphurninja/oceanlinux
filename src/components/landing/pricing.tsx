"use client";

import { Check, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Tilt3DCard from "@/components/landing/Tilt3DCard";
import PremiumSection from "@/components/landing/PremiumSection";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";
import { stripEmojis } from "@/lib/stripEmojis";

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
  };
}

interface PopularPlan {
  name: string;
  orderCount: number;
  avgPrice: number;
}

const PLANS_DISPLAY_LIMIT = 3;

const fallbackPlans: Plan[] = [
  {
    name: "Premium Gold Series",
    description: "Premium rotating Linux servers with high-quality IP ranges for reliable, affordable VPS hosting.",
    price: 599,
    originalPrice: 999,
    badge: "Most Popular",
    popular: true,
    specs: {
      cpu: "4 vCPU Cores",
      ram: "8GB DDR4 RAM",
      storage: "100GB NVMe SSD",
      bandwidth: "Unlimited",
      ip: "103.183.xx • 103.187.xx",
    },
    features: [
      "Premium rotating IP addresses",
      "High-speed NVMe SSD storage",
      "Advanced DDoS protection",
      "Enterprise-grade security",
      "24/7 email & chat support",
      "Full root access & control",
    ],
  },
  {
    name: "Nova Linux VPS",
    description: "High-performance Linux VPS designed for speed and reliability at market-leading prices.",
    price: 799,
    originalPrice: 1299,
    badge: "Best Performance",
    specs: {
      cpu: "6 vCPU Cores",
      ram: "12GB DDR4 RAM",
      storage: "150GB NVMe SSD",
      bandwidth: "Unlimited",
      ip: "163.227.xx",
    },
    features: [
      "Optimized for high performance",
      "Ultra-fast NVMe SSD storage",
      "Enhanced CPU performance",
      "Multi-layer security protection",
      "Advanced control panel",
      "Scalable resources on demand",
    ],
  },
  {
    name: "Power Linux VPS",
    description: "Maximum power for demanding applications with enterprise features at budget-friendly prices.",
    price: 899,
    originalPrice: 1499,
    badge: "Maximum Power",
    specs: {
      cpu: "8 vCPU Cores",
      ram: "16GB DDR4 RAM",
      storage: "200GB NVMe SSD",
      bandwidth: "Unlimited",
      ip: "149.13.xx",
    },
    features: [
      "Maximum processing power",
      "Premium NVMe SSD performance",
      "High-speed network connectivity",
      "Advanced security suite",
      "Priority support access",
      "Advanced server management",
    ],
  },
];

function planSlug(name: string) {
  return stripEmojis(name).toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

function PricingCard({ plan }: { plan: Plan }) {
  const cleanName = stripEmojis(plan.name);
  const cleanFeatures = plan.features.map(stripEmojis);

  return (
    <Tilt3DCard
      maxTilt={plan.popular ? 7 : 5}
      scale={1.012}
      className={`h-full ${plan.popular ? "lg:-mt-2 lg:mb-2" : ""}`}
      innerClassName="h-full"
    >
      <div
        className={`premium-pricing-card h-full ${plan.popular ? "popular" : ""}`}
        itemScope
        itemType="https://schema.org/Product"
        role="listitem"
      >
        <div className="premium-glass-card h-full flex flex-col p-6 sm:p-7">
          {plan.popular && (
            <div className="flex justify-center mb-5">
              <span className="premium-pricing-badge">
                <Star className="w-3 h-3" />
                Most Popular
              </span>
            </div>
          )}

          <div className={plan.popular ? "mb-6" : "mb-6 mt-1"}>
            {plan.badge && !plan.popular && (
              <span className="premium-tag mb-4 inline-block">{plan.badge}</span>
            )}
            <h3 className="text-lg font-semibold text-white tracking-tight mb-2 leading-snug" itemProp="name">
              {cleanName}
            </h3>
            <p className="text-sm text-white/45 leading-relaxed" itemProp="description">
              {stripEmojis(plan.description)}
            </p>
          </div>

          <div className="mb-6" itemProp="offers" itemScope itemType="https://schema.org/Offer">
            <meta itemProp="priceCurrency" content="INR" />
            <meta itemProp="availability" content="https://schema.org/InStock" />
            <div className="flex items-baseline gap-2">
              {plan.originalPrice && (
                <span className="text-sm text-white/30 line-through tabular-nums">
                  ₹{plan.originalPrice.toLocaleString("en-IN")}
                </span>
              )}
              <span className="premium-price" itemProp="price" content={plan.price.toString()}>
                ₹{plan.price.toLocaleString("en-IN")}
              </span>
              <span className="text-sm text-white/40">/mo</span>
            </div>
            {plan.originalPrice && (
              <p className="text-xs text-emerald-400/70 mt-1.5">
                Save ₹{(plan.originalPrice - plan.price).toLocaleString("en-IN")}/month
              </p>
            )}
          </div>

          <div className="premium-specs-box mb-6 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/35 mb-3">
              Specifications
            </p>
            {[
              ["CPU", plan.specs.cpu],
              ["RAM", plan.specs.ram],
              ["Storage", plan.specs.storage],
              ["Bandwidth", plan.specs.bandwidth],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-1">
                <span className="text-white/40">{label}</span>
                <span className="text-white/75 font-medium text-right">{value}</span>
              </div>
            ))}
            <div className="pt-2 mt-1 border-t border-white/[0.06] text-xs text-white/35">
              IP: {plan.specs.ip}
            </div>
          </div>

          <ul className="space-y-2.5 mb-8 flex-1">
            {cleanFeatures.map((feature, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-white/60">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Link href={`/get-started?plan=${planSlug(plan.name)}`} className="block w-full mt-auto shrink-0 relative z-[1]">
            <button
              type="button"
              className={`w-full min-h-11 px-6 py-3 text-sm sm:text-base font-semibold ${plan.popular ? "premium-btn-primary premium-btn-primary--card" : "premium-btn-outline premium-btn-outline--card"}`}
            >
              {plan.popular ? "Get Started" : "Choose Plan"}
            </button>
          </Link>
        </div>
      </div>
    </Tilt3DCard>
  );
}

export default function PricingSection() {
  const [displayPlans, setDisplayPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPopularPlans = async () => {
      try {
        const response = await fetch("/api/popular-plans");
        const data = await response.json();

        if (data.success && data.plans.length > 0) {
          const plansToDisplay = data.plans
            .slice(0, PLANS_DISPLAY_LIMIT)
            .map((plan: PopularPlan, index: number) => ({
              name: plan.name,
              description: `${plan.orderCount} orders in the last 7 days — a proven choice for Linux VPS hosting.`,
              price: plan.avgPrice,
              originalPrice: Math.round(plan.avgPrice * 1.5),
              badge: index === 0 ? "Most Popular" : index === 1 ? "Trending" : "Popular",
              popular: index === 0,
              specs: {
                cpu: "High Performance vCPU",
                ram: "Premium DDR4 RAM",
                storage: "NVMe SSD Storage",
                bandwidth: "Unlimited",
                ip: "Premium IP Range",
              },
              features: [
                "High-speed NVMe SSD storage",
                "Advanced DDoS protection",
                "Enterprise-grade security",
                "24/7 expert support",
                "Full root access",
                "Instant provisioning",
              ],
            }));
          setDisplayPlans(plansToDisplay);
        }
      } catch (error) {
        console.error("Error fetching popular plans:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPopularPlans();
  }, []);

  const plansToShow = (displayPlans.length > 0 ? displayPlans : fallbackPlans).slice(
    0,
    PLANS_DISPLAY_LIMIT
  );

  return (
    <PremiumSection id="pricing" aria-label="Linux VPS Hosting Pricing Plans">
      <div itemScope itemType="https://schema.org/OfferCatalog">
        <PremiumSectionHeader
          eyebrow={displayPlans.length > 0 ? "Trending Plans" : "Pricing"}
          title="Choose Your"
          titleAccent="Linux Server Series"
          description="Curated VPS plans with premium specs, managed by OceanLinux — transparent pricing, no hidden fees."
        />

        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mx-auto" />
            <p className="text-white/40 mt-4 text-sm">Loading plans…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7 max-w-6xl mx-auto" role="list">
            {plansToShow.map((plan, index) => (
              <PricingCard key={index} plan={plan} />
            ))}
          </div>
        )}

        <div className="text-center mt-16">
          <p className="text-sm text-white/45 mb-5 max-w-md mx-auto">
            Not sure which plan fits? Our team will help you choose the right configuration.
          </p>
          <Link href="/contact-sales">
            <button type="button" className="premium-btn-outline px-8 w-auto inline-flex">
              Talk to an Expert
            </button>
          </Link>
        </div>
      </div>
    </PremiumSection>
  );
}
