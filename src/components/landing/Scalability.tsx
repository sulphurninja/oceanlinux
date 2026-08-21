"use client";

import { ArrowUpCircle, ArrowDownCircle, Minimize2, Zap, TrendingUp, Settings } from "lucide-react"
import PremiumSection from "@/components/landing/PremiumSection"
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader"
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard"
import Tilt3DCard from "@/components/landing/Tilt3DCard"

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

      <div className="premium-panel">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <h3 className="text-2xl font-semibold text-white mb-6 tracking-tight">Why Our Scaling Works</h3>
            <div className="space-y-5">
              {[
                { icon: <TrendingUp />, title: "Cost-Effective Growth", desc: "Scale based on actual usage. No long-term contracts or hidden fees." },
                { icon: <Zap />, title: "Instant Deployment", desc: "New resources available in seconds, not hours." },
                { icon: <Settings />, title: "Simple Management", desc: "One dashboard to manage all your VPS instances." },
              ].map((item) => (
                <div key={item.title} className="flex gap-4">
                  <div className="premium-icon-box shrink-0 w-10 h-10">{item.icon}</div>
                  <div>
                    <h4 className="font-medium text-white mb-1">{item.title}</h4>
                    <p className="text-sm text-white/45">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Tilt3DCard maxTilt={5} scale={1.01} innerClassName="premium-glass-card p-7">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/35 mb-5 text-center">
              Resource Scaling
            </p>
            {[
              { label: "CPU Cores", from: "2", to: "8", pct: "w-1/3" },
              { label: "RAM (GB)", from: "4", to: "16", pct: "w-1/2" },
              { label: "Storage (GB)", from: "50", to: "200", pct: "w-3/4" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-3 border-b border-white/[0.05] last:border-0">
                <span className="text-sm text-white/50">{row.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/30 tabular-nums">{row.from}</span>
                  <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className={`${row.pct} h-full bg-emerald-400/80 rounded-full`} />
                  </div>
                  <span className="text-xs text-emerald-400 tabular-nums">{row.to}</span>
                </div>
              </div>
            ))}
            <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
              <div className="premium-stat-value text-2xl">₹899</div>
              <div className="text-xs text-white/35 mt-1">estimated / month</div>
            </div>
          </Tilt3DCard>
        </div>
      </div>
    </PremiumSection>
  )
}
