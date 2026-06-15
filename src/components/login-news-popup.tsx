"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Megaphone, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoginPopupAnnouncement = {
  _id: string;
  title: string;
  content: string;
  communityLink?: string;
  actionText?: string;
  actionUrl?: string;
};

const JUST_LOGGED_IN_KEY = "justLoggedIn";
const LOGIN_POPUP_SHOWN_KEY = "loginPopupShownInSession";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        fill="#fff"
        d="M16 3C8.82 3 3 8.73 3 15.8c0 2.49.73 4.9 2.12 6.96L3 29l6.43-2.02A13.16 13.16 0 0 0 16 28.6c7.18 0 13-5.73 13-12.8S23.18 3 16 3Z"
      />
      <path
        fill="#25D366"
        d="M23.36 19.37c-.3-.15-1.77-.86-2.05-.96-.27-.1-.47-.15-.66.15-.2.3-.76.96-.93 1.16-.17.2-.35.22-.65.07-.3-.15-1.24-.45-2.36-1.44-.87-.77-1.46-1.72-1.63-2.02-.17-.3-.02-.47.13-.62.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.57-.9-2.15-.24-.58-.49-.5-.66-.51h-.56c-.2 0-.52.07-.8.37-.27.3-1.04 1-1.04 2.44s1.07 2.82 1.22 3.02c.15.2 2.1 3.36 5.2 4.58.74.29 1.32.46 1.77.59.75.2 1.43.17 1.97.1.6-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.13-.27-.2-.56-.35Z"
      />
    </svg>
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden border-0 shadow-2xl bg-background",
          "w-[calc(100vw-1rem)] max-w-none",
          "fixed left-1/2 bottom-2 top-auto translate-x-[-50%] translate-y-0",
          "max-h-[min(92dvh,720px)] rounded-2xl",
          "data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
          "sm:bottom-auto sm:top-1/2 sm:translate-y-[-50%] sm:max-w-xl md:max-w-2xl",
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
          "[&>button[class*='absolute']]:hidden"
        )}
      >
        <div className="flex max-h-[min(92dvh,720px)] flex-col">
          {/* Header */}
          <div className="relative shrink-0 overflow-hidden px-4 pb-5 pt-4 sm:px-7 sm:pb-7 sm:pt-6">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/85 to-violet-600" />
            <div
              className="absolute inset-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute -bottom-8 left-1/4 h-32 w-32 rounded-full bg-violet-300/30 blur-3xl" />

            <button
              onClick={() => handleOpenChange(false)}
              aria-label="Close announcement"
              className={cn(
                "absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full",
                "bg-black/20 text-white backdrop-blur-md transition-all",
                "hover:bg-black/30 hover:scale-105 active:scale-95",
                "sm:right-5 sm:top-5"
              )}
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className={cn(
                "relative z-10 transition-all duration-500 ease-out",
                entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              )}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2.5 pr-10">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 shadow-lg shadow-black/10 backdrop-blur-sm ring-1 ring-white/30 sm:h-12 sm:w-12">
                  <Megaphone className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white ring-1 ring-white/25 backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                  </span>
                  Latest News
                </span>
              </div>

              <DialogTitle className="pr-8 text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl md:text-[1.65rem]">
                {popup.title}
              </DialogTitle>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-5">
            <div
              className={cn(
                "transition-all duration-500 delay-75 ease-out",
                entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              )}
            >
              <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-4 sm:px-5 sm:py-5">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  What&apos;s new
                </div>
                <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line sm:text-[15px] sm:leading-7">
                  {popup.content}
                </p>
              </div>

              {popup.communityLink && (
                <a
                  href={popup.communityLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group mt-4 flex items-center gap-3 rounded-xl border p-3.5 transition-all sm:gap-4 sm:p-4",
                    "border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-green-50",
                    "hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-100/60",
                    "dark:border-emerald-800/60 dark:from-emerald-950/50 dark:to-green-950/40",
                    "dark:hover:border-emerald-700 dark:hover:shadow-emerald-950/30"
                  )}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25D366] shadow-lg shadow-emerald-200/80 transition-transform group-hover:scale-105 sm:h-12 sm:w-12 dark:shadow-emerald-950/50">
                    <WhatsAppIcon className="h-6 w-6" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-emerald-900 dark:text-emerald-200 sm:text-base">
                      Join Our Community
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 sm:text-sm">
                      Get updates & support on WhatsApp
                    </p>
                  </div>

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 transition-all group-hover:bg-emerald-200 group-hover:translate-x-0.5 dark:bg-emerald-900/50 dark:text-emerald-300">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className={cn(
              "shrink-0 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4",
              "transition-all duration-500 delay-150 ease-out",
              entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            )}
          >
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="h-11 w-full text-muted-foreground sm:h-10 sm:w-auto"
              >
                Dismiss
              </Button>
              {popup.actionUrl && (
                <Button asChild className="h-11 w-full gap-2 sm:h-10 sm:w-auto sm:px-6">
                  <a href={popup.actionUrl} target="_blank" rel="noopener noreferrer">
                    {popup.actionText || "Learn More"}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile drag handle hint */}
        <div className="absolute left-1/2 top-1.5 z-30 h-1 w-10 -translate-x-1/2 rounded-full bg-white/40 sm:hidden" />
      </DialogContent>
    </Dialog>
  );
}
