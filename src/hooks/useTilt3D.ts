"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

type GlareTone = "light" | "emerald" | "none";

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

function scheduleRaf(ref: RefObject<number | null>, fn: () => void) {
  if (ref.current !== null) return;
  ref.current = requestAnimationFrame(() => {
    ref.current = null;
    fn();
  });
}

export function useTilt3D(
  maxTilt = 14,
  scale = 1.03,
  maxGlare = 0.22,
  glareTone: GlareTone = "light"
) {
  const ref = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const enabledRef = useRef(false);
  const pendingRef = useRef<{ px: number; py: number } | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    enabledRef.current = !reduced && !coarse;
  }, []);

  const applyTilt = useCallback(() => {
    const el = ref.current;
    const pending = pendingRef.current;
    if (!el || !pending) return;

    const { px, py } = pending;
    const rotY = (px - 0.5) * maxTilt * 2;
    const rotX = (0.5 - py) * maxTilt * 2;

    el.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(${scale}, ${scale}, ${scale})`;
    el.style.transition = "transform 0.08s ease-out";

    const glareEl = glareRef.current;
    if (glareEl && glareTone !== "none" && maxGlare > 0) {
      const opacity = glareTone === "emerald" ? maxGlare * 0.85 : maxGlare;
      glareEl.style.background = buildGlareBackground(glareTone, px * 100, py * 100, opacity);
      glareEl.style.opacity = "1";
    }
  }, [glareTone, maxGlare, maxTilt, scale]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      if (!enabledRef.current) return;

      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      pendingRef.current = { px, py };
      scheduleRaf(rafRef, applyTilt);
    };

    const onLeave = () => {
      pendingRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      el.style.transform =
        "perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      el.style.transition = "transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)";

      const glareEl = glareRef.current;
      if (glareEl) {
        glareEl.style.background = "transparent";
        glareEl.style.opacity = "0";
      }
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [applyTilt]);

  return { ref, glareRef, enabled: enabledRef.current };
}

export function useHeroParallax<T extends HTMLElement = HTMLElement>(intensity = 18) {
  const ref = useRef<T>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const section = ref.current;
    if (!section) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;

    const flush = () => {
      const el = ref.current;
      if (!el) return;
      el.style.setProperty("--px", pendingRef.current.x.toFixed(2));
      el.style.setProperty("--py", pendingRef.current.y.toFixed(2));
    };

    const onMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      pendingRef.current = { x: px * intensity, y: py * intensity };
      scheduleRaf(rafRef, flush);
    };

    const onLeave = () => {
      pendingRef.current = { x: 0, y: 0 };
      scheduleRaf(rafRef, flush);
    };

    section.addEventListener("mousemove", onMove);
    section.addEventListener("mouseleave", onLeave);
    return () => {
      section.removeEventListener("mousemove", onMove);
      section.removeEventListener("mouseleave", onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [intensity]);

  return { ref };
}
