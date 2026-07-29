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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

const typeMeta: Record<
  AnnouncementType,
  { label: string; icon: typeof Gift; tone: string; badge: string }
> = {
  promotion: {
    label: "Offer",
    icon: Gift,
    tone: "from-amber-500/20 to-amber-500/5 border-amber-400/30 text-amber-300",
    badge: "border-amber-400/35 text-amber-200 bg-amber-500/15",
  },
  update: {
    label: "Update",
    icon: RefreshCw,
    tone: "from-emerald-500/20 to-emerald-500/5 border-emerald-400/30 text-emerald-300",
    badge: "border-emerald-400/35 text-emerald-200 bg-emerald-500/15",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    tone: "from-orange-500/20 to-orange-500/5 border-orange-400/30 text-orange-300",
    badge: "border-orange-400/35 text-orange-200 bg-orange-500/15",
  },
  feature: {
    label: "New",
    icon: Sparkles,
    tone: "from-violet-500/20 to-violet-500/5 border-violet-400/30 text-violet-300",
    badge: "border-violet-400/35 text-violet-200 bg-violet-500/15",
  },
  security: {
    label: "Security",
    icon: Shield,
    tone: "from-sky-500/20 to-sky-500/5 border-sky-400/30 text-sky-300",
    badge: "border-sky-400/35 text-sky-200 bg-sky-500/15",
  },
};

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
        className="text-white"
        style={{ width: size * 0.58, height: size * 0.58 }}
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </div>
  );
}

function NewsContent({ text }: { text: string }) {
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
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" />
              <p className="text-sm leading-relaxed text-white/60 sm:text-[15px]">{cleanLine}</p>
            </div>
          );
        }

        return (
          <p
            key={index}
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              index === 0
                ? "text-sm font-medium text-white/90 sm:text-base"
                : "text-sm text-white/60 sm:text-[15px]"
            )}
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
        <div className="h-0.5 w-full shrink-0 bg-gradient-to-r from-emerald-600/80 via-emerald-400 to-emerald-500/60" />

        <div
          className="absolute left-1/2 top-2.5 z-30 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20 sm:hidden"
          aria-hidden="true"
        />

        {/* Header */}
        <div
          className="premium-news-dialog-header relative shrink-0 border-b px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5"
          style={{ borderColor: 'var(--pd-border)' }}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl" />

          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            aria-label="Close announcement"
            className="absolute right-3 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:right-5 sm:top-5"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative z-10 pr-10">
            <div className="mb-2 flex flex-wrap items-center gap-2 sm:mb-2.5 sm:gap-2.5">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg border bg-gradient-to-br shadow-sm sm:h-10 sm:w-10",
                  meta.tone
                )}
              >
                <TypeIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  meta.badge
                )}
              >
                {meta.label}
              </span>
            </div>

            <DialogTitle className="premium-news-dialog-title font-bold tracking-tight" style={{ color: 'var(--pd-title)' }}>
              {popup.title}
            </DialogTitle>
          </div>
        </div>

        {/* Scrollable body — content + WhatsApp */}
        <div className="premium-news-dialog-scroll px-4 py-3 sm:px-5 sm:py-4">
          <div
            className="premium-login-news-content rounded-xl border px-3.5 py-3.5 sm:px-4 sm:py-4"
            style={{ borderColor: 'var(--pd-border)', background: 'var(--pd-surface-soft)' }}
          >
            <NewsContent text={popup.content} />
          </div>

          {popup.communityLink && (
            <a
              href={popup.communityLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative mt-3 block overflow-hidden rounded-xl border border-[#25D366]/25 bg-[#25D366]/[0.06] transition-all hover:border-[#25D366]/40 hover:shadow-lg hover:shadow-[#25D366]/10"
            >
              <div className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-3.5">
                <div className="flex items-center gap-3 sm:flex-1 min-w-0">
                  <WhatsAppLogo size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      Join WhatsApp Community
                    </p>
                    <p className="mt-0.5 text-xs text-white/45">
                      Get updates, support and offers
                    </p>
                  </div>
                </div>
                <span className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-[#20bd5a] sm:w-auto">
                  Join Now
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </a>
          )}
        </div>

        {/* Footer — always visible */}
        <div className="shrink-0 border-t px-4 py-3 sm:px-5 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ borderColor: 'var(--pd-border)', background: 'var(--pd-dialog-bg)' }}>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="premium-btn-outline h-10 w-full sm:h-9 sm:w-auto sm:min-w-[7rem]"
            >
              Dismiss
            </Button>
            {popup.actionUrl && (
              <Button
                asChild
                size="sm"
                className="h-10 w-full gap-2 rounded-xl border-0 text-sm font-semibold shadow-none sm:h-9 sm:w-auto sm:min-w-[10rem] bg-gradient-to-r from-emerald-400 to-emerald-500 text-[hsl(160_40%_8%)] hover:brightness-110"
              >
                <a href={popup.actionUrl} target="_blank" rel="noopener noreferrer">
                  {popup.actionText || "Learn more"}
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
