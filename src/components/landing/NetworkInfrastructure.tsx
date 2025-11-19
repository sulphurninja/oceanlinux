import { Globe, Wifi, Zap, MapPin, Clock, Server } from "lucide-react"

const networkFeatures = [
  {
    icon: <Globe className="w-8 h-8 text-blue-500" />,
    title: "Global Network Coverage",
    description: "Multiple data centers worldwide ensure your affordable VPS performs well for users everywhere. Premium global reach at budget prices.",
    stats: "6 Continents • 15 Data Centers"
  },
  {
    icon: <Wifi className="w-8 h-8 text-green-500" />,
    title: "High-Speed Connectivity",
    description: "Unlimited bandwidth and high-speed connections included with every affordable plan. No hidden bandwidth costs or throttling.",
    stats: "10 Gbps Network • Unlimited Traffic"
  },
  {
    icon: <Zap className="w-8 h-8 text-yellow-500" />,
    title: "Ultra-Low Latency",
    description: "Optimized routing and premium network peering for minimal latency worldwide. Fast connections without the premium price.",
    stats: "<50ms Global Latency"
  }
]

const datacenters = [
  { location: "🇺🇸 United States", city: "New York, Los Angeles", specs: "Tier III • 99.99% Uptime" },
  { location: "🇪🇺 Europe", city: "London, Frankfurt", specs: "ISO 27001 • GDPR Compliant" },
  { location: "🇸🇬 Asia Pacific", city: "Singapore, Tokyo", specs: "Low Latency • High Speed" },
  { location: "🇮🇳 India", city: "Mumbai, Bangalore", specs: "Local Presence • Fast Access" }
]

export default function NetworkInfrastructure() {
  return (
    <section id="network" className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Global Network Infrastructure at 
            <span className="text-primary"> Local Prices</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Access our worldwide network of premium data centers without paying premium prices. 
            Get global reach with local affordability.
          </p>
        </div>

        {/* Network Features */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {networkFeatures.map((feature, index) => (
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
                <p className="text-muted-foreground leading-relaxed mb-4">{feature.description}</p>
                <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  {feature.stats}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Data Centers Map */}
        <div className="glass rounded-2xl p-8 lg:p-12 mb-16 animate-fade-in">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Worldwide Data Centers</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose from our strategically located data centers around the world. 
              All offering the same affordable pricing with premium performance.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {datacenters.map((datacenter, index) => (
              <div key={index} className="p-6 rounded-xl bg-background/50 hover:bg-background/80 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-lg mb-1">{datacenter.location}</h4>
                    <p className="text-muted-foreground text-sm">{datacenter.city}</p>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-500 ml-2 font-medium">Online</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                  {datacenter.specs}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Network Stats */}
        <div className="text-center bg-gradient-to-r from-blue-500/10 to-green-500/10 rounded-2xl p-8 animate-fade-in">
          <h3 className="text-2xl font-bold mb-6">Network Performance That Delivers</h3>
          <div className="grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500 mb-2">99.99%</div>
              <div className="text-sm text-muted-foreground">Network Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500 mb-2">10 Gbps</div>
              <div className="text-sm text-muted-foreground">Network Speed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-500 mb-2">24/7</div>
              <div className="text-sm text-muted-foreground">Network Monitoring</div>
            </div>
          </div>
          <p className="text-muted-foreground mt-6 max-w-2xl mx-auto">
            Our global network ensures your applications are always fast, reliable, 
            and accessible from anywhere in the world - all at the most affordable prices.
          </p>
        </div>
      </div>
    </section>
  )
}