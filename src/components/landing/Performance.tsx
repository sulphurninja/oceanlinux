import { Cpu, MemoryStickIcon as Memory, HardDrive, Gauge, Zap, TrendingUp } from "lucide-react"

const performanceFeatures = [
  {
    icon: <Cpu className="w-8 h-8 text-blue-500" />,
    title: "Latest Generation CPUs",
    description: "Powered by Intel Xeon and AMD EPYC processors for maximum speed and efficiency. Get professional-grade performance at affordable prices.",
    specs: ["Intel Xeon Gold", "AMD EPYC 7000 Series", "Up to 32 Cores", "Turbo Boost Enabled"]
  },
  {
    icon: <Memory className="w-8 h-8 text-green-500" />,
    title: "High-Speed DDR4 RAM",
    description: "ECC memory for maximum reliability and lightning-fast data access. More RAM for less money compared to other providers.",
    specs: ["DDR4 ECC Memory", "Up to 64GB RAM", "Error Correction", "2933MHz Speed"]
  },
  {
    icon: <HardDrive className="w-8 h-8 text-purple-500" />,
    title: "NVMe SSD Storage",
    description: "Ultra-fast NVMe SSDs for rapid data access and application loading. Premium storage at budget-friendly prices.",
    specs: ["NVMe SSD Storage", "Up to 1TB Space", "RAID Protection", "99.99% Reliability"]
  }
]

export default function Performance() {
  return (
    <section id="performance" className="section-padding bg-background">
      <div className="container mx-auto container-padding">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Unmatched Performance at 
            <span className="text-gradient"> Most Affordable Prices</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Don't compromise on performance because of budget constraints. 
            Get enterprise-grade hardware without the enterprise price tag.
          </p>
        </div>

        {/* Performance Features */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {performanceFeatures.map((feature, index) => (
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
                {feature.specs.map((spec, i) => (
                  <div key={i} className="flex items-center text-sm">
                    <div className="w-2 h-2 bg-primary rounded-full mr-3 flex-shrink-0"></div>
                    <span className="text-muted-foreground">{spec}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Performance Comparison */}
        <div className="glass rounded-2xl p-8 lg:p-12 animate-fade-in">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Performance That Speaks for Itself</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              See how our affordable Linux VPS performs compared to expensive alternatives. 
              Same quality, better prices.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center p-6 rounded-xl bg-background/50">
              <Gauge className="w-8 h-8 text-green-500 mx-auto mb-3" />
              <div className="text-2xl font-bold text-green-500 mb-1">200%</div>
              <div className="text-sm text-muted-foreground">Faster than Traditional VPS</div>
            </div>
            
            <div className="text-center p-6 rounded-xl bg-background/50">
              <Zap className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
              <div className="text-2xl font-bold text-yellow-500 mb-1">&lt;50ms</div>
              <div className="text-sm text-muted-foreground">Average Response Time</div>
            </div>
            
            <div className="text-center p-6 rounded-xl bg-background/50">
              <TrendingUp className="w-8 h-8 text-blue-500 mx-auto mb-3" />
              <div className="text-2xl font-bold text-blue-500 mb-1">99.9%</div>
              <div className="text-sm text-muted-foreground">Performance SLA</div>
            </div>
            
            <div className="text-center p-6 rounded-xl bg-background/50">
              <HardDrive className="w-8 h-8 text-purple-500 mx-auto mb-3" />
              <div className="text-2xl font-bold text-purple-500 mb-1">10x</div>
              <div className="text-sm text-muted-foreground">Faster Disk I/O</div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 animate-fade-in">
          <div className="inline-flex items-center px-6 py-3 bg-primary/10 rounded-full mb-4">
            <span className="text-sm text-primary font-medium">
              💡 Experience premium performance without premium pricing
            </span>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join thousands of developers and businesses who chose quality over cost. 
            Get started today with our most affordable Linux VPS plans.
          </p>
        </div>
      </div>
    </section>
  )
}