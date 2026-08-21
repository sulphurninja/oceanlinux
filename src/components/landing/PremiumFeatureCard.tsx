"use client";

import { ReactNode } from "react";
import Tilt3DCard from "@/components/landing/Tilt3DCard";
import { cn } from "@/lib/utils";

type PremiumFeatureCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  tag?: string;
  children?: ReactNode;
  className?: string;
};

export default function PremiumFeatureCard({
  icon,
  title,
  description,
  tag,
  children,
  className,
}: PremiumFeatureCardProps) {
  return (
    <Tilt3DCard
      maxTilt={6}
      scale={1.015}
      className={cn("h-full", className)}
      innerClassName="premium-glass-card h-full p-6 sm:p-7"
    >
      <div className="premium-icon-box mb-5">{icon}</div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
        <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">{title}</h3>
        {tag && <span className="premium-tag shrink-0 self-start">{tag}</span>}
      </div>
      <p className="text-sm leading-relaxed text-white/55">{description}</p>
      {children && <div className="mt-5 pt-5 border-t border-white/[0.06]">{children}</div>}
    </Tilt3DCard>
  );
}
