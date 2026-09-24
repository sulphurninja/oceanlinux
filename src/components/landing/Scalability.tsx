"use client";

import { ArrowUpCircle, ArrowDownCircle, Minimize2, Zap, TrendingUp, Settings } from "lucide-react"
import PremiumSection from "@/components/landing/PremiumSection"
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader"
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard"

const scalingOptions = [
  {
    icon: <ArrowUpCircle />,
    title: "Vertical Scaling",
    description: "Upgrade CPU, RAM, and storage instantly without downtime. Pay only for what you need.",
    features: ["Zero Downtime Upgrades", "Instant Resource Addition", "Flexible Billing", "Same Low Prices"],
  },
  {
    icon: <ArrowDownCircle />,
    title: "Horizontal Scaling",
    description: "Add VPS instances to handle traffic growth. Affordable pricing that scales with your business.",
    features: ["Load Balancing", "Multi-Server Management", "Unified Dashboard", "Cost-Effective"],
  },
  {
    icon: <Minimize2 />,
    title: "Smart Auto-Scaling",
    description: "Automatic scaling rules for traffic spikes — with budget controls to keep costs predictable.",
    features: ["Traffic-Based Scaling", "Cost Optimization", "Performance Monitoring", "Budget Controls"],
  },
]

export default function Scalability() {
  return (
    <PremiumSection id="scalability">
      <PremiumSectionHeader
        eyebrow="Scalability"
        title="Scale Without Breaking"
        titleAccent="Your Budget"
        description="Start small and grow on demand. Transparent pricing at every tier — no surprise bills."
      />

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6 mb-16">
        {scalingOptions.map((option, index) => (
          <PremiumFeatureCard
            key={index}
            icon={option.icon}
            title={option.title}
            description={option.description}
          >
            <div className="space-y-2">
              {option.features.map((feature, i) => (
                <div key={i} className="premium-spec-row">
                  <div className="premium-spec-dot" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </PremiumFeatureCard>
        ))}
      </div>

      <h3 className="text-2xl font-semibold text-white mb-6 tracking-tight text-center">Why Our Scaling Works</h3>
      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
        {[
          { icon: <TrendingUp />, title: "Cost-Effective Growth", desc: "Scale based on actual usage. No long-term contracts or hidden fees." },
          { icon: <Zap />, title: "Instant Deployment", desc: "New resources available in seconds, not hours." },
          { icon: <Settings />, title: "Simple Management", desc: "One dashboard to manage all your VPS instances." },
        ].map((item) => (
          <PremiumFeatureCard
            key={item.title}
            icon={item.icon}
            title={item.title}
            description={item.desc}
          />
        ))}
      </div>
    </PremiumSection>
  )
}
