'use client';

import ResponsiveSidebar from '@/components/component/sidebar';
import NotificationBell from '@/components/notification-bell';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    User,
    Activity,
    MessageCircle,
    Key,
    BookOpen,
    LogOut,
    CreditCard,
    Shield,
    UserCircle,
    Phone,
    Calendar,
    Bell,
    Home,
    Server,
    ShoppingBag,
    Settings,
    Lock,
    FileText,
    ChevronRight,
    Store
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, Suspense, useCallback } from 'react';
import { toast } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { SessionAlertProvider } from '@/components/session-alert';
import FloatingSupport from '@/components/component/floating-support';
import LoginNewsPopup from '@/components/login-news-popup';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserData {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    createdAt: string;
    isVerified?: boolean;
}

interface PageInfo {
    title: string;
    description?: string;
    icon: any;
    breadcrumb?: { name: string; href: string }[];
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPhoneDialog, setShowPhoneDialog] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isSavingPhone, setIsSavingPhone] = useState(false);

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const response = await fetch('/api/users/me');
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);

                if (!userData.phone) {
                    const dismissed = sessionStorage.getItem('phonePromptDismissed');
                    if (!dismissed) {
                        setTimeout(() => setShowPhoneDialog(true), 1200);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSavePhone = async () => {
        const cleaned = phoneNumber.replace(/\s+/g, '');
        if (!cleaned || cleaned.length < 10) {
            toast.error('Please enter a valid phone number');
            return;
        }
        setIsSavingPhone(true);
        try {
            const response = await fetch('/api/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: cleaned }),
            });
            if (!response.ok) throw new Error('Failed to update phone number');
            toast.success('Phone number updated!');
            setUser(prev => prev ? { ...prev, phone: cleaned } : prev);
            setShowPhoneDialog(false);
        } catch (error) {
            console.error('Error saving phone:', error);
            toast.error('Failed to save phone number. Please try again.');
        } finally {
            setIsSavingPhone(false);
        }
    };

    const handleDismissPhone = () => {
        sessionStorage.setItem('phonePromptDismissed', 'true');
        setShowPhoneDialog(false);
    };

    const handleLogout = async () => {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                // Clear local storage
                const itemsToClear = ['lastClientTxnId', 'user', 'preferences'];
                itemsToClear.forEach(item => {
                    localStorage.removeItem(item);
                    sessionStorage.removeItem(item);
                });

                toast.success('Logged out successfully');
                window.location.href = '/login';
            } else {
                toast.error('Failed to logout');
            }
        } catch (error) {
            console.error('Logout error:', error);
            toast.error('Logout failed. Redirecting anyway...');
            window.location.href = '/login';
        }
    };

    const getUserInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    const formatJoinDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long'
            });
        } catch {
            return 'Recently';
        }
    };

    // Define page information
    const getPageInfo = (path: string): PageInfo => {
        const pages: Record<string, PageInfo> = {
            '/dashboard': {
                title: 'Dashboard',
                description: 'Overview of your account and services',
                icon: Home,
            },
            '/dashboard/ipStock': {
                title: 'IP Stock',
                description: 'Browse server plans and deploy instantly',
                icon: Store,
            },
            '/dashboard/viewLinux': {
                title: 'Manage Orders',
                description: 'Manage your purchased servers',
                icon: Server,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/orders': {
                title: 'Order History',
                description: 'View your past orders and transactions',
                icon: ShoppingBag,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/scripts': {
                title: 'Proxy Setup Scripts',
                description: 'Find server scripts and installation assistance',
                icon: FileText,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/my-account': {
                title: 'My Account',
                description: 'Manage your profile and account settings',
                icon: UserCircle,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/changePassword': {
                title: 'Security Settings',
                description: 'Change your password and security settings',
                icon: Lock,
                // breadcrumb: [
                //     { name: 'Dashboard', href: '/dashboard' },
                //     { name: 'My Account', href: '/dashboard/my-account' }
                // ]
            },
            '/dashboard/activity': {
                title: 'Activity Log',
                description: 'Track all your account activities',
                icon: Activity,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/notifications': {
                title: 'Notifications',
                description: 'Manage your notifications and alerts',
                icon: Bell,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/api-keys': {
                title: 'API Keys',
                description: 'Manage your API access keys',
                icon: Key,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/billing': {
                title: 'Billing & Usage',
                description: 'View your billing information and usage',
                icon: CreditCard,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/support/tickets': {
                title: 'Support Center',
                description: 'Get help and manage support tickets',
                icon: MessageCircle,
            }
        };

        // Handle dynamic routes (like /dashboard/order/[id])
        if (path.startsWith('/dashboard/order/')) {
            return {
                title: 'Order Details',
                description: 'View order information and status',
                icon: ShoppingBag,
                // breadcrumb: [
                //     { name: 'Dashboard', href: '/dashboard' },
                //     { name: 'Orders', href: '/dashboard/orders' }
                // ]
            };
        }

        if (path.startsWith('/support/tickets/')) {
            return {
                title: 'Ticket Details',
                description: 'View and manage support ticket',
                icon: MessageCircle,
                // breadcrumb: [{ name: 'Support', href: '/support/tickets' }]
            };
        }

        return pages[path] || {
            title: 'Dashboard',
            description: 'OceanLinux Dashboard',
            icon: Home,
        };
    };

    const currentPage = getPageInfo(pathname);

    return (
        <SessionAlertProvider>
            <AuthProvider>
                <div className="min-h-screen bg-background">
                    <LoginNewsPopup />
                    {/* Sidebar */}
                    <Suspense>
                      <ResponsiveSidebar user={user} />
                    </Suspense>

                    {/* Main Content Area */}
                    <div className="lg:pl-64">
                        {/* Top Navigation Bar */}
                        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/60 lg:top-0">
                            <div className="flex h-14 items-center justify-between px-4 lg:px-6">
                                {/* Page Info */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <currentPage.icon className="h-4 w-4 text-muted-foreground shrink-0" />

                                    {/* Breadcrumb */}
                                    {currentPage.breadcrumb && currentPage.breadcrumb.length > 0 ? (
                                        <div className="flex items-center gap-1 text-sm">
                                            {currentPage.breadcrumb.map((crumb) => (
                                                <div key={crumb.href} className="flex items-center gap-1">
                                                    <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                                                        {crumb.name}
                                                    </Link>
                                                    <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                                                </div>
                                            ))}
                                            <span className="font-medium truncate">{currentPage.title}</span>
                                        </div>
                                    ) : (
                                        <h1 className="text-sm font-medium truncate">{currentPage.title}</h1>
                                    )}
                                </div>

                                {/* Right Side Actions */}
                                <div className="flex items-center gap-2">
                                    <NotificationBell />

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={user?.avatar} alt={user?.name || 'User'} />
                                                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                                                        {user?.name ? getUserInitials(user.name) : 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-72" align="end" forceMount>
                                            <DropdownMenuLabel className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-10 w-10">
                                                        <AvatarImage src={user?.avatar} alt={user?.name || 'User'} />
                                                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                                            {user?.name ? getUserInitials(user.name) : 'U'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-sm font-medium truncate">
                                                                {loading ? 'Loading...' : (user?.name || 'User')}
                                                            </p>
                                                            {user?.isVerified && (
                                                                <Shield className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                                                    </div>
                                                </div>
                                            </DropdownMenuLabel>

                                            <DropdownMenuSeparator />

                                            <DropdownMenuGroup>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/my-account" className="cursor-pointer">
                                                        <UserCircle className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                                        My Profile
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/activity" className="cursor-pointer">
                                                        <Activity className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                                        Activity Log
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/support/tickets" className="cursor-pointer">
                                                        <MessageCircle className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                                        Support
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuGroup>

                                            <DropdownMenuSeparator />

                                            <DropdownMenuGroup>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/api-keys" className="cursor-pointer">
                                                        <Key className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                                        API Keys
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/billing" className="cursor-pointer">
                                                        <CreditCard className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                                        Billing
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/notifications" className="cursor-pointer">
                                                        <Bell className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                                        Notifications
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/knowledge-base" className="cursor-pointer">
                                                        <BookOpen className="mr-2.5 h-4 w-4 text-muted-foreground" />
                                                        Docs
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuGroup>

                                            <DropdownMenuSeparator />

                                            <DropdownMenuItem
                                                className="text-red-500 focus:text-red-500 cursor-pointer"
                                                onClick={handleLogout}
                                            >
                                                <LogOut className="mr-2.5 h-4 w-4" />
                                                Sign Out
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>

                        {/* Page Content */}
                        <main>
                            {children}
                        </main>
                        <FloatingSupport />
                    </div>

                    {/* Phone Number Prompt Dialog */}
                    <Dialog open={showPhoneDialog} onOpenChange={(open) => {
                        if (!open) handleDismissPhone();
                    }}>
                        <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-base">
                                    <Phone className="h-4 w-4 text-primary" />
                                    Add Your Phone Number
                                </DialogTitle>
                                <DialogDescription className="text-sm">
                                    Please add a phone number so we can reach you about your orders and account security.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-2">
                                <Label htmlFor="phone-prompt" className="text-sm">Phone Number</Label>
                                <Input
                                    id="phone-prompt"
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="+91 98765 43210"
                                    className="text-sm h-10"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePhone(); }}
                                />
                                <p className="text-xs text-muted-foreground">Include country code (e.g. +91 for India)</p>
                            </div>
                            <DialogFooter className="gap-2 flex-col-reverse sm:flex-row">
                                <Button variant="ghost" size="sm" onClick={handleDismissPhone} disabled={isSavingPhone} className="w-full sm:w-auto text-sm">
                                    Skip for now
                                </Button>
                                <Button size="sm" onClick={handleSavePhone} disabled={isSavingPhone || !phoneNumber.trim()} className="w-full sm:w-auto gap-2 text-sm">
                                    {isSavingPhone ? (
                                        <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />Saving...</>
                                    ) : (
                                        <>Save Phone Number</>
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                </div>
            </AuthProvider>
        </SessionAlertProvider>
    );
}
