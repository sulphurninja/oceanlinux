"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import OceanFlyingBird from "@/components/landing/OceanFlyingBird";
import { cn } from "@/lib/utils";
import {
  OCEAN_BIRD_FLY_EVENT,
  OCEAN_CELEBRATION_COMPLETE_EVENT,
  OCEAN_CELEBRATION_COPY,
  type OceanBirdFlyDetail,
  type OceanBirdFlyVariant,
} from "@/lib/oceanBirdFly";

type Point = { x: number; y: number };
type Phase = "announce" | "morph" | "fly";

type BirdFrame = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
  wingPhase: number;
};

type ActiveCelebration = OceanBirdFlyDetail & {
  id: number;
  phase: Phase;
  origin: Point;
  frame: BirdFrame;
  size: number;
  flyDurationMs: number;
  showBird: boolean;
  birdOpacity: number;
};

const ANNOUNCE_MS = 1050;
const MORPH_MS = 380;

const FLY_DURATIONS: Record<OceanBirdFlyVariant, number> = {
  login: 1250,
  "order-success": 1400,
  "renewal-success": 1450,
  "wallet-success": 1300,
  logout: 1150,
};

const BIRD_SIZES: Record<OceanBirdFlyVariant, number> = {
  login: 88,
  "order-success": 84,
  "renewal-success": 86,
  "wallet-success": 82,
  logout: 80,
};

const VARIANT_ICONS: Record<OceanBirdFlyVariant, LucideIcon> = {
  login: ShieldCheck,
  "wallet-success": Wallet,
  "order-success": Check,
  "renewal-success": RefreshCw,
  logout: LogOut,
};

function viewportCenter(): Point {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function resolveDestination(variant: OceanBirdFlyVariant, selector?: string): Point {
  if (variant === "logout") {
    return { x: window.innerWidth + 48, y: Math.max(36, window.innerHeight * 0.1) };
  }

  const nodes = document.querySelectorAll(selector || "[data-ocean-brand-logo]");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }
  return { x: 52, y: 52 };
}

