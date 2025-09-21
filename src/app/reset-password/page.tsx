'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Eye,
  EyeOff,
  Key,
  CheckCircle,
  Shield,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

function ResetPasswordForm() {
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [token]);

  const validatePassword = (password: string) => {
    const errors = [];
    if (password.length < 6) errors.push('At least 6 characters');
    if (!/(?=.*[a-z])/.test(password)) errors.push('One lowercase letter');
    if (!/(?=.*[A-Z])/.test(password)) errors.push('One uppercase letter');
    if (!/(?=.*\d)/.test(password)) errors.push('One number');
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordErrors = validatePassword(formData.newPassword);
    if (passwordErrors.length > 0) {
      setError(`Password must contain: ${passwordErrors.join(', ')}`);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          newPassword: formData.newPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError(data.message || 'Failed to reset password');
        if (data.message?.includes('Invalid or expired')) {
          setTokenValid(false);
        }
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!tokenValid) {
    return (
      <div className="relative min-h-screen overflow-hidden">
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
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error || 'The reset link may have expired or already been used.'}
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Link href="/forgot-password">
                  <Button className="w-full">
                    Request New Reset Link
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    Back to Login
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="relative min-h-screen overflow-hidden">
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
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl">Password Reset Successful!</CardTitle>
              <CardDescription>
                Your password has been successfully updated
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  You can now log in with your new password. Redirecting to login page...
                </AlertDescription>
              </Alert>

              <Link href="/login">
                <Button className="w-full">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Continue to Login
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const passwordStrength = formData.newPassword ? validatePassword(formData.newPassword) : [];

  return (
    <div className="relative min-h-screen overflow-hidden">
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
                <CardTitle className="text-2xl">Set New Password</CardTitle>
                <CardDescription className="text-base">
                  Create a strong, secure password for your account
                </CardDescription>
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
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Enter your new password"
                      value={formData.newPassword}
                      onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                      className="h-12 pr-10"
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-12 px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>

                  {/* Password Strength Indicator */}
                  {formData.newPassword && (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">Password requirements:</div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className={`flex items-center gap-1 ${formData.newPassword.length >= 6 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {formData.newPassword.length >= 6 ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                          6+ characters
                        </div>
                        <div className={`flex items-center gap-1 ${/(?=.*[a-z])/.test(formData.newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {/(?=.*[a-z])/.test(formData.newPassword) ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                          Lowercase
                        </div>
                        <div className={`flex items-center gap-1 ${/(?=.*[A-Z])/.test(formData.newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {/(?=.*[A-Z])/.test(formData.newPassword) ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                          Uppercase
                        </div>
                        <div className={`flex items-center gap-1 ${/(?=.*\d)/.test(formData.newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {/(?=.*\d)/.test(formData.newPassword) ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                          Number
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      placeholder="Confirm your new password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="h-12 pr-10"
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-12 px-3"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>

                  {/* Password Match Indicator */}
                  {formData.confirmPassword && (
                    <div className={`flex items-center gap-2 text-xs ${
                      formData.newPassword === formData.confirmPassword ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formData.newPassword === formData.confirmPassword ?
                        <CheckCircle className="w-3 h-3" /> :
                        <AlertCircle className="w-3 h-3" />
                      }
                      {formData.newPassword === formData.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  disabled={isLoading || passwordStrength.length > 0 || formData.newPassword !== formData.confirmPassword}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      Update Password
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/login" className="text-sm text-primary hover:underline">
                  Back to Login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
