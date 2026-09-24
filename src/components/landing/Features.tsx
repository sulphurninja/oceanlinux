"use client";

import { Server, Shield, Zap, Scale, Cloud, Star, IndianRupee } from "lucide-react";
import Tilt3DCard from "@/components/landing/Tilt3DCard";
import PremiumSection from "@/components/landing/PremiumSection";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard";

const features = [
  {
    icon: <IndianRupee />,
    title: "Affordable Pricing",
    description: "Premium Linux VPS at prices up to 40% lower than comparable providers — without cutting corners on quality.",
    tag: "Best Value",
  },
  {
    icon: <Server />,
    title: "Provider-Grade Hardware",
    description: "Intel and AMD processors on NVMe infrastructure sourced from trusted upstream partners.",
    tag: "Enterprise",
  },
  {
    icon: <Shield />,
    title: "Advanced Security",
    description: "Multi-layer DDoS protection, firewall management, and automatic security updates on every plan.",
    tag: "Protected",
  },
  {
    icon: <Zap />,
    title: "High Performance",
    description: "NVMe SSD storage and optimized networking for fast applications and low-latency workloads.",
    tag: "NVMe SSD",
  },
  {
    icon: <Scale />,
    title: "Instant Scaling",
    description: "Upgrade CPU, RAM, and storage on demand without downtime. Pay only for what you need.",
    tag: "Flexible",
  },
  {
    icon: <Cloud />,
    title: "Managed Service",
    description: "OceanLinux handles provisioning, billing, and support — one dashboard, one team.",
    tag: "Managed",
  },
];

const serverSeries = [
  { icon: <Star />, title: "Gold Series", description: "Premium rotating IP servers", ipRange: "103.183.xx • 103.187.xx" },
  { icon: <Zap />, title: "Nova Linux", description: "High-performance servers", ipRange: "163.227.xx" },
  { icon: <Server />, title: "Power Linux", description: "Maximum power and control", ipRange: "149.13.xx" },
  { icon: <Shield />, title: "Titan Series", description: "Enterprise-grade solutions", ipRange: "103.15.xx" },
];

export default function Features() {
  return (
    <PremiumSection id="features">
      <PremiumSectionHeader
        eyebrow="Why OceanLinux"
        title="Affordable"
        titleAccent="Premium Linux VPS"
        description="Professional hosting features without the enterprise price tag. Quality infrastructure, managed by a team that actually responds."
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 mb-16 lg:mb-20">
        {features.map((feature, index) => (
          <PremiumFeatureCard
            key={index}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
            tag={feature.tag}
          />
        ))}
      </div>

      <div className="premium-panel mb-16">
        <PremiumSectionHeader
          eyebrow="Server Series"
          title="Popular"
          titleAccent="Linux Series"
          description="Each series is optimized for a specific use case — rotating IPs, raw performance, or enterprise workloads."
          className="mb-10"
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {serverSeries.map((series, index) => (
            <Tilt3DCard key={index} maxTilt={5} scale={1.01} innerClassName="premium-glass-card p-6 h-full text-center">
              <div className="premium-icon-box mx-auto mb-4">{series.icon}</div>
              <h3 className="text-base font-semibold text-white mb-1.5">{series.title}</h3>
              <p className="text-sm text-white/70 mb-4">{series.description}</p>
              <code className="text-sm font-mono text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/15">
                {series.ipRange}
              </code>
            </Tilt3DCard>
          ))}
        </div>
      </div>

      <div className="premium-highlight-box">
        <h3 className="text-xl sm:text-2xl font-semibold text-white mb-3 tracking-tight">Get More, Pay Less</h3>
        <p className="text-sm sm:text-base text-white/70 mb-8 max-w-xl mx-auto">
          Enterprise-grade hosting at prices that make sense. No inflated reseller markup — just honest value.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-2xl mx-auto">
          <div className="premium-stat-card">
            <div className="premium-stat-value">40%</div>
            <div className="text-sm text-white/70">Lower Costs</div>
          </div>
          <div className="premium-stat-card">
            <div className="premium-stat-value premium-stat-value--blue">99.9%</div>
            <div className="text-sm text-white/70">Uptime SLA</div>
          </div>
          <div className="premium-stat-card">
            <div className="premium-stat-value premium-stat-value--violet">24/7</div>
            <div className="text-sm text-white/70">Expert Support</div>
          </div>
        </div>
      </div>
    </PremiumSection>
  );
}
