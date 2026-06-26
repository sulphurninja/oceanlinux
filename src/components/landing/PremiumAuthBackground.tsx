"use client";

import Hero3DScene from "@/components/landing/Hero3DScene";

type PremiumAuthBackgroundProps = {
  parallaxX?: number;
  parallaxY?: number;
};

export default function PremiumAuthBackground({
  parallaxX = 0,
  parallaxY = 0,
}: PremiumAuthBackgroundProps) {
  const px = (n: number) => ({
    transform: `translate3d(${parallaxX * n}px, ${parallaxY * n}px, 0)`,
  });

  return (
    <div className="premium-auth-bg-fx absolute inset-0 z-[1] pointer-events-none overflow-hidden" aria-hidden>
      <Hero3DScene parallaxX={parallaxX} parallaxY={parallaxY} />

      {/* Animated grid overlay */}
      <div className="absolute inset-0 opacity-[0.1] premium-auth-grid-layer">
        <div
          className="absolute inset-[-8%] bg-[url('/grid-pattern.svg')] bg-center bg-[length:64px_64px] premium-auth-grid-drift"
          style={px(0.12)}
        />
      </div>

      {/* Emerald glow pools */}
      <div
        className="absolute -top-20 -left-20 w-64 h-64 sm:w-80 sm:h-80 bg-emerald-400/25 rounded-full blur-3xl animate-hero-glow"
        style={px(1.6)}
      />
      <div
        className="absolute top-1/4 -right-24 w-72 h-72 sm:w-96 sm:h-96 bg-emerald-500/15 rounded-full blur-3xl animate-hero-glow [animation-delay:1.5s]"
        style={px(-1.1)}
      />
      <div
        className="absolute bottom-0 left-1/4 w-72 h-72 -translate-x-1/2 translate-y-1/3 bg-teal-400/12 rounded-full blur-3xl animate-pulse"
        style={px(0.7)}
      />

      {/* Soft vignette — keeps form readable without hiding 3D motion */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_85%_at_50%_42%,transparent_0%,hsl(160_32%_6%/0.28)_100%)]" />
    </div>
  );
}
