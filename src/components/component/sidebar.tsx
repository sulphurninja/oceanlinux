'use client';

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { performLogoutWithCelebration } from "@/lib/logoutWithCelebration";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { premiumBadge } from '@/lib/premium-badges';
import {
  LayoutDashboardIcon,
  LogOutIcon,
  Menu,
  Terminal,
  ReceiptIndianRupee,
  Store,
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

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
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

  const isCustomer = !user || user?.userType !== 'reseller';
  const isReseller = user?.userType === 'reseller';

  const sidebarNavBadgeClass = (item: NavItem, active: boolean) => {
    if (item.href === '/dashboard/support/tickets' && ticketUnreadCount > 0) {
      return cn(premiumBadge.warning, 'text-[10px] px-2 py-0 h-5 font-medium shrink-0');
    }
    if (item.badge && /^(\d+|99\+)$/.test(item.badge)) {
      return cn(premiumBadge.neutral, 'text-[10px] px-2 py-0 h-5 font-medium tabular-nums shrink-0');
    }
    if (item.href === '/dashboard/ipStock' && item.badge === 'Shop') {
      return cn(
        'premium-sidebar-badge--shop',
        'text-[10px] px-2.5 py-0 h-5 font-semibold shrink-0 tracking-wide'
      );
    }
    if (item.href === '/dashboard/proxy-checker' && item.badge === 'Free') {
      return cn(
        'premium-sidebar-badge--free',
        'text-[10px] px-2.5 py-0 h-5 font-semibold shrink-0 tracking-wide'
      );
    }
    return cn(
      premiumBadge.neutral,
      'text-[10px] px-2 py-0 h-5 font-medium shrink-0',
      active && 'opacity-90'
    );
  };

  const navSections: NavSection[] = [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
      ],
    },
    ...(isCustomer
      ? [{
          id: 'products',
          label: 'Buy plans',
          items: [
            { href: '/dashboard/ipStock', label: 'All Plans', icon: Store, badge: 'Shop' },
            { href: '/dashboard/ipStock?category=Linux', label: 'Linux Servers', icon: Server },
            { href: '/dashboard/ipStock?category=VPS', label: 'Windows VPS', icon: Cloud },
            { href: '/dashboard/ipStock?category=SlotIP', label: 'Premium IP Proxies', icon: Zap },
            { href: '/dashboard/ipStock?category=Trial', label: 'Trial VPS', icon: Sparkles },
          ],
        }]
      : []),
    ...(isReseller
      ? [{
          id: 'reseller',
          label: 'Reseller',
          items: [
            { href: '/dashboard/api-rates', label: 'API Rates', icon: Tag },
            { href: '/dashboard/reseller-wallet', label: 'Reseller Console', icon: Wallet, badge: 'Wallet' },
            { href: '/dashboard/reseller-api-docs', label: 'Reseller API Docs', icon: FileCode },
          ],
        }]
      : []),
    {
      id: 'manage',
      label: 'Manage',
      items: [
        { href: '/dashboard/viewLinux', label: 'Manage Orders', icon: Server },
        { href: '/dashboard/orders', label: 'Order History', icon: ReceiptIndianRupee },
        { href: '/dashboard/scripts', label: 'PuTTY / SSH', icon: Terminal },
        { href: '/dashboard/proxy-checker', label: 'Proxy Checker', icon: Globe, badge: 'Free' },
      ],
    },
    {
      id: 'support',
      label: 'Support & billing',
      items: [
        ...(isCustomer
          ? [
              { href: '/dashboard/wallet', label: 'My Wallet', icon: Wallet },
              {
                href: '/dashboard/cart',
                label: 'Cart',
                icon: ShoppingCart,
                badge: cartCount > 0 ? String(cartCount > 99 ? '99+' : cartCount) : undefined,
              },
            ]
          : []),
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
      ],
    },
    {
      id: 'account',
      label: 'Account',
      items: [
        { href: '/dashboard/my-account', label: 'Profile Settings', icon: Settings },
        { href: '/dashboard/changePassword', label: 'Security', icon: Lock },
      ],
    },
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
    if (pathname.startsWith('/dashboard/order/')) {
      return hrefPath === '/dashboard/viewLinux';
    }
    return pathname === hrefPath;
  };

  const SidebarContent = ({ isMobile = false, isCollapsed = false }: { isMobile?: boolean; isCollapsed?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full premium-dashboard-sidebar border-r transition-all duration-300",
      isCollapsed && !isMobile ? "w-16" : "w-[19rem]"
    )}>
      {/* Header */}
      <div className={cn(
        "border-b border-white/[0.06]",
        isCollapsed && !isMobile ? "px-3 pt-6 pb-3" : "px-3 pt-6 pb-3"
      )}>
        {isCollapsed && !isMobile ? (
          <div className="flex justify-center">
            <img
              src='/ol.png'
              data-ocean-brand-logo
              className="h-9 w-9 object-contain"
              alt="OceanLinux"
            />
          </div>
        ) : (
          <div className="premium-sidebar-brand-card">
            <div className="premium-sidebar-brand-mark">
              <img
                src='/ol.png'
                data-ocean-brand-logo
                className="object-contain"
                alt=""
              />
            </div>
            <div className="min-w-0">
              <p className="text-[1.2rem] font-bold leading-none premium-sidebar-brand tracking-tight whitespace-nowrap m-0">
                OceanLinux
              </p>
              <a
                href="https://backticklabs.io"
                target="_blank"
                rel="noopener noreferrer"
                className="premium-sidebar-brand-credit"
              >
                <span>A product of</span>
                <img src="/backtick.png" className="h-3 w-auto shrink-0" alt="" aria-hidden />
                <span className="premium-sidebar-brand-credit-name">Backtick Labs</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="premium-sidebar-nav-scroll flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 pt-8 pb-6">
        <nav className="space-y-7" aria-label="Dashboard">
          {navSections.map((section) => (
            <div key={section.id} className="space-y-1">
              {(!isCollapsed || isMobile) && (
                <p className="premium-sidebar-nav-heading px-3 pb-1">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  onClick={() => isMobile && setOpen(false)}
                  className={cn(
                    "group flex h-11 items-center gap-3 rounded-lg px-4 text-sm transition-all duration-200",
                    isActive(item.href)
                      ? "premium-dashboard-nav-active"
                      : "premium-dashboard-nav-item",
                    isCollapsed && !isMobile ? "justify-center px-2 py-2.5" : ""
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
                      <span className="min-w-0 flex-1 truncate leading-none pr-2">{item.label}</span>
                      {item.badge ? (
                        <Badge
                          variant="outline"
                          className={cn(sidebarNavBadgeClass(item, isActive(item.href)), 'ml-auto shrink-0')}
                        >
                          {item.badge}
                        </Badge>
                      ) : null}
                    </>
                  )}
                </Link>
              ))}
            </div>
          ))}

        </nav>
      </div>

      {/* Footer — signed-in name, then sign out */}
      <div className={cn(
        "premium-sidebar-footer mt-auto shrink-0 border-t border-white/[0.06] px-4 pt-4 pb-8 space-y-3",
        isCollapsed && !isMobile ? "px-2" : "px-4"
      )}>
        <div className={cn(
          "premium-sidebar-account-card rounded-xl",
          isCollapsed && !isMobile ? "p-2" : "p-3"
        )}>
          {(!isCollapsed || isMobile) ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="premium-sidebar-account-avatar">
                {user?.name ? getUserInitials(user.name) : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate premium-sidebar-brand leading-tight">
                  {user?.name || 'My Account'}
                </p>
                <p
                  className="premium-sidebar-muted mt-0.5 line-clamp-2 break-all leading-snug"
                  title={user?.email || undefined}
                >
                  {user?.email || 'Signed in'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="premium-sidebar-account-avatar">
                {user?.name ? getUserInitials(user.name) : 'U'}
              </div>
            </div>
          )}

        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          title={isCollapsed && !isMobile ? 'Sign Out' : undefined}
          className={cn(
            "premium-sidebar-signout-btn mt-2",
            isCollapsed && !isMobile && "justify-center px-0"
          )}
        >
          {isLoggingOut ? (
            <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-red-400/80 border-t-transparent shrink-0" />
          ) : (
            <LogOutIcon className="h-[18px] w-[18px] shrink-0" />
          )}
          {(!isCollapsed || isMobile) && (
            <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header with Menu Button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 premium-dashboard-mobile-header">
        <div className="relative flex items-center justify-between p-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="premium-dashboard-icon-btn"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(19rem,calc(100vw-2.75rem))] max-w-[19rem] p-0 border-r border-white/[0.06] bg-transparent">
              <SidebarContent isMobile />
            </SheetContent>
          </Sheet>

          <div className="premium-mobile-brand-slot pointer-events-none" aria-hidden="true">
            <img src='/ol.png' data-ocean-brand-logo className='premium-mobile-brand-logo h-10 sm:h-12 w-auto object-contain' alt="" />
          </div>

          <div className="flex items-center gap-1">
            {(!user || user?.userType !== 'reseller') && (
              <Link href="/dashboard/cart" className="relative">
                <Button variant="ghost" size="icon" className="premium-dashboard-icon-btn relative">
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
                className="premium-dashboard-icon-btn relative"
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
        collapsed ? "lg:w-16" : "lg:w-[19rem]"
      )}>
        <SidebarContent isCollapsed={collapsed} />
      </div>
    </>
  );
};

export default ResponsiveSidebar;
