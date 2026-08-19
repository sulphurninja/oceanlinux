'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    User,
    Mail,
    Shield,
    Key,
    Bell,
    Palette,
    Globe,
    Activity,
    Save,
    RefreshCw,
    Edit3,
    Check,
    X,
    Eye,
    EyeOff,
    Calendar,
    MapPin,
    Phone,
    Building,
    CreditCard,
    Settings,
    Download,
    Upload,
    Camera,
    Trash2,
    Link,
    Github,
    Twitter,
    Linkedin,
    ExternalLink,
    Moon,
    Sun,
    Monitor,
    Zap,
    Target,
    TrendingUp,
    Award,
    Clock,
    Server,
    DollarSign,
    AlertCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import { useSessionAlert } from '@/components/session-alert';
import { dashboardFetch } from '@/lib/dashboardFetch';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import RealActivityFeed from '@/components/real-activity-feed';

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

interface BillingAddress {
    line?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
}

interface UserProfile {
    _id?: string;
    name: string;
    email: string;
    avatar?: string;
    bio?: string;
    location?: string;
    phone?: string;
    company?: string;
    website?: string;
    billingAddress?: BillingAddress;
    socialLinks?: {
        github?: string;
        twitter?: string;
        linkedin?: string;
    };
    preferences?: {
        theme: 'light' | 'dark' | 'system';
        notifications: {
            email: boolean;
            push: boolean;
            orderUpdates: boolean;
            marketing: boolean;
        };
        language: string;
        timezone: string;
    };
    stats?: {
        totalOrders: number;
        totalSpent: number;
        accountAge: number;
        lastLogin: Date;
    };
}

interface SecuritySettings {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    twoFactorEnabled: boolean;
}

