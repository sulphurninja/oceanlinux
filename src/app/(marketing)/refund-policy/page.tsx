import {
  RefreshCw,
  Clock,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CreditCard,
  Calendar,
  FileText,
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

export default function RefundPolicy() {
  return (
    <>
      <PublicPageHero
        eyebrow="Legal"
        title="Refund Policy"
        titleAccent="Fair & Transparent Process"
        description="Clear terms for refunds on our Linux hosting services. Hassle-free process when you qualify under the conditions outlined below."
        badge={
          <span className="premium-chip inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Fair Refunds · Clear Terms
          </span>
        }
      >
        <div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Defined Window</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Fair Process</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Quick Processing</span>
          </div>
        </div>
      </PublicPageHero>

      <section className="premium-page-section">
        <div className="container mx-auto container-padding max-w-4xl space-y-6">
          <PremiumLegalSection
            icon={Clock}
            title="1. Refund Guarantee Window"
            description="We offer a refund window for new customers who meet the eligibility criteria below."
          >
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              {[
                { icon: Calendar, title: "7-Day Window", desc: "Refund requests within 7 days of purchase" },
                { icon: Zap, title: "Quick Process", desc: "Processed within 5–7 business days" },
                { icon: CreditCard, title: "Original Method", desc: "Refunded to your payment method" },
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
              If you&apos;re not satisfied within the first 7 days for a valid qualifying reason, we&apos;ll
              process your refund according to this policy.
            </PremiumCallout>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={CheckCircle}
            title="2. Refund Eligibility & Qualifying Reasons"
            description="Qualifying conditions and valid reasons for refund requests:"
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Valid Refund Reasons">
                <PremiumLegalList
                  items={[
                    "Service not delivered within promised timeframe",
                    "Technical issues unresolvable by our support",
                    "Service specifications don't match purchased plan",
                    "Server hardware failures affecting performance",
                    "Network connectivity issues on our end",
                    "Billing errors or duplicate charges",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Eligibility Requirements">
                <PremiumLegalList
                  items={[
                    "Request must be within 7 days of purchase",
                    "Service must not have been extensively used",
                    "Valid reason as outlined above",
                    "Request submitted through official channels",
                    "Account must be in good standing",
                    "No violations of Terms of Service",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={XCircle}
            title="3. Non-Refundable Circumstances"
            description="Certain situations do not qualify for refunds:"
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Non-Refundable Situations">
                <ul className="space-y-2 text-sm text-white/50">
                  {[
                    "Change of mind or buyer's remorse",
                    "Accidental purchases due to user error",
                    "Requests made after the 7-day period",
                    "Services extensively used or modified",
                    "Violation of Terms of Service",
                    "Data loss due to user error",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </PremiumLegalBox>
              <PremiumLegalBox title="Partial Refund Cases">
                <PremiumLegalList
                  items={[
                    "Annual plans with justified early cancellation",
                    "Downgrade requests within 7 days",
                    "Pro-rated refunds for billing errors",
                    "Credit adjustments for service outages",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
            <div className="mt-4">
              <PremiumCallout variant="warning" title="Fair Usage Policy">
                Abuse of this policy, such as repeated refund requests or fraudulent claims, may result in
                account restrictions.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={FileText}
            title="4. How to Request a Refund"
            description="Simple process to request your refund within the qualifying window:"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { step: "1", title: "Contact Support", desc: "Email us within 7 days" },
                { step: "2", title: "Provide Details", desc: "Order number and reason" },
                { step: "3", title: "Review Process", desc: "24–48 hours review" },
                { step: "4", title: "Refund Issued", desc: "5–7 business days" },
              ].map((item) => (
                <div key={item.step} className="premium-inner-card p-4 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2 text-sm font-bold">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-white text-xs mb-1">{item.title}</h3>
                  <p className="text-[11px] text-white/40">{item.desc}</p>
                </div>
              ))}
            </div>
            <PremiumLegalGrid>
              <PremiumLegalBox title="Required Information">
                <PremiumLegalList
                  items={[
                    "Order number or transaction ID",
                    "Email address used for purchase",
                    "Detailed reason for refund request",
                    "Screenshots if reporting technical issues",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Processing Timeline">
                <ul className="space-y-1.5">
                  <li><strong className="text-white/70">Review:</strong> 24–48 hours</li>
                  <li><strong className="text-white/70">Approval:</strong> Email confirmation sent</li>
                  <li><strong className="text-white/70">Processing:</strong> 5–7 business days</li>
                  <li><strong className="text-white/70">Bank:</strong> Additional 2–3 days possible</li>
                </ul>
              </PremiumLegalBox>
            </PremiumLegalGrid>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={AlertTriangle}
            title="5. Cancellation Policy"
            description="How cancellations work and what happens to your data:"
          >
            <PremiumLegalGrid>
              <PremiumLegalBox title="Cancellation Rules">
                <PremiumLegalList
                  items={[
                    "Cancel anytime through your dashboard",
                    "No refunds for time already used (after 7 days)",
                    "Service continues until end of billing period",
                    "Auto-renewal stops immediately upon cancellation",
                  ]}
                />
              </PremiumLegalBox>
              <PremiumLegalBox title="Data Handling">
                <PremiumLegalList
                  items={[
                    "7-day grace period for data backup",
                    "Download your data before expiration",
                    "Server wiped clean after grace period",
                    "No data recovery after final deletion",
                  ]}
                />
              </PremiumLegalBox>
            </PremiumLegalGrid>
            <div className="mt-4">
              <PremiumCallout variant="danger" title="Important Notice">
                Always backup your data before cancelling. Once the grace period expires, all data is
                permanently deleted and cannot be recovered.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalSection
            icon={Shield}
            title="6. Chargeback & Dispute Policy"
            description="Please contact us before initiating chargebacks. We're here to resolve issues fairly."
          >
            <div className="space-y-4">
              <PremiumCallout variant="info" title="Before Filing a Chargeback">
                Contact our support team first. Most issues can be resolved quickly through direct communication.
              </PremiumCallout>
              <PremiumCallout variant="warning" title="Chargeback Consequences">
                Unauthorized chargebacks without prior communication may lead to immediate account suspension.
              </PremiumCallout>
              <PremiumCallout variant="success" title="Legitimate Disputes">
                Contact us immediately with any billing concerns, and we&apos;ll work together to find a fair resolution.
              </PremiumCallout>
            </div>
          </PremiumLegalSection>

          <PremiumLegalCta
            title="Need to Request a Refund?"
            description="Our support team is here to help. For urgent refund requests, mention 'URGENT REFUND' in your subject line."
          />

          <PremiumLegalFooter />
        </div>
      </section>
    </>
  );
}
