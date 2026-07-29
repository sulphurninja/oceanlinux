"use client";

import { cn } from "@/lib/utils";

type OceanFlyingBirdProps = {
  size?: number;
  wingPhase?: number;
  /** CSS-driven wing beat — avoids React re-renders during flight. */
  autoFlap?: boolean;
  className?: string;
};

/**
 * Emerald seabird in side profile — animated wing beat via wingPhase or CSS autoFlap.
 */
export default function OceanFlyingBird({
  size = 64,
  wingPhase = 0,
  autoFlap = false,
  className,
}: OceanFlyingBirdProps) {
  const beat = Math.sin(wingPhase * Math.PI * 2);
  const wingRotate = -8 + beat * 38;
  const wingLift = beat * 3;
  const tailRotate = 4 + beat * 5;

  return (
    <svg
      viewBox="0 0 140 88"
      width={size}
      height={size * 0.63}
      className={cn(
        "ocean-flying-bird-svg",
        autoFlap && "ocean-flying-bird-svg--auto-flap",
        className
      )}
      aria-hidden
    >
      {!autoFlap && (
        <defs>
          <linearGradient id="olBirdBodyGrad" x1="10%" y1="10%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="35%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#065f46" />
          </linearGradient>
          <linearGradient id="olBirdWingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="55%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>
          <linearGradient id="olBirdHeadGrad" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#bbf7d0" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
          <filter id="olBirdDrop" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.8" floodColor="#022c22" floodOpacity="0.4" />
          </filter>
        </defs>
      )}

      {autoFlap && (
        <defs>
          <linearGradient id="olBirdBodyGradLite" x1="10%" y1="10%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="35%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#065f46" />
          </linearGradient>
          <linearGradient id="olBirdWingGradLite" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="55%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>
          <linearGradient id="olBirdHeadGradLite" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#bbf7d0" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>
      )}

      <g filter={autoFlap ? undefined : "url(#olBirdDrop)"}>
        <g
          className={autoFlap ? "ocean-bird-tail" : undefined}
          transform={autoFlap ? undefined : `rotate(${tailRotate} 26 48)`}
        >
          <path d="M12 46 C4 42 2 48 8 52 C12 54 18 52 22 48 Z" fill="#15803d" />
          <path d="M16 48 C8 46 8 52 14 53" fill="#166534" opacity="0.8" />
          <path d="M20 46 L8 44" stroke="#064e3b" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
        </g>

        <path
          d="M28 48 C34 34 68 30 92 36 C88 52 58 58 34 52 C28 50 26 49 28 48 Z"
          fill={autoFlap ? "url(#olBirdBodyGradLite)" : "url(#olBirdBodyGrad)"}
        />
        <ellipse cx="58" cy="46" rx="22" ry="11" fill="#16a34a" opacity="0.25" />

        <g
          className={autoFlap ? "ocean-bird-wing" : undefined}
          transform={
            autoFlap ? undefined : `translate(0 ${wingLift}) rotate(${wingRotate} 54 40)`
          }
        >
          <path
            d="M54 40 C68 14 104 8 128 20 C118 26 96 32 72 38 C60 42 54 42 54 40 Z"
            fill={autoFlap ? "url(#olBirdWingGradLite)" : "url(#olBirdWingGrad)"}
          />
          <path
            d="M64 28 L98 18 M68 34 L108 26 M72 40 L118 34 M76 44 L124 40"
            fill="none"
            stroke="#14532d"
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.45"
          />
          <path
            d="M58 38 C72 24 100 20 120 26 L72 42 Z"
            fill="#064e3b"
            opacity="0.2"
          />
        </g>

        <path
          d="M88 36 C94 28 102 26 108 30 C106 38 96 42 88 40 Z"
          fill={autoFlap ? "url(#olBirdHeadGradLite)" : "url(#olBirdHeadGrad)"}
        />
        <ellipse cx="104" cy="32" rx="9" ry="8.5" fill={autoFlap ? "url(#olBirdHeadGradLite)" : "url(#olBirdHeadGrad)"} />

        <path d="M112 32 L132 30 L112 37 Z" fill="#047857" />
        <path d="M112 32 L132 30" stroke="#065f46" strokeWidth="0.8" opacity="0.6" />

        <circle cx="106" cy="29.5" r="2.4" fill="#ecfdf5" />
        <circle cx="106.8" cy="29.5" r="1.1" fill="#052e16" />

        <ellipse cx="72" cy="44" rx="10" ry="6" fill="#86efac" opacity="0.22" />
      </g>
    </svg>
  );
}
