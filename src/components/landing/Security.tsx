import { Shield, Lock, Eye } from "lucide-react"

export default function Security() {
  return (
    <section id="security" className="py-20 px-4 sm:px-6 lg:px-8 ">
      <div className="container mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center">Enterprise-Grade Security</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border 0 p-6 rounded-lg shadow-lg">
            <Shield className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">DDoS Protection</h3>
            <p className="text-blue-100">
              Advanced DDoS mitigation techniques to keep your services online even during large-scale attacks.
            </p>
          </div>
          <div className="border p-6 rounded-lg shadow-lg">
            <Lock className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">Encrypted Data</h3>
            <p className="text-blue-100">
              All data is encrypted at rest and in transit, ensuring your information remains confidential and secure.
            </p>
          </div>
          <div className="border p-6 rounded-lg shadow-lg">
            <Eye className="w-12 h-12 mb-4 text-blue-300" />
            <h3 className="text-xl font-semibold mb-2">24/7 Monitoring</h3>
            <p className="text-blue-100">
              Continuous monitoring and threat detection to identify and neutralize potential security risks.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-xl">
            Your data's security is our top priority. We employ multiple layers of protection to ensure your peace of
            mind.
          </p>
        </div>
      </div>
    </section>
  )
}

