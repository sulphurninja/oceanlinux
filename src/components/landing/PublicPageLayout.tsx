import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import FloatingSupport from "@/components/component/floating-support";
import { cn } from "@/lib/utils";

type PublicPageLayoutProps = {
  children: React.ReactNode;
  showHeader?: boolean;
  showFooter?: boolean;
  showSupport?: boolean;
  className?: string;
};

export default function PublicPageLayout({
  children,
  showHeader = true,
  showFooter = true,
  showSupport = true,
  className,
}: PublicPageLayoutProps) {
  return (
    <div className={cn("premium-landing flex flex-col overflow-x-hidden min-w-0 w-full max-w-[100vw]", className ?? "min-h-dvh")}>
      {showHeader && <Header />}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden">{children}</main>
      {showFooter && <Footer />}
      {showSupport && <FloatingSupport />}
    </div>
  );
}
