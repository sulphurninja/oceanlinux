'use client';

import ResponsiveSidebar from '@/components/component/sidebar';
import NotificationBell from '@/components/notification-bell';
import CartIcon from '@/components/cart/CartIcon';
import WalletBadge from '@/components/wallet/WalletBadge';
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
    MapPin,
    Calendar,
    Bell,
    Home,
    Server,
    ShoppingBag,
    Settings,
    Lock,
    FileText,
    Globe,
    ChevronRight,
    Store,
    Wallet as WalletIcon,
    ShoppingCart,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, Suspense, useCallback } from 'react';
import { toast } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { SessionAlertProvider } from '@/components/session-alert';
import FloatingSupport from '@/components/component/floating-support';
import LoginNewsPopup from '@/components/login-news-popup';
import OrderNewsPopup from '@/components/order-news-popup';
import PremiumPostLoginSplash from '@/components/landing/PremiumPostLoginSplash';
import { performLogoutWithCelebration } from '@/lib/logoutWithCelebration';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { dashboardFetch } from '@/lib/dashboardFetch';
import { readDashboardCache, writeDashboardCache, DASHBOARD_CACHE_KEYS } from '@/lib/dashboardCache';
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

interface BillingAddress {
    line?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
}

interface UserData {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    createdAt: string;
    isVerified?: boolean;
    userType?: 'customer' | 'reseller' | 'admin';
    billingAddress?: BillingAddress;
}

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

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
    const [phoneNumber, setPhoneNumber] = useState('+91 ');
    const [isSavingPhone, setIsSavingPhone] = useState(false);
    const [showAddressDialog, setShowAddressDialog] = useState(false);
    const [addressForm, setAddressForm] = useState({ line: '', city: '', state: '', pincode: '' });
    const [isSavingAddress, setIsSavingAddress] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        const cached = readDashboardCache(DASHBOARD_CACHE_KEYS.currentUser) as UserData | null;
        if (cached) {
            setUser(cached);
            setLoading(false);
        }
        fetchUserData();
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        if (saved) {
            try {
                setSidebarCollapsed(JSON.parse(saved));
            } catch {
                /* ignore */
            }
        }
        const onCollapse = (e: Event) => {
            const detail = (e as CustomEvent<{ collapsed: boolean }>).detail;
            if (detail && typeof detail.collapsed === 'boolean') {
                setSidebarCollapsed(detail.collapsed);
            }
        };
        window.addEventListener('sidebar-collapse', onCollapse);
        return () => window.removeEventListener('sidebar-collapse', onCollapse);
    }, []);

    /* Portals (dialogs, selects) render on document.body — mark dashboard for portal theme vars */
    useEffect(() => {
        document.documentElement.classList.add('premium-dashboard-active');
        return () => {
            document.documentElement.classList.remove('premium-dashboard-active');
        };
    }, []);

    const fetchUserData = async () => {
        try {
            const response = await dashboardFetch('/api/users/me');
            if (response.ok) {
                const userData = await response.json();
                writeDashboardCache(DASHBOARD_CACHE_KEYS.currentUser, userData);
                setUser(userData);

                // Billing address is mandatory (needed for GST-correct invoices).
                // Prompt for it first; only fall back to the optional phone prompt
                // once the address is on file.
                const addr = userData.billingAddress || {};
                const addressComplete = !!(addr.line && addr.city && addr.state && addr.pincode);
                if (!addressComplete) {
                    setAddressForm({
                        line: addr.line || '',
                        city: addr.city || '',
                        state: addr.state || '',
                        pincode: addr.pincode || '',
                    });
                    setTimeout(() => setShowAddressDialog(true), 1000);
                } else if (!userData.phone) {
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
            const response = await dashboardFetch('/api/users/update', {
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

    const handleSaveAddress = async () => {
        const line = addressForm.line.trim();
        const city = addressForm.city.trim();
        const state = addressForm.state.trim();
        const pincode = addressForm.pincode.trim();
        if (!line || !city || !state || !/^\d{6}$/.test(pincode)) {
            toast.error('Please fill address, city, state and a valid 6-digit PIN code');
            return;
        }
        setIsSavingAddress(true);
        try {
            const billingAddress = { line, city, state, pincode, country: 'India' };
            const response = await dashboardFetch('/api/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ billingAddress }),
            });
            if (!response.ok) throw new Error('Failed to update address');
            toast.success('Billing address saved!');
            setUser(prev => prev ? { ...prev, billingAddress } : prev);
            setShowAddressDialog(false);
            // If phone is still missing, surface that prompt next.
            if (user && !user.phone) {
                const dismissed = sessionStorage.getItem('phonePromptDismissed');
                if (!dismissed) setTimeout(() => setShowPhoneDialog(true), 600);
            }
        } catch (error) {
            console.error('Error saving address:', error);
            toast.error('Failed to save address. Please try again.');
        } finally {
            setIsSavingAddress(false);
        }
    };

    const handleLogout = async () => {
        await performLogoutWithCelebration(async () => {
            try {
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                const itemsToClear = ['lastClientTxnId', 'user', 'preferences'];
                itemsToClear.forEach(item => {
                    localStorage.removeItem(item);
                    sessionStorage.removeItem(item);
                });

                if (!response.ok) {
                    toast.error('Failed to logout');
                }

                window.location.href = '/login';
            } catch (error) {
                console.error('Logout error:', error);
                toast.error('Logout failed. Redirecting anyway...');
                window.location.href = '/login';
            }
        });
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
                description: 'Browse Linux, Windows & proxy plans',
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
            },
            '/dashboard/wallet': {
                title: 'My Wallet',
                description: 'Recharge once, checkout faster on every order',
                icon: WalletIcon,
            },
            '/dashboard/cart': {
                title: 'Your Cart',
                description: 'Review items and complete checkout',
                icon: ShoppingCart,
            },
            '/dashboard/support/tickets': {
                title: 'Raise Ticket',
                description: 'View tickets and get help from our team',
                icon: MessageCircle,
            },
            '/dashboard/scripts': {
                title: 'PuTTY / SSH',
                description: 'Connect to your Linux server and run proxy setup',
                icon: FileText,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
            },
            '/dashboard/proxy-checker': {
                title: 'Proxy IP Checker',
                description: 'Test your proxy on IRCTC, Google, YouTube and more',
                icon: Globe,
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
                title: 'Raise Ticket',
                description: 'Redirecting to support…',
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

        if (path.startsWith('/dashboard/support/tickets/')) {
            return {
                title: 'Ticket Details',
                description: 'View and reply to your support ticket',
                icon: MessageCircle,
            };
        }

        if (path.startsWith('/support/tickets/')) {
            return {
                title: 'Ticket Details',
                description: 'View and manage support ticket',
                icon: MessageCircle,
            };
        }

        return pages[path] || {
            title: 'Dashboard',
            description: 'OceanLinux Dashboard',
            icon: Home,
        };
    };

    const currentPage = getPageInfo(pathname);
    const orderNewsOrderId = pathname.match(/^\/dashboard\/order\/([^/]+)/)?.[1] ?? null;

    return (
        <SessionAlertProvider>
            <AuthProvider>
                <div className="premium-dashboard min-h-screen">
                    <PremiumPostLoginSplash autoFromSession />
                    <LoginNewsPopup />
                    {orderNewsOrderId ? (
                      <OrderNewsPopup key={pathname} orderId={orderNewsOrderId} />
                    ) : null}
                    {/* Sidebar */}
                    <Suspense>
                      <ResponsiveSidebar user={user} />
                    </Suspense>

                    {/* Main Content Area */}
                    <div className={cn(
                        "premium-dashboard-content-wrap min-w-0 overflow-x-hidden",
                        sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
                    )}>
                        {/* Top Navigation Bar */}
                        <div className="sticky top-0 z-40 premium-dashboard-topbar lg:top-0">
                            <div className="flex h-12 sm:h-14 items-center justify-between gap-2 px-3 sm:px-4 lg:px-6">
                                {/* Page Info */}
                                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                                    <div className="premium-dashboard-topbar-icon">
                                        <currentPage.icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
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
                                                <span className="font-semibold truncate">{currentPage.title}</span>
                                            </div>
                                        ) : (
                                            <>
                                                <h1 className="text-sm sm:text-base font-semibold truncate leading-tight tracking-tight premium-dashboard-title">
                                                    {currentPage.title}
                                                </h1>
                                                {currentPage.description && (
                                                    <p className="text-[10px] sm:text-xs premium-dashboard-subtitle truncate hidden min-[420px]:block">
                                                        {currentPage.description}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Right Side Actions */}
                                <div className="premium-dashboard-topbar-actions">
                                    <ThemeToggle
                                        variant="ghost"
                                        size="icon"
                                        className="premium-dashboard-icon-btn h-8 w-8 shrink-0"
                                    />
                                    <WalletBadge hidden={user?.userType === 'reseller'} />
                                    <CartIcon hidden={user?.userType === 'reseller'} />
                                    <NotificationBell />

                                    <div className="w-px h-5 hidden sm:block" style={{ background: 'var(--pd-border)' }} />

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                className="relative h-9 w-9 rounded-full p-0 hover:opacity-90 ring-2 ring-emerald-400/20 ring-offset-2 ring-offset-background hover:ring-emerald-400/40 transition-all duration-200"
                                            >
                                                <Avatar className="h-8 w-8 shadow-md shadow-emerald-500/20">
                                                    <AvatarImage src={user?.avatar} alt={user?.name || 'User'} className="object-cover" />
                                                    <AvatarFallback className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-primary text-white text-xs font-bold tracking-wide">
                                                        {user?.name ? getUserInitials(user.name) : 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background shadow-sm" title="Online" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-72 premium-dashboard-dropdown" align="end" forceMount>
                                            <DropdownMenuLabel className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative shrink-0">
                                                        <Avatar className="h-11 w-11 shadow-md shadow-emerald-500/15 ring-2 ring-emerald-400/25">
                                                            <AvatarImage src={user?.avatar} alt={user?.name || 'User'} className="object-cover" />
                                                            <AvatarFallback className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-primary text-white font-bold">
                                                                {user?.name ? getUserInitials(user.name) : 'U'}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 border-2 border-background" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-sm font-medium truncate premium-dropdown-name">
                                                                {loading ? 'Loading...' : (user?.name || 'User')}
                                                            </p>
                                                            {user?.isVerified && (
                                                                <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                            )}
                                                        </div>
                                                        <p className="text-xs premium-dropdown-email truncate">{user?.email}</p>
                                                    </div>
                                                </div>
                                            </DropdownMenuLabel>

                                            <DropdownMenuSeparator className="premium-dropdown-separator" />

                                            <DropdownMenuGroup>
                                                <DropdownMenuItem asChild className="premium-dropdown-item cursor-pointer">
                                                    <Link href="/dashboard/my-account">
                                                        <UserCircle className="mr-2.5 h-4 w-4 premium-dropdown-icon--accent" />
                                                        My Profile
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="premium-dropdown-item cursor-pointer">
                                                    <Link href="/dashboard/activity">
                                                        <Activity className="mr-2.5 h-4 w-4 premium-dropdown-icon" />
                                                        Activity Log
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="premium-dropdown-item cursor-pointer">
                                                    <Link href="/dashboard/support/tickets">
                                                        <MessageCircle className="mr-2.5 h-4 w-4 premium-dropdown-icon" />
                                                        Raise Ticket
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuGroup>

                                            <DropdownMenuSeparator className="premium-dropdown-separator" />

                                            <DropdownMenuGroup>
                                                <DropdownMenuItem asChild className="premium-dropdown-item cursor-pointer">
                                                    <Link href="/dashboard/api-keys">
                                                        <Key className="mr-2.5 h-4 w-4 premium-dropdown-icon" />
                                                        API Keys
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="premium-dropdown-item cursor-pointer">
                                                    <Link href="/dashboard/wallet">
                                                        <WalletIcon className="mr-2.5 h-4 w-4 premium-dropdown-icon" />
                                                        Wallet
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="premium-dropdown-item cursor-pointer">
                                                    <Link href="/dashboard/notifications">
                                                        <Bell className="mr-2.5 h-4 w-4 premium-dropdown-icon" />
                                                        Notifications
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="premium-dropdown-item cursor-pointer">
                                                    <Link href="/knowledge-base">
                                                        <BookOpen className="mr-2.5 h-4 w-4 premium-dropdown-icon" />
                                                        Docs
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuGroup>

                                            <DropdownMenuSeparator className="premium-dropdown-separator" />

                                            <DropdownMenuItem
                                                className="text-red-600 focus:text-red-700 focus:bg-red-500/10 cursor-pointer dark:text-red-400 dark:focus:text-red-300"
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
                        <main className="min-w-0 overflow-x-hidden">
                            {children}
                        </main>
                        <FloatingSupport />
                    </div>

                    {/* Billing Address Prompt Dialog (compulsory — needed for GST invoices) */}
                    <Dialog open={showAddressDialog} onOpenChange={() => { /* compulsory: cannot dismiss */ }}>
                        <DialogContent
                            className="w-[calc(100vw-2rem)] max-w-md mx-auto premium-dashboard-dialog [&>button]:hidden"
                            onPointerDownOutside={(e) => e.preventDefault()}
                            onEscapeKeyDown={(e) => e.preventDefault()}
                            onInteractOutside={(e) => e.preventDefault()}
                        >
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-base">
                                    <MapPin className="h-4 w-4 text-primary" />
                                    Add Your Billing Address
                                </DialogTitle>
                                <DialogDescription className="text-sm">
                                    We need your billing address to generate GST-compliant invoices.
                                    This is required for all accounts.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="addr-line" className="text-sm">Address</Label>
                                    <Input
                                        id="addr-line"
                                        value={addressForm.line}
                                        onChange={(e) => setAddressForm(p => ({ ...p, line: e.target.value }))}
                                        placeholder="House / Building, Street, Area"
                                        className="text-sm h-10"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="addr-city" className="text-sm">City</Label>
                                        <Input
                                            id="addr-city"
                                            value={addressForm.city}
                                            onChange={(e) => setAddressForm(p => ({ ...p, city: e.target.value }))}
                                            placeholder="City"
                                            className="text-sm h-10"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="addr-pin" className="text-sm">PIN Code</Label>
                                        <Input
                                            id="addr-pin"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={addressForm.pincode}
                                            onChange={(e) => setAddressForm(p => ({ ...p, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                            placeholder="6-digit PIN"
                                            className="text-sm h-10"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="addr-state" className="text-sm">State</Label>
                                    <select
                                        id="addr-state"
                                        value={addressForm.state}
                                        onChange={(e) => setAddressForm(p => ({ ...p, state: e.target.value }))}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                        <option value="">Select your state…</option>
                                        {INDIAN_STATES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-muted-foreground">
                                        GST is applied based on your state (CGST+SGST within Maharashtra, otherwise IGST).
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    size="sm"
                                    onClick={handleSaveAddress}
                                    disabled={isSavingAddress}
                                    className="w-full gap-2 text-sm"
                                >
                                    {isSavingAddress ? (
                                        <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />Saving...</>
                                    ) : (
                                        <>Save Billing Address</>
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Phone Number Prompt Dialog */}
                    <Dialog open={showPhoneDialog} onOpenChange={(open) => {
                        if (!open) handleDismissPhone();
                    }}>
                        <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-auto premium-dashboard-dialog">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-base">
                                    <svg className="h-4 w-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    Add Your WhatsApp Number
                                </DialogTitle>
                                <DialogDescription className="text-sm">
                                    Enter your WhatsApp number to receive instant order confirmations, server credentials, and service updates directly on WhatsApp.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-2">
                                <Label htmlFor="phone-prompt" className="text-sm">WhatsApp Number</Label>
                                <Input
                                    id="phone-prompt"
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val.startsWith('+91')) {
                                            setPhoneNumber(val);
                                        }
                                    }}
                                    placeholder="+91 98765 43210"
                                    className="text-sm h-10"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePhone(); }}
                                />
                                <p className="text-xs text-muted-foreground">We'll send order updates to this number via WhatsApp</p>
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
