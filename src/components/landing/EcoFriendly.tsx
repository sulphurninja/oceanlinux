import { Leaf, Recycle, Sun, Wind, Battery, Globe2 } from "lucide-react"

const ecoFeatures = [
  {
    icon: <Leaf className="w-8 h-8 text-green-500" />,
    title: "100% Green Energy",
    description: "Our data centers run on renewable energy sources. Get eco-friendly hosting at the most affordable prices without compromising on performance.",
    impact: "50% Less Carbon Footprint"
  },
  {
    icon: <Recycle className="w-8 h-8 text-blue-500" />,
    title: "Responsible Hardware Recycling",
    description: "We properly recycle and dispose of old hardware. Environmentally responsible hosting that doesn't cost extra.",
    impact: "100% Hardware Recycled"
  },
  {
    icon: <Sun className="w-8 h-8 text-yellow-500" />,
    title: "Energy-Efficient Infrastructure",
    description: "Advanced cooling systems and efficient hardware reduce power consumption. Green technology at budget-friendly prices.",
    impact: "40% Energy Savings"
  }
]

const sustainabilityStats = [
  {
    icon: <Wind className="w-6 h-6 text-green-500" />,
    value: "100%",
    label: "Renewable Energy"
  },
  {
    icon: <Battery className="w-6 h-6 text-blue-500" />,
    value: "40%",
    label: "Less Energy Use"
  },
  {
    icon: <Recycle className="w-6 h-6 text-purple-500" />,
    value: "Zero",
    label: "E-Waste to Landfills"
  },
  {
    icon: <Globe2 className="w-6 h-6 text-cyan-500" />,
    value: "Carbon",
    label: "Neutral Hosting"
  }
]

export default function EcoFriendly() {
  return (
    <section className="section-padding bg-muted/30">
      <div className="container mx-auto container-padding">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Eco-Friendly Hosting That's 
            <span className="text-primary"> Kind to Your Wallet</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Choose sustainable hosting without paying premium prices. Our green infrastructure 
            is included in all our affordable VPS plans at no extra cost.
          </p>
        </div>

        {/* Eco Features */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {ecoFeatures.map((feature, index) => (
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
                <div className="inline-flex items-center px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-sm font-medium">
                  🌱 {feature.impact}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sustainability Stats */}
        <div className="glass rounded-2xl p-8 lg:p-12 mb-16 animate-fade-in">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Our Environmental Impact</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We believe in responsible hosting that doesn't harm the planet. 
              All our green initiatives are included at no extra cost to you.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {sustainabilityStats.map((stat, index) => (
              <div key={index} className="text-center p-6 rounded-xl bg-background/50">
                <div className="flex justify-center mb-3">
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-green-500 mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Green Promise */}
        <div className="text-center bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-2xl p-8 animate-fade-in">
          <Leaf className="w-16 h-16 text-green-500 mx-auto mb-6" />
          <h3 className="text-2xl font-bold mb-4">Our Green Promise</h3>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            Choose OceanLinux for powerful hosting that's also kind to our planet. 
            Get professional VPS hosting while supporting environmental sustainability - 
            all at the most affordable prices.
          </p>
          <div className="inline-flex items-center px-6 py-3 bg-green-500/10 text-green-500 rounded-full font-medium">
            🌍 Hosting That Cares for Tomorrow
          </div>
        </div>
      </div>
    </section>
  )
}