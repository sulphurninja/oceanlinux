import AuthAwarePublicLayout from "@/components/landing/AuthAwarePublicLayout";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthAwarePublicLayout>{children}</AuthAwarePublicLayout>;
}
