"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Megaphone, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl [&>button[class*='absolute']]:hidden">
        {/* Header banner */}
        <div className="relative bg-gradient-to-br from-primary via-primary/90 to-primary/80 px-8 py-8 text-primary-foreground">
          <div className="absolute top-4 right-4">
            <button
              onClick={() => handleOpenChange(false)}
              className="rounded-full bg-white/20 p-1.5 backdrop-blur-sm transition-colors hover:bg-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Megaphone className="h-6 w-6" />
            </div>
            <Badge variant="secondary" className="bg-white/20 text-white border-0 backdrop-blur-sm text-xs">
              News
            </Badge>
          </div>

          <h2 className="text-2xl font-bold leading-tight">{popup.title}</h2>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          <p className="text-[15px] leading-relaxed text-muted-foreground whitespace-pre-line">
            {popup.content}
          </p>

          {/* WhatsApp community banner */}
          {popup.communityLink && (
            <a
              href={popup.communityLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-xl border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-5 py-4 transition-all hover:border-green-300 hover:shadow-md dark:border-green-800 dark:from-green-950/40 dark:to-emerald-950/40 dark:hover:border-green-700"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-200 dark:shadow-green-900/40">
                <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
                  <path
                    fill="#fff"
                    d="M16 3C8.82 3 3 8.73 3 15.8c0 2.49.73 4.9 2.12 6.96L3 29l6.43-2.02A13.16 13.16 0 0 0 16 28.6c7.18 0 13-5.73 13-12.8S23.18 3 16 3Z"
                  />
                  <path
                    fill="#25D366"
                    d="M23.36 19.37c-.3-.15-1.77-.86-2.05-.96-.27-.1-.47-.15-.66.15-.2.3-.76.96-.93 1.16-.17.2-.35.22-.65.07-.3-.15-1.24-.45-2.36-1.44-.87-.77-1.46-1.72-1.63-2.02-.17-.3-.02-.47.13-.62.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.57-.9-2.15-.24-.58-.49-.5-.66-.51h-.56c-.2 0-.52.07-.8.37-.27.3-1.04 1-1.04 2.44s1.07 2.82 1.22 3.02c.15.2 2.1 3.36 5.2 4.58.74.29 1.32.46 1.77.59.75.2 1.43.17 1.97.1.6-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.13-.27-.2-.56-.35Z"
                  />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-green-800 dark:text-green-300">Join Our Community</p>
                <p className="text-sm text-green-600 dark:text-green-400">Connect with us on WhatsApp</p>
              </div>

              <ExternalLink className="h-4 w-4 text-green-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="text-muted-foreground"
            >
              Dismiss
            </Button>
            {popup.actionUrl && (
              <Button asChild size="lg" className="gap-2 px-6">
                <a href={popup.actionUrl} target="_blank" rel="noopener noreferrer">
                  {popup.actionText || "Learn More"}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
