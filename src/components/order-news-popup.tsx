"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
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

function orderPopupSessionKey(orderId: string, announcementId: string, updatedAt?: string) {
  return `orderNewsShown_${orderId}_${announcementId}_${updatedAt || 'v1'}`;
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

export default function OrderNewsPopup({ orderId }: { orderId: string }) {
  const [popup, setPopup] = useState<OrderPopupAnnouncement | null>(null);
  const [open, setOpen] = useState(false);

  const markAsShown = (announcement: OrderPopupAnnouncement) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      orderPopupSessionKey(orderId, announcement._id, announcement.updatedAt)
    );
  };

  useEffect(() => {
    if (!orderId) return;

    const loadPopup = async () => {
      try {
        const response = await fetch(`/api/announcements/order-popup?orderId=${orderId}`, {
          credentials: "include",
        });

        if (!response.ok) return;

        const data = await response.json();
        if (!data?.popup) return;

        const seenKey = orderPopupSessionKey(
          orderId,
          data.popup._id,
          data.popup.updatedAt
        );
        if (sessionStorage.getItem(seenKey) === "1") return;

        setPopup(data.popup);
        setOpen(true);
      } catch (error) {
        console.error("Failed to load order news popup:", error);
      }
    };

    loadPopup();
  }, [orderId]);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value && popup) {
      sessionStorage.setItem(
        orderPopupSessionKey(orderId, popup._id, popup.updatedAt),
        "1"
      );
    }
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

        <div className="flex max-h-[min(92dvh,720px)] flex-col">
          <div className="relative shrink-0 border-b border-border/40 px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
            <button
              onClick={() => handleOpenChange(false)}
              aria-label="Close announcement"
              className="absolute right-3 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:right-5 sm:top-5"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative z-10 pr-10">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border bg-gradient-to-br shadow-sm",
                    meta.tone
                  )}
                >
                  <TypeIcon className="h-5 w-5" />
                </div>
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", meta.tone)}>
                  {meta.label}
                </span>
                {popup.targetLabel && (
                  <Badge variant="outline" className="gap-1 text-[11px]">
                    <Server className="h-3 w-3" />
                    {popup.targetLabel}
                  </Badge>
                )}
              </div>

              <DialogTitle className="text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl">
                {popup.title}
              </DialogTitle>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card px-4 py-4 sm:px-6 sm:py-5">
            <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-4 sm:px-5 sm:py-5">
              <NewsContent text={popup.content} />
            </div>
          </div>

          <div className="shrink-0 border-t border-border/40 bg-muted/15 px-4 py-3 sm:px-6 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
