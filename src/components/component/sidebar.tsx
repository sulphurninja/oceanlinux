'use client';

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { performLogoutWithCelebration } from "@/lib/logoutWithCelebration";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboardIcon,
  LogOutIcon,
  Menu,
  Terminal,
  ReceiptIndianRupee,
  Store,
  ShoppingBag,
  Settings,
  Lock,
  PanelLeftClose,
  PanelLeft,
  FileCode,
  Server,
  Cloud,
  Zap,
  ShoppingCart,
  Ticket,
  Tag,
  Globe,
  Sparkles,
} from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Wallet } from 'lucide-react';
import { fetchCart, subscribeCart, type CartSnapshot } from '@/lib/cartClient';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const getUserInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

const ResponsiveSidebar = ({ user }: { user?: any }) => {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cartCount, setCartCount] = useState<number>(0);
  const [ticketUnreadCount, setTicketUnreadCount] = useState<number>(0);
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Initialize collapsed state from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (savedCollapsed) {
      setCollapsed(JSON.parse(savedCollapsed));
    }
  }, []);

  // Hydrate cart count + subscribe to updates so the sidebar badge stays
  // in sync after add-to-cart / checkout completion anywhere in the app.
  useEffect(() => {
    if (user?.userType === 'reseller' || user?.userType === 'admin') return;
    let cancelled = false;
    fetchCart()
      .then((snap) => { if (!cancelled) setCartCount(snap.itemCount || 0); })
      .catch(() => { /* unauthenticated — ignore */ });
    const unsub = subscribeCart((snap: CartSnapshot | null) => {
      if (snap) setCartCount(snap.itemCount || 0);
    });
    return () => { cancelled = true; unsub(); };
  }, [user?.userType]);

  const fetchTicketUnreadCount = React.useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets/unread-count', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      setTicketUnreadCount(Number(data.count) || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchTicketUnreadCount();
  }, [user, pathname, fetchTicketUnreadCount]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => fetchTicketUnreadCount();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, fetchTicketUnreadCount]);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newCollapsed));
    window.dispatchEvent(new CustomEvent('sidebar-collapse', { detail: { collapsed: newCollapsed } }));
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

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

        setOpen(false);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Logout failed');
        }

        window.location.href = '/login';
      } catch (error) {
        console.error('Logout error:', error);
        toast.error('Logout failed. Redirecting anyway...');
        window.location.href = '/login';
      } finally {
        setIsLoggingOut(false);
      }
    });
  };

  const navItems: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboardIcon,
    },
    // Plan/store items — hidden for resellers (panel buying is disabled;
    // resellers order via the Reseller API instead).
    ...((!user || user?.userType !== 'reseller') ? [
      {
        href: '/dashboard/ipStock',
        label: 'All Plans',
        icon: Store,
        badge: 'Buy Now'
      },
      {
        href: '/dashboard/ipStock?category=Linux',
        label: 'Linux Servers',
        icon: Server,
      },
      {
        href: '/dashboard/ipStock?category=VPS',
        label: 'Windows VPS',
        icon: Cloud,
      },
      {
        href: '/dashboard/ipStock?category=SlotIP',
        label: 'Premium IP Proxies',
        icon: Zap,
      },
      {
        href: '/dashboard/ipStock?category=Trial',
        label: 'Trial VPS',
        icon: Sparkles,
      },
    ] : []),
    // Reseller rate card lives on its own page — linked above Manage Orders.
    ...(user?.userType === 'reseller' ? [
      {
        href: '/dashboard/api-rates',
        label: 'API Rates',
        icon: Tag,
      },
    ] : []),
    {
      href: '/dashboard/viewLinux',
      label: 'Manage Orders',
      icon: ShoppingBag,
    },
    {
      href: '/dashboard/orders',
      label: 'Order History',
      icon: ReceiptIndianRupee,
    },
    {
      href: '/dashboard/scripts',
      label: 'PuTTY / SSH',
      icon: Terminal,
    },
    {
      href: '/dashboard/proxy-checker',
      label: 'Proxy IP Checker',
      icon: Globe,
      badge: 'Free',
    },
    // Customer wallet + cart entries (hidden for resellers — they have
    // their own reseller wallet flow below).
    ...((!user || user?.userType !== 'reseller') ? [
      {
        href: '/dashboard/wallet',
        label: 'My Wallet',
        icon: Wallet,
      },
      {
        href: '/dashboard/cart',
        label: 'Cart',
        icon: ShoppingCart,
        badge: cartCount > 0 ? String(cartCount > 99 ? '99+' : cartCount) : undefined,
      },
    ] : []),
    {
      href: '/dashboard/support/tickets',
      label: 'Raise Ticket',
      icon: Ticket,
      badge:
        ticketUnreadCount > 0
          ? ticketUnreadCount === 1
            ? 'New reply'
            : `${ticketUnreadCount > 99 ? '99+' : ticketUnreadCount} replies`
          : undefined,
    },
    // Conditionally add Reseller Wallet
    ...(user?.userType === 'reseller' ? [
      {
        href: '/dashboard/reseller-wallet',
        label: 'Reseller Console',
        icon: Wallet,
        badge: 'Wallet'
      },
      {
        href: '/dashboard/reseller-api-docs',
        label: 'Reseller API Docs',
        icon: FileCode,
      }
    ] : [])
  ];

  const accountItems: NavItem[] = [
    {
      href: '/dashboard/my-account',
      label: 'Profile Settings',
      icon: Settings,
    },
    {
      href: '/dashboard/changePassword',
      label: 'Security',
      icon: Lock,
    }
  ];

  const currentSearchParams = useSearchParams();

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split('?');
    if (hrefQuery) {
      const hrefParams = new URLSearchParams(hrefQuery);
      const categoryParam = hrefParams.get('category');
      return pathname === hrefPath && currentSearchParams.get('category') === categoryParam;
    }
    if (hrefPath === '/dashboard/ipStock') {
      return pathname === hrefPath && !currentSearchParams.get('category');
    }
    if (hrefPath === '/dashboard/support/tickets') {
      return pathname === hrefPath || pathname.startsWith('/dashboard/support/tickets/');
    }
    return pathname === hrefPath;
  };

  const SidebarContent = ({ isMobile = false, isCollapsed = false }: { isMobile?: boolean; isCollapsed?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full premium-dashboard-sidebar border-r transition-all duration-300",
      isCollapsed && !isMobile ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className={cn(
        "border-b border-white/[0.06]",
        isCollapsed && !isMobile ? "p-4" : "p-5"
      )}>
        <div className={cn(
          "flex items-center gap-3",
          isCollapsed && !isMobile ? "justify-center" : "justify-center"
        )}>
          <img
            src='/ol.png'
            data-ocean-brand-logo
            className={cn(
              "transition-all duration-200 hover:scale-105",
              isCollapsed && !isMobile ? "h-20 w-auto" : "h-12 w-auto"
            )}
            alt="OceanLinux"
          />
          {(!isCollapsed || isMobile) && (
            <h1 className="text-2xl font-bold premium-sidebar-brand tracking-tight whitespace-nowrap">
              OceanLinux
            </h1>
          )}
        </div>

        {/* Backtick Labs Attribution */}
        {(!isCollapsed || isMobile) && (
          <div className='flex flex-col items-center gap-1.5 mt-3'>
            <div className="h-px w-12 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent premium-sidebar-divider" />
            <div className='flex items-center gap-2 opacity-90 hover:opacity-100 transition-all duration-200 group'>
              <span className="text-[9px] premium-sidebar-muted font-medium uppercase tracking-wider">A Product of</span>
              <img src='/backtick.png' className='h-3.5 w-auto opacity-90 transition-transform group-hover:scale-110' alt="Backtick" />
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Backtick Labs</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        <nav className="space-y-1">
          {/* Main Navigation */}
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => isMobile && setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                isActive(item.href)
                  ? "premium-dashboard-nav-active"
                  : "premium-dashboard-nav-item",
                isCollapsed && !isMobile ? "justify-center px-2" : ""
              )}
              title={isCollapsed && !isMobile ? item.label : undefined}
            >
              <span className="relative shrink-0">
                <item.icon className={cn(
                  "flex-shrink-0 transition-transform group-hover:scale-110",
                  isCollapsed && !isMobile ? "h-5 w-5" : "h-[18px] w-[18px]"
                )} />
                {item.href === '/dashboard/support/tickets' && ticketUnreadCount > 0 && isCollapsed && !isMobile && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-[hsl(158_40%_8%)]" />
                )}
              </span>
              {(!isCollapsed || isMobile) && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <Badge
                      className={cn(
                        "text-[10px] px-2 py-0 h-5 font-semibold border-0",
                        item.href === '/dashboard/support/tickets'
                          ? isActive(item.href)
                            ? "bg-amber-400/25 text-amber-100"
                            : "bg-amber-500/20 text-amber-200"
                          : isActive(item.href)
                            ? "bg-emerald-400/20 text-emerald-200"
                            : "bg-emerald-500/15 text-emerald-300"
                      )}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          ))}

          <Separator className="my-3 premium-sidebar-divider" />

          {/* Account Items */}
          {accountItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => isMobile && setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                isActive(item.href)
                  ? "premium-dashboard-nav-active"
                  : "premium-dashboard-nav-item",
                isCollapsed && !isMobile ? "justify-center px-2" : ""
              )}
              title={isCollapsed && !isMobile ? item.label : undefined}
            >
              <item.icon className={cn(
                "flex-shrink-0 transition-transform group-hover:scale-110",
                isCollapsed && !isMobile ? "h-5 w-5" : "h-[18px] w-[18px]"
              )} />
              {(!isCollapsed || isMobile) && (
                <span className="flex-1">{item.label}</span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {/* Footer — account card + sign out */}
      <div className={cn(
        "shrink-0 p-3",
        isCollapsed && !isMobile ? "px-2" : "px-3"
      )}>
        <div className={cn(
          "premium-sidebar-account-card rounded-xl",
          isCollapsed && !isMobile ? "p-2" : "p-3"
        )}>
          {(!isCollapsed || isMobile) ? (
            <div className="flex items-center gap-2.5 mb-3 min-w-0">
              <div className="premium-sidebar-account-avatar">
                {user?.name ? getUserInitials(user.name) : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate premium-sidebar-brand leading-tight">
                  {user?.name || 'My Account'}
                </p>
                <p className="text-[11px] premium-sidebar-muted truncate mt-0.5">
                  {user?.email || 'Signed in'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div className="premium-sidebar-account-avatar">
                {user?.name ? getUserInitials(user.name) : 'U'}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            title={isCollapsed && !isMobile ? 'Sign Out' : undefined}
            className={cn(
              "premium-sidebar-signout-btn",
              isCollapsed && !isMobile && "px-2"
            )}
          >
            {isLoggingOut ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400/80 border-t-transparent shrink-0" />
            ) : (
              <LogOutIcon className="h-4 w-4 shrink-0" />
            )}
            {(!isCollapsed || isMobile) && (
              <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header with Menu Button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 premium-dashboard-mobile-header">
        <div className="flex items-center justify-between p-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 premium-dashboard-icon-btn"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 border-r border-white/[0.06] bg-transparent">
              <SidebarContent isMobile />
            </SheetContent>
          </Sheet>

          <div className="flex justify-center items-center space-x-2">
            <img src='/ol.png' data-ocean-brand-logo className='h-10 sm:h-12 w-auto object-contain' alt="OceanLinux" />
          </div>

          <div className="flex items-center gap-1">
            {(!user || user?.userType !== 'reseller') && (
              <Link href="/dashboard/cart" className="relative">
                <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/[0.05] relative">
                  <ShoppingCart className="h-4 w-4" />
                  {cartCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-emerald-500 text-emerald-950 text-[9px] font-bold px-1 border-2 border-[hsl(158_40%_8%)]">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </Button>
              </Link>
            )}
            <Link href="/dashboard/support/tickets" className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/[0.05] relative"
                title="Raise Ticket"
              >
                <Ticket className="h-4 w-4" />
                {ticketUnreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-amber-500 text-amber-950 text-[9px] font-bold px-1 border-2 border-[hsl(158_40%_8%)]">
                    {ticketUnreadCount > 99 ? '99+' : ticketUnreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={cn(
        "hidden lg:flex lg:flex-col lg:h-screen lg:fixed lg:inset-y-0 lg:z-10 transition-all duration-300",
        collapsed ? "lg:w-16" : "lg:w-64"
      )}>
        <SidebarContent isCollapsed={collapsed} />
      </div>
    </>
  );
};

export default ResponsiveSidebar;
