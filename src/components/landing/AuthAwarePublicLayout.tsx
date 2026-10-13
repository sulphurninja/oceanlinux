"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import PublicPageLayout from "@/components/landing/PublicPageLayout";

const AUTH_ROUTES = ["/login", "/get-started", "/forgot-password", "/reset-password"];

export default function AuthAwarePublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  useEffect(() => {
    document.documentElement.classList.add("premium-landing-active");
    return () => {
      document.documentElement.classList.remove("premium-landing-active");
    };
  }, []);

  return (
    <PublicPageLayout
      className={isAuthPage ? "h-svh max-h-svh overflow-hidden w-full max-w-[100vw]" : "min-h-dvh w-full max-w-[100vw]"}
      showHeader={!isAuthPage}
      showFooter={!isAuthPage}
      showSupport={!isAuthPage}
    >
      {children}
    </PublicPageLayout>
  );
}
