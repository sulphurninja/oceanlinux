"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Gift,
  RefreshCw,
  Shield,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
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

function isWhatsAppLink(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com");
  } catch {
    return false;
  }
}

function channelLabel(text?: string) {
  const label = (text || "").replace(/\s+/g, " ").trim();
  return label || "Join channel";
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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
    <div className="space-y-2.5">
      {blocks.map((line, index) => {
        const isBullet = /^[-•*]\s/.test(line);
        const cleanLine = isBullet ? line.replace(/^[-•*]\s+/, "") : line;

        if (isBullet) {
          return (
            <div key={index} className="flex gap-3 pl-0.5">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" />
              <p className="text-sm leading-relaxed premium-dashboard-subtitle">{cleanLine}</p>
            </div>
          );
        }

        return (
          <p
            key={index}
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              index === 0
                ? "text-sm font-medium premium-dashboard-title"
                : "text-sm premium-dashboard-subtitle"
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
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissPopup();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, dismissPopup]);

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

  if (!popup || !open || typeof document === "undefined") return null;

  const meta = typeMeta[popup.type || "update"] || typeMeta.update;
  const TypeIcon = meta.icon;

  return createPortal(
    <div className="premium-order-news-overlay" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-news-title"
        className="premium-order-news-card"
      >
        <div
          className="premium-news-dialog-header relative shrink-0 border-b px-4 pb-3.5 pt-4 sm:px-6 sm:pb-4 sm:pt-5"
          style={{ borderColor: "var(--pd-border)" }}
        >
          <button
            type="button"
            onClick={dismissPopup}
            aria-label="Dismiss announcement"
            className="premium-news-close absolute right-3 top-3.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border transition-colors sm:right-5 sm:top-5"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="relative z-10 flex items-start gap-3 pr-10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15">
              <TypeIcon className="h-5 w-5 premium-price-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide premium-dashboard-subtitle">
                {meta.label}
                {popup.targetLabel ? ` · ${popup.targetLabel}` : ""}
              </p>
              <h2 id="order-news-title" className="premium-news-dialog-title mt-1 text-lg font-bold premium-dashboard-title">
                {popup.title}
              </h2>
            </div>
          </div>
        </div>
        <div className="premium-news-dialog-scroll px-4 py-4 sm:px-6">
          <p className="sr-only">Service update for this order</p>
          <NewsContent text={popup.content} />
        </div>
        {popup.actionUrl ? (
          <div
            className="shrink-0 border-t px-4 py-3 sm:px-6"
            style={{ borderColor: "var(--pd-border)", background: "var(--pd-dialog-bg)" }}
          >
            <a
              href={popup.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "premium-order-news-channel-btn",
                !isWhatsAppLink(popup.actionUrl) && "premium-order-news-channel-btn--default"
              )}
            >
              {isWhatsAppLink(popup.actionUrl) ? (
                <WhatsAppMark />
              ) : (
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>{channelLabel(popup.actionText)}</span>
            </a>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
