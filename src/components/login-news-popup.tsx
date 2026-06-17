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

const JUST_LOGGED_IN_KEY = "justLoggedIn";
const LOGIN_POPUP_SHOWN_KEY = "loginPopupShownInSession";

const typeMeta: Record<
  AnnouncementType,
  { label: string; icon: typeof Gift; tone: string }
> = {
  promotion: {
    label: "Offer",
    icon: Gift,
    tone: "from-amber-500/15 to-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400",
  },
  update: {
    label: "Update",
    icon: RefreshCw,
    tone: "from-primary/20 to-primary/5 border-primary/20 text-emerald-700 dark:text-emerald-400",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    tone: "from-orange-500/15 to-orange-500/5 border-orange-500/20 text-orange-700 dark:text-orange-400",
  },
  feature: {
    label: "New",
    icon: Sparkles,
    tone: "from-violet-500/15 to-violet-500/5 border-violet-500/20 text-violet-700 dark:text-violet-400",
  },
  security: {
    label: "Security",
    icon: Shield,
    tone: "from-blue-500/15 to-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-400",
  },
};

/** Official WhatsApp mark — same path as floating widget, on brand green. */
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
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600/70 dark:bg-emerald-400/80" />
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{cleanLine}</p>
            </div>
          );
        }

        return (
          <p
            key={index}
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              index === 0
                ? "text-sm font-medium text-foreground sm:text-base"
                : "text-sm text-muted-foreground sm:text-[15px]"
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
          "border border-border/50 bg-card/95 backdrop-blur-md text-card-foreground",
          "shadow-[0_12px_48px_-14px_hsl(var(--foreground)/0.15)]",
          "w-[calc(100vw-1rem)] max-w-none",
          "fixed left-1/2 bottom-2 top-auto translate-x-[-50%] translate-y-0",
          "max-h-[min(92dvh,720px)] rounded-2xl",
          "data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
          "sm:bottom-auto sm:top-1/2 sm:translate-y-[-50%] sm:max-w-xl md:max-w-2xl",
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
          "[&>button[class*='absolute']]:hidden"
        )}
      >
        <div className="h-0.5 w-full bg-gradient-to-r from-emerald-600/80 via-primary to-emerald-500/60" />

        <div className="absolute left-1/2 top-2.5 z-30 h-1 w-10 -translate-x-1/2 rounded-full bg-border/80 sm:hidden" />

        <div className="flex max-h-[min(92dvh,720px)] flex-col">
          {/* Header */}
          <div className="relative shrink-0 border-b border-border/40 px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-bl from-primary/8 to-transparent blur-2xl" />

            <button
              onClick={() => handleOpenChange(false)}
              aria-label="Close announcement"
              className="absolute right-3 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:right-5 sm:top-5"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative z-10 pr-10">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border bg-gradient-to-br shadow-sm sm:h-11 sm:w-11",
                    meta.tone
                  )}
                >
                  <TypeIcon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5",
                    "text-[11px] font-medium",
                    meta.tone
                  )}
                >
                  {meta.label}
                </span>
              </div>

              <DialogTitle className="text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl">
                {popup.title}
              </DialogTitle>
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card px-4 py-4 sm:px-6 sm:py-5">
            <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-4 sm:px-5 sm:py-5">
              <NewsContent text={popup.content} />
            </div>

            {popup.communityLink && (
              <a
                href={popup.communityLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "group relative mt-4 block overflow-hidden rounded-xl border transition-all",
                  "border-[#25D366]/20 bg-[#25D366]/[0.04] hover:border-[#25D366]/35 hover:shadow-md",
                  "dark:border-[#25D366]/25 dark:bg-[#25D366]/[0.06]"
                )}
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
                  <div className="flex items-center gap-3 sm:flex-1 sm:gap-4">
                    <WhatsAppLogo size={52} />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground sm:text-base">
                        Join WhatsApp Community
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                        Get updates, support and offers
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5",
                      "text-sm font-semibold text-white bg-[#25D366] transition-colors group-hover:bg-[#20bd5a]",
                      "sm:w-auto"
                    )}
                  >
                    Join Now
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </a>
            )}
          </div>

          {/* Footer */}
          <div
            className={cn(
              "shrink-0 border-t border-border/40 bg-muted/15 px-4 py-3 sm:px-6 sm:py-4",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            )}
          >
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                className="h-9 w-full text-sm text-muted-foreground sm:w-auto"
              >
                Dismiss
              </Button>
              {popup.actionUrl && (
                <Button asChild size="sm" className="h-9 w-full gap-2 text-sm shadow-sm sm:w-auto">
                  <a href={popup.actionUrl} target="_blank" rel="noopener noreferrer">
                    {popup.actionText || "Learn more"}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
