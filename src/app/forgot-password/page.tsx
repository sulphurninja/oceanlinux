'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mail,
  ArrowLeft,
  CheckCircle,
  Clock,
  Shield,
  Key
} from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsSubmitted(true);
      } else {
        setError(data.message || 'Failed to send reset email');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <img
            src='/bg.gif'
            className='absolute inset-0 w-full h-full object-cover opacity-20'
            alt="Background"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/90 to-background/95"></div>
        </div>

        <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription>
                We've sent password reset instructions to your email address
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  If an account with <strong>{email}</strong> exists, you'll receive a password reset link within a few minutes.
                </AlertDescription>
              </Alert>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Email delivery usually takes 1-2 minutes</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4" />
                  <span>Reset link expires in 1 hour for security</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-center text-sm text-muted-foreground">
                  Didn't receive the email? Check your spam folder or
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setIsSubmitted(false);
                    setEmail('');
                  }}
                >
                  Try Again
                </Button>
              </div>

              <div className="text-center">
                <Link href="/login" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src='/bg.gif'
          className='absolute inset-0 w-full h-full object-cover opacity-20'
          alt="Background"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/90 to-background/95"></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <img src="/oceanlinux.png" className="h-16 mx-auto mb-4" alt="OceanLinux" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">
                OceanLinux
              </h1>
              <p className="text-sm text-muted-foreground">The Ocean of Linux</p>
            </Link>
          </div>

          <Card className="shadow-2xl">
            <CardHeader className="space-y-4">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Key className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Forgot Password?</CardTitle>
                <CardDescription className="text-base">
                  No worries! Enter your email and we'll send you a reset link
                </CardDescription>
              </div>

              {/* Security Features */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Secure password reset process</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Link expires automatically for safety</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-purple-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Instant email delivery</span>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="Enter your registered email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12"
                    disabled={isLoading}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Sending Reset Link...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Reset Link
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6">
                <div className="text-center">
                  <Link href="/login" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Login
                  </Link>
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-muted-foreground">
                  Don't have an account?{' '}
                  <Link href="/get-started" className="text-primary hover:underline">
                    Sign up for free
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Help Section */}
          <div className="mt-8 text-center">
            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Need Help?</h3>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>• Check your spam/junk folder</p>
                <p>• Make sure you entered the correct email</p>
                <p>• Contact support if you still need help</p>
              </div>
              <Link href="/live-chat" className="inline-block mt-3 text-xs text-primary hover:underline">
                Get Live Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
