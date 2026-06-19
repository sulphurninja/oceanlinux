import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PremiumSectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export default function PremiumSection({
  id,
  children,
  className,
  "aria-label": ariaLabel,
}: PremiumSectionProps) {
  return (
    <section id={id} className={cn("premium-section", className)} aria-label={ariaLabel}>
      <div className="premium-section-grid" aria-hidden />
      <div className="premium-section-glow premium-section-glow--tl" aria-hidden />
      <div className="premium-section-glow premium-section-glow--br" aria-hidden />
      <div className="container mx-auto container-padding relative z-10 min-w-0">{children}</div>
    </section>
  );
}
