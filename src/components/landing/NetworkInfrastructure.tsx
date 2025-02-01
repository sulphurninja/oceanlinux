import { Globe, Wifi, Zap } from "lucide-react"

export default function NetworkInfrastructure() {
  return (
    <section id="network" className="py-20 px-4 sm:px-6 lg:px-8 ">
      <div className="container mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">Global Network Infrastructure</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border p-6 rounded-lg shadow-lg">
            <Globe className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Global Presence</h3>
            <p className="text-blue-100">
              Multiple data centers across 6 continents ensure low-latency access for your global audience.
            </p>
          </div>
          <div className="border p-6 rounded-lg shadow-lg">
            <Wifi className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">High Bandwidth</h3>
            <p className="text-blue-100">
              Unlimited inbound traffic and high outbound bandwidth to handle your most demanding applications.
            </p>
          </div>
          <div className="border p-6 rounded-lg shadow-lg">
            <Zap className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Low Latency</h3>
            <p className="text-blue-100">
              Optimized network routes and peering agreements for minimal latency and maximum speed.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-xl">
            Our robust network ensures your applications are always fast, reliable, and accessible from anywhere in the
            world.
          </p>
        </div>
      </div>
    </section>
  )
}

