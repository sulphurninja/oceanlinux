"use client";

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LucideWaves, Menu, X, ChevronDown } from "lucide-react"
import { useState } from "react"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import EmailSupportDialog from "@/components/EmailSupportDialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [resourcesOpen, setResourcesOpen] = useState(false)

    return (
        <header className="sticky top-0 z-50 bg-foreground dark:bg-background border-b border-background/20 dark:border-border/20">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* Top bar */}
                <div className="hidden lg:flex justify-between items-center py-2 text-sm border-b border-background/20 dark:border-border/40">
                    <div className="flex items-center space-x-6">
                        <span className="text-background/70 dark:text-muted-foreground">
                            📧 Email: <a href="mailto:hello@oceanlinux.com" className="text-green-500 hover:underline">hello@oceanlinux.com</a>
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
                                    <span className="text-green-500  ml-1 font-medium">Backtick Labs</span>
                                </Link></span>
                        </div>
                        <Link href="/contact-us" className="text-background/70 dark:text-muted-foreground hover:text-primary transition-colors">
                            💜 Contact Us
                        </Link>
                    </div>
                </div>

                {/* Main header */}
                <div className="flex justify-between items-center py-4">
                    <Link href="/" className="flex items-center gap-3">
                        <img 
                            src="/ol.png" 
                            className="h-12 w-auto transition-all duration-200 hover:scale-105" 
                            alt="OceanLinux"
                        />
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-l from-primary to-foreground bg-clip-text text-transparent whitespace-nowrap">
                                OceanLinux
                            </h1>
                            <div className="text-xs text-background/70 dark:text-muted-foreground -mt-1">The Ocean of Linux</div>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex items-center space-x-6">
                        <Link href="/hosting" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            Hosting Plans
                        </Link>
                        <Link href="/vps" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            VPS Servers
                        </Link>
                        <Link href="/series" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            Server Series
                        </Link>
                        
                        {/* Resources Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger className="flex items-center gap-1 text-background dark:text-foreground hover:text-primary transition-colors font-medium focus:outline-none">
                                Resources
                                <ChevronDown className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem asChild>
                                    <Link href="/knowledge-base" className="flex items-center gap-2 cursor-pointer">
                                        📚 Knowledge Base
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/docs/api" className="flex items-center gap-2 cursor-pointer">
                                        🔌 API Docs
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/tools/proxy-setup" className="flex items-center gap-2 cursor-pointer">
                                        🔧 Proxy Setup Tool
                                    </Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Link href="/live-chat" className="text-background dark:text-foreground hover:text-primary transition-colors font-medium">
                            24/7 Support
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
                        {/* <ThemeToggle
                            variant="ghost"
                            size="sm"
                            className="text-background dark:text-foreground hover:text-primary hover:bg-background/10 dark:hover:bg-accent"
                        /> */}
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
                                💰 Hosting Plans
                            </Link>
                            <Link
                                href="/vps"
                                className="text-background dark:text-foreground hover:text-primary transition-colors font-medium"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                🚀 VPS Servers
                            </Link>
                            <Link
                                href="/series"
                                className="text-background dark:text-foreground hover:text-primary transition-colors font-medium"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                🔄 Server Series
                            </Link>
                            
                            {/* Resources Submenu */}
                            <div className="space-y-2">
                                <button
                                    onClick={() => setResourcesOpen(!resourcesOpen)}
                                    className="flex items-center justify-between w-full text-background dark:text-foreground hover:text-primary transition-colors font-medium"
                                >
                                    📚 Resources
                                    <ChevronDown className={`h-4 w-4 transition-transform ${resourcesOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {resourcesOpen && (
                                    <div className="pl-6 space-y-2 animate-fade-in">
                                        <Link
                                            href="/knowledge-base"
                                            className="block text-background/80 dark:text-foreground/80 hover:text-primary transition-colors text-sm"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            📚 Knowledge Base
                                        </Link>
                                        <Link
                                            href="/docs/api"
                                            className="block text-background/80 dark:text-foreground/80 hover:text-primary transition-colors text-sm"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            🔌 API Docs
                                        </Link>
                                    </div>
                                )}
                            </div>

                            <Link
                                href="/live-chat"
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
                                    <Button className="btn-primary w-full mt-2">
                                        🚀 Get Started
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
