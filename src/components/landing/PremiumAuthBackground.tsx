"use client";

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
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Animated grid */}
      <div className="absolute inset-0 opacity-[0.09] premium-auth-grid-layer">
        <div
          className="absolute inset-[-8%] bg-[url('/grid-pattern.svg')] bg-center bg-[length:64px_64px] premium-auth-grid-drift"
          style={px(0.12)}
        />
      </div>

      {/* Emerald glow pools — same language as homepage hero */}
      <div
        className="absolute -top-20 -left-20 w-64 h-64 sm:w-80 sm:h-80 bg-emerald-400/25 rounded-full blur-3xl animate-hero-glow"
        style={px(1.6)}
      />
      <div
        className="absolute top-1/4 -right-24 w-72 h-72 sm:w-96 sm:h-96 bg-emerald-500/15 rounded-full blur-3xl animate-hero-glow [animation-delay:1.5s]"
        style={px(-1.1)}
      />
      <div
        className="absolute -bottom-16 left-1/4 w-56 h-56 bg-teal-400/12 rounded-full blur-3xl animate-pulse"
        style={px(0.7)}
      />

      {/* Floating rings & orbs (lighter than full hero) */}
      <div className="hero-3d-shape hero-3d-ring hero-3d-ring-1 opacity-40 scale-75 sm:scale-100" style={px(-0.5)} />
      <div className="hero-3d-shape hero-3d-ring hero-3d-ring-2 opacity-30 scale-75 sm:scale-100 hidden sm:block" style={px(0.4)} />
      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-1 opacity-80" style={px(1.2)} />
      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-2 opacity-70 hidden sm:block" style={px(-0.8)} />
      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-3 opacity-60" style={px(0.5)} />

      {/* Particles */}
      <div className="hero-3d-particles opacity-60">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="hero-3d-particle"
            style={{
              left: `${10 + (i * 11) % 80}%`,
              top: `${15 + (i * 13) % 70}%`,
              animationDelay: `${i * 0.4}s`,
              transform: `translate3d(${parallaxX * (0.15 + (i % 3) * 0.1)}px, ${parallaxY * (0.15 + (i % 3) * 0.1)}px, 0)`,
            }}
          />
        ))}
      </div>

      {/* Vignette — keeps form readable */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(160_32%_6%/0.55)_100%)]" />
    </div>
  );
}
