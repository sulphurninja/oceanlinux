import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LucideWaves } from "lucide-react"

export default function Header() {
    return (
        <header className="py-6 px-4 sm:px-6 lg:px-8 bg-background border-b">
            <div className="container mx-auto flex justify-between items-center">
                <Link href="/" className="text-2xl font-bold gap-2 text-white flex items-center">
                    <LucideWaves />
                    Ocean Linux
                </Link>
                <nav className="hidden md:flex space-x-8">
                    <Link href="/features" className="text-white hover:text-blue-200 transition">
                        Features
                    </Link>
                    <Link href="/performance" className="text-white hover:text-blue-200 transition">
                        Performance
                    </Link>
                    <Link href="/security" className="text-white hover:text-blue-200 transition">
                        Security
                    </Link>
                </nav>
                <Link href='/get-started'>
                    <Button variant="outline" className="bg-transparent text-white border-white  hover:text-white hover:border-muted">
                        Get Started
                    </Button>
                </Link>
            </div>
        </header>
    )
}

