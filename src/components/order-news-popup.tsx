"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Gift,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  JUST_LOGGED_IN_KEY,
  LOGIN_POPUP_COMPLETE_EVENT,
  LOGIN_POPUP_SHOWN_KEY,
} from "@/lib/post-login";

type AnnouncementType = "promotion" | "update" | "maintenance" | "feature" | "security";

type OrderPopupAnnouncement = {
  _id: string;
  title: string;
  content: string;
  type?: AnnouncementType;
  communityLink?: string;
  actionText?: string;
  actionUrl?: string;
  targetLabel?: string;
  updatedAt?: string;
};

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

function waitForLoginPopupComplete(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  if (sessionStorage.getItem(LOGIN_POPUP_SHOWN_KEY) === "1") {
    return Promise.resolve();
  }

  const justLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === "1";
  if (!justLoggedIn) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      window.removeEventListener(LOGIN_POPUP_COMPLETE_EVENT, finish);
      clearTimeout(timer);
      resolve();
    };

    window.addEventListener(LOGIN_POPUP_COMPLETE_EVENT, finish, { once: true });
    const timer = window.setTimeout(finish, 8000);
  });
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

export default function OrderNewsPopup({ orderId }: { orderId: string }) {
  const [popup, setPopup] = useState<OrderPopupAnnouncement | null>(null);
  const [open, setOpen] = useState(false);

  const dismissPopup = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    const loadPopup = async () => {
      try {
        await waitForLoginPopupComplete();
        if (cancelled) return;

        const response = await fetch(`/api/announcements/order-popup?orderId=${encodeURIComponent(orderId)}`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) {
            console.warn("[OrderNewsPopup] API error:", response.status, orderId);
          }
          return;
        }

        const data = await response.json();
        if (!data?.popup || cancelled) {
          if (!cancelled && data?.hint) {
            console.info("[OrderNewsPopup]", data.hint, { provider: data.provider, orderId });
          }
          return;
        }

        setPopup(data.popup);
        setOpen(true);
      } catch (error) {
        console.error("Failed to load order news popup:", error);
      }
    };

    setPopup(null);
    setOpen(false);
    loadPopup();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
  };

  if (!popup) return null;

  const meta = typeMeta[popup.type || "update"] || typeMeta.update;
  const TypeIcon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "premium-login-news-dialog premium-order-news-dialog premium-news-dialog premium-dialog-mobile-sheet",
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

        <div
          className="premium-news-dialog-header relative shrink-0 border-b px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5"
          style={{ borderColor: "var(--pd-border)" }}
        >
          <button
            type="button"
            onClick={dismissPopup}
            aria-label="Close announcement"
            className="absolute right-3 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:right-5 sm:top-5"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative z-10 pr-10">
            <div className="mb-3 flex flex-wrap items-center gap-2.5 sm:mb-4 sm:gap-3">
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
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  meta.badge
                )}
              >
                {meta.label}
              </span>
              {popup.targetLabel && (
                <Badge variant="outline" className="gap-1 text-[11px] border-white/15 text-white/70">
                  <Server className="h-3 w-3" />
                  {popup.targetLabel}
                </Badge>
              )}
            </div>

            <DialogTitle
              className="premium-news-dialog-title premium-order-news-title font-bold tracking-tight"
              style={{ color: "var(--pd-title)" }}
            >
              {popup.title}
            </DialogTitle>
          </div>
        </div>

        <div className="premium-news-dialog-scroll px-4 py-3 sm:px-5 sm:py-4">
          <div
            className="premium-login-news-content rounded-xl border px-3.5 py-3.5 sm:px-4 sm:py-4"
            style={{ borderColor: "var(--pd-border)", background: "var(--pd-surface-soft)" }}
          >
            <NewsContent text={popup.content} />
          </div>
        </div>

        <div
          className="shrink-0 border-t px-4 py-3 sm:px-5 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ borderColor: "var(--pd-border)", background: "var(--pd-dialog-bg)" }}
        >
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={dismissPopup}
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
