import { HeadphonesIcon, Clock, Award } from "lucide-react"

export default function SupportAndReliability() {
  return (
    <section id="support" className="py-20 px-4 sm:px-6 lg:px-8 ">
      <div className="container mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">Unparalleled Support & Reliability</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-secondary -800 p-6 rounded-lg shadow-lg">
            <HeadphonesIcon className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">24/7 Expert Support</h3>
            <p className="text-blue-100">
              Our team of experienced professionals is available round the clock to assist you with any issues or
              questions.
            </p>
          </div>
          <div className="bg-secondary -800 p-6 rounded-lg shadow-lg">
            <Clock className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">99.9% Uptime Guarantee</h3>
            <p className="text-blue-100">
              We ensure your services remain online and accessible, backed by our robust SLA.
            </p>
          </div>
          <div className="bg-secondary -800 p-6 rounded-lg shadow-lg">
            <Award className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Industry-Leading SLAs</h3>
            <p className="text-blue-100">
              Our service level agreements provide you with peace of mind and guaranteed performance.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-xl">
            Experience support that goes above and beyond, ensuring your success is our top priority.
          </p>
        </div>
      </div>
    </section>
  )
}

