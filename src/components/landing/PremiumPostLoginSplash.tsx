"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import PremiumAuthBackground from "@/components/landing/PremiumAuthBackground";
import { triggerLoginBird } from "@/lib/oceanBirdFly";
import {
  JUST_LOGGED_IN_KEY,
  POST_LOGIN_SPLASH_DONE_KEY,
  POST_LOGIN_SPLASH_EVENT,
  POST_LOGIN_SPLASH_MS,
  clearPostLoginLoadingScreen,
  isPostLoginSplashPending,
  setPostLoginLoadingScreen,
} from "@/lib/post-login";

const STEPS = [
  "Authenticating credentials",
  "Syncing your environment",
  "Opening dashboard",
];

type PremiumPostLoginSplashProps = {
  /** Show splash immediately (login/signup page — best for mobile) */
  active?: boolean;
  /** Fallback: auto-start on dashboard when justLoggedIn is set */
  autoFromSession?: boolean;
  onComplete?: () => void;
  title?: string;
};

function finishSplash(onComplete?: () => void) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(POST_LOGIN_SPLASH_DONE_KEY, "1");
  clearPostLoginLoadingScreen();
  window.dispatchEvent(new CustomEvent(POST_LOGIN_SPLASH_EVENT));

  const justLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === "1";
  if (justLoggedIn) {
    window.setTimeout(() => triggerLoginBird(), 100);
  }

  onComplete?.();
}

export default function PremiumPostLoginSplash({
  active = false,
  autoFromSession = false,
  onComplete,
  title = "Welcome back",
}: PremiumPostLoginSplashProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [step, setStep] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useLayoutEffect(() => {
    setMounted(true);
    const shouldShow =
      active || (autoFromSession && isPostLoginSplashPending());
    if (shouldShow) {
      setPostLoginLoadingScreen();
      setVisible(true);
    }
  }, [active, autoFromSession]);

  useEffect(() => {
    if (!visible) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 1200 : POST_LOGIN_SPLASH_MS;
    const stepMs = duration / STEPS.length;

    const stepTimers = STEPS.map((_, index) =>
      index === 0
        ? undefined
        : window.setTimeout(() => setStep(index), stepMs * index)
    );

    const exitTimer = window.setTimeout(() => {
      setExiting(true);
      window.setTimeout(() => {
        setVisible(false);
        finishSplash(onCompleteRef.current);
      }, 160);
    }, duration);

    return () => {
      stepTimers.forEach((id) => id && clearTimeout(id));
      clearTimeout(exitTimer);
    };
  }, [visible]);

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center px-4",
        "min-h-[100dvh] w-full",
        "hero-premium-bg premium-post-login-splash",
        exiting ? "premium-post-login-splash--exit" : "premium-post-login-splash--enter"
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <PremiumAuthBackground lite />

      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="premium-post-login-card mx-auto">
          <div className="premium-post-login-ring-wrap mx-auto mb-6">
            <svg className="premium-post-login-ring" viewBox="0 0 120 120" aria-hidden>
              <defs>
                <linearGradient id="postLoginGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#6ee7b7" />
                </linearGradient>
              </defs>
              <circle
                className="premium-post-login-ring-track"
                cx="60"
                cy="60"
                r="52"
                fill="none"
                strokeWidth="4"
              />
              <circle
                className="premium-post-login-ring-progress"
                cx="60"
                cy="60"
                r="52"
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <img src="/ol.png" alt="" className="premium-post-login-logo" />
          </div>

          <p className="premium-section-eyebrow mb-2 tracking-[0.22em]">OceanLinux</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mb-1">
            {title}
          </h2>
          <p key={step} className="text-sm text-white/45 premium-post-login-step font-light">
            {STEPS[step]}
          </p>

          <div className="premium-post-login-bar mt-6">
            <div className="premium-post-login-bar-fill" />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
