"use client";

import { cn } from "@/lib/utils";

export default function Hero3DScene() {
  return (
    <div className="hero-3d-scene pointer-events-none absolute inset-0 overflow-hidden hidden lg:block" aria-hidden>
      <div className="hero-3d-floor hidden sm:block" />

      <div className="hero-3d-shape hero-3d-cube hero-3d-cube-1 hidden md:block">
        <div className="hero-3d-cube-face hero-3d-cube-front" />
        <div className="hero-3d-cube-face hero-3d-cube-back" />
        <div className="hero-3d-cube-face hero-3d-cube-right" />
        <div className="hero-3d-cube-face hero-3d-cube-left" />
        <div className="hero-3d-cube-face hero-3d-cube-top" />
        <div className="hero-3d-cube-face hero-3d-cube-bottom" />
      </div>

      <div className="hero-3d-shape hero-3d-ring hero-3d-ring-1" />
      <div className="hero-3d-shape hero-3d-ring hero-3d-ring-2" />

      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-1" />
      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-2" />
      <div className="hero-3d-shape hero-3d-orb hero-3d-orb-3" />

      <div className="hero-3d-particles">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="hero-3d-particle"
            style={{
              left: `${8 + (i * 11) % 84}%`,
              top: `${12 + (i * 13) % 76}%`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
