import { Shield, Lock, Eye } from "lucide-react"
import PremiumSection from "@/components/landing/PremiumSection"
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader"
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard"

const securityFeatures = [
  {
    icon: <Shield />,
    title: "Advanced DDoS Protection",
    description: "Multi-layer protection keeps your VPS online during large-scale attacks — included on every plan.",
    features: ["24/7 Attack Monitoring", "Automatic Mitigation", "Real-time Response", "99.9% Protection Rate"],
  },
  {
    icon: <Lock />,
    title: "Data Encryption & Privacy",
    description: "Data encrypted at rest and in transit. Premium security features included at no extra cost.",
    features: ["AES-256 Encryption", "SSL/TLS Security", "Provider-Grade Security", "GDPR Aware"],
  },
  {
    icon: <Eye />,
    title: "24/7 Security Monitoring",
    description: "Continuous monitoring and threat detection included with every VPS plan through our service layer.",
    features: ["Real-time Alerts", "Threat Detection", "Security Audits", "Incident Response"],
  },
]

const securityStats = [
  { value: "99.99%", label: "Security Uptime" },
  { value: "0", label: "Successful Attacks" },
  { value: "24/7", label: "Monitoring" },
  { value: "<1min", label: "Threat Response" },
]

export default function Security() {
  return (
    <PremiumSection id="security">
      <PremiumSectionHeader
        eyebrow="Security"
        title="Enterprise Security at"
        titleAccent="Every Price Point"
        description="Professional-grade protection on every plan. Your data's safety is built into the service — not sold as an add-on."
      />

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6 mb-16">
        {securityFeatures.map((feature, index) => (
          <PremiumFeatureCard
            key={index}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          >
            <div className="space-y-2">
              {feature.features.map((item, i) => (
                <div key={i} className="premium-spec-row">
                  <div className="premium-spec-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </PremiumFeatureCard>
        ))}
      </div>

      <div className="premium-panel mb-16">
        <PremiumSectionHeader
          eyebrow="Trust Metrics"
          title="Security You Can"
          titleAccent="Trust"
          description="Transparent metrics from our infrastructure partners and security layer."
          className="mb-10"
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {securityStats.map((stat, index) => (
            <div key={index} className="premium-stat-card">
              <div className="premium-stat-value text-2xl sm:text-3xl">{stat.value}</div>
              <div className="text-xs text-white/40 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="premium-highlight-box">
        <div className="premium-icon-box mx-auto mb-6">
          <Shield />
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">Security Guarantee</h3>
        <p className="text-sm text-white/45 mb-6 max-w-lg mx-auto leading-relaxed">
          If your VPS is compromised due to a failure in our security layer, we will investigate,
          remediate, and make it right.
        </p>
        <span className="premium-chip">Protected by OceanLinux</span>
      </div>
    </PremiumSection>
  )
}
