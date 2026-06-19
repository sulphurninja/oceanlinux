import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PublicPageHeroProps = {
  eyebrow?: string;
  title: string;
  titleAccent?: string;
  description: string;
  badge?: ReactNode;
  align?: "center" | "left";
  className?: string;
  children?: ReactNode;
};

export default function PublicPageHero({
  eyebrow,
  title,
  titleAccent,
  description,
  badge,
  align = "center",
  className,
  children,
}: PublicPageHeroProps) {
  const centered = align === "center";

  return (
    <section className={cn("hero-premium-bg section-padding relative overflow-hidden min-w-0 w-full", className)}>
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none bg-[url('/grid-pattern.svg')] bg-center" aria-hidden />
      <div className="container mx-auto container-padding relative z-10 min-w-0">
        <div className={cn("max-w-4xl min-w-0 w-full animate-fade-in", centered ? "mx-auto text-center" : "text-left")}>
          {badge && <div className={cn("mb-6", centered && "flex justify-center")}>{badge}</div>}
          {eyebrow && <p className="hero-premium-eyebrow">{eyebrow}</p>}
          <h1 className="hero-premium-headline mb-4">
            <span className={cn("hero-premium-line-light", !centered && "block")}>{title}</span>
            {titleAccent && (
              <span className="hero-premium-line-accent">
                <em>{titleAccent}</em>
              </span>
            )}
          </h1>
          <div className={cn("hero-premium-divider mb-5", centered && "mx-auto")} aria-hidden>
            <span>◆</span>
          </div>
          <p className={cn("hero-premium-lead", centered && "mx-auto")}>{description}</p>
          {children && <div className="mt-6 sm:mt-8 w-full min-w-0">{children}</div>}
        </div>
      </div>
    </section>
  );
}
