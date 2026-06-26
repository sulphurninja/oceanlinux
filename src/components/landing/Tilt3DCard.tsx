"use client";

import { cn } from "@/lib/utils";
import { useTilt3D } from "@/hooks/useTilt3D";
import type { ReactNode } from "react";

type GlareTone = "light" | "emerald" | "none";

type Tilt3DCardProps = {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  maxTilt?: number;
  scale?: number;
  float?: boolean;
  glow?: boolean;
  glareTone?: GlareTone;
  maxGlare?: number;
  interactive?: boolean;
};

function buildGlareBackground(
  tone: GlareTone,
  x: number,
  y: number,
  opacity: number
): string {
  if (tone === "none" || opacity <= 0) return "transparent";

  if (tone === "emerald") {
    return `radial-gradient(circle at ${x}% ${y}%, rgba(52,211,153,${opacity}) 0%, rgba(16,185,129,${opacity * 0.35}) 28%, transparent 62%)`;
  }

  return `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,${opacity}), transparent 55%)`;
}

export default function Tilt3DCard({
  children,
  className,
  innerClassName,
  maxTilt = 12,
  scale = 1.03,
  float = false,
  glow = true,
  glareTone = "light",
  maxGlare = 0.22,
  interactive = true,
}: Tilt3DCardProps) {
  const { ref, style, glare } = useTilt3D(
    interactive ? maxTilt : 0,
    interactive ? scale : 1,
    interactive ? maxGlare : 0
  );

  const glareOpacity =
    glareTone === "emerald" ? glare.opacity * 0.85 : glare.opacity;

  return (
    <div
      ref={interactive ? ref : undefined}
      className={cn("tilt-3d-wrap", float && interactive && "animate-float-3d", className)}
      style={interactive ? style : undefined}
    >
      <div
        className={cn(
          "tilt-3d-inner relative overflow-hidden",
          glow && "tilt-3d-glow",
          glareTone === "emerald" && "tilt-3d-glow--emerald",
          innerClassName
        )}
      >
        {glareTone !== "none" && interactive && (
          <div
            className="tilt-3d-glare pointer-events-none absolute inset-0 z-20 rounded-[inherit]"
            style={{
              background: buildGlareBackground(
                glareTone,
                glare.x,
                glare.y,
                glareOpacity
              ),
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}
