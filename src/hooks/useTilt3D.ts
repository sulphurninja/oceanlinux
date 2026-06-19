"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type GlareState = { x: number; y: number; opacity: number };

export function useTilt3D(maxTilt = 14, scale = 1.03, maxGlare = 0.22) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [glare, setGlare] = useState<GlareState>({ x: 50, y: 50, opacity: 0 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setEnabled(!reduced && !coarse);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const px = x / rect.width;
      const py = y / rect.height;
      const rotY = (px - 0.5) * maxTilt * 2;
      const rotX = (0.5 - py) * maxTilt * 2;

      setStyle({
        transform: `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(${scale}, ${scale}, ${scale})`,
        transition: "transform 0.08s ease-out",
      });
      setGlare({ x: px * 100, y: py * 100, opacity: maxGlare });
    };

    const onLeave = () => {
      setStyle({
        transform: "perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
        transition: "transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)",
      });
      setGlare({ x: 50, y: 50, opacity: 0 });
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [enabled, maxTilt, scale, maxGlare]);

  return { ref, style, glare, enabled };
}

export function useHeroParallax(intensity = 18) {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const section = ref.current;
    if (!section) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;

    const onMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      setOffset({ x: px * intensity, y: py * intensity });
    };

    const onLeave = () => setOffset({ x: 0, y: 0 });

    section.addEventListener("mousemove", onMove);
    section.addEventListener("mouseleave", onLeave);
    return () => {
      section.removeEventListener("mousemove", onMove);
      section.removeEventListener("mouseleave", onLeave);
    };
  }, [intensity]);

  return { ref, offset };
}
