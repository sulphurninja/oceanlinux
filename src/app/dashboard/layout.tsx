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
    BarChart3,
    Zap,
    ChevronRight,
    Package
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { SessionAlertProvider } from '@/components/session-alert';
import FloatingSupport from '@/components/component/floating-support';

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

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const response = await fetch('/api/users/me');
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        } finally {
            setLoading(false);
        }
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
                description: 'Browse and purchase available servers',
                icon: Package,
                // breadcrumb: [{ name: 'Dashboard', href: '/dashboard' }]
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
                    {/* Sidebar */}
                    <ResponsiveSidebar user={user} />

                    {/* Main Content Area */}
                    <div className="lg:pl-64">
                        {/* Top Navigation Bar */}
                        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm lg:top-0">
                            <div className="flex h-16 items-center justify-between px-4 lg:px-6">
                                {/* Page Info */}
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {/* Page Icon */}
                                        <div className="w-8 h-8 bg-primary /10 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <currentPage.icon className="h-4 w-4 text-white" />
                                        </div>

                                        {/* Page Title and Breadcrumb */}
                                        <div className="min-w-0 flex-1">
                                            {/* Breadcrumb */}
                                            {currentPage.breadcrumb && currentPage.breadcrumb.length > 0 && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                                                    {currentPage.breadcrumb.map((crumb, index) => (
                                                        <div key={crumb.href} className="flex items-center gap-1">
                                                            <Link
                                                                href={crumb.href}
                                                                className="hover:text-foreground transition-colors"
                                                            >
                                                                {crumb.name}
                                                            </Link>
                                                            <ChevronRight className="h-3 w-3" />
                                                        </div>
                                                    ))}
                                                    <span className="text-foreground">{currentPage.title}</span>
                                                </div>
                                            )}

                                            {/* Page Title */}
                                            <div className="flex items-center gap-2">
                                                <h1 className="text-lg font-semibold truncate">
                                                    {currentPage.title}
                                                </h1>

                                                {/* Add badges for special pages */}
                                                {pathname === '/dashboard/ipStock' && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        <Zap className="h-3 w-3 mr-1" />
                                                        Hot
                                                    </Badge>
                                                )}

                                                {pathname === '/dashboard/activity' && (
                                                    <Badge variant="outline" className="text-xs">
                                                        New
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Page Description (hidden on mobile) */}
                                            {currentPage.description && (
                                                <p className="text-xs text-muted-foreground hidden sm:block truncate">
                                                    {currentPage.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side Actions */}
                                <div className="flex items-center gap-3">
                                    {/* Notifications */}
                                    <NotificationBell />

                                    {/* User Dropdown */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                                                <Avatar className="h-10 w-10">
                                                    <AvatarImage src={user?.avatar} alt={user?.name || 'User'} />
                                                    <AvatarFallback className="bg-primary text-primary-foreground">
                                                        {user?.name ? getUserInitials(user.name) : 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-80" align="end" forceMount>
                                            {/* User Info Header */}
                                            <DropdownMenuLabel className="p-4 pb-2">
                                                <div className="flex items-start gap-3">
                                                    <Avatar className="h-12 w-12">
                                                        <AvatarImage src={user?.avatar} alt={user?.name || 'User'} />
                                                        <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                                                            {user?.name ? getUserInitials(user.name) : 'U'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-semibold truncate">
                                                                {loading ? 'Loading...' : (user?.name || 'User')}
                                                            </p>
                                                            {user?.isVerified && (
                                                                <Shield className="h-4 w-4 text-green-500" title="Verified Account" />
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-muted-foreground truncate">
                                                            {user?.email}
                                                        </p>
                                                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                                            {user?.phone && (
                                                                <div className="flex items-center gap-1">
                                                                    <Phone className="h-3 w-3" />
                                                                    <span>{user.phone}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-1">
                                                                <Calendar className="h-3 w-3" />
                                                                <span>Joined {user?.createdAt ? formatJoinDate(user.createdAt) : 'Recently'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </DropdownMenuLabel>

                                            <DropdownMenuSeparator />



                                            <DropdownMenuSeparator />

                                            {/* Menu Items */}
                                            <DropdownMenuGroup>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/my-account" className="cursor-pointer">
                                                        <UserCircle className="mr-3 h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div>My Profile</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Manage your account settings
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </DropdownMenuItem>

                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/activity" className="cursor-pointer">
                                                        <Activity className="mr-3 h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div>Activity Log</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                View your account activity
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </DropdownMenuItem>

                                                <DropdownMenuItem asChild>
                                                    <Link href="/support/tickets" className="cursor-pointer">
                                                        <MessageCircle className="mr-3 h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div>Support Center</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Get help and create tickets
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </DropdownMenuItem>

                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/api-keys" className="cursor-pointer">
                                                        <Key className="mr-3 h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div>API Keys</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Manage your API access
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </DropdownMenuItem>

                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/billing" className="cursor-pointer">
                                                        <CreditCard className="mr-3 h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div>Billing & Usage</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                View invoices and usage
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuGroup>

                                            <DropdownMenuSeparator />

                                            <DropdownMenuGroup>
                                                <DropdownMenuItem asChild>
                                                    <Link href="/knowledge-base" className="cursor-pointer">
                                                        <BookOpen className="mr-3 h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div>Knowledge Base</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Documentation and guides
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </DropdownMenuItem>

                                                <DropdownMenuItem asChild>
                                                    <Link href="/dashboard/notifications" className="cursor-pointer">
                                                        <Bell className="mr-3 h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div>Notifications</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Manage notification settings
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuGroup>

                                            <DropdownMenuSeparator />

                                            <DropdownMenuItem
                                                className="text-red-600 focus:text-red-600 cursor-pointer"
                                                onClick={handleLogout}
                                            >
                                                <LogOut className="mr-3 h-4 w-4" />
                                                <div className="flex-1">
                                                    <div>Sign Out</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        Logout from your account
                                                    </div>
                                                </div>
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

                </div>
            </AuthProvider>
        </SessionAlertProvider>
    );
}
