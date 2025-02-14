import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function Hero() {
    return (
        <section className="py-20 px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6">
                Most Affordable VPS Hosting with Ocean Linux
            </h1>
            <p className="text-xl sm:text-2xl mb-8 max-w-3xl mx-auto">
                Experience lightning-fast, secure, and scalable virtual private servers tailored for your needs.
            </p>
            <div className="flex justify-center space-x-4">
                <Link href='/get-started'>
                    <Button size="lg" className=" ">
                        Get Started
                    </Button>
                </Link>
                <Link href='/features'>
                    <Button
                        size="lg"
                        variant="outline"
                        className="bg-transparent text-white border-white hover:bg-white hover:text-blue-700"
                    >
                        Learn More
                    </Button>
                </Link>
            </div>
        </section>
    )
}

