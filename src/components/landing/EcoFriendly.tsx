import { Server, Headphones, Shield, Zap, Users, CheckCircle } from "lucide-react"
import PremiumSection from "@/components/landing/PremiumSection"
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader"
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard"

const howItWorks = [
  {
    icon: <Server />,
    title: "VPS from Trusted Providers",
    description: "We partner with established hosting companies for underlying infrastructure — proven hardware, transparent sourcing.",
    tag: "Upstream",
  },
  {
    icon: <Headphones />,
    title: "OceanLinux Manages Everything",
    description: "Ordering, provisioning, renewals, billing, and support — all through one dashboard and one team.",
    tag: "Managed",
  },
  {
    icon: <Shield />,
    title: "Support You Can Reach",
    description: "When something goes wrong, you contact OceanLinux — not a foreign provider portal.",
    tag: "Human Support",
  },
]

const serviceStats = [
  { icon: <Zap />, value: "<5 min", label: "Typical Setup" },
  { icon: <Headphones />, value: "24/7", label: "Support" },
  { icon: <Users />, value: "5000+", label: "Customers" },
  { icon: <CheckCircle />, value: "100%", label: "Transparent Pricing" },
]

export default function EcoFriendly() {
  return (
    <PremiumSection id="how-it-works">
      <PremiumSectionHeader
        eyebrow="Transparent & Honest"
        title="How OceanLinux"
        titleAccent="Works"
        description="We're not a data center company. We source VPS from reliable upstream providers and deliver it with OceanLinux service — simple, affordable, honest."
      />

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6 mb-16">
        {howItWorks.map((item, index) => (
          <PremiumFeatureCard
            key={index}
            icon={item.icon}
            title={item.title}
            description={item.description}
            tag={item.tag}
          />
        ))}
      </div>

      <div className="premium-panel mb-16">
        <PremiumSectionHeader
          eyebrow="The Difference"
          title="Provider Power +"
          titleAccent="Our Service Layer"
          description="Great VPS from trusted partners, delivered with OceanLinux management and support."
          className="mb-10"
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {serviceStats.map((stat, index) => (
            <div key={index} className="premium-stat-card">
              <div className="premium-icon-box mx-auto mb-3 w-10 h-10">{stat.icon}</div>
              <div className="premium-stat-value text-2xl sm:text-3xl">{stat.value}</div>
              <div className="text-sm text-white/70 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="premium-highlight-box">
        <div className="premium-icon-box mx-auto mb-6">
          <Server />
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">Honest Hosting, Real Service</h3>
        <p className="text-sm text-white/70 mb-6 max-w-lg mx-auto leading-relaxed">
          OceanLinux makes VPS hosting simple and affordable for India — sourced from proven providers,
          managed and supported by our team.
        </p>
        <span className="premium-chip">Provider VPS · OceanLinux Managed</span>
      </div>
    </PremiumSection>
  )
}
