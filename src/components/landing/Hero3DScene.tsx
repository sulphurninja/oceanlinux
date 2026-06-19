"use client";

type Hero3DSceneProps = {
  parallaxX?: number;
  parallaxY?: number;
};

export default function Hero3DScene({ parallaxX = 0, parallaxY = 0 }: Hero3DSceneProps) {
  const px = (n: number) => ({ transform: `translate3d(${parallaxX * n}px, ${parallaxY * n}px, 0)` });

  return (
    <div className="hero-3d-scene pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Perspective grid floor */}
      <div className="hero-3d-floor hidden sm:block" style={px(0.3)} />

      {/* Floating 3D shapes */}
      <div className="hero-3d-shape hero-3d-cube hero-3d-cube-1 hidden md:block" style={px(1.2)}>
        <div className="hero-3d-cube-face hero-3d-cube-front" />
        <div className="hero-3d-cube-face hero-3d-cube-back" />
        <div className="hero-3d-cube-face hero-3d-cube-right" />
        <div className="hero-3d-cube-face hero-3d-cube-left" />
        <div className="hero-3d-cube-face hero-3d-cube-top" />
        <div className="hero-3d-cube-face hero-3d-cube-bottom" />
      </div>

      <div className="hero-3d-shape hero-3d-ring hero-3d-ring-1" style={px(-0.8)} />
      <div className="hero-3d-shape hero-3d-ring hero-3d-ring-2" style={px(0.6)} />

      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-1" style={px(1.5)} />
      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-2" style={px(-1)} />
      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-3" style={px(0.4)} />

      {/* Depth particles */}
      <div className="hero-3d-particles">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="hero-3d-particle"
            style={{
              left: `${8 + (i * 7.5) % 84}%`,
              top: `${12 + (i * 11) % 76}%`,
              animationDelay: `${i * 0.35}s`,
              transform: `translate3d(${parallaxX * (0.2 + (i % 3) * 0.15)}px, ${parallaxY * (0.2 + (i % 3) * 0.15)}px, 0)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
