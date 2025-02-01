import { Cpu, MemoryStickIcon as Memory, HardDrive } from "lucide-react"

export default function Performance() {
  return (
    <section id="performance" className="py-20 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="container mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">Unmatched Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border p-6 rounded-lg shadow-lg">
            <Cpu className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Latest Generation CPUs</h3>
            <p className="text-blue-100">
              Powered by the latest Intel and AMD processors, ensuring maximum speed and efficiency for your
              applications.
            </p>
          </div>
          <div className=" border p-6 rounded-lg shadow-lg">
            <Memory className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">High-Speed RAM</h3>
            <p className="text-blue-100">
              DDR4 ECC RAM for lightning-fast data access and processing, reducing latency and improving overall
              performance.
            </p>
          </div>
          <div className="border p-6 rounded-lg shadow-lg">
            <HardDrive className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">NVMe SSD Storage</h3>
            <p className="text-blue-100">
              Ultra-fast NVMe SSDs for rapid data retrieval and storage, significantly reducing I/O wait times.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-xl">Experience up to 200% faster performance compared to traditional VPS providers.</p>
        </div>
      </div>
    </section>
  )
}

