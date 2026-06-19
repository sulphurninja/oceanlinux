import { Button } from "@/components/ui/button";
import { InstagramLogoIcon } from "@radix-ui/react-icons";
import {
  Mail,
  MessageSquare,
  Shield,
  Handshake,
  Linkedin,
  IndianRupee,
  Zap,
  HeartHandshake,
  Clock,
} from "lucide-react";
import Link from "next/link";
import PublicPageHero from "@/components/landing/PublicPageHero";
import PremiumSectionHeader from "@/components/landing/PremiumSectionHeader";
import PremiumFeatureCard from "@/components/landing/PremiumFeatureCard";
import Tilt3DCard from "@/components/landing/Tilt3DCard";

const contactMethods = [
  {
    icon: MessageSquare,
    title: "Live Chat Support",
    description: "Get instant help from our technical experts. Available 24/7 for all your hosting needs.",
    badge: "Online Now · Under 5 min response",
    href: "/live-chat",
    cta: "Start Chat",
    primary: true,
  },
  {
    icon: Mail,
    title: "Email Support",
    description: "Send us detailed queries and we'll get back to you with comprehensive solutions.",
    badge: "Professional & Detailed",
    href: "mailto:hello@oceanlinux.com",
    cta: "hello@oceanlinux.com",
    primary: false,
  },
  {
    icon: Handshake,
    title: "Business & Partnerships",
    description: "Explore partnership opportunities, bulk orders, or enterprise solutions.",
    badge: "Enterprise Solutions",
    href: "mailto:hello@oceanlinux.com?subject=Business Inquiry",
    cta: "Contact Business Team",
    primary: false,
  },
];

export default function ContactUs() {
  return (
    <>
      <PublicPageHero
        eyebrow="Support"
        title="Get in Touch with"
        titleAccent="Our Expert Team"
        description="Need help with your Linux hosting? Have questions about our VPS solutions? Our expert team is ready to assist you 24/7."
        badge={
          <span className="premium-chip inline-flex items-center gap-2">
            <HeartHandshake className="w-4 h-4" />
            24/7 Support · Always Here for You
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4 mb-8 max-w-2xl mx-auto w-full min-w-0">
          {[
            { value: "24/7", label: "Support Available" },
            { value: "<5min", label: "Response Time" },
            { value: "5000+", label: "Happy Customers" },
            { value: "4.9/5", label: "Support Rating" },
          ].map((stat) => (
            <div key={stat.label} className="premium-stat-card py-4">
              <div className="premium-stat-value text-xl">{stat.value}</div>
              <div className="text-xs text-white/45 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/live-chat">
            <Button className="premium-btn-primary w-full sm:w-auto px-8 h-12">
              <MessageSquare className="w-4 h-4 mr-2" />
              Start Live Chat
            </Button>
          </Link>
          <Link href="mailto:hello@oceanlinux.com">
            <Button variant="outline" className="premium-btn-outline w-full sm:w-auto px-8 h-12">
              <Mail className="w-4 h-4 mr-2" />
              Send Email
            </Button>
          </Link>
        </div>
      </PublicPageHero>

      <section className="premium-page-section">
        <div className="container mx-auto container-padding">
          <PremiumSectionHeader
            eyebrow="Contact"
            title="Choose Your Preferred"
            titleAccent="Way to Connect"
            description="Multiple ways to get in touch — pick what works best for you."
          />

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {contactMethods.map((method) => (
              <Tilt3DCard
                key={method.title}
                maxTilt={5}
                scale={1.02}
                innerClassName="premium-glass-card h-full p-7 text-center flex flex-col"
              >
                <div className="premium-icon-box w-14 h-14 mx-auto mb-5">
                  <method.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{method.title}</h3>
                <p className="text-sm text-white/50 mb-4 flex-1">{method.description}</p>
                <div className="flex items-center justify-center gap-2 mb-5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-emerald-400/80">{method.badge}</span>
                </div>
                <Link href={method.href}>
                  <Button className={method.primary ? "premium-btn-primary w-full h-11" : "premium-btn-outline w-full h-11"}>
                    {method.cta}
                  </Button>
                </Link>
              </Tilt3DCard>
            ))}
          </div>
        </div>
      </section>

      <section className="premium-page-section premium-page-section--alt">
        <div className="container mx-auto container-padding max-w-4xl">
          <PremiumSectionHeader
            eyebrow="Payments"
            title="Secure & Trusted"
            titleAccent="Payments"
            description="Your payments are safe with our enterprise-grade security."
          />
          <div className="grid md:grid-cols-2 gap-6">
            <PremiumFeatureCard
              icon={<Shield className="w-5 h-5" />}
              title="Multiple Secure Payment Options"
              description="All transactions are processed through Razorpay, Cashfree, and UPI Gateway with bank-grade encryption."
            />
            <PremiumFeatureCard
              icon={<IndianRupee className="w-5 h-5" />}
              title="Flexible Payment Methods"
              description="Credit/Debit Cards, Net Banking, UPI, and Digital Wallets. Instant payment processing."
            />
          </div>
        </div>
      </section>

      <section className="premium-page-section">
        <div className="container mx-auto container-padding max-w-3xl">
          <PremiumSectionHeader
            eyebrow="Community"
            title="Join Our"
            titleAccent="Community"
            description="Stay connected and get updates on the latest features, tips, and discussions."
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              href="https://instagram.com/oceanlinux"
              target="_blank"
              rel="noopener noreferrer"
              className="premium-inner-card p-5 flex items-center gap-4 hover:border-emerald-400/20 transition-colors"
            >
              <div className="premium-icon-box w-11 h-11 shrink-0">
                <InstagramLogoIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Follow on Instagram</h3>
                <p className="text-xs text-white/45">@OceanLinux</p>
              </div>
            </Link>
            <Link
              href="https://www.linkedin.com/company/oceanlinux"
              target="_blank"
              rel="noopener noreferrer"
              className="premium-inner-card p-5 flex items-center gap-4 hover:border-emerald-400/20 transition-colors"
            >
              <div className="premium-icon-box w-11 h-11 shrink-0">
                <Linkedin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Connect on LinkedIn</h3>
                <p className="text-xs text-white/45">Ocean Linux</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="premium-page-section premium-page-section--alt">
        <div className="container mx-auto container-padding">
          <div className="premium-cta-box max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-3">Still Have Questions?</h2>
            <p className="text-white/50 mb-6 text-sm">
              Check our knowledge base or reach out directly for personalized assistance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/knowledge-base">
                <Button variant="outline" className="premium-btn-outline w-full sm:w-auto px-8 h-11">
                  Knowledge Base
                </Button>
              </Link>
              <Link href="/live-chat">
                <Button className="premium-btn-primary w-full sm:w-auto px-8 h-11">
                  <Zap className="w-4 h-4 mr-2" />
                  Get Instant Help
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
