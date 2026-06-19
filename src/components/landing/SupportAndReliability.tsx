import { HeadphonesIcon, Clock, Award, MessageCircle, Users, CheckCircle } from "lucide-react"
import PremiumSection from "@/components/landing/PremiumSection"
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader"
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard"

const supportFeatures = [
  {
    icon: <HeadphonesIcon />,
    title: "24/7 Expert Support",
    description: "Linux experts available whenever you need help — included free with every VPS plan.",
    features: ["Live Chat", "Email Support", "Phone Support", "Community Forums"],
  },
  {
    icon: <Clock />,
    title: "99.9% Uptime SLA",
    description: "We guarantee your VPS stays online. Miss our uptime promise and you receive service credits.",
    features: ["Uptime Monitoring", "SLA Credits", "Proactive Maintenance", "Redundant Systems"],
  },
  {
    icon: <Award />,
    title: "Industry-Leading Service",
    description: "Experienced support team with years of Linux hosting expertise — at no premium fee.",
    features: ["Expert Team", "Fast Response", "Problem Resolution", "High Satisfaction"],
  },
]

const supportStats = [
  { icon: <MessageCircle />, value: "<2 min", label: "Avg Response Time" },
  { icon: <Users />, value: "98%", label: "Customer Satisfaction" },
  { icon: <CheckCircle />, value: "99.5%", label: "First Contact Resolution" },
  { icon: <Clock />, value: "24/7", label: "Availability" },
]

export default function SupportAndReliability() {
  return (
    <PremiumSection id="support">
      <PremiumSectionHeader
        eyebrow="Support"
        title="Premium Support"
        titleAccent="Included Free"
        description="Expert help when you need it — no premium support fees, no upsells. Just people who solve problems."
      />

      <div className="grid lg:grid-cols-3 gap-5 lg:gap-6 mb-16">
        {supportFeatures.map((feature, index) => (
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
          eyebrow="Metrics"
          title="Support That"
          titleAccent="Delivers"
          description="Our team solves problems — not just closes tickets."
          className="mb-10"
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {supportStats.map((stat, index) => (
            <div key={index} className="premium-stat-card">
              <div className="premium-icon-box mx-auto mb-3 w-10 h-10">{stat.icon}</div>
              <div className="premium-stat-value text-2xl sm:text-3xl">{stat.value}</div>
              <div className="text-xs text-white/40 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="premium-highlight-box">
        <div className="premium-icon-box mx-auto mb-6">
          <HeadphonesIcon />
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">Our Support Promise</h3>
        <p className="text-sm text-white/45 mb-6 max-w-lg mx-auto leading-relaxed">
          Helpful, knowledgeable support that actually resolves your issues. Not satisfied? We make it right.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <span className="premium-chip">Live Chat</span>
          <span className="premium-chip">Email Support</span>
          <span className="premium-chip">Phone Support</span>
        </div>
      </div>
    </PremiumSection>
  )
}