const MyAccount = () => {
    const [user, setUser] = useState<UserProfile>({
        name: '',
        email: '',
        bio: '',
        location: '',
        phone: '',
        company: '',
        website: '',
        billingAddress: {
            line: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India'
        },
        socialLinks: {
            github: '',
            twitter: '',
            linkedin: ''
        },
        preferences: {
            theme: 'system',
            notifications: {
                email: true,
                push: true,
                orderUpdates: true,
                marketing: false
            },
            language: 'en',
            timezone: 'UTC'
        },
        stats: {
            totalOrders: 0,
            totalSpent: 0,
            accountAge: 0,
            lastLogin: new Date()
        }
    });

    const [security, setSecurity] = useState<SecuritySettings>({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorEnabled: false
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [activeTab, setActiveTab] = useState('profile');

    // Email change state
    const [emailChangeMode, setEmailChangeMode] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [emailChangeStep, setEmailChangeStep] = useState<'input' | 'verify'>('input');
    const [emailChangePending, setEmailChangePending] = useState(false);
    const [emailChangeError, setEmailChangeError] = useState('');

    const router = useRouter();
    const { showAlert } = useSessionAlert();

    const { theme, setTheme, systemTheme } = useTheme();

    useEffect(() => {
        fetchUserData();
    }, []);

    // Sync theme preference with actual theme on component mount
    useEffect(() => {
        if (user.preferences?.theme && theme) {
            // Only sync if they're different to avoid infinite loops
            if (user.preferences.theme !== theme) {
                setUser(prev => ({
                    ...prev,
                    preferences: {
                        ...prev.preferences!,
                        theme: theme as 'light' | 'dark' | 'system'
                    }
                }));
            }
        }
    }, [theme]);

    const fetchUserData = async () => {
        try {
            setLoading(true);
            const response = await dashboardFetch('/api/users/me?stats=1', { cache: 'no-store', credentials: 'include' });
            if (response.status === 401) {
                const authData = await response.json().catch(() => ({}));
                const code = authData.code || '';
                if (code === 'SESSION_EXPIRED' || String(authData.message || '').toLowerCase().includes('expired')) {
                    showAlert('session_expired');
                } else {
                    showAlert('action_requires_login', 'Please log in to view your account.');
                }
                return;
            }
            if (!response.ok) throw new Error('Failed to fetch user data');
            const data = await response.json();

            // Merge the API data with default structure to avoid undefined errors
            const userData = {
                ...data,
                preferences: {
                    theme: data.preferences?.theme || 'system',
                    notifications: {
                        email: data.preferences?.notifications?.email ?? true,
                        push: data.preferences?.notifications?.push ?? true,
                        orderUpdates: data.preferences?.notifications?.orderUpdates ?? true,
                        marketing: data.preferences?.notifications?.marketing ?? false
                    },
                    language: data.preferences?.language || 'en',
                    timezone: data.preferences?.timezone || 'UTC'
                },
                socialLinks: {
                    github: data.socialLinks?.github || '',
                    twitter: data.socialLinks?.twitter || '',
                    linkedin: data.socialLinks?.linkedin || ''
                },
                billingAddress: {
                    line: data.billingAddress?.line || '',
                    city: data.billingAddress?.city || '',
                    state: data.billingAddress?.state || '',
                    pincode: data.billingAddress?.pincode || '',
                    country: data.billingAddress?.country || 'India'
                },
                stats: {
                    totalOrders: data.stats?.totalOrders || 0,
                    totalSpent: data.stats?.totalSpent || 0,
                    totalSpentIncludingRenewals: data.stats?.totalSpentIncludingRenewals || 0,
                    renewalSpent: data.stats?.renewalSpent || 0,
                    accountAge: data.stats?.accountAge || 0,
                    lastLogin: data.stats?.lastLogin || new Date(),
                    averageOrderValue: data.stats?.averageOrderValue || 0,
                    ordersByStatus: {
                        completed: data.stats?.ordersByStatus?.completed || 0,
                        pending: data.stats?.ordersByStatus?.pending || 0,
                        failed: data.stats?.ordersByStatus?.failed || 0,
                        active: data.stats?.ordersByStatus?.active || 0
                    },
                    recentOrders: data.stats?.recentOrders || []
                }
            };

            setUser(userData);

            // Apply the saved theme preference
            if (userData.preferences.theme) {
                setTheme(userData.preferences.theme);
            }

            // Set security preferences
            setSecurity(prev => ({
                ...prev,
                twoFactorEnabled: data.twoFactorEnabled || false
            }));

        } catch (error) {
            console.error('Error fetching user data:', error);
            toast.error('Could not load profile data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const fetchRealActivity = async () => {
        try {
            const response = await dashboardFetch('/api/users/activity');
            if (response.ok) {
                const data = await response.json();
                return data.activities;
            }
            return [];
        } catch (error) {
            console.error('Error fetching activity:', error);
            return [];
        }
    };

    // Safe helper functions to prevent undefined errors
    const safeUpdateNotifications = (key: keyof NonNullable<UserProfile['preferences']>['notifications'], value: boolean) => {
        setUser(prev => ({
            ...prev,
            preferences: {
                ...prev.preferences!,
                notifications: {
                    ...prev.preferences!.notifications,
                    [key]: value
                }
            }
        }));
    };

    const safeUpdatePreference = (key: keyof UserProfile['preferences'], value: any) => {
        setUser(prev => ({
            ...prev,
            preferences: {
                ...prev.preferences!,
                [key]: value
            }
        }));
    };

    const safeUpdateSocialLink = (platform: keyof UserProfile['socialLinks'], value: string) => {
        setUser(prev => ({
            ...prev,
            socialLinks: {
                ...prev.socialLinks!,
                [platform]: value
            }
        }));
    };


    const handleProfileUpdate = async () => {
        try {
            setSaving(true);
            const response = await dashboardFetch('/api/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });

            if (!response.ok) throw new Error('Failed to update profile');

            toast.success('Profile updated successfully!');
            setIsEditing(false);
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error('Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    // Handle theme change
    const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
        // Update the theme immediately
        setTheme(newTheme);

        // Update the user state
        setUser(prev => ({
            ...prev,
            preferences: {
                ...prev.preferences!,
                theme: newTheme
            }
        }));

        // Auto-save theme preference
        savethemePreference(newTheme);
    };

    // Function to save theme preference immediately
    const savethemePreference = async (themeValue: string) => {
        try {
            await dashboardFetch('/api/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...user,
                    preferences: {
                        ...user.preferences,
                        theme: themeValue
                    }
                })
            });
            toast.success('Theme preference saved!');
        } catch (error) {
            console.error('Error saving theme preference:', error);
            toast.error('Failed to save theme preference');
        }
    };

    // Get current theme display value
    const getCurrentThemeDisplay = () => {
        if (theme === 'system') {
            return `System (${systemTheme === 'dark' ? 'Dark' : 'Light'})`;
        }
        return theme === 'dark' ? 'Dark' : 'Light';
    };

    const handlePasswordUpdate = async () => {
        if (!security.currentPassword) {
            toast.error('Current password is required');
            return;
        }

        if (security.newPassword !== security.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        if (security.newPassword.length < 8) {
            toast.error('Password must be at least 8 characters long');
            return;
        }

        try {
            setSaving(true);
            const response = await dashboardFetch('/api/user/update-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: user.name,
                    email: user.email,
                    currentPassword: security.currentPassword,
                    newPassword: security.newPassword,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update password');
            toast.success('Password updated successfully!');
            setSecurity({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
                twoFactorEnabled: security.twoFactorEnabled
            });
        } catch (error) {
            console.error('Error updating password:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to update password');
        } finally {
            setSaving(false);
        }
    };

    // Email change handlers
    const handleRequestEmailChange = async () => {
        if (!newEmail) {
            setEmailChangeError('Please enter a new email address');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            setEmailChangeError('Please enter a valid email address');
            return;
        }

        if (newEmail.toLowerCase() === user.email.toLowerCase()) {
            setEmailChangeError('New email must be different from your current email');
            return;
        }

        setEmailChangeError('');
        setEmailChangePending(true);

        try {
            const response = await dashboardFetch('/api/users/update-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newEmail })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                setEmailChangeError(data.message || 'Failed to send verification code');
                return;
            }

            toast.success('Verification code sent to your new email!');
            setEmailChangeStep('verify');

        } catch (error) {
            console.error('Email change error:', error);
            setEmailChangeError('Failed to send verification code. Please try again.');
        } finally {
            setEmailChangePending(false);
        }
    };

    const handleVerifyEmailChange = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            setEmailChangeError('Please enter the 6-digit verification code');
            return;
        }

        setEmailChangeError('');
        setEmailChangePending(true);

        try {
            const response = await dashboardFetch('/api/users/update-email', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ verificationCode })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                setEmailChangeError(data.message || 'Invalid verification code');
                return;
            }

            toast.success('Email address updated successfully!');
            
            // Update local state
            setUser(prev => ({ ...prev, email: data.newEmail }));
            
            // Reset email change state
            setEmailChangeMode(false);
            setNewEmail('');
            setVerificationCode('');
            setEmailChangeStep('input');

        } catch (error) {
            console.error('Email verification error:', error);
            setEmailChangeError('Failed to verify. Please try again.');
        } finally {
            setEmailChangePending(false);
        }
    };

    const cancelEmailChange = () => {
        setEmailChangeMode(false);
        setNewEmail('');
        setVerificationCode('');
        setEmailChangeStep('input');
        setEmailChangeError('');
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    };

    const formatCurrency = (amount: number) => {
        return `₹${amount.toLocaleString()}`;
    };

    if (loading) {
        return (
            <div className="premium-dashboard-page">
                <div className="premium-dashboard-page-inner">
                    <div className="flex justify-center items-center py-12">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-emerald-500/15 rounded-full animate-pulse"></div>
                            <div className="text-center">
                                <div className="h-4 w-32 bg-white/10 rounded animate-pulse mb-2"></div>
                                <div className="h-3 w-24 bg-white/5 rounded animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='premium-dashboard-page'>
            <div className='premium-dashboard-page-inner'>
            <div className="premium-dashboard-page-header mb-4">
                <div className="flex gap-2 ml-auto w-full sm:w-auto justify-end">
                            {isEditing && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setIsEditing(false);
                                            fetchUserData();
                                        }}
                                        className="gap-1 h-8 sm:h-9 px-2 sm:px-3 premium-btn-outline"
                                    >
                                        <X className="h-3 w-3 sm:h-4 sm:w-4" />
                                        <span className="hidden sm:inline text-xs">Cancel</span>
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleProfileUpdate}
                                        disabled={saving}
                                        className="gap-1 h-8 sm:h-9 px-2 sm:px-3 premium-btn-primary border-0"
                                    >
                                        {saving ? (
                                            <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                                        ) : (
                                            <Save className="h-3 w-3 sm:h-4 sm:w-4" />
                                        )}
                                        <span className="hidden sm:inline text-xs">Save</span>
                                    </Button>
                                </>
                            )}
                            {!isEditing && activeTab === 'profile' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsEditing(true)}
                                    className="gap-1 h-8 sm:h-9 px-2 sm:px-3 premium-btn-outline"
                                >
                                    <Edit3 className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span className="hidden sm:inline text-xs">Edit</span>
                                </Button>
                            )}
                </div>
            </div>

                {/* Profile Header */}
                <div className="mb-8">
                    <Card className="premium-dashboard-card border-0">
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                                <div className="relative">
                                    <Avatar className="w-24 h-24 md:w-32 md:h-32">
                                        <AvatarImage src={user.avatar} alt={user.name} />
                                        <AvatarFallback className="text-2xl md:text-3xl font-bold bg-primary text-primary-foreground">
                                            {getInitials(user.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    {/* {isEditing && (
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full"
                                        >
                                            <Camera className="h-4 w-4" />
                                        </Button>
                                    )} */}
                                </div>

                                <div className="flex-1 space-y-4">
                                    <div>
                                        <h2 className="text-2xl md:text-3xl font-bold">{user.name}</h2>
                                        <p className="text-muted-foreground flex items-center gap-2 mt-1">
                                            <Mail className="h-4 w-4" />
                                            {user.email}
                                        </p>
                                        {user.bio && (
                                            <p className="text-muted-foreground mt-2">{user.bio}</p>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {user.location && (
                                            <Badge variant="outline" className="gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {user.location}
                                            </Badge>
                                        )}
                                        {user.company && (
                                            <Badge variant="outline" className="gap-1">
                                                <Building className="h-3 w-3" />
                                                {user.company}
                                            </Badge>
                                        )}
                                        <Badge variant="outline" className="gap-1">
                                            <Calendar className="h-3 w-3" />
                                            Member for {user.stats?.accountAge} days
                                        </Badge>
                                    </div>
                                </div>

                                {/* Quick Stats + Desktop Edit/Save */}
                                <div className="flex flex-col gap-4 md:w-48">
                                    <div className="hidden md:flex gap-2 justify-end">
                                        {isEditing ? (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setIsEditing(false);
                                                        fetchUserData();
                                                    }}
                                                    className="gap-1"
                                                >
                                                    <X className="h-4 w-4" />
                                                    Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={handleProfileUpdate}
                                                    disabled={saving}
                                                    className="gap-1"
                                                >
                                                    {saving ? (
                                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Save className="h-4 w-4" />
                                                    )}
                                                    Save
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setIsEditing(true)}
                                                className="gap-1"
                                            >
                                                <Edit3 className="h-4 w-4" />
                                                Edit Profile
                                            </Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
                                        <div className="text-center p-4 bg-primary/5 rounded-lg">
                                            <div className="text-2xl font-bold text-primary">{user.stats?.totalOrders}</div>
                                            <div className="text-xs text-muted-foreground">Total Orders</div>
                                        </div>
                                        <div className="text-center p-4 bg-green-500/5 rounded-lg">
                                            <div className="text-2xl font-bold text-green-600">{formatCurrency(user.stats?.totalSpent || 0)}</div>
                                            <div className="text-xs text-muted-foreground">Total Spent</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 premium-dashboard-tabs">
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 premium-profile-tabs-list">
                        <TabsTrigger value="profile" className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span className="hidden sm:inline">Profile</span>
                        </TabsTrigger>
                        <TabsTrigger value="security" className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <span className="hidden sm:inline">Security</span>
                        </TabsTrigger>
                        <TabsTrigger value="preferences" className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            <span className="hidden sm:inline">Settings</span>
                        </TabsTrigger>
                        <TabsTrigger value="activity" className="flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            <span className="hidden sm:inline">Activity</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* Profile Tab */}
                    <TabsContent value="profile" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Personal Information */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <User className="h-5 w-5" />
                                        Personal Information
                                    </CardTitle>
                                    <CardDescription>
                                        Update your personal details and contact information
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="name">Full Name</Label>
                                            <Input
                                                id="name"
                                                value={user.name}
                                                onChange={(e) => setUser({ ...user, name: e.target.value })}
                                                disabled={!isEditing}
                                                className={cn(!isEditing && "bg-muted")}
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <Label htmlFor="email" className="flex items-center justify-between">
                                                <span>Email Address</span>
                                                {!emailChangeMode && (
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="text-xs h-auto p-0 text-primary"
                                                        onClick={() => setEmailChangeMode(true)}
                                                    >
                                                        Change Email
                                                    </Button>
                                                )}
                                            </Label>
                                            
                                            {!emailChangeMode ? (
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={user.email}
                                                    disabled={true}
                                                    className="bg-muted"
                                                />
                                            ) : (
                                                <div className="space-y-3 mt-2 p-4 border rounded-lg bg-muted/30">
                                                    {emailChangeStep === 'input' ? (
                                                        <>
                                                            <div className="text-sm text-muted-foreground mb-2">
                                                                Current email: <span className="font-medium text-foreground">{user.email}</span>
                                                            </div>
                                                            <div>
                                                                <Label htmlFor="newEmail">New Email Address</Label>
                                                                <Input
                                                                    id="newEmail"
                                                                    type="email"
                                                                    value={newEmail}
                                                                    onChange={(e) => setNewEmail(e.target.value)}
                                                                    placeholder="Enter new email address"
                                                                    className="mt-1"
                                                                />
                                                            </div>
                                                            {emailChangeError && (
                                                                <p className="text-sm text-red-500 flex items-center gap-1">
                                                                    <AlertCircle className="h-4 w-4" />
                                                                    {emailChangeError}
                                                                </p>
                                                            )}
                                                            <div className="flex gap-2 pt-2">
                                                                <Button
                                                                    onClick={handleRequestEmailChange}
                                                                    disabled={emailChangePending}
                                                                    className="gap-1"
                                                                >
                                                                    {emailChangePending ? (
                                                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <Mail className="h-4 w-4" />
                                                                    )}
                                                                    Send Verification Code
                                                                </Button>
                                                                <Button variant="outline" onClick={cancelEmailChange}>
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="text-sm text-muted-foreground mb-2">
                                                                We sent a verification code to: <span className="font-medium text-foreground">{newEmail}</span>
                                                            </div>
                                                            <div>
                                                                <Label htmlFor="verificationCode">Verification Code</Label>
                                                                <Input
                                                                    id="verificationCode"
                                                                    type="text"
                                                                    value={verificationCode}
                                                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                                    placeholder="Enter 6-digit code"
                                                                    className="mt-1 text-center text-2xl tracking-widest font-mono"
                                                                    maxLength={6}
                                                                />
                                                            </div>
                                                            {emailChangeError && (
                                                                <p className="text-sm text-red-500 flex items-center gap-1">
                                                                    <AlertCircle className="h-4 w-4" />
                                                                    {emailChangeError}
                                                                </p>
                                                            )}
                                                            <div className="flex gap-2 pt-2">
                                                                <Button
                                                                    onClick={handleVerifyEmailChange}
                                                                    disabled={emailChangePending || verificationCode.length !== 6}
                                                                    className="gap-1"
                                                                >
                                                                    {emailChangePending ? (
                                                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <Check className="h-4 w-4" />
                                                                    )}
                                                                    Verify & Update Email
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setEmailChangeStep('input');
                                                                        setVerificationCode('');
                                                                        setEmailChangeError('');
                                                                    }}
                                                                >
                                                                    Back
                                                                </Button>
                                                                <Button variant="ghost" onClick={cancelEmailChange}>
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mt-2">
                                                                Didn't receive the code? Check your spam folder or{' '}
                                                                <button
                                                                    type="button"
                                                                    className="text-primary underline"
                                                                    onClick={() => {
                                                                        setEmailChangeStep('input');
                                                                        setVerificationCode('');
                                                                        setEmailChangeError('');
                                                                    }}
                                                                >
                                                                    try again
                                                                </button>
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <Label htmlFor="phone">Phone Number</Label>
                                            <Input
                                                id="phone"
                                                value={user.phone || ''}
                                                onChange={(e) => setUser({ ...user, phone: e.target.value })}
                                                disabled={!isEditing}
                                                className={cn(!isEditing && "bg-muted")}
                                                placeholder="+91 9876543210"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="location">Location</Label>
                                            <Input
                                                id="location"
                                                value={user.location || ''}
                                                onChange={(e) => setUser({ ...user, location: e.target.value })}
                                                disabled={!isEditing}
                                                className={cn(!isEditing && "bg-muted")}
                                                placeholder="City, Country"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <Label htmlFor="company">Company</Label>
                                            <Input
                                                id="company"
                                                value={user.company || ''}
                                                onChange={(e) => setUser({ ...user, company: e.target.value })}
                                                disabled={!isEditing}
                                                className={cn(!isEditing && "bg-muted")}
                                                placeholder="Your company name"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <Label htmlFor="bio">Bio</Label>
                                            <Textarea
                                                id="bio"
                                                value={user.bio || ''}
                                                onChange={(e) => setUser({ ...user, bio: e.target.value })}
                                                disabled={!isEditing}
                                                className={cn(!isEditing && "bg-muted")}
                                                placeholder="Tell us about yourself..."
                                                rows={3}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Social Links */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Link className="h-5 w-5" />
                                        Social Links & Website
                                    </CardTitle>
                                    <CardDescription>
                                        Connect your social media profiles and website
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="website" className="flex items-center gap-2">
                                            <Globe className="h-4 w-4" />
                                            Website
                                        </Label>
                                        <Input
                                            id="website"
                                            value={user.website || ''}
                                            onChange={(e) => setUser({ ...user, website: e.target.value })}
                                            disabled={!isEditing}
                                            className={cn(!isEditing && "bg-muted")}
                                            placeholder="https://yourwebsite.com"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="github" className="flex items-center gap-2">
                                            <Github className="h-4 w-4" />
                                            GitHub
                                        </Label>
                                        <Input
                                            id="github"
                                            value={user.socialLinks?.github || ''}
                                            onChange={(e) => setUser({
                                                ...user,
                                                socialLinks: { ...user.socialLinks, github: e.target.value }
                                            })}
                                            disabled={!isEditing}
                                            className={cn(!isEditing && "bg-muted")}
                                            placeholder="https://github.com/username"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="twitter" className="flex items-center gap-2">
                                            <Twitter className="h-4 w-4" />
                                            Twitter
                                        </Label>
                                        <Input
                                            id="twitter"
                                            value={user.socialLinks?.twitter || ''}
                                            onChange={(e) => setUser({
                                                ...user,
                                                socialLinks: { ...user.socialLinks, twitter: e.target.value }
                                            })}
                                            disabled={!isEditing}
                                            className={cn(!isEditing && "bg-muted")}
                                            placeholder="https://twitter.com/username"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="linkedin" className="flex items-center gap-2">
                                            <Linkedin className="h-4 w-4" />
                                            LinkedIn
                                        </Label>
                                        <Input
                                            id="linkedin"
                                            value={user.socialLinks?.linkedin || ''}
                                            onChange={(e) => setUser({
                                                ...user,
                                                socialLinks: { ...user.socialLinks, linkedin: e.target.value }
                                            })}
                                            disabled={!isEditing}
                                            className={cn(!isEditing && "bg-muted")}
                                            placeholder="https://linkedin.com/in/username"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Billing Address */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MapPin className="h-5 w-5" />
                                    Billing Address
                                </CardTitle>
                                <CardDescription>
                                    Used on your GST invoices. State decides CGST+SGST (within Maharashtra) vs IGST.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="addr-line">Address</Label>
                                    <Input
                                        id="addr-line"
                                        value={user.billingAddress?.line || ''}
                                        onChange={(e) => setUser({
                                            ...user,
                                            billingAddress: { ...user.billingAddress, line: e.target.value }
                                        })}
                                        disabled={!isEditing}
                                        className={cn(!isEditing && "bg-muted")}
                                        placeholder="House / Building, Street, Area"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label htmlFor="addr-city">City</Label>
                                        <Input
                                            id="addr-city"
                                            value={user.billingAddress?.city || ''}
                                            onChange={(e) => setUser({
                                                ...user,
                                                billingAddress: { ...user.billingAddress, city: e.target.value }
                                            })}
                                            disabled={!isEditing}
                                            className={cn(!isEditing && "bg-muted")}
                                            placeholder="City"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="addr-state">State</Label>
                                        <Select
                                            value={user.billingAddress?.state || ''}
                                            onValueChange={(value) => setUser({
                                                ...user,
                                                billingAddress: { ...user.billingAddress, state: value }
                                            })}
                                            disabled={!isEditing}
                                        >
                                            <SelectTrigger className={cn(!isEditing && "bg-muted")}>
                                                <SelectValue placeholder="Select state" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {INDIAN_STATES.map((s) => (
                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="addr-pin">PIN Code</Label>
                                        <Input
                                            id="addr-pin"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={user.billingAddress?.pincode || ''}
                                            onChange={(e) => setUser({
                                                ...user,
                                                billingAddress: { ...user.billingAddress, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }
                                            })}
                                            disabled={!isEditing}
                                            className={cn(!isEditing && "bg-muted")}
                                            placeholder="6-digit PIN"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Security Tab */}
                    <TabsContent value="security" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Password Change */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Key className="h-5 w-5" />
                                        Change Password
                                    </CardTitle>
                                    <CardDescription>
                                        Keep your account secure with a strong password
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="currentPassword">Current Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="currentPassword"
                                                type={showPasswords.current ? "text" : "password"}
                                                value={security.currentPassword}
                                                onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                                                placeholder="Enter current password"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                            >
                                                {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor="newPassword">New Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="newPassword"
                                                type={showPasswords.new ? "text" : "password"}
                                                value={security.newPassword}
                                                onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                                                placeholder="Enter new password"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                            >
                                                {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="confirmPassword"
                                                type={showPasswords.confirm ? "text" : "password"}
                                                value={security.confirmPassword}
                                                onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                                                placeholder="Confirm new password"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                            >
                                                {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <Button onClick={handlePasswordUpdate} disabled={saving} className="w-full gap-2">
                                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                                        Update Password
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Two-Factor Authentication */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Shield className="h-5 w-5" />
                                        Two-Factor Authentication
                                    </CardTitle>
                                    <CardDescription>
                                        Add an extra layer of security to your account
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center  justify-between">
                                        <div>
                                            <p className="font-medium">Enable 2FA</p>
                                            <p className="text-sm text-muted-foreground">
                                                Secure your account with two-factor authentication
                                            </p>
                                        </div>
                                        <Switch
                                            checked={security.twoFactorEnabled}
                                            onCheckedChange={(checked) => setSecurity({ ...security, twoFactorEnabled: checked })}
                                        />
                                    </div>
                                    {/*
                                    {security.twoFactorEnabled && (
                                        <div className="p-4 border rounded-lg bg-muted/50">
                                            <p className="text-sm font-medium mb-2">Setup Instructions:</p>
                                            <ol className="text-sm text-muted-foreground space-y-1">
                                                <li>1. Install an authenticator app (Google Authenticator, Authy)</li>
                                                <li>2. Scan the QR code or enter the setup key</li>
                                                <li>3. Enter the 6-digit code from your app</li>
                                            </ol>
                                        </div>
                                    )} */}
                                    <h1 className='mt-4 p-2 text-center font-bold text-4xl'>                                    Coming Soon!</h1>

                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Preferences Tab */}
                    <TabsContent value="preferences" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Theme & Display */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Palette className="h-5 w-5" />
                                        Theme & Display
                                    </CardTitle>
                                    <CardDescription>
                                        Customize your visual experience. Current theme: {getCurrentThemeDisplay()}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label htmlFor="theme">Theme Preference</Label>
                                        <Select
                                            value={user.preferences?.theme || theme}
                                            onValueChange={handleThemeChange}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="light">
                                                    <div className="flex items-center gap-2">
                                                        <Sun className="h-4 w-4" />
                                                        Light
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="dark">
                                                    <div className="flex items-center gap-2">
                                                        <Moon className="h-4 w-4" />
                                                        Dark
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="system">
                                                    <div className="flex items-center gap-2">
                                                        <Monitor className="h-4 w-4" />
                                                        System
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>

                                        {/* Theme Preview */}
                                        <div className="mt-3 p-3  rounded-lg bg-muted/50">
                                            <p className="text-sm font-medium mb-2">Theme Preview:</p>
                                            <div className="flex gap-2">
                                                <div className={`w-8 h-8 rounded border-2 ${theme === 'light' ? 'bg-white border-blue-500' : 'bg-white border-gray-300'
                                                    }`} title="Light theme" />
                                                <div className={`w-8 h-8 rounded border-2 ${theme === 'dark' ? 'bg-gray-900 border-blue-500' : 'bg-gray-900 border-gray-600'
                                                    }`} title="Dark theme" />
                                                <div className={`w-8 h-8 rounded border-2 bg-gradient-to-r from-white to-gray-900 ${theme === 'system' ? 'border-blue-500' : 'border-gray-400'
                                                    }`} title="System theme" />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="language">Language</Label>
                                        <Select
                                            value={user.preferences?.language}
                                            onValueChange={(value) =>
                                                setUser({
                                                    ...user,
                                                    preferences: { ...user.preferences!, language: value }
                                                })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="en">🇺🇸 English</SelectItem>
                                                <SelectItem value="hi">🇮🇳 हिंदी</SelectItem>
                                                <SelectItem value="es">🇪🇸 Español</SelectItem>
                                                <SelectItem value="fr">🇫🇷 Français</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label htmlFor="timezone">Timezone</Label>
                                        <Select
                                            value={user.preferences?.timezone}
                                            onValueChange={(value) =>
                                                setUser({
                                                    ...user,
                                                    preferences: { ...user.preferences!, timezone: value }
                                                })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="UTC">UTC (+00:00)</SelectItem>
                                                <SelectItem value="IST">IST (+05:30)</SelectItem>
                                                <SelectItem value="EST">EST (-05:00)</SelectItem>
                                                <SelectItem value="PST">PST (-08:00)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Quick Theme Toggle Buttons */}
                                    <div className="pt-2">
                                        <Label className="text-sm font-medium mb-2 block">Quick Theme Switch:</Label>
                                        <div className="flex gap-2">
                                            <Button
                                                variant={theme === 'light' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handleThemeChange('light')}
                                                className="gap-1"
                                            >
                                                <Sun className="h-3 w-3" />
                                                Light
                                            </Button>
                                            <Button
                                                variant={theme === 'dark' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handleThemeChange('dark')}
                                                className="gap-1"
                                            >
                                                <Moon className="h-3 w-3" />
                                                Dark
                                            </Button>
                                            <Button
                                                variant={theme === 'system' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handleThemeChange('system')}
                                                className="gap-1"
                                            >
                                                <Monitor className="h-3 w-3" />
                                                Auto
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Notifications */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Bell className="h-5 w-5" />
                                        Notification Preferences
                                    </CardTitle>
                                    <CardDescription>
                                        Choose what notifications you want to receive
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">Email Notifications</p>
                                            <p className="text-sm text-muted-foreground">
                                                Receive notifications via email
                                            </p>
                                        </div>
                                        <Switch
                                            checked={user.preferences?.notifications?.email ?? true}
                                            onCheckedChange={(checked) => safeUpdateNotifications('email', checked)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">Order Updates</p>
                                            <p className="text-sm text-muted-foreground">
                                                Get notified about order status changes
                                            </p>
                                        </div>
                                        <Switch
                                            checked={user.preferences?.notifications?.orderUpdates ?? true}
                                            onCheckedChange={(checked) => safeUpdateNotifications('orderUpdates', checked)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">Push Notifications</p>
                                            <p className="text-sm text-muted-foreground">
                                                Receive push notifications in browser
                                            </p>
                                        </div>
                                        <Switch
                                            checked={user.preferences?.notifications?.push ?? true}
                                            onCheckedChange={(checked) => safeUpdateNotifications('push', checked)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">Marketing Emails</p>
                                            <p className="text-sm text-muted-foreground">
                                                Receive promotional offers and updates
                                            </p>
                                        </div>
                                        <Switch
                                            checked={user.preferences?.notifications?.marketing ?? false}
                                            onCheckedChange={(checked) => safeUpdateNotifications('marketing', checked)}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                        </div>
                    </TabsContent>

                    {/* Activity Tab */}
                    <TabsContent value="activity" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Account Statistics */}
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <TrendingUp className="h-5 w-5" />
                                        Account Statistics
                                    </CardTitle>
                                    <CardDescription>
                                        Your account activity overview
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        <div className="p-4 rounded-xl border border-sky-400/20 bg-sky-500/10 text-center">
                                            <div className="w-10 h-10 bg-sky-500/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                                                <Server className="h-5 w-5 text-sky-300" />
                                            </div>
                                            <div className="text-2xl font-bold tabular-nums premium-dashboard-stat-value">{user.stats?.totalOrders}</div>
                                            <div className="premium-dashboard-stat-label mt-1">Total Orders</div>
                                        </div>

                                        <div className="p-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-center">
                                            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                                                <DollarSign className="h-5 w-5 text-emerald-300" />
                                            </div>
                                            <div className="text-2xl font-bold tabular-nums premium-dashboard-stat-value">{formatCurrency(user.stats?.totalSpent || 0)}</div>
                                            <div className="premium-dashboard-stat-label mt-1">Total Spent</div>
                                        </div>

                                        <div className="p-4 rounded-xl border border-violet-400/20 bg-violet-500/10 text-center col-span-2 md:col-span-1">
                                            <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                                                <Calendar className="h-5 w-5 text-violet-300" />
                                            </div>
                                            <div className="text-2xl font-bold tabular-nums premium-dashboard-stat-value">{user.stats?.accountAge}</div>
                                            <div className="premium-dashboard-stat-label mt-1">Days Active</div>
                                        </div>

                                        {/* <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-center">
                                            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/50 rounded-lg flex items-center justify-center mx-auto mb-2">
                                                <Award className="h-5 w-5 text-orange-600" />
                                            </div>
                                            <div className="text-2xl font-bold text-orange-600">Pro</div>
                                            <div className="text-xs text-muted-foreground">Account Tier</div>
                                        </div> */}
                                    </div>

                                    {/* Progress bars */}
                                    <div className="mt-6 space-y-4">
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-sm font-medium">Account Progress</span>
                                                <span className="text-sm text-muted-foreground">85%</span>
                                            </div>
                                            <div className="w-full bg-white/10 rounded-full h-2">
                                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '85%' }}></div>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-sm font-medium text-white/80">Profile Completeness</span>
                                                <span className="text-sm text-white/45">92%</span>
                                            </div>
                                            <div className="w-full bg-white/10 rounded-full h-2">
                                                <div className="bg-emerald-400 h-2 rounded-full" style={{ width: '92%' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Quick Actions */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Zap className="h-5 w-5" />
                                        Quick Actions
                                    </CardTitle>
                                    <CardDescription>
                                        Common account tasks
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <Button variant="outline" className="w-full justify-start gap-2 premium-btn-outline" onClick={() => router.push('/dashboard/orders')}>
                                        <CreditCard className="h-4 w-4" />
                                        View Orders
                                    </Button>
                                    <Button variant="outline" className="w-full justify-start gap-2 premium-btn-outline" onClick={() => router.push('/dashboard/viewLinux')}>
                                        <Server className="h-4 w-4" />
                                        Manage Servers
                                    </Button>
                                    <Button variant="outline" className="w-full justify-start gap-2 premium-btn-outline" onClick={() => router.push('/support/tickets')}>
                                        <ExternalLink className="h-4 w-4" />
                                        Support Tickets
                                    </Button>
                                    <Button variant="outline" className="w-full justify-start gap-2 premium-btn-outline">
                                        <Download className="h-4 w-4" />
                                        Export Data
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Real Activity Section - Replace the mock activity */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Clock className="h-5 w-5" />
                                    Recent Activity
                                </CardTitle>
                                <CardDescription>
                                    Your recent account activity and actions
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <RealActivityFeed userId={user._id} />
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Danger Zone */}
                <Card className="premium-dashboard-card border-red-400/20 bg-red-950/20 mt-8">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-300">
                            <AlertCircle className="h-5 w-5" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription className="text-white/45">
                            Irreversible and destructive actions
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-red-400/25 bg-red-950/30 rounded-xl">
                            <div>
                                <h4 className="font-semibold text-red-200">Delete Account</h4>
                                <p className="text-sm text-red-300/80">
                                    Permanently delete your account and all associated data. This action cannot be undone.
                                </p>
                            </div>
                            <Button variant="destructive" className="gap-2">
                                <Trash2 className="h-4 w-4" />
                                Delete Account
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default MyAccount;
