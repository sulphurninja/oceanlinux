"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Gift,
  MessageCircle,
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

const JUST_LOGGED_IN_KEY = "justLoggedIn";
const LOGIN_POPUP_SHOWN_KEY = "loginPopupShownInSession";

const typeMeta: Record<
  AnnouncementType,
  { label: string; icon: typeof Gift }
> = {
  promotion: { label: "Promotion", icon: Gift },
  update: { label: "Update", icon: RefreshCw },
  maintenance: { label: "Maintenance", icon: Wrench },
  feature: { label: "New Feature", icon: Sparkles },
  security: { label: "Security", icon: Shield },
};

/** Matches dashboard accent pattern (primary in light, emerald in dark). */
const accentText = "text-primary dark:text-emerald-400";
const accentBg = "bg-primary/10 dark:bg-emerald-500/10";
const accentBorder = "border-primary/20 dark:border-emerald-500/20";
const accentRing = "ring-primary/20 dark:ring-emerald-500/25";
const accentDot = "bg-primary dark:bg-emerald-400";
const accentBar = "bg-primary dark:bg-emerald-500";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        className="text-white"
        d="M16 3C8.82 3 3 8.73 3 15.8c0 2.49.73 4.9 2.12 6.96L3 29l6.43-2.02A13.16 13.16 0 0 0 16 28.6c7.18 0 13-5.73 13-12.8S23.18 3 16 3Z"
      />
      <path
        fill="currentColor"
        className="text-white/95"
        d="M23.36 19.37c-.3-.15-1.77-.86-2.05-.96-.27-.1-.47-.15-.66.15-.2.3-.76.96-.93 1.16-.17.2-.35.22-.65.07-.3-.15-1.24-.45-2.36-1.44-.87-.77-1.46-1.72-1.63-2.02-.17-.3-.02-.47.13-.62.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.57-.9-2.15-.24-.58-.49-.5-.66-.51h-.56c-.2 0-.52.07-.8.37-.27.3-1.04 1-1.04 2.44s1.07 2.82 1.22 3.02c.15.2 2.1 3.36 5.2 4.58.74.29 1.32.46 1.77.59.75.2 1.43.17 1.97.1.6-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.13-.27-.2-.56-.35Z"
      />
    </svg>
  );
}

function NewsContent({ text }: { text: string }) {
  const blocks = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3">
      {blocks.map((line, index) => {
        const isBullet = /^[-•*]\s/.test(line);
        const cleanLine = isBullet ? line.replace(/^[-•*]\s+/, "") : line;
        const isLead = index === 0;

        if (isBullet) {
          return (
            <div key={index} className="flex gap-2.5">
              <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", accentDot)} />
              <p className="text-sm leading-relaxed text-muted-foreground">{cleanLine}</p>
            </div>
          );
        }

        return (
          <p
            key={index}
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              isLead
                ? "text-sm font-medium text-foreground sm:text-base"
                : "text-sm text-muted-foreground"
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
  const [entered, setEntered] = useState(false);

  const markAsShown = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(LOGIN_POPUP_SHOWN_KEY, "1");
  };

  useEffect(() => {
    const loadPopup = async () => {
      if (typeof window === "undefined") return;

      const isJustLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === "1";
      if (!isJustLoggedIn) return;

      sessionStorage.removeItem(JUST_LOGGED_IN_KEY);

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

    loadPopup();
  }, []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, [open]);

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
          "p-0 gap-0 overflow-hidden",
          "border border-border bg-card text-card-foreground",
          "shadow-lg ring-1 ring-border/50",
          "w-[calc(100vw-1rem)] max-w-none",
          "fixed left-1/2 bottom-2 top-auto translate-x-[-50%] translate-y-0",
          "max-h-[min(92dvh,720px)] rounded-xl",
          "data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
          "sm:bottom-auto sm:top-1/2 sm:translate-y-[-50%] sm:max-w-xl md:max-w-2xl",
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
          "[&>button[class*='absolute']]:hidden"
        )}
      >
        <div className={cn("h-1 w-full", accentBar)} />

        <div className="flex max-h-[min(92dvh,720px)] flex-col">
          {/* Header — same type scale as dashboard welcome */}
          <div className="relative shrink-0 border-b border-border px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl dark:bg-emerald-500/10" />

            <button
              onClick={() => handleOpenChange(false)}
              aria-label="Close announcement"
              className="absolute right-3 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-5 sm:top-5"
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className={cn(
                "relative z-10 transition-all duration-500 ease-out",
                entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              )}
            >
              <div className="mb-4 flex flex-wrap items-center gap-3 pr-10">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg ring-1 sm:h-11 sm:w-11",
                    accentBg,
                    accentText,
                    accentRing
                  )}
                >
                  <TypeIcon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
                    "text-[10px] font-semibold uppercase tracking-widest",
                    accentBg,
                    accentText,
                    accentBorder
                  )}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", accentBg)} />
                    <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", accentDot)} />
                  </span>
                  {meta.label}
                </span>
              </div>

              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-primary dark:text-emerald-400">
                Fresh from OceanLinux
              </p>
              <DialogTitle className="pr-8 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {popup.title}
              </DialogTitle>
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card px-4 py-4 sm:px-6 sm:py-5">
            <div
              className={cn(
                "transition-all duration-500 delay-75 ease-out",
                entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              )}
            >
              <div className="rounded-xl border border-border border-l-[3px] border-l-primary bg-card px-4 py-4 dark:border-l-emerald-500 sm:px-5 sm:py-5">
                <div className={cn("mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest", accentText)}>
                  <TypeIcon className="h-3.5 w-3.5" />
                  What&apos;s new
                </div>
                <NewsContent text={popup.content} />
              </div>

              {popup.communityLink && (
                <a
                  href={popup.communityLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group relative mt-4 block overflow-hidden rounded-xl border transition-all",
                    "border-[#25D366]/25 bg-[#25D366]/[0.06] hover:border-[#25D366]/45 hover:shadow-md",
                    "dark:border-[#25D366]/30 dark:bg-[#25D366]/10 dark:hover:border-[#25D366]/50"
                  )}
                >
                  <div className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
                    <div className="flex items-center gap-3 sm:flex-1 sm:gap-4">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#25D366] shadow-sm transition-transform group-hover:scale-105 sm:h-14 sm:w-14">
                        <WhatsAppIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background text-[#25D366] ring-1 ring-border">
                          <MessageCircle className="h-2.5 w-2.5 fill-current" />
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground sm:text-base">
                          Join Our WhatsApp Community
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                          Instant updates · 24/7 support · exclusive offers
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5",
                        "text-sm font-semibold text-white bg-[#25D366] hover:bg-[#22c55e]",
                        "transition-colors sm:w-auto"
                      )}
                    >
                      Join Now
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className={cn(
              "shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6 sm:py-4",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              "transition-all duration-500 delay-150 ease-out",
              entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            )}
          >
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                className="h-9 w-full text-muted-foreground sm:w-auto"
              >
                Dismiss
              </Button>
              {popup.actionUrl && (
                <Button asChild size="sm" className="h-9 w-full gap-2 sm:w-auto">
                  <a href={popup.actionUrl} target="_blank" rel="noopener noreferrer">
                    {popup.actionText || "Learn More"}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="absolute left-1/2 top-2 z-30 h-1 w-10 -translate-x-1/2 rounded-full bg-border sm:hidden" />
      </DialogContent>
    </Dialog>
  );
}
