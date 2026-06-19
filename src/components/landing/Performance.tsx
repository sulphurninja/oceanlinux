import { Cpu, MemoryStickIcon as Memory, HardDrive, Gauge, Zap, TrendingUp } from "lucide-react"
import PremiumSection from "@/components/landing/PremiumSection"
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader"
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard"

const performanceFeatures = [
  {
    icon: <Cpu />,
    title: "Latest Generation CPUs",
    description: "Intel Xeon and AMD EPYC processors for maximum throughput — professional-grade performance at accessible prices.",
    specs: ["Intel Xeon Gold", "AMD EPYC 7000 Series", "Up to 32 Cores", "Turbo Boost Enabled"],
  },
  {
    icon: <Memory />,
    title: "High-Speed DDR4 RAM",
    description: "ECC memory for reliability and fast data access. More RAM per rupee compared to typical providers.",
    specs: ["DDR4 ECC Memory", "Up to 64GB RAM", "Error Correction", "2933MHz Speed"],
  },
  {
    icon: <HardDrive />,
    title: "NVMe SSD Storage",
    description: "Ultra-fast NVMe drives for rapid I/O and application loading on every plan tier.",
    specs: ["NVMe SSD Storage", "Up to 1TB Space", "RAID Protection", "99.99% Reliability"],
  },
]

const stats = [
  { icon: <Gauge />, value: "200%", label: "Faster than Traditional VPS" },
  { icon: <Zap />, value: "<50ms", label: "Average Response Time" },
  { icon: <TrendingUp />, value: "99.9%", label: "Performance SLA" },
  { icon: <HardDrive />, value: "10x", label: "Faster Disk I/O" },
]

export default function Performance() {
  return (
    <PremiumSection id="performance">
      <PremiumSectionHeader
        eyebrow="Performance"
        title="Unmatched Speed at"
        titleAccent="Affordable Prices"
        description="Enterprise-grade hardware from trusted upstream providers — without the enterprise markup."
      />

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6 mb-16">
        {performanceFeatures.map((feature, index) => (
          <PremiumFeatureCard
            key={index}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          >
            <div className="space-y-2">
              {feature.specs.map((spec, i) => (
                <div key={i} className="premium-spec-row">
                  <div className="premium-spec-dot" />
                  <span>{spec}</span>
                </div>
              ))}
            </div>
          </PremiumFeatureCard>
        ))}
      </div>

      <div className="premium-panel">
        <PremiumSectionHeader
          eyebrow="Benchmarks"
          title="Performance That"
          titleAccent="Speaks for Itself"
          description="Same quality infrastructure as expensive alternatives — at a fraction of the cost."
          className="mb-10"
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((stat, index) => (
            <div key={index} className="premium-stat-card">
              <div className="premium-icon-box mx-auto mb-4">{stat.icon}</div>
              <div className="premium-stat-value text-2xl sm:text-3xl">{stat.value}</div>
              <div className="text-xs text-white/40 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </PremiumSection>
  )
}
