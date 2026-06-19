"use client";

import Link from "next/link";
import { Zap, Clock, Star, Shield } from "lucide-react";
import Tilt3DCard from "@/components/landing/Tilt3DCard";
import PremiumSection from "@/components/landing/PremiumSection";

export default function CTA() {
  return (
    <PremiumSection className="hero-premium-bg border-t-0">
      <div className="text-center max-w-3xl mx-auto">
        <p className="premium-section-eyebrow mb-4">Get Started</p>
        <h2 className="premium-section-title mb-5">
          Ready to Launch Your
          <br />
          <span className="premium-accent">Linux VPS?</span>
        </h2>
        <div className="premium-section-divider mx-auto mb-6" aria-hidden>
          <span>◆</span>
        </div>
        <p className="premium-section-desc mx-auto mb-10">
          Join thousands of developers and businesses on OceanLinux. Premium VPS from trusted providers,
          fully managed and supported by our team.
        </p>

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-10 text-sm text-white/50">
          {[
            { icon: Zap, text: "Instant setup" },
            { icon: Shield, text: "Enterprise security" },
            { icon: Clock, text: "No hidden costs" },
          ].map(({ icon: Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-2">
              <Icon className="w-4 h-4 text-emerald-400" />
              {text}
            </span>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-14">
          <Link href="/get-started">
            <button type="button" className="premium-btn-primary px-10 w-full sm:w-auto">
              Get Started
            </button>
          </Link>
          <Link href="/pricing">
            <button type="button" className="premium-btn-outline px-10 w-full sm:w-auto">
              View All Plans
            </button>
          </Link>
        </div>

        <Tilt3DCard maxTilt={4} scale={1.005} innerClassName="premium-glass-card p-7 sm:p-8 mb-10">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/35 mb-5">
            Included with every plan
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { value: "40%", label: "Lower Costs" },
              { value: "Free", label: "SSL Certificate" },
              { value: "Root", label: "Full Access" },
              { value: "24/7", label: "Expert Support" },
            ].map((item) => (
              <div key={item.label} className="text-center py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="premium-stat-value text-xl sm:text-2xl">{item.value}</div>
                <div className="text-[10px] text-white/35 mt-1 uppercase tracking-wider">{item.label}</div>
              </div>
            ))}
          </div>
        </Tilt3DCard>

        <div className="flex flex-wrap justify-center items-center gap-6 text-xs text-white/35">
          <span className="inline-flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-emerald-400" />
            4.9/5 Rating
          </span>
          <span>Enterprise Security</span>
          <span>99.9% Uptime SLA</span>
          <span>Managed VPS Service</span>
        </div>
      </div>
    </PremiumSection>
  );
}
