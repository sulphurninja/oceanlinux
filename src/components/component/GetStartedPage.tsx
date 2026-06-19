'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Clock,
  Zap,
  Star,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import PremiumAuthBackground from '@/components/landing/PremiumAuthBackground';
import PremiumPostLoginSplash from '@/components/landing/PremiumPostLoginSplash';
import Tilt3DCard from '@/components/landing/Tilt3DCard';
import { useHeroParallax } from '@/hooks/useTilt3D';
import { JUST_LOGGED_IN_KEY, LOGIN_POPUP_SHOWN_KEY, POST_LOGIN_SPLASH_DONE_KEY } from '@/lib/post-login';

const trustItems = [
  { icon: Zap, label: "Instant setup" },
  { icon: Activity, label: "99.9% uptime" },
  { icon: Clock, label: "24/7 support" },
];

function formatPlanName(plan: string) {
  return plan.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function GetStartedPage({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPostLoginSplash, setShowPostLoginSplash] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ref, offset } = useHeroParallax(10);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const plan = searchParams.get('plan');
    if (plan) {
      setSelectedPlan(plan);
    }

    const checkUser = async () => {
      const response = await fetch('/api/users/me');
      if (response.ok) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, [searchParams, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        sessionStorage.removeItem(LOGIN_POPUP_SHOWN_KEY);
        sessionStorage.removeItem(POST_LOGIN_SPLASH_DONE_KEY);
        sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
        setShowPostLoginSplash(true);
        setIsLoading(false);
        return;
      } else {
        setError(data.message || 'An error occurred during signup.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {showPostLoginSplash && (
        <PremiumPostLoginSplash
          active
          title="Welcome aboard"
          onComplete={() => router.push('/dashboard')}
        />
      )}
    <div
      ref={ref}
      className={cn(
        "premium-auth-shell hero-premium-bg premium-auth-shell--centered h-full",
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
          "premium-auth-inner premium-auth-inner--signup",
          mounted && "animate-slide-up opacity-0 stagger-1 [animation-fill-mode:forwards]"
        )}
      >
        <Tilt3DCard maxTilt={4} scale={1.008} glow glareTone="emerald" maxGlare={0.09} className="w-full">
          <Card className="premium-auth-card border-0 shadow-none w-full">
            <CardHeader className="text-center space-y-3 px-5 sm:px-7 pt-7 pb-0">
              <Link href="/" className="inline-block mx-auto group">
                <img
                  src="/ol.png"
                  className="h-11 w-auto mx-auto mb-3 transition-transform duration-200 group-hover:scale-105"
                  alt="OceanLinux"
                />
              </Link>
              <div className="space-y-1">
                <CardTitle className="text-xl sm:text-2xl font-semibold tracking-tight">
                  Create your account
                </CardTitle>
                <CardDescription className="text-sm text-white/50">
                  Start your Linux VPS journey in minutes
                </CardDescription>
              </div>

              {selectedPlan && (
                <div className="p-3 premium-inner-card border border-emerald-400/20 text-left">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium text-white">
                      Selected plan: {formatPlanName(selectedPlan)}
                    </span>
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="px-5 sm:px-7 pb-6 pt-5">
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {error && (
                  <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10">
                    <p className="text-red-300 text-sm leading-relaxed">{error}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-white/70 text-sm">
                    Full name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    required
                    placeholder="Your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-11 w-full text-base sm:text-sm"
                    disabled={isLoading}
                    autoComplete="name"
                  />
                </div>

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
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-white/70 text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      placeholder="Create a strong password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="h-11 pr-11 w-full text-base sm:text-sm"
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-11 w-11 px-0 text-white/45 hover:text-white hover:bg-transparent touch-manipulation"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-white/40">Must be at least 8 characters</p>
                </div>

                <Button
                  type="submit"
                  className="premium-btn-primary w-full h-11 text-sm sm:text-base mt-1 touch-manipulation"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      <span className="sm:hidden">Create account</span>
                      <span className="hidden sm:inline">Create account &amp; get started</span>
                      <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-5 text-center text-xs sm:text-sm text-white/45">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                >
                  Sign in
                </Link>
              </p>

              <p className="mt-4 text-center text-[11px] sm:text-xs text-white/35 leading-relaxed px-1">
                By creating an account, you agree to our{" "}
                <Link href="/terms-and-conditions" className="text-emerald-400/90 hover:text-emerald-300">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy-policy" className="text-emerald-400/90 hover:text-emerald-300">
                  Privacy Policy
                </Link>
              </p>

              <div className="premium-auth-trust mt-5 pt-5 border-t border-white/[0.06]">
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
    </>
  );
}

export default GetStartedPage;
