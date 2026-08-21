import AuthAwarePublicLayout from "@/components/landing/AuthAwarePublicLayout";
import { GoogleAuthProvider } from "@/components/auth/GoogleSignIn";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GoogleAuthProvider>
      <AuthAwarePublicLayout>{children}</AuthAwarePublicLayout>
    </GoogleAuthProvider>
  );
}
