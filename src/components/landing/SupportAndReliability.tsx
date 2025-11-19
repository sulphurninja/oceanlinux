import { HeadphonesIcon, Clock, Award, MessageCircle, Users, CheckCircle } from "lucide-react"

const supportFeatures = [
  {
    icon: <HeadphonesIcon className="w-8 h-8 text-blue-500" />,
    title: "24/7 Expert Support",
    description: "Get help whenever you need it from our experienced Linux experts. Professional support included free with every affordable VPS plan.",
    features: ["Live Chat Support", "Email Support", "Phone Support", "Community Forums"]
  },
  {
    icon: <Clock className="w-8 h-8 text-green-500" />,
    title: "99.9% Uptime SLA",
    description: "We guarantee your VPS will be online and running. If we don't meet our uptime promise, you get credits back.",
    features: ["Uptime Monitoring", "SLA Credits", "Proactive Maintenance", "Redundant Systems"]
  },
  {
    icon: <Award className="w-8 h-8 text-purple-500" />,
    title: "Industry-Leading Service",
    description: "Award-winning support team with years of Linux hosting experience. Premium service quality at budget-friendly prices.",
    features: ["Expert Team", "Fast Response", "Problem Resolution", "Customer Satisfaction"]
  }
]

const supportStats = [
  {
    icon: <MessageCircle className="w-6 h-6 text-blue-500" />,
    value: "<2 min",
    label: "Average Response Time"
  },
  {
    icon: <Users className="w-6 h-6 text-green-500" />,
    value: "98%",
    label: "Customer Satisfaction"
  },
  {
    icon: <CheckCircle className="w-6 h-6 text-purple-500" />,
    value: "99.5%",
    label: "First Contact Resolution"
  },
  {
    icon: <Clock className="w-6 h-6 text-orange-500" />,
    value: "24/7/365",
    label: "Support Availability"
  }
]

export default function SupportAndReliability() {
  return (
    <section id="support" className="section-padding bg-background">
      <div className="container mx-auto container-padding">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Premium Support at 
            <span className="text-primary"> Affordable Prices</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Get expert help when you need it most. Our professional support team is included 
            free with every VPS plan - no premium support fees required.
          </p>
        </div>

        {/* Support Features */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {supportFeatures.map((feature, index) => (
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
                    <div className="w-2 h-2 bg-primary rounded-full mr-3 flex-shrink-0"></div>
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Support Stats */}
        <div className="glass rounded-2xl p-8 lg:p-12 mb-16 animate-fade-in">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Support That Actually Helps</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our support team doesn't just answer tickets - they solve problems. 
              See why customers love our affordable VPS hosting and support.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {supportStats.map((stat, index) => (
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

        {/* Support Guarantee */}
        <div className="text-center bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl p-8 animate-fade-in">
          <HeadphonesIcon className="w-16 h-16 text-blue-500 mx-auto mb-6" />
          <h3 className="text-2xl font-bold mb-4">Our Support Promise</h3>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            We promise to provide helpful, knowledgeable support that actually solves your problems. 
            If you're not satisfied with our support, we'll make it right or refund your money.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="inline-flex items-center px-4 py-2 bg-blue-500/10 text-blue-500 rounded-full text-sm font-medium">
              💬 Live Chat Available
            </div>
            <div className="inline-flex items-center px-4 py-2 bg-green-500/10 text-green-500 rounded-full text-sm font-medium">
              📧 Email Support
            </div>
            <div className="inline-flex items-center px-4 py-2 bg-purple-500/10 text-purple-500 rounded-full text-sm font-medium">
              📞 Phone Support
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}