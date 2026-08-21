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
  const { ref, glareRef } = useTilt3D(
    interactive ? maxTilt : 0,
    interactive ? scale : 1,
    interactive ? maxGlare : 0,
    glareTone
  );

  return (
    <div
      ref={interactive ? ref : undefined}
      className={cn("tilt-3d-wrap", float && interactive && "animate-float-3d", className)}
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
            ref={glareRef}
            className="tilt-3d-glare pointer-events-none absolute inset-0 z-20 rounded-[inherit] opacity-0"
          />
        )}
        {children}
      </div>
    </div>
  );
}
