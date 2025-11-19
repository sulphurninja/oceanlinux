import { Shield, Lock, Eye, Server, Wifi, AlertTriangle } from "lucide-react"

const securityFeatures = [
  {
    icon: <Shield className="w-8 h-8 text-green-500" />,
    title: "Advanced DDoS Protection",
    description: "Multi-layer DDoS protection keeps your affordable VPS online even during large-scale attacks. Enterprise-grade security at budget prices.",
    features: ["24/7 Attack Monitoring", "Automatic Mitigation", "Real-time Response", "99.9% Protection Rate"]
  },
  {
    icon: <Lock className="w-8 h-8 text-blue-500" />,
    title: "Data Encryption & Privacy",
    description: "Your data is fully encrypted at rest and in transit. Premium security features included at no extra cost in all our affordable plans.",
    features: ["AES-256 Encryption", "SSL/TLS Security", "Secure Data Centers", "GDPR Compliant"]
  },
  {
    icon: <Eye className="w-8 h-8 text-purple-500" />,
    title: "24/7 Security Monitoring",
    description: "Our expert security team monitors your server around the clock. Professional monitoring included free with every affordable VPS plan.",
    features: ["Real-time Alerts", "Threat Detection", "Security Audits", "Incident Response"]
  }
]

const securityStats = [
  {
    icon: <Server className="w-6 h-6 text-green-500" />,
    value: "99.99%",
    label: "Security Uptime"
  },
  {
    icon: <Shield className="w-6 h-6 text-blue-500" />,
    value: "0",
    label: "Successful Attacks"
  },
  {
    icon: <Lock className="w-6 h-6 text-purple-500" />,
    value: "24/7",
    label: "Security Monitoring"
  },
  {
    icon: <AlertTriangle className="w-6 h-6 text-orange-500" />,
    value: "<1min",
    label: "Threat Response Time"
  }
]

export default function Security() {
  return (
    <section id="security" className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Enterprise-Grade Security at 
            <span className="text-primary"> Most Affordable Prices</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Don't pay premium prices for basic security. Get professional-grade protection 
            with every affordable VPS plan. Your data's safety is our top priority.
          </p>
        </div>

        {/* Security Features */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {securityFeatures.map((feature, index) => (
            <div 
              key={index} 
              className="feature-card animate-slide-up hover-lift"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="text-center mb-6">
                <div className="inline-flex p-4 rounded-xl bg-muted mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
              
              <div className="space-y-2">
                {feature.features.map((item, i) => (
                  <div key={i} className="flex items-center text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3 flex-shrink-0"></div>
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Security Stats */}
        <div className="glass rounded-2xl p-8 lg:p-12 mb-16 animate-fade-in">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Security You Can Trust</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our security metrics speak for themselves. Get enterprise-level protection 
              without the enterprise price tag.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {securityStats.map((stat, index) => (
              <div key={index} className="text-center p-6 rounded-xl bg-background/50">
                <div className="flex justify-center mb-3">
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-primary mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Guarantee */}
        <div className="text-center bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-2xl p-8 animate-fade-in">
          <Shield className="w-16 h-16 text-green-500 mx-auto mb-6" />
          <h3 className="text-2xl font-bold mb-4">100% Security Guarantee</h3>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            We're so confident in our security that we offer a 100% guarantee. 
            If your VPS gets compromised due to our security failure, we'll refund your money and fix the issue for free.
          </p>
          <div className="inline-flex items-center px-6 py-3 bg-green-500/10 text-green-500 rounded-full font-medium">
            🛡️ Protected by OceanLinux Security Promise
          </div>
        </div>
      </div>
    </section>
  )
}