import { LucideIcon, CheckCircle } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PremiumLegalSectionProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function PremiumLegalSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: PremiumLegalSectionProps) {
  return (
    <div className={cn("premium-glass-card p-7 sm:p-8", className)}>
      <div className="flex items-start gap-4 mb-6">
        <div className="premium-icon-box w-12 h-12 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white mb-1">{title}</h2>
          {description && <p className="text-sm text-white/50 leading-relaxed">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

type PremiumCalloutProps = {
  title: string;
  children: ReactNode;
  variant?: "info" | "success" | "warning" | "danger";
};

const calloutStyles = {
  info: "border-emerald-400/20 bg-emerald-500/5",
  success: "border-emerald-400/25 bg-emerald-500/8",
  warning: "border-amber-400/20 bg-amber-500/5",
  danger: "border-red-400/20 bg-red-500/5",
};

export function PremiumCallout({ title, children, variant = "info" }: PremiumCalloutProps) {
  return (
    <div className={cn("premium-inner-card p-4 border", calloutStyles[variant])}>
      <p className="font-semibold text-white text-sm mb-1">{title}</p>
      <div className="text-sm text-white/50 leading-relaxed">{children}</div>
    </div>
  );
}

export function PremiumLegalList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="premium-spec-row">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PremiumLegalGrid({ children }: { children: ReactNode }) {
  return <div className="grid md:grid-cols-2 gap-4">{children}</div>;
}

export function PremiumLegalBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="premium-inner-card p-4">
      <h3 className="font-semibold text-white text-sm mb-3">{title}</h3>
      <div className="text-sm text-white/50 space-y-1.5">{children}</div>
    </div>
  );
}

export function PremiumLegalFooter() {
  return (
    <div className="text-center pt-6 border-t border-white/[0.06]">
      <p className="text-sm text-white/40">
        <strong className="text-white/60">Last Updated:</strong>{" "}
        {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>
      <p className="text-sm text-white/35 mt-2">
        We may update this page from time to time. Significant changes will be posted here.
      </p>
    </div>
  );
}

export function PremiumLegalCta({
  title,
  description,
  email = "hello@oceanlinux.com",
}: {
  title: string;
  description: string;
  email?: string;
}) {
  return (
    <div className="premium-cta-box">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">{title}</h2>
      <p className="text-white/50 mb-6 max-w-xl mx-auto text-sm">{description}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a href={`mailto:${email}`} className="premium-btn-primary inline-flex items-center justify-center px-6 h-11 text-sm rounded-xl">
          {email}
        </a>
        <a href="/contact-us" className="premium-btn-outline inline-flex items-center justify-center px-6 h-11 text-sm rounded-xl">
          Contact Support
        </a>
      </div>
    </div>
  );
}
