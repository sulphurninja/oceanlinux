"use client";

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LucideWaves, Menu, X } from "lucide-react"
import { useState } from "react"
import EmailSupportDialog from "@/components/EmailSupportDialog"

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    return (
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* Top bar */}
                <div className="hidden lg:flex justify-between items-center py-2 text-sm border-b border-border/50">
                    <div className="flex items-center space-x-6">
                        <span className="text-muted-foreground">
                            📧 Email: <a href="mailto:hello@oceanlinux.com" className="text-primary hover:underline">hello@oceanlinux.com</a>
                        </span>
                    </div>
                    <div className="flex items-center space-x-4">
                        {/* Backtick Labs branding in top bar */}
                        <div className="flex items-center space-x-2 text-xs">
                            <div className="w-4 h-4  rounded flex items-center justify-center">
                                <img src='/backtick.png' />
                            </div>
                            <span className="text-muted-foreground">A Product of
                                <Link href='https://backtick.app'>
                                    <span className="text-primary ml-1 font-medium">Backtick Labs</span>
                                </Link></span>
                        </div>
                        <Link href="/contact-us" className="text-muted-foreground hover:text-primary transition-colors">
                            💜 Contact Us
                        </Link>
                    </div>
                </div>

                {/* Main header */}
                <div className="flex justify-between items-center py-4">
                    <Link href="/" className="flex items-center space-x-3">
                        <div className="relative">
                          <img src="/oceanlinux.png" className="h-16"/>
                        </div>
                        <div>
                            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                                OceanLinux
                            </span>
                            <div className="text-xs text-muted-foreground -mt-1">The Ocean of Linux</div>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex items-center space-x-8">
                        <Link href="/hosting" className="text-foreground hover:text-primary transition-colors font-medium">
                            Affordable Hosting
                        </Link>
                        <Link href="/vps" className="text-foreground hover:text-primary transition-colors font-medium">
                            Linux VPS & Servers
                        </Link>
                        <Link href="/series" className="text-foreground hover:text-primary transition-colors font-medium">
                            Server Series
                        </Link>
                        <Link href="/live-chat" className="text-foreground hover:text-primary transition-colors font-medium">
                            💬 24/7 Support
                        </Link>
                    </nav>

                    {/* CTA Buttons */}
                    <div className="hidden lg:flex items-center space-x-3">
                        <Link href="/login">
                            <Button variant="ghost" className="text-foreground hover:text-primary">
                                👤 Log In
                            </Button>
                        </Link>
                        <Link href="/get-started">
                            <Button className="btn-primary">
                                🚀 Get Started
                            </Button>
                        </Link>
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                        {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>

                {/* Mobile Menu */}
                {isMenuOpen && (
                    <div className="lg:hidden py-4 border-t border-border animate-fade-in">
                        <nav className="flex flex-col space-y-4">
                            <Link href="/hosting" className="text-foreground hover:text-primary transition-colors font-medium">
                                💰 Affordable Hosting
                            </Link>
                            <Link href="/vps" className="text-foreground hover:text-primary transition-colors font-medium">
                                🚀 Linux VPS & Servers
                            </Link>
                            <Link href="/series" className="text-foreground hover:text-primary transition-colors font-medium">
                                🔄 Server Series
                            </Link>
                            <Link href="/support" className="text-foreground hover:text-primary transition-colors font-medium">
                                💬 24/7 Support
                            </Link>
                            <div className="pt-4 border-t border-border space-y-3">
                                <Link href="/login">
                                    <Button variant="outline" className="w-full">
                                        👤 Log In
                                    </Button>
                                </Link>
                                <Link href="/get-started">
                                    <Button className="btn-primary w-full">
                                        🚀 Get Most Affordable VPS
                                    </Button>
                                </Link>
                            </div>
                        </nav>
                    </div>
                )}
            </div>
        </header>
    )
}