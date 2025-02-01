import { Server, Shield, Zap, Scale, Cloud, Clock } from "lucide-react"

const features = [
  {
    icon: <Server className="w-12 h-12 mb-4 text-blue-300" />,
    title: "High-Performance Servers",
    description: "Cutting-edge hardware ensures your applications run at peak efficiency.",
  },
  {
    icon: <Shield className="w-12 h-12 mb-4 text-blue-300" />,
    title: "Advanced Security",
    description: "Multi-layered security protocols to keep your data safe and secure.",
  },
  {
    icon: <Zap className="w-12 h-12 mb-4 text-blue-300" />,
    title: "Lightning-Fast Network",
    description: "Global network infrastructure for minimal latency and maximum speed.",
  },
  {
    icon: <Scale className="w-12 h-12 mb-4 text-blue-300" />,
    title: "Scalable Resources",
    description: "Easily scale your resources up or down as your needs change.",
  },
  {
    icon: <Cloud className="w-12 h-12 mb-4 text-blue-300" />,
    title: "Cloud-Native Architecture",
    description: "Built for the cloud, optimized for modern, distributed applications.",
  },
  {
    icon: <Clock className="w-12 h-12 mb-4 text-blue-300" />,
    title: "99.9% Uptime Guarantee",
    description: "Reliable service with minimal downtime, backed by our SLA.",
  },
]

export default function Features() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 ">
      <div className="container mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">Why Choose Ocean Linux?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="bg-acce border -700 p-6 rounded-lg shadow-lg">
              <div className="flex flex-col items-center text-center">
                {feature.icon}
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-blue-100">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

