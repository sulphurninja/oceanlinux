'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  KeyRound,
  Loader2,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
  met?: boolean;
}

const ChangePasswordPage = () => {
  const router = useRouter();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Password requirements
  const requirements: PasswordRequirement[] = [
    {
      label: 'At least 8 characters long',
      test: (password) => password.length >= 8
    },
    {
      label: 'Contains uppercase letter',
      test: (password) => /[A-Z]/.test(password)
    },
    {
      label: 'Contains lowercase letter',
      test: (password) => /[a-z]/.test(password)
    },
    {
      label: 'Contains number',
      test: (password) => /\d/.test(password)
    },
    {
      label: 'Contains special character (!@#$%^&*)',
      test: (password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    }
  ];

  // Check which requirements are met
  const getRequirementStatus = () => {
    return requirements.map(req => ({
      ...req,
      met: req.test(formData.newPassword)
    }));
  };

  // Calculate password strength
  const getPasswordStrength = () => {
    const metRequirements = getRequirementStatus().filter(req => req.met).length;
    if (metRequirements === 0) return { level: 0, label: '', color: '' };
    if (metRequirements <= 2) return { level: 1, label: 'Weak', color: 'text-red-500' };
    if (metRequirements <= 3) return { level: 2, label: 'Fair', color: 'text-yellow-500' };
    if (metRequirements <= 4) return { level: 3, label: 'Good', color: 'text-blue-500' };
    return { level: 4, label: 'Strong', color: 'text-green-500' };
  };

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (getRequirementStatus().some(req => !req.met)) {
      newErrors.newPassword = 'Password does not meet all requirements';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (formData.currentPassword === formData.newPassword) {
      newErrors.newPassword = 'New password must be different from current password';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors below');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Password changed successfully!', {
          description: 'You will be logged out for security reasons.'
        });

        // Clear form
        setFormData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });

        // Redirect to login after a short delay
        setTimeout(() => {
          router.push('/auth/login');
        }, 2000);
      } else {
        toast.error(data.message || 'Failed to change password');
        if (data.message?.includes('current password')) {
          setErrors({ currentPassword: 'Current password is incorrect' });
        }
      }
    } catch (error) {
      console.error('Change password error:', error);
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear specific error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const passwordStrength = getPasswordStrength();
  const requirementStatus = getRequirementStatus();

  return (
    <div className='min-h-screen bg-background'>
      {/* Mobile Header */}
      <div className="lg:hidden h-16" />

      {/* Header */}
      <div className='sticky md:hidden lg:top-0 z-40 bg-background/95 backdrop-blur-sm shadow-sm border-b border-border'>
        <div className='container mx-auto -mt-14 md:mt-0 px-3 sm:px-4 md:px-6 lg:px-8'>
          <div className='flex h-14 sm:h-16 items-center gap-2 sm:gap-4'>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="hover:bg-muted rounded-full flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <Lock className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className='text-base sm:text-lg lg:text-xl font-bold'>Change Password</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">
                  Update your account security
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className='container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6'>
        <div className="max-w-2xl mx-auto">
          {/* Security Alert */}
          <Alert className="mb-6">
            <Shield className="h-4 w-4" />
            <AlertTitle>Security Notice</AlertTitle>
            <AlertDescription>
              After changing your password, you'll be automatically logged out from all devices for security reasons.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Update Your Password
              </CardTitle>
              <CardDescription>
                Choose a strong password to keep your account secure. Make sure it's something you haven't used before.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Current Password */}
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPasswords.current ? 'text' : 'password'}
                      value={formData.currentPassword}
                      onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                      placeholder="Enter your current password"
                      className={cn(
                        "pr-10",
                        errors.currentPassword && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => togglePasswordVisibility('current')}
                    >
                      {showPasswords.current ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {errors.currentPassword && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      {errors.currentPassword}
                    </p>
                  )}
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPasswords.new ? 'text' : 'password'}
                      value={formData.newPassword}
                      onChange={(e) => handleInputChange('newPassword', e.target.value)}
                      placeholder="Enter your new password"
                      className={cn(
                        "pr-10",
                        errors.newPassword && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => togglePasswordVisibility('new')}
                    >
                      {showPasswords.new ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>

                  {/* Password Strength Indicator */}
                  {formData.newPassword && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Password strength:</span>
                        <Badge variant="outline" className={passwordStrength.color}>
                          {passwordStrength.label}
                        </Badge>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={cn(
                            "h-2 rounded-full transition-all duration-300",
                            passwordStrength.level === 1 && "w-1/4 bg-red-500",
                            passwordStrength.level === 2 && "w-2/4 bg-yellow-500",
                            passwordStrength.level === 3 && "w-3/4 bg-blue-500",
                            passwordStrength.level === 4 && "w-full bg-green-500"
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {errors.newPassword && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      {errors.newPassword}
                    </p>
                  )}
                </div>

                {/* Password Requirements */}
                {formData.newPassword && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Password Requirements</Label>
                    <div className="grid gap-2">
                      {requirementStatus.map((req, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          {req.met ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className={req.met ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      placeholder="Confirm your new password"
                      className={cn(
                        "pr-10",
                        errors.confirmPassword && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => togglePasswordVisibility('confirm')}
                    >
                      {showPasswords.confirm ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>

                  {formData.confirmPassword && formData.newPassword === formData.confirmPassword && (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Passwords match
                    </p>
                  )}

                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                {/* Security Tip */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Security Tip</AlertTitle>
                  <AlertDescription>
                    Use a unique password that you don't use for other accounts. Consider using a password manager to generate and store strong passwords.
                  </AlertDescription>
                </Alert>

                {/* Submit Button */}
                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={loading || Object.keys(errors).length > 0}
                    className="flex-1 sm:flex-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Changing Password...
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Change Password
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
