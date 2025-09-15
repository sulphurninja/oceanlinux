"use client";

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LucideWaves, Menu, X } from "lucide-react"
import { useState } from "react"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import EmailSupportDialog from "@/components/EmailSupportDialog"

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    return (
        <header className="sticky top-0 z-50 bg-foreground dark:bg-background border-b border-background/20 dark:border-border/20">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* Top bar */}
                <div className="hidden lg:flex justify-between items-center py-2 text-sm border-b border-background/20 dark:border-border/40">
                    <div className="flex items-center space-x-6">
                        <span className="text-background/70 dark:text-muted-foreground">
                            📧 Email: <a href="mailto:hello@oceanlinux.com" className="text-primary hover:underline">hello@oceanlinux.com</a>
                        </span>
                    </div>
                    <div className="flex items-center space-x-4">
                        {/* Backtick Labs branding in top bar */}
                        <div className="flex items-center space-x-2 text-xs">
                            <div className="w-4 h-4 rounded flex items-center justify-center">
                                <img src='/backtick.png' className="  dark:filter-none" />
                            </div>
                            <span className="text-background/70 dark:text-muted-foreground">A Product of
                                <Link href='https://backtick.app'>
                                    <span className="text-primary ml-1 font-medium">Backtick Labs</span>
                                </Link></span>
                        </div>
                        <Link href="/contact-us" className="text-background/70 dark:text-muted-foreground hover:text-primary transition-colors">
                            💜 Contact Us
                        </Link>
                    </div>
                </div>

                {/* Main header */}
                <div className="flex justify-between items-center py-4">
                    <Link href="/" className="flex items-center space-x-3">
                        <div className="relative">
                            <img src="/oceanlinux.png" className="h-16   dark:filter-none" />
                        </div>
                        <div>
                            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">
                                OceanLinux
                            </span>
                            <div className="text-xs text-background/70 dark:text-muted-foreground -mt-1">The Ocean of Linux</div>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex items-center space-x-8">
                        <Link href="/hosting" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            Affordable Hosting
                        </Link>
                        <Link href="/vps" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            Linux VPS & Servers
                        </Link>
                        <Link href="/series" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            Server Series
                        </Link>
                        <Link href="/live-chat" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            💬 24/7 Support
                        </Link>
                    </nav>

                    {/* CTA Buttons & Theme Toggle */}
                    <div className="hidden lg:flex items-center space-x-3">
                        {/* <ThemeToggle
                            variant="ghost"
                            className="text-background dark:text-foreground hover:text-primary hover:bg-background/10 dark:hover:bg-accent"
                        /> */}
                        <Link href="/login">
                            <Button variant="ghost" className="text-background dark:text-foreground hover:text-primary hover:bg-background/10 dark:hover:bg-accent">
                                👤 Log In
                            </Button>
                        </Link>
                        <Link href="/get-started">
                            <Button className="btn-primary">
                                🚀 Get Started
                            </Button>
                        </Link>
                    </div>

                    {/* Mobile Menu Button & Theme Toggle */}
                    <div className="lg:hidden flex items-center space-x-2">
                        <ThemeToggle
                            variant="ghost"
                            size="sm"
                            className="text-background dark:text-foreground hover:text-primary hover:bg-background/10 dark:hover:bg-accent"
                        />
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 rounded-lg hover:bg-background/10 dark:hover:bg-muted transition-colors text-background dark:text-foreground"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMenuOpen && (
                    <div className="lg:hidden py-4 border-t border-background/20 dark:border-border/40 animate-fade-in">
                        <nav className="flex flex-col space-y-4">
                            <Link
                                href="/hosting"
                                className="text-background dark:text-foreground hover:text-primary transition-colors font-medium"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                💰 Affordable Hosting
                            </Link>
                            <Link
                                href="/vps"
                                className="text-background dark:text-foreground hover:text-primary transition-colors font-medium"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                🚀 Linux VPS & Servers
                            </Link>
                            <Link
                                href="/series"
                                className="text-background dark:text-foreground hover:text-primary transition-colors font-medium"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                🔄 Server Series
                            </Link>
                            <Link
                                href="/support"
                                className="text-background dark:text-foreground hover:text-primary transition-colors font-medium"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                💬 24/7 Support
                            </Link>
                            <div className="pt-4 border-t border-background/20 dark:border-border/40 space-y-3">
                                <Link href="/login" onClick={() => setIsMenuOpen(false)}>
                                    <Button
                                        variant="outline"
                                        className="w-full border-background/30 dark:border-border text-background dark:text-foreground hover:bg-background/10 dark:hover:bg-accent"
                                    >
                                        👤 Log In
                                    </Button>
                                </Link>
                                <Link href="/get-started" onClick={() => setIsMenuOpen(false)}>
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
