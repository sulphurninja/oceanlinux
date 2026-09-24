import Link from "next/link"
import { Mail, Globe, Shield, Lock, Activity } from "lucide-react"
import EmailSupportDialog from "@/components/EmailSupportDialog"

const footerSections = {
  hosting: {
    title: "Linux Hosting",
    links: [
      { name: "Gold Series Rotating", href: "/hosting#gold-series" },
      { name: "Nova Linux VPS", href: "/hosting#nova-linux" },
      { name: "Power Linux VPS", href: "/hosting#power-linux" },
      { name: "Titan Series", href: "/hosting#titan-series" },
      { name: "Most Affordable Plans", href: "/hosting" },
      { name: "Managed Linux Hosting", href: "/vps" },
    ],
  },
  servers: {
    title: "VPS & Servers",
    links: [
      { name: "Linux VPS Hosting", href: "/vps" },
      { name: "Server Series", href: "/series" },
      { name: "Affordable Hosting", href: "/hosting" },
      { name: "Premium Gold Series", href: "/hosting#gold-series" },
      { name: "Enterprise Titan Series", href: "/hosting#titan-series" },
    ],
  },
  support: {
    title: "Support & Help",
    links: [
      { name: "Knowledge Base", href: "/knowledge-base" },
      { name: "Live Chat Support", href: "/live-chat" },
      { name: "Support Tickets", href: "/support/tickets" },
      { name: "Server Status", href: "/status" },
      { name: "API Documentation", href: "/docs/api" },
      { name: "Proxy Setup Tool", href: "/tools/proxy-setup" },
      { name: "Proxy IP Checker", href: "/tools/proxy-checker" },
    ],
  },
  company: {
    title: "Company",
    links: [
      { name: "About OceanLinux", href: "/about" },
      { name: "Contact Us", href: "/contact-us" },
    ],
  },
}

const trustBadges = [
  { icon: Lock, label: "SSL Secured" },
  { icon: Shield, label: "DDoS Protected" },
  { icon: Activity, label: "24/7 Monitored" },
]

export default function Footer() {
  return (
    <footer className="premium-footer relative overflow-hidden">
      <div className="premium-section-grid opacity-[0.025]" aria-hidden />
      <div className="premium-section-glow premium-section-glow--tl opacity-60" aria-hidden />

      <div className="container mx-auto container-padding relative z-10">
        <div className="section-padding pb-10">
          <div className="grid lg:grid-cols-5 gap-10 lg:gap-12">
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-6 group">
                <img
                  src="/ol.png"
                  className="h-14 w-auto transition-transform duration-200 group-hover:scale-105"
                  alt="OceanLinux"
                />
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">OceanLinux</h2>
                  <p className="text-sm text-white/70 tracking-wide">The Ocean of Linux</p>
                </div>
              </Link>

              <p className="text-white/70 leading-relaxed mb-6 text-sm max-w-sm">
                Affordable premium Linux VPS hosting — transparent pricing, reliable performance,
                and expert support managed by OceanLinux.
              </p>

              <div className="premium-glass-card p-4 mb-6 inline-flex items-center gap-3 max-w-xs">
                <img src="/backtick.png" alt="Backtick Labs" className="w-7 h-7 opacity-90" />
                <div>
                  <p className="text-sm text-white/70">A product of</p>
                  <Link
                    href="https://backticklabs.io"
                    className="text-sm font-semibold text-emerald-300 hover:text-white transition-colors"
                  >
                    Backtick Labs
                  </Link>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <a
                  href="mailto:hello@oceanlinux.com"
                  className="flex items-center gap-2.5 text-white/70 hover:text-emerald-300 transition-colors"
                >
                  <Mail className="w-4 h-4 text-emerald-300" />
                  hello@oceanlinux.com
                </a>
                <div className="flex items-center gap-2.5 text-white/70">
                  <Globe className="w-4 h-4 text-emerald-300" />
                  Managed VPS Service · 99.9% Uptime SLA
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-6">
                {trustBadges.map(({ icon: Icon, label }) => (
                  <span key={label} className="premium-chip gap-1.5">
                    <Icon className="w-3 h-3" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                {Object.entries(footerSections).map(([key, section]) => (
                  <div key={key}>
                    <h3 className="text-sm font-semibold text-white mb-4">
                      {section.title}
                    </h3>
                    <ul className="space-y-2.5">
                      {section.links.map((link, index) => {
                        if (link.name === "Email Support") {
                          return (
                            <li key={index}>
                              <EmailSupportDialog />
                            </li>
                          )
                        }
                        return (
                          <li key={index}>
                            <Link
                              href={link.href}
                              className="text-sm text-white/70 hover:text-emerald-300 transition-colors"
                            >
                              {link.name}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06] relative z-10">
        <div className="container mx-auto container-padding">
          <div className="py-5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-white/70 text-center sm:text-left leading-relaxed">
              <p>© 2024 OceanLinux. All rights reserved · Backtick Labs</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {[
                { href: "/privacy-policy", label: "Privacy" },
                { href: "/terms-and-conditions", label: "Terms" },
                { href: "/refund-policy", label: "Refund" },
                { href: "/contact-us", label: "Contact" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-white/70 hover:text-emerald-300 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
