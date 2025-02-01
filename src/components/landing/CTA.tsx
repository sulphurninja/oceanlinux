import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function CTA() {
    return (
        <section className="py-20 px-4 sm:px-6 lg:px-8  text-center">
            <div className="container mx-auto">
                <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to Dive Into Ocean Linux?</h2>
                <p className="text-xl mb-8 max-w-2xl mx-auto">
                    Experience the power of our cutting-edge VPS hosting. Start your journey today with our 30-day free trial.
                </p>
                <Link href='/get-started'>
                    <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-100">
                        Get Started with Ocean Linux
                    </Button>
                </Link>
            </div>
        </section>
    )
}

