import {
  FileText,
  Users,
  Shield,
  CreditCard,
  Server,
  AlertTriangle,
  CheckCircle,
  Scale,
  Clock,
  Ban,
  Zap,
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

export default function TermsConditions() {
  return (
    <>
      <PublicPageHero
        eyebrow="Legal"
        title="Terms & Conditions"
        titleAccent="Clear Rules, Fair Service"
        description="By using OceanLinux's Linux hosting services, you agree to these terms. We've made them clear and straightforward — because transparency matters."
        badge={
          <span className="premium-chip inline-flex items-center gap-2">
            <Scale className="w-4 h-4" />
            Legal Framework · Fair Usage
          </span>
        }
      >
        <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Fair Terms</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">User Protection</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Clear Guidelines</span>
          </div>
        </div>
      </PublicPageHero>

      <section className="premium-page-section">
        <div className="container mx-auto container-padding max-w-4xl space-y-6">
          <PremiumLegalSection
            icon={Users}
            title="1. Account Registration & Eligibility"
            description="To access our Linux hosting services, you must create an account with accurate information."
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Registration Requirements">
                <PremiumLegalList
                  items={[
                    "Provide accurate and complete information",
                    "Must be 18+ years old or have guardian consent",
                    "Valid email address for account verification",
                    "Keep account credentials secure",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Account Responsibility">
                <ul className="space-y-2 text-sm text-white/50">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    You&apos;re responsible for all account activity
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    Notify us immediately of unauthorized access
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    One account per person or organization
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    Update information when it changes
                  </li>
                </ul>
              </PremiumLegalBox>
            </PremiumLegalGrid>
            <div className="mt-4">
              <PremiumCallout variant="danger" title="Account Termination">
                Accounts with fraudulent information or involved in illegal activities will be terminated
                immediately without prior notice.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Server}
            title="2. Acceptable Service Usage"
            description="Our Linux hosting services are designed for legitimate business and personal use."
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Allowed Uses">
                <PremiumLegalList
                  items={[
                    "Web hosting and applications",
                    "Development and testing environments",
                    "Database hosting and file storage",
                    "API, microservices, and e-commerce platforms",
                    "Educational and research projects",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Prohibited Uses">
                <ul className="space-y-2 text-sm text-white/50">
                  {[
                    "Illegal activities or content",
                    "Hacking, phishing, or malware",
                    "Spam or unsolicited emails",
                    "Copyright infringement",
                    "Cryptocurrency mining",
                    "Resource-intensive attacks",
                    "Proxy or VPN services (unless approved)",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Ban className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </PremiumLegalBox>
            </PremiumLegalGrid>
            <div className="mt-4">
              <PremiumCallout variant="warning" title="Fair Usage Policy">
                While we offer generous resources, excessive usage that affects other users may result in
                account review and potential limitations.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={CreditCard}
            title="3. Payments, Billing & Refunds"
            description="Clear payment terms for our Linux hosting services:"
          >
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              {[
                { icon: Clock, title: "Payment Schedule", desc: "All payments must be made in advance" },
                { icon: Shield, title: "Secure Processing", desc: "Multiple secure payment gateways" },
                { icon: Zap, title: "Instant Activation", desc: "Services activated upon payment" },
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
            <PremiumLegalGrid>
              <PremiumLegalBox title="Payment Methods">
                <ul className="space-y-1.5">
                  <li>Razorpay — Cards, Net Banking, UPI</li>
                  <li>Cashfree — All major Indian payment methods</li>
                  <li>UPI Gateway — UPI and digital wallets</li>
                </ul>
              </PremiumLegalBox>
              <PremiumLegalBox title="Billing & Renewals">
                <PremiumLegalList
                  items={[
                    "Monthly and annual billing cycles available",
                    "Auto-renewal can be enabled or disabled",
                    "No grace period for renewals",
                    "Notifications sent before expiry",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
            <div className="mt-4">
              <PremiumCallout variant="info" title="Refund Policy">
                See our dedicated{" "}
                <a href="/refund-policy" className="text-emerald-400 hover:text-emerald-300 underline">
                  Refund Policy
                </a>{" "}
                for eligibility, process, and timelines.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Server}
            title="4. Service Availability & Support"
            description="Our commitment to reliable Linux hosting:"
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Service Level Agreement">
                <PremiumLegalList
                  items={[
                    "99.9% uptime guarantee",
                    "24/7 monitoring and support",
                    "Regular maintenance windows",
                    "Automated backups included",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Support Services">
                <PremiumLegalList
                  items={[
                    "Technical support via email and chat",
                    "Knowledge base and documentation",
                    "Server management assistance",
                    "Migration support for new customers",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Ban}
            title="5. Account Suspension & Termination"
            description="Circumstances under which services may be suspended or terminated:"
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Suspension Reasons">
                <PremiumLegalList
                  items={[
                    "Non-payment of invoices",
                    "Violation of acceptable use policy",
                    "Excessive resource usage",
                    "Suspected fraudulent activity",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Termination Reasons">
                <PremiumLegalList
                  items={[
                    "Repeated violations of terms",
                    "Illegal activities or content",
                    "Extended non-payment (30+ days)",
                    "Security threats to infrastructure",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
            <div className="mt-4">
              <PremiumCallout variant="info" title="Fair Process">
                We&apos;ll attempt to notify you before suspension when possible. Data backup grace period of
                7 days after termination for most cases.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Scale}
            title="6. Limitation of Liability"
            description="Understanding responsibilities and limitations:"
          >
            <div className="space-y-4">
              <PremiumLegalBox title="Service Disclaimer">
                While we strive for 99.9% uptime, we cannot guarantee uninterrupted service. We are not liable
                for indirect damages, data loss, or business interruption beyond our service credits.
              </PremiumLegalBox>
              <PremiumLegalBox title="Data Responsibility">
                You are responsible for maintaining backups of your data. While we provide backup services, you
                should maintain independent backups of critical data.
              </PremiumLegalBox>
              <PremiumLegalBox title="Maximum Liability">
                Our maximum liability is limited to the amount paid for services in the affected billing period,
                typically provided as service credits or refunds.
              </PremiumLegalBox>
            </div>
          </PremiumLegalSection>

          <PremiumLegalCta
            title="Questions About These Terms?"
            description="If you need clarification on any policies or want to discuss your specific use case, contact us."
          />

          <PremiumLegalFooter />
        </div>
      </section>
    </>
  );
}
