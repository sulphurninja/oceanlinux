"use client";

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

  return (
    <PublicPageLayout
      className={isAuthPage ? "h-dvh overflow-hidden" : "min-h-dvh"}
      showHeader={!isAuthPage}
      showFooter={!isAuthPage}
      showSupport={!isAuthPage}
    >
      {children}
    </PublicPageLayout>
  );
}
