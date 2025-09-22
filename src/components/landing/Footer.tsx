import Link from "next/link"
import { LucideWaves, Mail, Phone, MapPin, Globe } from "lucide-react"
import Image from "next/image"
import EmailSupportDialog from "@/components/EmailSupportDialog"

const footerSections = {
  hosting: {
    title: "Linux Hosting",
    links: [
      { name: "🔄 Gold Series Rotating", href: "/hosting#gold-series" },
      { name: "🚀 Nova Linux VPS", href: "/hosting#nova-linux" },
      { name: "🔋 Power Linux VPS", href: "/hosting#power-linux" },
      { name: "🔰 Titan Series", href: "/hosting#titan-series" },
      { name: "💰 Most Affordable Plans", href: "/hosting" },
      { name: "🛠️ Managed Linux Hosting", href: "/vps" }
    ]
  },
  servers: {
    title: "VPS & Servers",
    links: [
      { name: "Linux VPS Hosting", href: "/vps" },
      { name: "Server Series", href: "/series" },
      { name: "Affordable Hosting", href: "/hosting" },
      { name: "Premium Gold Series", href: "/hosting#gold-series" },
      { name: "Enterprise Titan Series", href: "/hosting#titan-series" }
    ]
  },
  support: {
    title: "Support & Help",
    links: [
      { name: "📚 Knowledge Base", href: "/knowledge-base" },
      { name: "💬 Live Chat Support", href: "/live-chat" },
      { name: "🎟️ Support Tickets", href: "/support/tickets" },
      { name: "⚠️ Server Status", href: "/status" },
      { name: "📋 API Documentation", href: "/docs/api" },
    ]
  },
  company: {
    title: "Company",
    links: [
      { name: "About OceanLinux", href: "/about" },
      { name: "Contact Us", href: "/contact-us" }
    ]
  }
}

export default function Footer() {
  return (
    <footer className="bg-card border dark:border-none-t border dark:border-none-border dark:border-none">
      {/* Main Footer */}
      <div className="container mx-auto container-padding">
        <div className="section-padding">
          <div className="grid lg:grid-cols-5 gap-8">
            {/* Brand Section */}
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center space-x-3 mb-6">
                <div className="relative">
                  <img src='/oceanlinux.png' className="h-20" />
                </div>
                <div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">
                    OceanLinux
                  </span>
                  <div className="text-xs text-muted-foreground -mt-1">The Ocean of Linux</div>
                </div>
              </Link>

              <p className="text-muted-foreground leading-relaxed mb-6">
                The most affordable premium Linux VPS hosting provider. We make professional hosting
                accessible to everyone with transparent pricing, reliable performance, and expert support.
              </p>

              {/* Backtick Labs Branding */}
              <div className="flex items-center space-x-3 mb-6 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded flex items-center justify-center">
                    <img src='/backtick.png' />
                  </div>
                  <div>
                    <div className="text-sm font-medium">A Product of</div>
                    <Link href='https://backtick.app'>
                      <div className="text-lg font-bold text-primary">Backtick Labs</div>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center space-x-3">
                  <Mail className="w-4 h-4 text-primary" />
                  <a href="mailto:hello@oceanlinux.com" className="hover:text-primary transition-colors">
                    hello@oceanlinux.com
                  </a>
                </div>
                <div className="flex items-center space-x-3">
                  <Globe className="w-4 h-4 text-primary" />
                  <span>Global Data Centers • 99.9% Uptime SLA</span>
                </div>
              </div>

              {/* Trust Badges */}
              <div className="flex items-center space-x-4 mt-6">
                <div className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded">
                  ✓ SSL Secured
                </div>
                <div className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded">
                  ✓ DDoS Protected
                </div>
                <div className="text-xs bg-purple-500/10 text-purple-500 px-2 py-1 rounded">
                  ✓ 24/7 Monitored
                </div>
              </div>
            </div>

            {/* Footer Links */}
            <div className="lg:col-span-3">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {Object.entries(footerSections).map(([key, section]) => (
                  <div key={key}>
                    <h4 className="font-semibold text-foreground mb-4">{section.title}</h4>
                    <ul className="space-y-2">
                      {section.links.map((link, index) => {
                        // Special handling for Email Support
                        if (link.name === "📧 Email Support") {
                          return (
                            <li key={index}>
                              <EmailSupportDialog />
                            </li>
                          );
                        }

                        return (
                          <li key={index}>
                            <Link
                              href={link.href}
                              className="text-sm text-muted-foreground hover:text-primary transition-colors"
                            >
                              {link.name}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border dark:border-none-t border dark:border-none-border dark:border-none bg-muted/30">
        <div className="container mx-auto container-padding">
          <div className="py-6 flex flex-col sm:flex-row justify-between items-center">
            <div className="text-sm text-muted-foreground mb-4 sm:mb-0">
              © 2024 OceanLinux. All rights reserved. • A Product of Backtick Labs
            </div>
            <div className="flex items-center space-x-6">
              <Link href="/privacy-policy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms-and-conditions" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Terms of Service
              </Link>
              <Link href="/refund-policy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Refund Policy
              </Link>
              <Link href="/contact-us" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
