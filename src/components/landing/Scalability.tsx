import { ArrowUpCircle, ArrowDownCircle, Minimize2 } from "lucide-react"

export default function Scalability() {
  return (
    <section id="scalability" className="py-20 px-4 sm:px-6 lg:px-8 ">
      <div className="container mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">Effortless Scalability</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border p-6 rounded-lg shadow-lg">
            <ArrowUpCircle className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Vertical Scaling</h3>
            <p className="text-blue-100">
              Easily upgrade your VPS resources (CPU, RAM, Storage) with just a few clicks, without any downtime.
            </p>
          </div>
          <div className="border p-6 rounded-lg shadow-lg">
            <ArrowDownCircle className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Horizontal Scaling</h3>
            <p className="text-blue-100">
              Seamlessly add more VPS instances to distribute your workload and handle increased traffic.
            </p>
          </div>
          <div className="border p-6 rounded-lg shadow-lg">
            <Minimize2 className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Auto-scaling</h3>
            <p className="text-blue-100">
              Set up automatic scaling rules to handle traffic spikes and optimize resource usage efficiently.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-xl">
            Grow your infrastructure effortlessly as your business expands, without the need for complex migrations.
          </p>
        </div>
      </div>
    </section>
  )
}

