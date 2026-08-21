"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Gift,
  RefreshCw,
  Shield,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AnnouncementType = "promotion" | "update" | "maintenance" | "feature" | "security";

type LoginPopupAnnouncement = {
  _id: string;
  title: string;
  content: string;
  type?: AnnouncementType;
  communityLink?: string;
  actionText?: string;
  actionUrl?: string;
};

import {
  JUST_LOGGED_IN_KEY,
  LOGIN_POPUP_COMPLETE_EVENT,
  LOGIN_POPUP_SHOWN_KEY,
  POST_LOGIN_SPLASH_DONE_KEY,
  POST_LOGIN_SPLASH_EVENT,
} from "@/lib/post-login";
import { OCEAN_CELEBRATION_COMPLETE_EVENT } from "@/lib/oceanBirdFly";

/**
 * One accent family per announcement type so the bar, icon, badge and CTA all
 * agree. Each colour pair is written explicitly for light and dark instead of
 * leaning on the `text-white/*` remaps in globals.css, which only covered the
 * emerald set and left promos/maintenance low-contrast in light mode.
 */
type AccentTheme = {
  label: string;
  icon: typeof Gift;
  bar: string;
  glow: string;
  tile: string;
  badge: string;
  dot: string;
  cta: string;
};

const typeMeta: Record<AnnouncementType, AccentTheme> = {
  promotion: {
    label: "Offer",
    icon: Gift,
    bar: "from-amber-500/50 via-amber-300 to-amber-500/40",
    glow: "bg-amber-400/15",
    tile: "border-amber-500/25 from-amber-400/25 to-amber-500/5 text-amber-600 dark:border-amber-400/30 dark:text-amber-300",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200",
    dot: "bg-amber-500/70 dark:bg-amber-400/80",
    cta: "from-amber-400 to-amber-500 text-[hsl(35_65%_12%)]",
  },
  update: {
    label: "Update",
    icon: RefreshCw,
    bar: "from-emerald-500/50 via-emerald-300 to-emerald-500/40",
    glow: "bg-emerald-400/15",
    tile: "border-emerald-500/25 from-emerald-400/25 to-emerald-500/5 text-emerald-600 dark:border-emerald-400/30 dark:text-emerald-300",
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-200",
    dot: "bg-emerald-500/70 dark:bg-emerald-400/80",
    cta: "from-emerald-400 to-emerald-500 text-[hsl(160_40%_8%)]",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    bar: "from-orange-500/50 via-orange-300 to-orange-500/40",
    glow: "bg-orange-400/15",
    tile: "border-orange-500/25 from-orange-400/25 to-orange-500/5 text-orange-600 dark:border-orange-400/30 dark:text-orange-300",
    badge:
      "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:border-orange-400/35 dark:bg-orange-500/15 dark:text-orange-200",
    dot: "bg-orange-500/70 dark:bg-orange-400/80",
    cta: "from-orange-400 to-orange-500 text-[hsl(25_65%_12%)]",
  },
  feature: {
    label: "New",
    icon: Sparkles,
    bar: "from-violet-500/50 via-violet-300 to-violet-500/40",
    glow: "bg-violet-400/15",
    tile: "border-violet-500/25 from-violet-400/25 to-violet-500/5 text-violet-600 dark:border-violet-400/30 dark:text-violet-300",
    badge:
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/35 dark:bg-violet-500/15 dark:text-violet-200",
    dot: "bg-violet-500/70 dark:bg-violet-400/80",
    cta: "from-violet-400 to-violet-500 text-[hsl(265_60%_12%)]",
  },
  security: {
    label: "Security",
    icon: Shield,
    bar: "from-sky-500/50 via-sky-300 to-sky-500/40",
    glow: "bg-sky-400/15",
    tile: "border-sky-500/25 from-sky-400/25 to-sky-500/5 text-sky-600 dark:border-sky-400/30 dark:text-sky-300",
    badge:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/35 dark:bg-sky-500/15 dark:text-sky-200",
    dot: "bg-sky-500/70 dark:bg-sky-400/80",
    cta: "from-sky-400 to-sky-500 text-[hsl(205_65%_12%)]",
  },
};

