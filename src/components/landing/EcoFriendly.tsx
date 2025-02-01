import { Leaf, Recycle, Sun } from "lucide-react"

export default function EcoFriendly() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 ">
      <div className="container mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">Eco-Friendly Hosting</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-accent-foreground -700 p-6 rounded-lg shadow-lg">
            <Leaf className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Green Data Centers</h3>
            <p className="text-blue-100">
              Our data centers are powered by renewable energy sources, reducing our carbon footprint.
            </p>
          </div>
          <div className="bg-accent-foreground p-6 rounded-lg shadow-lg">
            <Recycle className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">E-Waste Reduction</h3>
            <p className="text-blue-100">
              We responsibly recycle and dispose of old hardware to minimize environmental impact.
            </p>
          </div>
          <div className="bg-accent-foreground p-6 rounded-lg shadow-lg">
            <Sun className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Energy Efficiency</h3>
            <p className="text-blue-100">
              Advanced cooling systems and energy-efficient hardware optimize our power consumption.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-xl">Choose Ocean Linux for powerful hosting that's also kind to our planet.</p>
        </div>
      </div>
    </section>
  )
}

