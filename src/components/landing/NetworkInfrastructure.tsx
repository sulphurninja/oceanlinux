import { Globe, Wifi, Zap, Server, Headphones, Shield } from "lucide-react"
import PremiumSection from "@/components/landing/PremiumSection"
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader"
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard"

const networkFeatures = [
  {
    icon: <Server />,
    title: "Trusted Upstream Providers",
    description: "Linux VPS from established infrastructure partners — proven hardware without inflated reseller markup.",
    tag: "Provider-Grade",
  },
  {
    icon: <Headphones />,
    title: "OceanLinux Managed Service",
    description: "Provisioning, billing, renewals, and support handled by our team. One simple experience.",
    tag: "Fully Managed",
  },
  {
    icon: <Zap />,
    title: "Curated Premium Plans",
    description: "Quality IP ranges and specs selected for Indian users — at prices that stay affordable.",
    tag: "Fair Pricing",
  },
]

const servicePillars = [
  {
    icon: <Globe />,
    title: "Provider-Sourced VPS",
    description: "Servers from reliable upstream hosting companies. We don't operate our own data centers.",
  },
  {
    icon: <Shield />,
    title: "Security Layer",
    description: "DDoS protection and security features through provider partnerships and OceanLinux management.",
  },
  {
    icon: <Headphones />,
    title: "Human Support",
    description: "Real people for setup, billing, and server issues — not just automated tickets.",
  },
  {
    icon: <Wifi />,
    title: "India-Focused",
    description: "INR pricing, local payment options, and support tailored for Indian developers and businesses.",
  },
]

export default function NetworkInfrastructure() {
  return (
    <PremiumSection id="network">
      <PremiumSectionHeader
        eyebrow="How We Deliver"
        title="Premium VPS"
        titleAccent="Managed by OceanLinux"
        description="We partner with established VPS providers and deliver the full service — setup, support, billing, and affordable pricing handled by our team."
      />

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6 mb-16">
        {networkFeatures.map((feature, index) => (
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
          eyebrow="What You Get"
          title="Provider VPS +"
          titleAccent="Our Service"
          description="Reliable infrastructure from trusted partners — plus the full OceanLinux management experience."
          className="mb-10"
        />

        <div className="grid sm:grid-cols-2 gap-5">
          {servicePillars.map((pillar, index) => (
            <div key={index} className="premium-glass-card p-6 flex gap-4">
              <div className="premium-icon-box shrink-0 w-10 h-10">{pillar.icon}</div>
              <div>
                <h3 className="text-base font-medium text-white mb-1.5">{pillar.title}</h3>
                <p className="text-sm text-white/70 leading-relaxed">{pillar.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="premium-highlight-box">
        <h3 className="text-xl font-semibold text-white mb-6">Simple VPS, Fully Managed</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-2xl mx-auto mb-6">
          <div className="premium-stat-card">
            <div className="premium-stat-value premium-stat-value--blue text-2xl sm:text-3xl">99.9%</div>
            <div className="text-sm text-white/70 mt-1">Uptime Target</div>
          </div>
          <div className="premium-stat-card">
            <div className="premium-stat-value text-2xl sm:text-3xl">24/7</div>
            <div className="text-sm text-white/70 mt-1">OceanLinux Support</div>
          </div>
          <div className="premium-stat-card">
            <div className="premium-stat-value premium-stat-value--violet text-2xl sm:text-3xl">₹599+</div>
            <div className="text-sm text-white/70 mt-1">Starting Price</div>
          </div>
        </div>
        <p className="text-sm text-white/70 max-w-lg mx-auto">
          Quality VPS from proven providers, delivered with OceanLinux care — honest service, no inflated claims.
        </p>
      </div>
    </PremiumSection>
  )
}
