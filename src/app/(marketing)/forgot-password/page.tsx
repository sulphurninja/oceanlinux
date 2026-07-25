'use client';

import { useEffect, useState } from 'react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  Shield,
  Key,
} from 'lucide-react';
import Link from 'next/link';
import PremiumAuthBackground from '@/components/landing/PremiumAuthBackground';
import Tilt3DCard from '@/components/landing/Tilt3DCard';
import { useHeroParallax } from '@/hooks/useTilt3D';

const trustItems = [
  { icon: Shield, label: "Secure reset" },
  { icon: Clock, label: "1-hour link" },
  { icon: Mail, label: "Email delivery" },
];

function AuthShell({
  children,
  mounted,
}: {
  children: React.ReactNode;
  mounted: boolean;
}) {
  const { ref, offset } = useHeroParallax<HTMLDivElement>(10);

  return (
    <div
      ref={ref}
      className="premium-auth-shell hero-premium-bg premium-auth-shell--centered flex-1 min-h-0 w-full max-w-full"
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
          {children}
        </Tilt3DCard>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsSubmitted(true);
      } else {
        setError(data.message || 'Failed to send reset email');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <AuthShell mounted={mounted}>
        <Card className="premium-auth-card border-0 shadow-none w-full">
          <CardHeader className="text-center space-y-3 px-5 sm:px-7 pt-7 pb-0">
            <Link href="/" className="inline-block mx-auto group">
              <img
                src="/ol.png"
                className="h-11 w-auto mx-auto mb-3 transition-transform duration-200 group-hover:scale-105"
                alt="OceanLinux"
              />
            </Link>
            <div className="mx-auto w-12 h-12 premium-icon-box rounded-full">
              <Mail className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl sm:text-2xl font-semibold tracking-tight">
                Check your email
              </CardTitle>
              <CardDescription className="text-sm text-white/50">
                Password reset instructions are on the way
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="px-5 sm:px-7 pb-6 pt-5 space-y-5">
            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-white/70 leading-relaxed">
                  If an account with <strong className="text-white">{email}</strong> exists,
                  you&apos;ll receive a reset link within a few minutes.
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm text-white/45">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Email delivery usually takes 1–2 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Reset link expires in 1 hour for security</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="premium-btn-outline w-full h-11 touch-manipulation"
              onClick={() => {
                setIsSubmitted(false);
                setEmail('');
              }}
            >
              Try again
            </Button>

            <p className="text-center text-xs sm:text-sm text-white/45">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to login
              </Link>
            </p>

            <div className="premium-auth-trust pt-5 border-t border-white/[0.06]">
              {trustItems.map((item) => (
                <div key={item.label} className="premium-auth-trust-item">
                  <item.icon />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell mounted={mounted}>
      <Card className="premium-auth-card border-0 shadow-none w-full">
        <CardHeader className="text-center space-y-3 px-5 sm:px-7 pt-7 pb-0">
          <Link href="/" className="inline-block mx-auto group">
            <img
              src="/ol.png"
              className="h-11 w-auto mx-auto mb-3 transition-transform duration-200 group-hover:scale-105"
              alt="OceanLinux"
            />
          </Link>
          <div className="mx-auto w-12 h-12 premium-icon-box rounded-full">
            <Key className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl sm:text-2xl font-semibold tracking-tight">
              Forgot password?
            </CardTitle>
            <CardDescription className="text-sm text-white/50">
              Enter your email and we&apos;ll send you a reset link
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-5 sm:px-7 pb-6 pt-5">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full text-base sm:text-sm"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            <Button
              type="submit"
              className="premium-btn-primary w-full h-11 text-sm sm:text-base mt-1 touch-manipulation"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                  Sending reset link...
                </>
              ) : (
                <>
                  Send reset link
                  <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs sm:text-sm text-white/45">
            Remember your password?{" "}
            <Link
              href="/login"
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>

          <p className="mt-3 text-center text-xs text-white/40">
            Don&apos;t have an account?{" "}
            <Link href="/get-started" className="text-emerald-400 hover:text-emerald-300">
              Create one free
            </Link>
          </p>

          <div className="mt-5 p-3.5 premium-inner-card text-center">
            <p className="text-xs font-medium text-white mb-1">Need help?</p>
            <p className="text-[11px] text-white/45 leading-relaxed mb-2">
              Check spam folder or verify your email address
            </p>
            <Link href="/live-chat" className="text-xs text-emerald-400 hover:text-emerald-300">
              Get live support
            </Link>
          </div>

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
    </AuthShell>
  );
}