function quadBezier(t: number, p0: number, p1: number, p2: number) {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeBirdFrame(
  from: Point,
  to: Point,
  progress: number,
  variant: OceanBirdFlyVariant,
  elapsedSec: number,
): BirdFrame {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const lift = variant === "logout" ? Math.min(100, dist * 0.16) : Math.min(150, Math.max(64, dist * 0.3));
  const control = {
    x: from.x + dx * 0.36,
    y: from.y + dy * 0.18 - lift,
  };

  const t = easeInOutCubic(progress);
  const baseX = quadBezier(t, from.x, control.x, to.x);
  const baseY = quadBezier(t, from.y, control.y, to.y);

  const flapCycles = 4 + dist / 320;
  const bob = Math.sin(t * Math.PI * flapCycles * 2) * (10 * (1 - t * 0.65));
  const sway = Math.sin(t * Math.PI * flapCycles) * (3.5 * (1 - t * 0.5));

  const sample = Math.min(1, t + 0.02);
  const nextX = quadBezier(sample, from.x, control.x, to.x);
  const nextY = quadBezier(sample, from.y, control.y, to.y);
  const tilt = Math.atan2(nextY - baseY, nextX - baseX) * (180 / Math.PI);

  const wingBeat = Math.abs(Math.sin(t * Math.PI * flapCycles * 2));
  const climb = nextY < baseY ? -1 : 1;
  const flapHz = 5.2 + progress * 0.8;

  return {
    x: baseX + sway,
    y: baseY + bob,
    rotate: tilt + climb * wingBeat * 3.5 - 8,
    scale: variant === "logout" ? 0.88 + (1 - t) * 0.1 : 1 - t * 0.76,
    opacity: progress < 0.94 ? 1 : 1 - (progress - 0.94) / 0.06,
    wingPhase: elapsedSec * flapHz,
  };
}

export default function OceanBirdFlyOverlay() {
  const [mounted, setMounted] = useState(false);
  const [celebration, setCelebration] = useState<ActiveCelebration | null>(null);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const birdRef = useRef<HTMLDivElement | null>(null);
  const fromRef = useRef<Point>({ x: 0, y: 0 });
  const toRef = useRef<Point>({ x: 0, y: 0 });

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  const stopFlight = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const finishCelebration = useCallback(
    (id: number) => {
      stopFlight();
      clearTimers();
      setCelebration((prev) => (prev?.id === id ? null : prev));
      window.dispatchEvent(new CustomEvent(OCEAN_CELEBRATION_COMPLETE_EVENT));
    },
    [clearTimers, stopFlight],
  );

  const startFlyPhase = useCallback(
    (id: number, detail: OceanBirdFlyDetail, origin: Point) => {
      const to = resolveDestination(detail.variant, detail.toSelector);
      fromRef.current = origin;
      toRef.current = to;

      const flyDurationMs = FLY_DURATIONS[detail.variant];
      const flyStart = performance.now();

      setCelebration((prev) =>
        prev && prev.id === id
          ? {
              ...prev,
              phase: "fly",
              showBird: true,
              birdOpacity: 1,
              flyDurationMs,
              frame: computeBirdFrame(origin, to, 0, detail.variant, 0),
            }
          : prev,
      );

      const tick = (now: number) => {
        const progress = Math.min(1, (now - flyStart) / flyDurationMs);
        const elapsedSec = (now - flyStart) / 1000;
        const frame = computeBirdFrame(fromRef.current, toRef.current, progress, detail.variant, elapsedSec);

        if (birdRef.current) {
          birdRef.current.style.opacity = String(frame.opacity);
          birdRef.current.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) translate(-50%, -50%) rotate(${frame.rotate}deg) scale(${frame.scale})`;
        }

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          if (detail.variant !== "logout") {
            document.querySelectorAll("[data-ocean-brand-logo]").forEach((node) => {
              node.classList.add("ocean-brand-logo--bird-landed");
              window.setTimeout(() => node.classList.remove("ocean-brand-logo--bird-landed"), 650);
            });
          }
          timersRef.current.push(
            window.setTimeout(() => finishCelebration(id), 120),
          );
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [finishCelebration],
  );

  const launch = useCallback(
    (detail: OceanBirdFlyDetail) => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        window.dispatchEvent(new CustomEvent(OCEAN_CELEBRATION_COMPLETE_EVENT));
        return;
      }

      stopFlight();
      clearTimers();

      const id = Date.now();
      const origin = viewportCenter();
      const size = BIRD_SIZES[detail.variant];
      const flyDurationMs = FLY_DURATIONS[detail.variant];

      setCelebration({
        ...detail,
        id,
        phase: "announce",
        origin,
        size,
        flyDurationMs,
        showBird: false,
        birdOpacity: 0,
        frame: computeBirdFrame(origin, origin, 0, detail.variant, 0),
      });

      timersRef.current.push(
        window.setTimeout(() => {
          setCelebration((prev) =>
            prev && prev.id === id
              ? { ...prev, phase: "morph", showBird: true, birdOpacity: 0.08 }
              : prev,
          );

          timersRef.current.push(
            window.setTimeout(() => {
              setCelebration((prev) =>
                prev && prev.id === id ? { ...prev, birdOpacity: 1 } : prev,
              );
              startFlyPhase(id, detail, viewportCenter());
            }, MORPH_MS),
          );
        }, ANNOUNCE_MS),
      );
    },
    [clearTimers, startFlyPhase, stopFlight],
  );

  useEffect(() => {
    setMounted(true);

    const onFly = (event: Event) => {
      const detail = (event as CustomEvent<OceanBirdFlyDetail>).detail;
      if (!detail?.variant) return;
      launch(detail);
    };

    window.addEventListener(OCEAN_BIRD_FLY_EVENT, onFly);
    return () => {
      window.removeEventListener(OCEAN_BIRD_FLY_EVENT, onFly);
      stopFlight();
      clearTimers();
    };
  }, [launch, stopFlight, clearTimers]);

  if (!mounted || !celebration) return null;

  const copy = OCEAN_CELEBRATION_COPY[celebration.variant];
  const Icon = VARIANT_ICONS[celebration.variant];
  const { size, phase } = celebration;
  const isFlying = phase === "fly";
  const showCard = phase === "announce" || phase === "morph";

  return createPortal(
    <div className="ocean-bird-fly-layer" aria-live="polite" aria-label={copy.title}>
      {showCard && (
        <div
          className={cn(
            "ocean-celebrate-scrim",
            phase === "announce" && "ocean-celebrate-scrim--enter",
            phase === "morph" && "ocean-celebrate-scrim--morph",
          )}
        >
          <div className="ocean-celebrate-ambient ocean-celebrate-ambient--a" aria-hidden />
          <div className="ocean-celebrate-ambient ocean-celebrate-ambient--b" aria-hidden />

          <div
            className={cn(
              "ocean-celebrate-card",
              `ocean-celebrate-card--${celebration.variant}`,
              phase === "announce" && "ocean-celebrate-card--enter",
              phase === "morph" && "ocean-celebrate-card--morph",
            )}
          >
            <div className="ocean-celebrate-card-shine" aria-hidden />

            <div className="ocean-celebrate-mark">
              <div className="ocean-celebrate-mark-ring" aria-hidden />
              <img src="/ol.png" alt="" className="ocean-celebrate-mark-logo" draggable={false} />
              <div className="ocean-celebrate-mark-badge" aria-hidden>
                <Icon className="ocean-celebrate-mark-icon" strokeWidth={2.25} />
              </div>
            </div>

            <p className="ocean-celebrate-eyebrow">{copy.eyebrow}</p>
            <h2 className="ocean-celebrate-title">{copy.title}</h2>
            <div className="ocean-celebrate-divider" aria-hidden />
            <p className="ocean-celebrate-subtitle">{copy.subtitle}</p>
          </div>
        </div>
      )}

      {celebration.showBird && (
        <div
          ref={birdRef}
          className={cn(
            "ocean-bird-fly-bird",
            `ocean-bird-fly-bird--${celebration.variant}`,
            phase === "morph" && "ocean-bird-fly-bird--emerging",
            isFlying && "ocean-bird-fly-bird--flying",
          )}
          style={{
            opacity: isFlying ? undefined : celebration.birdOpacity,
            transform: isFlying
              ? undefined
              : `translate3d(${celebration.origin.x}px, ${celebration.origin.y}px, 0) translate(-50%, -50%) scale(${phase === "morph" ? 0.42 : 0.22})`,
          }}
        >
          <div className="ocean-bird-fly-glow" aria-hidden />
          <OceanFlyingBird
            size={size}
            autoFlap={phase === "morph" || isFlying}
            className="ocean-bird-fly-svg"
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
