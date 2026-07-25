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
  Zap,
  Star,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Activity,
  Check,
  X,
} from 'lucide-react';
import Link from 'next/link';
import PremiumAuthBackground from '@/components/landing/PremiumAuthBackground';
import Tilt3DCard from '@/components/landing/Tilt3DCard';
import { useHeroParallax } from '@/hooks/useTilt3D';
import { JUST_LOGGED_IN_KEY, LOGIN_POPUP_SHOWN_KEY, POST_LOGIN_SPLASH_DONE_KEY, setPostLoginLoadingScreen } from '@/lib/post-login';
import { AuthDivider, GoogleSignInButton } from '@/components/auth/GoogleSignIn';

const trustItems = [
  { icon: Shield, label: "Secure signup" },
  { icon: Zap, label: "Instant setup" },
  { icon: Activity, label: "99.9% uptime" },
];

function formatPlanName(plan: string) {
  return plan.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

type SignupFormData = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    number: /\d/.test(password),
  };
}

function validateSignupForm(formData: SignupFormData) {
  const errors: Partial<Record<keyof SignupFormData, string>> = {};
  const name = formData.name.trim();

  if (!name) {
    errors.name = 'Full name is required';
  } else if (name.length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  const email = formData.email.trim();
  if (!email) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address';
  }

  const checks = getPasswordChecks(formData.password);
  if (!formData.password) {
    errors.password = 'Password is required';
  } else if (!checks.length || !checks.letter || !checks.number) {
    errors.password = 'Use at least 8 characters with letters and numbers';
  }

  if (!formData.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password';
  } else if (formData.confirmPassword !== formData.password) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

function GetStartedPage({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [formData, setFormData] = useState<SignupFormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SignupFormData, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ref, offset } = useHeroParallax<HTMLDivElement>(10);
  const passwordChecks = getPasswordChecks(formData.password);
  const passwordsMatch =
    formData.confirmPassword.length > 0 && formData.confirmPassword === formData.password;

  const updateField = (field: keyof SignupFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (error) setError('');
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const plan = searchParams.get('plan');
    if (plan) {
      setSelectedPlan(plan);
    }

    const checkUser = async () => {
      try {
        const response = await fetch('/api/users/me', { credentials: 'include' });
        if (response.ok) {
          router.replace('/dashboard');
        }
      } catch {
        /* not logged in */
      }
    };
    checkUser();
  }, [searchParams, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationErrors = validateSignupForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError('Please fix the highlighted fields.');
      return;
    }

    setIsLoading(true);
    setError('');
    setFieldErrors({});

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
        }),
      });

      const text = await response.text();
      let data: { message?: string } = {};
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
        sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
        setPostLoginLoadingScreen();
        router.replace('/dashboard');
        return;
      }

      setError(data.message || 'An error occurred during signup.');
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        "premium-auth-shell premium-auth-shell--signup hero-premium-bg premium-auth-shell--centered flex-1 min-h-0 w-full max-w-full",
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
        <Tilt3DCard interactive={false} glow={false} glareTone="none" innerClassName="overflow-visible" className="w-full max-w-full">
          <Card className="premium-auth-card premium-auth-card--signup border-0 shadow-none w-full">
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
                  Create your account
                </CardTitle>
                <CardDescription className="text-sm text-white/50">
                  Start your Linux VPS journey in minutes
                </CardDescription>
              </div>

              {selectedPlan && (
                <div className="p-2.5 premium-inner-card border border-emerald-400/20 text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <Star className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-medium text-white truncate">
                      Selected plan: {formatPlanName(selectedPlan)}
                    </span>
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="px-5 sm:px-6 pb-5 pt-4">
              {error && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 mb-3">
                  <p className="text-red-300 text-sm leading-relaxed">{error}</p>
                </div>
              )}

              <div className={cn(isGoogleLoading && "pointer-events-none opacity-60")}>
                <GoogleSignInButton
                  mode="signup"
                  disabled={isLoading || isGoogleLoading}
                  onLoadingChange={setIsGoogleLoading}
                  onError={setError}
                />
              </div>

              <AuthDivider />

              <form onSubmit={handleSubmit} className="space-y-3" noValidate>
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
                    onChange={(e) => updateField('name', e.target.value)}
                    className={cn(
                      "h-10 w-full text-sm",
                      fieldErrors.name && "border-red-400/60 focus-visible:ring-red-400/40"
                    )}
                    disabled={isLoading || isGoogleLoading}
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                  />
                  {fieldErrors.name && (
                    <p className="text-xs text-red-300">{fieldErrors.name}</p>
                  )}
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
                    onChange={(e) => updateField('email', e.target.value)}
                    className={cn(
                      "h-10 w-full text-sm",
                      fieldErrors.email && "border-red-400/60 focus-visible:ring-red-400/40"
                    )}
                    disabled={isLoading || isGoogleLoading}
                    autoComplete="email"
                    aria-invalid={Boolean(fieldErrors.email)}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-red-300">{fieldErrors.email}</p>
                  )}
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
                      onChange={(e) => updateField('password', e.target.value)}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      className={cn(
                        "h-10 pr-10 w-full text-sm",
                        fieldErrors.password && "border-red-400/60 focus-visible:ring-red-400/40"
                      )}
                      disabled={isLoading || isGoogleLoading}
                      autoComplete="new-password"
                      aria-invalid={Boolean(fieldErrors.password)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-10 w-10 px-0 text-white/45 hover:text-white hover:bg-transparent touch-manipulation"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading || isGoogleLoading}
                      aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-xs text-red-300">{fieldErrors.password}</p>
                  )}
                  {(passwordFocused || formData.password.length > 0) && (
                    <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {[
                        { key: 'length', label: '8+ chars', ok: passwordChecks.length },
                        { key: 'letter', label: 'Letter', ok: passwordChecks.letter },
                        { key: 'number', label: 'Number', ok: passwordChecks.number },
                      ].map((rule) => (
                        <li
                          key={rule.key}
                          className={cn(
                            "flex items-center gap-1 text-[11px]",
                            rule.ok ? "text-emerald-400/90" : "text-white/35"
                          )}
                        >
                          {rule.ok ? (
                            <Check className="w-3 h-3 shrink-0" />
                          ) : (
                            <X className="w-3 h-3 shrink-0 opacity-60" />
                          )}
                          <span>{rule.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-white/70 text-sm">
                    Confirm password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Re-enter your password"
                      value={formData.confirmPassword}
                      onChange={(e) => updateField('confirmPassword', e.target.value)}
                      className={cn(
                        "h-10 pr-10 w-full text-sm",
                        fieldErrors.confirmPassword && "border-red-400/60 focus-visible:ring-red-400/40",
                        passwordsMatch && "border-emerald-400/50 focus-visible:ring-emerald-400/30"
                      )}
                      disabled={isLoading || isGoogleLoading}
                      autoComplete="new-password"
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    />
                    {passwordsMatch && (
                      <Check className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
                    )}
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs text-red-300">{fieldErrors.confirmPassword}</p>
                  )}
                  {!fieldErrors.confirmPassword && formData.confirmPassword && !passwordsMatch && (
                    <p className="text-xs text-amber-300/90">Passwords must match</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="premium-btn-primary w-full h-10 text-sm mt-1 touch-manipulation"
                  disabled={isLoading || isGoogleLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create account
                      <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs sm:text-sm text-white/45">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                >
                  Sign in
                </Link>
              </p>

              <p className="mt-2 text-center text-[11px] text-white/35 leading-snug">
                By signing up you agree to our{" "}
                <Link href="/terms-and-conditions" className="text-emerald-400/90 hover:text-emerald-300">
                  Terms
                </Link>{" "}
                &{" "}
                <Link href="/privacy-policy" className="text-emerald-400/90 hover:text-emerald-300">
                  Privacy
                </Link>
              </p>

              <div className="premium-auth-trust premium-auth-trust--inline mt-4 pt-4 border-t border-white/[0.06]">
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

export default GetStartedPage;
