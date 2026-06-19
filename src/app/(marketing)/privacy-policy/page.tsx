import {
  Shield,
  Lock,
  Eye,
  Server,
  CreditCard,
  Users,
  FileText,
  Globe,
  Database,
} from "lucide-react";
import PublicPageHero from "@/components/landing/PublicPageHero";
import {
  PremiumLegalSection,
  PremiumCallout,
  PremiumLegalList,
  PremiumLegalGrid,
  PremiumLegalBox,
  PremiumLegalFooter,
  PremiumLegalCta,
} from "@/components/landing/PremiumLegalSection";

export default function PrivacyPolicy() {
  return (
    <>
      <PublicPageHero
        eyebrow="Legal"
        title="Privacy Policy"
        titleAccent="Transparency & Trust"
        description="At OceanLinux, your privacy is critically important to us. This policy explains how we collect, use, and protect your personal information when you use our Linux hosting services."
        badge={
          <span className="premium-chip inline-flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Your Privacy · Our Priority
          </span>
        }
      >
        <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Secure Data</span>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Full Transparency</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">GDPR Compliant</span>
          </div>
        </div>
      </PublicPageHero>

      <section className="premium-page-section">
        <div className="container mx-auto container-padding max-w-4xl space-y-6">
          <PremiumLegalSection
            icon={Database}
            title="1. Information We Collect"
            description="To provide our Linux hosting services, we collect the following information:"
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Personal Information">
                <PremiumLegalList
                  items={[
                    "Name and contact details",
                    "Email address",
                    "Billing information",
                    "Account preferences",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Service Information">
                <PremiumLegalList
                  items={[
                    "Server usage logs",
                    "Performance metrics",
                    "Support interactions",
                    "Security monitoring data",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Server}
            title="2. How We Use Your Information"
            description="Your information helps us deliver the best Linux hosting experience:"
          >
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              {[
                { icon: Users, title: "Account Management", desc: "Create and manage your hosting accounts" },
                { icon: CreditCard, title: "Payment Processing", desc: "Process transactions securely" },
                { icon: Shield, title: "Security Enhancement", desc: "Protect your servers and data" },
              ].map((item) => (
                <div key={item.title} className="premium-stat-card text-center p-5">
                  <div className="premium-icon-box w-10 h-10 mx-auto mb-3">
                    <item.icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-white text-sm mb-1">{item.title}</h3>
                  <p className="text-xs text-white/45">{item.desc}</p>
                </div>
              ))}
            </div>
            <PremiumCallout variant="success" title="Our Commitment">
              We do not sell, rent, or share your personal data with third parties for marketing purposes.
            </PremiumCallout>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={CreditCard}
            title="3. Payment Information & Processing"
            description="We use trusted payment gateways to ensure your financial data is secure:"
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Secure Payment Gateways">
                <ul className="space-y-1.5 list-none">
                  <li><strong className="text-white/70">Razorpay:</strong> PCI DSS compliant processing</li>
                  <li><strong className="text-white/70">Cashfree:</strong> Bank-grade transaction security</li>
                  <li><strong className="text-white/70">UPI Gateway:</strong> Secure UPI and wallet payments</li>
                </ul>
              </PremiumLegalBox>
              <PremiumLegalBox title="Data Protection">
                <PremiumLegalList
                  items={[
                    "Payment data is encrypted and tokenized",
                    "We do not store your full card details",
                    "All transactions are monitored for fraud",
                    "Compliance with RBI guidelines",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
            <div className="mt-4">
              <PremiumCallout variant="info" title="Payment Gateway Privacy">
                When you make payments, our payment gateway partners collect and process payment information
                according to their privacy policies and PCI DSS compliance standards.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Lock}
            title="4. Security Measures"
            description="We implement industry-leading security measures to protect your data:"
          >
            <PremiumLegalGrid>
              <PremiumLegalList
                items={[
                  "Advanced Encryption — SSL/TLS for all data transmission",
                  "Secure Infrastructure — Data centers with physical security controls",
                ]}
              />
              <PremiumLegalList
                items={[
                  "Access Controls — Restricted to authorized personnel only",
                  "Monitoring — 24/7 security monitoring and threat detection",
                ]}
              />
            </PremiumLegalGrid>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Globe}
            title="5. Third-Party Services & Data Sharing"
            description="We work with trusted partners to deliver our services:"
          >
            <PremiumCallout variant="success" title="Limited Data Sharing">
              We only share your data when necessary for service delivery, legal compliance, or with your consent.
            </PremiumCallout>
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <PremiumLegalBox title="Payment Processing">
                Payment gateways process transactions according to their privacy policies and security standards.
              </PremiumLegalBox>
              <PremiumLegalBox title="Infrastructure Partners">
                Cloud and hosting infrastructure providers help us deliver reliable VPS services sourced from trusted upstream providers.
              </PremiumLegalBox>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={FileText}
            title="6. Your Privacy Rights"
            description="You have control over your personal information:"
          >
            <PremiumLegalGrid>
              <PremiumLegalList
                items={[
                  "Access Your Data — Request a copy of your personal information",
                  "Update Information — Correct or update your personal details",
                  "Data Portability — Export your data in a common format",
                ]}
              />
              <PremiumLegalList
                items={[
                  "Delete Data — Request deletion of your personal information",
                  "Restrict Processing — Limit how we use your data",
                  "Communication Preferences — Control marketing communications",
                ]}
              />
            </PremiumLegalGrid>
          </PremiumLegalSection>

          <PremiumLegalCta
            title="Questions About Your Privacy?"
            description="If you have questions about this policy or want to exercise your privacy rights, contact us. We typically respond within 48 hours."
          />

          <PremiumLegalFooter />
        </div>
      </section>
    </>
  );
}
