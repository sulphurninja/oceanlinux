'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield,
  Clock,
  Activity,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import PremiumAuthBackground from '@/components/landing/PremiumAuthBackground';
import { JUST_LOGGED_IN_KEY, LOGIN_POPUP_SHOWN_KEY, POST_LOGIN_SPLASH_DONE_KEY, setPostLoginLoadingScreen } from '@/lib/post-login';
import Tilt3DCard from '@/components/landing/Tilt3DCard';
import { useHeroParallax } from '@/hooks/useTilt3D';
import { AuthDivider, GoogleSignInButton } from '@/components/auth/GoogleSignIn';

const trustItems = [
  { icon: Shield, label: "Encrypted login" },
  { icon: Activity, label: "99.9% uptime" },
  { icon: Clock, label: "24/7 support" },
];

function resolveSafeReturnPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

function resolvePostLoginPath(
  userType: string | undefined,
  returnToParam: string | null
): string {
  const fromQuery = resolveSafeReturnPath(returnToParam);
  if (fromQuery) return fromQuery;

  try {
    const stored = localStorage.getItem('redirectAfterLogin');
    const fromStorage = resolveSafeReturnPath(stored);
    if (fromStorage) {
      localStorage.removeItem('redirectAfterLogin');
      return fromStorage;
    }
  } catch {
    /* ignore */
  }

  return userType === 'reseller' ? '/dashboard/reseller-wallet' : '/dashboard';
}

function LoginPage({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const { ref, offset } = useHeroParallax<HTMLDivElement>(10);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const response = await fetch('/api/users/me', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          router.replace(resolvePostLoginPath(data?.userType, returnTo));
        }
      } catch {
        /* not logged in or server unavailable */
      }
    };
    checkUser();
  }, [router, returnTo]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const text = await response.text();
      let data: { message?: string; result?: { userType?: string } } = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }

      if (response.ok) {
        sessionStorage.removeItem(LOGIN_POPUP_SHOWN_KEY);
        sessionStorage.removeItem(POST_LOGIN_SPLASH_DONE_KEY);
        const path = resolvePostLoginPath(data.result?.userType, returnTo);
        const isDashboard = path.startsWith('/dashboard');
        if (isDashboard) {
          sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
          setPostLoginLoadingScreen();
        }
        router.replace(path);
        return;
      }

      setError(data.message || 'Invalid email or password.');
    } catch {
      setError('Unable to reach the server. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "premium-auth-shell hero-premium-bg premium-auth-shell--centered flex-1 min-h-0 w-full max-w-full",
        className
      )}
      {...props}
    >
      <PremiumAuthBackground parallaxX={offset.x} parallaxY={offset.y} />

      <Link href="/" className="premium-auth-back">
        <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
        Back to home
      </Link>

      <div
        className={cn(
          "premium-auth-inner",
          mounted && "animate-slide-up opacity-0 stagger-1 [animation-fill-mode:forwards]"
        )}
      >
        <Tilt3DCard interactive={false} glow={false} glareTone="none" className="w-full max-w-full">
          <Card className="premium-auth-card border-0 shadow-none w-full">
            <CardHeader className="text-center space-y-2 px-5 sm:px-6 pt-5 sm:pt-6 pb-0">
              <Link href="/" className="inline-block mx-auto group">
                <img
                  src="/ol.png"
                  className="h-10 w-auto mx-auto mb-2 transition-transform duration-200 group-hover:scale-105"
                  alt="OceanLinux"
                />
              </Link>
              <div className="space-y-0.5">
                <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">
                  Welcome back
                </CardTitle>
                <CardDescription className="text-sm text-white/50">
                  Sign in to your OceanLinux dashboard
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-5 sm:px-6 pb-5 pt-4">
              <div className={cn(isGoogleLoading && "pointer-events-none opacity-60")}>
                <GoogleSignInButton
                  mode="login"
                  returnTo={returnTo}
                  disabled={isLoading || isGoogleLoading}
                  onLoadingChange={setIsGoogleLoading}
                  onError={setError}
                />
              </div>

              <AuthDivider />

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {error && (
                  <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10">
                    <p className="text-red-300 text-sm leading-relaxed">{error}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-white/70 text-sm">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-11 w-full text-base sm:text-sm"
                    disabled={isLoading || isGoogleLoading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <Label htmlFor="password" className="text-white/70 text-sm shrink-0">
                      Password
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-emerald-400/90 hover:text-emerald-300 transition-colors shrink-0"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="h-11 pr-11 w-full text-base sm:text-sm"
                      disabled={isLoading || isGoogleLoading}
                      autoComplete="current-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-11 w-11 px-0 text-white/45 hover:text-white hover:bg-transparent touch-manipulation"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading || isGoogleLoading}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="premium-btn-primary w-full h-11 text-sm sm:text-base mt-1 touch-manipulation"
                  disabled={isLoading || isGoogleLoading}
                  >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in to dashboard
                      <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs sm:text-sm text-white/45">
                Don&apos;t have an account?{" "}
                <Link
                  href="/get-started"
                  className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                >
                  Create one free
                </Link>
              </p>

              <div className="premium-auth-trust mt-4 pt-4 border-t border-white/[0.06]">
                {trustItems.map((item) => (
                  <div key={item.label} className="premium-auth-trust-item">
                    <item.icon />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Tilt3DCard>
      </div>
    </div>
  );
}

export default LoginPage;
