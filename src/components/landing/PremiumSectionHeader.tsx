"use client";

import { cn } from "@/lib/utils";

type PremiumSectionHeaderProps = {
  eyebrow: string;
  title: string;
  titleAccent?: string;
  description: string;
  align?: "center" | "left";
  className?: string;
};

export default function PremiumSectionHeader({
  eyebrow,
  title,
  titleAccent,
  description,
  align = "center",
  className,
}: PremiumSectionHeaderProps) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        "mb-10 sm:mb-14 lg:mb-20",
        centered ? "text-center mx-auto max-w-3xl" : "text-left max-w-2xl",
        className
      )}
    >
      <p className="premium-section-eyebrow mb-4">{eyebrow}</p>
      <h2 className="premium-section-title mb-5">
        {title}
        {titleAccent && (
          <>
            <br className="hidden sm:block" />
            <span className="premium-accent"> {titleAccent}</span>
          </>
        )}
      </h2>
      <div
        className={cn("premium-section-divider mb-6", centered && "mx-auto")}
        aria-hidden
      >
        <span>◆</span>
      </div>
      <p className={cn("premium-section-desc", centered && "mx-auto")}>{description}</p>
    </div>
  );
}
