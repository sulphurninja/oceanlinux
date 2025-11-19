import { ArrowUpCircle, ArrowDownCircle, Minimize2, Zap, TrendingUp, Settings } from "lucide-react"

const scalingOptions = [
  {
    icon: <ArrowUpCircle className="w-8 h-8 text-green-500" />,
    title: "Instant Vertical Scaling",
    description: "Upgrade your CPU, RAM, and storage instantly without downtime. Pay only for what you need, when you need it.",
    features: ["Zero Downtime Upgrades", "Instant Resource Addition", "Flexible Billing", "Same Low Prices"]
  },
  {
    icon: <ArrowDownCircle className="w-8 h-8 text-blue-500" />,
    title: "Easy Horizontal Scaling",
    description: "Add more VPS instances to handle increased traffic. Our most affordable pricing scales with your growth.",
    features: ["Load Balancing", "Multiple Server Management", "Unified Dashboard", "Cost-Effective Scaling"]
  },
  {
    icon: <Minimize2 className="w-8 h-8 text-purple-500" />,
    title: "Smart Auto-Scaling",
    description: "Set up automatic scaling rules to handle traffic spikes efficiently while keeping costs low.",
    features: ["Traffic-Based Scaling", "Cost Optimization", "Performance Monitoring", "Budget Controls"]
  }
]

export default function Scalability() {
  return (
    <section id="scalability" className="section-padding bg-background">
      <div className="container mx-auto container-padding">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Scale Without Breaking
            <span className="text-primary"> Your Budget</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Grow your business without worrying about hosting costs.
            Our affordable VPS plans scale with you, keeping prices low as you expand.
          </p>
        </div>

        {/* Scaling Options */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {scalingOptions.map((option, index) => (
            <div
              key={index}
              className="feature-card animate-slide-up hover-lift"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="text-center mb-6">
                <div className="inline-flex p-4 rounded-xl bg-muted mb-4">
                  {option.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">{option.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{option.description}</p>
              </div>

              <div className="space-y-2">
                {option.features.map((feature, i) => (
                  <div key={i} className="flex items-center text-sm">
                    <div className="w-2 h-2 bg-primary rounded-full mr-3 flex-shrink-0"></div>
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Scaling Benefits */}
        <div className="glass rounded-2xl p-8 lg:p-12 animate-fade-in">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl font-bold mb-6">Why Our Scalability is Different</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Cost-Effective Growth</h4>
                    <p className="text-sm text-muted-foreground">
                      Scale up or down based on actual usage. No long-term contracts or hidden fees.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Zap className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Instant Deployment</h4>
                    <p className="text-sm text-muted-foreground">
                      New resources are available in seconds, not hours. Keep your business running smoothly.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Settings className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Simple Management</h4>
                    <p className="text-sm text-muted-foreground">
                      Easy-to-use dashboard makes scaling as simple as moving a slider.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="bg-gradient-to-br from-card to-muted rounded-xl p-8 border dark:border-none border dark:border-none-border dark:border-none">
                <h4 className="text-lg font-semibold mb-6">Scaling Dashboard Preview</h4>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg">
                    <span className="text-sm">CPU Cores</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">2</span>
                      <div className="w-16 h-2 bg-muted rounded-full">
                        <div className="w-1/3 h-full bg-primary rounded-full"></div>
                      </div>
                      <span className="text-primary">8</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg">
                    <span className="text-sm">RAM (GB)</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">4</span>
                      <div className="w-16 h-2 bg-muted rounded-full">
                        <div className="w-1/2 h-full bg-blue-500 rounded-full"></div>
                      </div>
                      <span className="text-blue-500">16</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg">
                    <span className="text-sm">Storage (GB)</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">50</span>
                      <div className="w-16 h-2 bg-muted rounded-full">
                        <div className="w-3/4 h-full bg-green-500 rounded-full"></div>
                      </div>
                      <span className="text-green-500">200</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 text-center">
                  <div className="text-2xl font-bold text-primary mb-1">₹899/month</div>
                  <div className="text-xs text-muted-foreground">Current estimated cost</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 animate-fade-in">
          <div className="inline-flex items-center px-6 py-3 bg-primary/10 rounded-full mb-4">
            <span className="text-sm text-primary font-medium">
              🚀 Start small, scale fast, pay less
            </span>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Begin with our most affordable plan and scale as your business grows.
            No surprises, no hidden costs, just transparent pricing that works for you.
          </p>
        </div>
      </div>
    </section>
  )
}
