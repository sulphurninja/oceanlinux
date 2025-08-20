import { Server, Shield, Zap, Scale, Cloud, Clock, Database, Globe, Cpu, HardDrive, DollarSign, Star, IndianRupee } from "lucide-react"

const features = [
  {
    icon: <IndianRupee className="w-8 h-8 text-green-500" />,
    title: "Most Affordable Pricing",
    description: "Get premium Linux VPS hosting at prices that won't break your budget. Up to 40% cheaper than competitors.",
    highlight: "Best Value"
  },
  {
    icon: <Server className="w-8 h-8 text-primary" />,
    title: "Premium Hardware",
    description: "Latest Intel & AMD processors with enterprise-grade components. Professional quality at affordable prices.",
    highlight: "Enterprise Grade"
  },
  {
    icon: <Shield className="w-8 h-8 text-blue-500" />,
    title: "Advanced Security",
    description: "Multi-layer protection with DDoS defense, firewall management, and automatic security updates included.",
    highlight: "Always Protected"
  },
  {
    icon: <Zap className="w-8 h-8 text-yellow-500" />,
    title: "Lightning Fast Performance",
    description: "NVMe SSD storage and optimized network setup for blazing-fast websites and applications.",
    highlight: "2x Faster"
  },
  {
    icon: <Scale className="w-8 h-8 text-purple-500" />,
    title: "Easy Scaling",
    description: "Upgrade your server resources instantly without downtime. Pay only for what you use.",
    highlight: "No Downtime"
  },
  {
    icon: <Cloud className="w-8 h-8 text-cyan-500" />,
    title: "Cloud Technology",
    description: "Modern cloud infrastructure with automatic backups and failover protection for reliability.",
    highlight: "Auto Backup"
  }
]

const serverSeries = [
  {
    icon: <Star className="w-6 h-6 text-yellow-500" />,
    title: "🔄 Gold Series",
    description: "Premium rotating IP servers",
    ipRange: "103.183.xx • 103.187.xx"
  },
  {
    icon: <Zap className="w-6 h-6 text-blue-500" />,
    title: "🚀 Nova Linux",
    description: "High-performance servers",
    ipRange: "163.227.xx"
  },
  {
    icon: <Server className="w-6 h-6 text-green-500" />,
    title: "🔋 Power Linux",
    description: "Maximum power and control",
    ipRange: "149.13.xx"
  },
  {
    icon: <Shield className="w-6 h-6 text-red-500" />,
    title: "🔰 Titan Series",
    description: "Enterprise-grade solutions",
    ipRange: "103.15.xx"
  }
]

export default function Features() {
  return (
    <section id="features" className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Why Choose the Most Affordable 
            <span className="text-gradient"> Premium Linux VPS?</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Get professional hosting features without the premium price tag. 
            We believe quality hosting should be accessible to everyone.
          </p>
        </div>

        {/* Main Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {features.map((feature, index) => (
            <div 
              key={index} 
              className="feature-card group animate-slide-up hover-lift"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 p-3 rounded-xl bg-background shadow-lg group-hover:shadow-xl transition-shadow">
                  {feature.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                    <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-full">
                      {feature.highlight}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Server Series Showcase */}
        <div className="glass rounded-2xl p-8 lg:p-12 mb-16 animate-fade-in">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Our Most Popular Linux Server Series</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose from our carefully crafted server series, each optimized for different use cases 
              while maintaining our promise of affordability.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {serverSeries.map((series, index) => (
              <div 
                key={index} 
                className="text-center p-6 rounded-xl bg-background/50 hover:bg-background/80 transition-all hover-lift border border-border/50"
              >
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-lg bg-muted">
                    {series.icon}
                  </div>
                </div>
                <h4 className="text-lg font-semibold mb-2">{series.title}</h4>
                <p className="text-sm text-muted-foreground mb-3">{series.description}</p>
                <div className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                  {series.ipRange}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Value Proposition */}
        <div className="text-center bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl p-8 animate-fade-in">
          <h3 className="text-2xl font-bold mb-4">Get More, Pay Less</h3>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            Why pay premium prices for basic features? With OceanLinux, you get enterprise-grade 
            hosting at prices that make sense for your budget.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500 mb-2">40%</div>
              <div className="text-sm text-muted-foreground">Lower Costs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500 mb-2">99.9%</div>
              <div className="text-sm text-muted-foreground">Uptime SLA</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-500 mb-2">24/7</div>
              <div className="text-sm text-muted-foreground">Expert Support</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}