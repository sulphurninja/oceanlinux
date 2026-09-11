"use client";

import Link from "next/link";
import { Menu, X, ChevronDown, Mail, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_LINKS = [
  { href: "/hosting", label: "Hosting Plans" },
  { href: "/vps", label: "VPS Servers" },
  { href: "/series", label: "Server Series" },
];

const RESOURCE_LINKS = [
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/docs/api", label: "API Docs" },
  { href: "/tools/proxy-setup", label: "Proxy Setup Tool" },
  { href: "/tools/proxy-checker", label: "Proxy IP Checker" },
];

const navLinkClass =
  "relative text-sm text-white/60 hover:text-white transition-colors font-medium group py-1";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300 premium-header",
        scrolled && "premium-header--scrolled"
      )}
    >
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none bg-[url('/grid-pattern.svg')] bg-center"
        aria-hidden
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Utility row — hides on scroll for compact sticky bar */}
        <div
          className={cn(
            "hidden lg:flex justify-between items-center text-xs border-b border-white/[0.05] overflow-hidden transition-all duration-300",
            scrolled ? "max-h-0 py-0 opacity-0 border-transparent" : "max-h-10 py-2 opacity-100"
          )}
        >
          <a
            href="mailto:hello@oceanlinux.com"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-emerald-300 transition-colors"
          >
            <Mail className="w-3 h-3 text-emerald-400/70" />
            hello@oceanlinux.com
          </a>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-2 text-white/40">
              <img src="/backtick.png" alt="" className="w-3.5 h-3.5 opacity-80" />
              A product of{" "}
              <Link href="https://backticklabs.io" className="text-emerald-400/90 hover:text-emerald-300 font-medium">
                Backtick Labs
              </Link>
            </span>
            <Link href="/contact-us" className="text-white/40 hover:text-emerald-300 transition-colors">
              Contact
            </Link>
          </div>
        </div>

        {/* Main nav */}
        <div
          className={cn(
            "flex justify-between items-center gap-3 transition-all duration-300",
            scrolled ? "py-2.5" : "py-3 sm:py-3.5"
          )}
        >
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink group">
            <img
              src="/ol.png"
              className="h-9 sm:h-11 w-auto transition-transform duration-200 group-hover:scale-105 shrink-0"
              alt="OceanLinux"
            />
            <div className="min-w-0">
              <span className="text-lg sm:text-xl font-bold text-white tracking-tight block truncate">
                OceanLinux
              </span>
              <span className="text-[10px] sm:text-[11px] text-white/35 -mt-0.5 block truncate tracking-wide">
                The Ocean of Linux
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={navLinkClass}>
                {link.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-emerald-400 transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger className={cn(navLinkClass, "flex items-center gap-1 focus:outline-none")}>
                Resources
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-48 bg-[hsl(160_30%_8%)] border-white/10 text-white"
              >
                {RESOURCE_LINKS.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className="cursor-pointer text-white/70 focus:text-white focus:bg-white/5"
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/live-chat" className={navLinkClass}>
              Support
              <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-emerald-400 transition-all duration-300 group-hover:w-full" />
            </Link>
          </nav>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <Link href="/login">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                <LogIn className="w-4 h-4" />
                Log In
              </button>
            </Link>
            <Link href="/get-started">
              <button type="button" className="premium-btn-primary px-5 py-2.5 w-auto text-sm">
                Get Started
              </button>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors shrink-0"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={cn(
            "lg:hidden overflow-hidden transition-all duration-300 ease-in-out",
            isMenuOpen ? "max-h-[85vh] opacity-100 pb-4" : "max-h-0 opacity-0"
          )}
        >
          <nav className="flex flex-col pt-3 border-t border-white/[0.06]">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-white/70 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium px-3 py-3 rounded-lg"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            <div>
              <button
                type="button"
                onClick={() => setResourcesOpen(!resourcesOpen)}
                className="flex items-center justify-between w-full text-white/70 hover:text-white text-sm font-medium px-3 py-3 rounded-lg hover:bg-white/5"
              >
                Resources
                <ChevronDown className={cn("h-4 w-4 transition-transform", resourcesOpen && "rotate-180")} />
              </button>
              {resourcesOpen && (
                <div className="pl-4 pb-2 space-y-1">
                  {RESOURCE_LINKS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block text-white/50 hover:text-emerald-300 text-sm py-2"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/live-chat"
              className="text-white/70 hover:text-white hover:bg-white/5 text-sm font-medium px-3 py-3 rounded-lg"
              onClick={() => setIsMenuOpen(false)}
            >
              Support
            </Link>

            <div className="pt-4 mt-2 border-t border-white/[0.06] flex flex-col gap-3 px-1">
              <Link
                href="/login"
                className="block w-full"
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="premium-btn-outline w-full py-3">
                  Log In
                </span>
              </Link>
              <Link
                href="/get-started"
                className="block w-full"
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="premium-btn-primary w-full py-3">
                  Get Started
                </span>
              </Link>
            </div>

            <p className="text-[11px] text-white/30 text-center pt-4">
              hello@oceanlinux.com
            </p>
          </nav>
        </div>
      </div>
    </header>
  );
}