/**
 * Colours are inline because the light-mode `.text-white` remap in globals.css
 * would otherwise darken the glyph sitting on WhatsApp green.
 */
function WhatsAppLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[#25D366] shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ width: size * 0.58, height: size * 0.58, color: "#fff" }}
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </div>
  );
}

function NewsContent({ text, dotClass }: { text: string; dotClass: string }) {
  const blocks = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {blocks.map((line, index) => {
        const isBullet = /^[-•*]\s/.test(line);
        const cleanLine = isBullet ? line.replace(/^[-•*]\s+/, "") : line;

        if (isBullet) {
          return (
            <div key={index} className="flex gap-3 pl-0.5">
              <span className={cn("mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
              <p
                className="text-sm leading-relaxed sm:text-[15px]"
                style={{ color: "hsl(var(--pd-fg-muted))" }}
              >
                {cleanLine}
              </p>
            </div>
          );
        }

        return (
          <p
            key={index}
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              index === 0 ? "text-[0.9375rem] font-medium sm:text-base" : "text-sm sm:text-[15px]"
            )}
            style={{ color: index === 0 ? "var(--pd-title)" : "hsl(var(--pd-fg-muted))" }}
          >
            {cleanLine}
          </p>
        );
      })}
    </div>
  );
}

export default function LoginNewsPopup() {
  const [popup, setPopup] = useState<LoginPopupAnnouncement | null>(null);
  const [open, setOpen] = useState(false);

  const markAsShown = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(LOGIN_POPUP_SHOWN_KEY, "1");
    window.dispatchEvent(new Event(LOGIN_POPUP_COMPLETE_EVENT));
  };

  useEffect(() => {
    const loadPopup = async () => {
      if (typeof window === "undefined") return;

      const alreadyShown = sessionStorage.getItem(LOGIN_POPUP_SHOWN_KEY) === "1";
      if (alreadyShown) return;

      try {
        const response = await fetch("/api/announcements/login-popup", {
          credentials: "include",
        });

        if (!response.ok) return;

        const data = await response.json();
        if (data?.popup) {
          setPopup(data.popup);
          setOpen(true);
        } else {
          markAsShown();
        }
      } catch (error) {
        console.error("Failed to load login popup announcement:", error);
      }
    };

    const scheduleAfterLoginBird = () => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        window.removeEventListener(OCEAN_CELEBRATION_COMPLETE_EVENT, run);
        clearTimeout(fallback);
        loadPopup();
      };
      const fallback = window.setTimeout(run, 3200);
      window.addEventListener(OCEAN_CELEBRATION_COMPLETE_EVENT, run, { once: true });
    };

    const onSplashComplete = () => {
      scheduleAfterLoginBird();
    };

    const justLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === "1";
    const splashDone = sessionStorage.getItem(POST_LOGIN_SPLASH_DONE_KEY) === "1";

    if (justLoggedIn && splashDone) {
      scheduleAfterLoginBird();
      return;
    }

    if (justLoggedIn && !splashDone) {
      window.addEventListener(POST_LOGIN_SPLASH_EVENT, onSplashComplete, { once: true });
      return () => window.removeEventListener(POST_LOGIN_SPLASH_EVENT, onSplashComplete);
    }
  }, []);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) markAsShown();
  };

  if (!popup) return null;

  const meta = typeMeta[popup.type || "update"] || typeMeta.update;
  const TypeIcon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "premium-login-news-dialog premium-news-dialog premium-dialog-mobile-sheet",
          "border-0 shadow-2xl rounded-2xl",
          "max-sm:data-[state=open]:slide-in-from-bottom-8 max-sm:data-[state=closed]:slide-out-to-bottom-8",
          "sm:data-[state=open]:zoom-in-95"
        )}
      >
        <div
          className={cn(
            "premium-news-accent-bar h-1 w-full shrink-0 bg-gradient-to-r",
            meta.bar
          )}
        />

        <div
          className="absolute left-1/2 top-3 z-30 h-1 w-9 -translate-x-1/2 rounded-full bg-current opacity-20 sm:hidden"
          aria-hidden="true"
        />

        {/* Header */}
        <div
          className="premium-news-dialog-header relative shrink-0 border-b px-4 pb-3.5 pt-4 sm:px-6 sm:pb-4 sm:pt-5"
          style={{ borderColor: "var(--pd-border)" }}
        >
          <div
            className={cn(
              "pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full blur-3xl",
              meta.glow
            )}
          />

          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            aria-label="Close announcement"
            className="premium-news-close absolute right-3 top-3.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border transition-colors sm:right-5 sm:top-5"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative z-10 flex items-start gap-3 pr-10 sm:gap-3.5">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br shadow-sm sm:h-11 sm:w-11",
                meta.tile
              )}
            >
              <TypeIcon className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  meta.badge
                )}
              >
                {meta.label}
              </span>
              <DialogTitle
                className="premium-news-dialog-title mt-1.5 font-bold tracking-tight"
                style={{ color: "var(--pd-title)" }}
              >
                {popup.title}
              </DialogTitle>
            </div>
          </div>
        </div>

        {/* Scrollable body — content + WhatsApp */}
        <div className="premium-news-dialog-scroll px-4 py-3.5 sm:px-6 sm:py-4">
          <DialogDescription className="sr-only">
            Announcement from OceanLinux
          </DialogDescription>

          <div
            className="premium-login-news-content rounded-xl border px-4 py-3.5 sm:px-[1.125rem] sm:py-4"
            style={{ borderColor: "var(--pd-border)", background: "var(--pd-surface-soft)" }}
          >
            <NewsContent text={popup.content} dotClass={meta.dot} />
          </div>

          {popup.communityLink && (
            <a
              href={popup.communityLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative mt-3 block overflow-hidden rounded-xl border border-[#25D366]/25 bg-[#25D366]/[0.07] transition-all hover:border-[#25D366]/45 hover:bg-[#25D366]/[0.11]"
            >
              <div className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-3.5">
                <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                  <WhatsAppLogo size={38} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--pd-title)" }}
                    >
                      Join WhatsApp Community
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "hsl(var(--pd-fg-muted))" }}>
                      Get updates, support and offers
                    </p>
                  </div>
                </div>
                <span
                  className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-sm font-semibold transition-transform group-hover:bg-[#20bd5a] group-active:scale-[0.98] sm:w-auto"
                  style={{ color: "#fff" }}
                >
                  Join Now
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </a>
          )}
        </div>

        {/* Footer — always visible */}
        <div
          className="shrink-0 border-t px-4 py-3 sm:px-6 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ borderColor: "var(--pd-border)", background: "var(--pd-dialog-bg)" }}
        >
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {popup.actionUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                className="premium-btn-outline h-10 w-full sm:h-9 sm:w-auto sm:min-w-[7rem]"
              >
                Dismiss
              </Button>
            ) : null}

            {popup.actionUrl ? (
              <Button
                asChild
                size="sm"
                className={cn(
                  "h-10 w-full gap-2 rounded-xl border-0 bg-gradient-to-r text-sm font-semibold shadow-none transition-[filter,transform] hover:brightness-110 active:scale-[0.99] sm:h-9 sm:w-auto sm:min-w-[10rem]",
                  meta.cta
                )}
              >
                <a
                  href={popup.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleOpenChange(false)}
                >
                  {popup.actionText || "Learn more"}
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </a>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleOpenChange(false)}
                className={cn(
                  "h-10 w-full rounded-xl border-0 bg-gradient-to-r text-sm font-semibold shadow-none transition-[filter,transform] hover:brightness-110 active:scale-[0.99] sm:h-9 sm:w-auto sm:min-w-[8rem]",
                  meta.cta
                )}
              >
                Got it
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
