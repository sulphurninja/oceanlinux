import Link from "next/link"
import { LucideWaves, Mail, Phone, MapPin, Globe } from "lucide-react"
import Image from "next/image"

const footerSections = {
  hosting: {
    title: "Linux Hosting",
    links: [
      { name: "🔄 Gold Series Rotating", href: "/hosting/gold-series" },
      { name: "🚀 Nova Linux VPS", href: "/hosting/nova-linux" },
      { name: "🔋 Power Linux VPS", href: "/hosting/power-linux" },
      { name: "🔰 Titan Series", href: "/hosting/titan-series" },
      { name: "💰 Most Affordable Plans", href: "/pricing" },
      { name: "🛠️ Managed Linux Hosting", href: "/managed-hosting" }
    ]
  },
  servers: {
    title: "VPS & Servers",
    links: [
      { name: "Linux VPS Hosting", href: "/vps/linux" },
      { name: "Dedicated Servers", href: "/servers/dedicated" },
      { name: "Cloud Servers", href: "/servers/cloud" },
      { name: "Managed Servers", href: "/servers/managed" },
      { name: "Affordable VPS", href: "/vps/affordable" }
    ]
  },
  support: {
    title: "Support & Help",
    links: [
      { name: "📚 Knowledge Base", href: "/knowledge-base" },
      { name: "💬 Live Chat Support", href: "/support/chat" },
      { name: "📧 Email Support", href: "/support/email" },
      { name: "🎟️ Support Tickets", href: "/support/tickets" },
      { name: "📋 Server Status", href: "/status" }
    ]
  },
  company: {
    title: "Company",
    links: [
      { name: "About OceanLinux", href: "/about" },
      { name: "Why Choose Us", href: "/why-choose-us" },
      { name: "Our Data Centers", href: "/data-centers" },
      { name: "Careers", href: "/careers" },
      { name: "Contact Us", href: "/contact" }
    ]
  }
}

export default function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      {/* Main Footer */}
      <div className="container mx-auto container-padding">
        <div className="section-padding">
          <div className="grid lg:grid-cols-5 gap-8">
            {/* Brand Section */}
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center space-x-3 mb-6">
                <div className="relative">
                  <LucideWaves className="w-8 h-8 text-primary" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full animate-pulse"></div>
                </div>
                <div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
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
                  {/* Replace with actual Backtick Labs logo */}
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded flex items-center justify-center">
                    <span className="text-white font-bold text-sm">`</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">A Product of</div>
                    <div className="text-lg font-bold text-primary">Backtick Labs</div>
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
                {/* <div className="flex items-center space-x-3">
                  <Phone className="w-4 h-4 text-primary" />
                  <a href="tel:+1-800-OCEAN-LX" className="hover:text-primary transition-colors">
                    +1-800-OCEAN-LX (24/7)
                  </a>
                </div> */}
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
                      {section.links.map((link, index) => (
                        <li key={index}>
                          <Link 
                            href={link.href}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                          >
                            {link.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border bg-muted/30">
        <div className="container mx-auto container-padding">
          <div className="py-6 flex flex-col sm:flex-row justify-between items-center">
            <div className="text-sm text-muted-foreground mb-4 sm:mb-0">
              © 2024 OceanLinux. All rights reserved. • A Product of Backtick Labs
            </div>
            <div className="flex items-center space-x-6">
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Terms of Service
              </Link>
              <Link href="/refund" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Refund Policy
              </Link>
              <Link href="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}