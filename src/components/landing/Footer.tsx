import Link from "next/link"
import { Facebook, Twitter, Linkedin, Github } from "lucide-react"

export default function Footer() {
    return (
        <footer className=" py-12 px-4 sm:px-6 lg:px-8">
            <div className="container mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Ocean Linux</h3>
                        <p className="text-blue-200">Powerful VPS hosting solutions for your business needs.</p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link href="/features" className="text-blue-200 hover:text-white transition">
                                    Features
                                </Link>
                            </li>
                            <li>
                                <Link href="/performance" className="text-blue-200 hover:text-white transition">
                                    Performance
                                </Link>
                            </li>
                            <li>
                                <Link href="/security" className="text-blue-200 hover:text-white transition">
                                    Security
                                </Link>
                            </li>

                        </ul>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Policies</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link href="/privacy-policy" className="text-blue-200 hover:text-white transition">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="/terms-and-conditions" className="text-blue-200 hover:text-white transition">
                                    Terms & Conditions
                                </Link>
                            </li>
                            <li>
                                <Link href="/refund-policy" className="text-blue-200 hover:text-white transition">
                                    Refund Policy
                                </Link>
                            </li>
                           
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Connect</h3>
                        <div className="flex space-x-4">
                            <Link href="#" className="text-blue-200 hover:text-white transition">
                                <Facebook className="w-6 h-6" />
                            </Link>
                            <Link href="#" className="text-blue-200 hover:text-white transition">
                                <Twitter className="w-6 h-6" />
                            </Link>
                            <Link href="#" className="text-blue-200 hover:text-white transition">
                                <Linkedin className="w-6 h-6" />
                            </Link>
                            <Link href="#" className="text-blue-200 hover:text-white transition">
                                <Github className="w-6 h-6" />
                            </Link>
                        </div>
                    </div>
                </div>
                <div className="mt-12 pt-8 border-t text-center text-blue-200">
                    <p>&copy; {new Date().getFullYear()} Ocean Linux. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}

