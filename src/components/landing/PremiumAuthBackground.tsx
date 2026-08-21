"use client";

import { useEffect, useState } from "react";
import Hero3DScene from "@/components/landing/Hero3DScene";
import { cn } from "@/lib/utils";

type PremiumAuthBackgroundProps = {
  parallaxX?: number;
  parallaxY?: number;
  /** Lighter backdrop for loading overlays (skips heavy 3D scene). */
  lite?: boolean;
};

export default function PremiumAuthBackground({
  parallaxX = 0,
  parallaxY = 0,
  lite: liteProp,
}: PremiumAuthBackgroundProps) {
  const [autoLite, setAutoLite] = useState(true);
  const lite = liteProp ?? autoLite;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px), (pointer: coarse), (prefers-reduced-motion: reduce)");
    const sync = () => setAutoLite(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const px = (n: number) => ({
    transform: `translate3d(${parallaxX * n}px, ${parallaxY * n}px, 0)`,
  });

  return (
    <div className="premium-auth-bg-fx absolute inset-0 z-[1] pointer-events-none overflow-hidden" aria-hidden>
      {!lite && <Hero3DScene parallaxX={parallaxX} parallaxY={parallaxY} />}

      <div className={cn("absolute inset-0 opacity-[0.1] premium-auth-grid-layer", lite && "opacity-[0.06]")}>
        <div
          className={cn(
            "absolute inset-[-8%] bg-[url('/grid-pattern.svg')] bg-center bg-[length:64px_64px]",
            !lite && "premium-auth-grid-drift"
          )}
          style={px(0.12)}
        />
      </div>

      <div
        className={cn(
          "absolute -top-20 -left-20 w-64 h-64 sm:w-80 sm:h-80 bg-emerald-400/25 rounded-full blur-3xl",
          !lite && "animate-hero-glow"
        )}
        style={px(1.6)}
      />
      <div
        className={cn(
          "absolute top-1/4 -right-24 w-72 h-72 sm:w-96 sm:h-96 bg-emerald-500/15 rounded-full blur-3xl",
          !lite && "animate-hero-glow [animation-delay:1.5s]"
        )}
        style={px(-1.1)}
      />
      {!lite && (
        <div
          className="absolute bottom-0 left-1/4 w-72 h-72 -translate-x-1/2 translate-y-1/3 bg-teal-400/12 rounded-full blur-3xl animate-pulse"
          style={px(0.7)}
        />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_85%_at_50%_42%,transparent_0%,hsl(160_32%_6%/0.28)_100%)]" />
    </div>
  );
}
