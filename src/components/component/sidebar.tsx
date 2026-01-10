'use client';

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboardIcon,
  LogOutIcon,
  Menu,
  NotebookText,
  ReceiptIndianRupee,
  ServerIcon,
  ShoppingBag,
  Settings,
  Lock,
  HelpCircle,
  PanelLeftClose,
  PanelLeft,
  FileCode
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Wallet } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const ResponsiveSidebar = ({ user }: { user?: any }) => {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newCollapsed));
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const itemsToClear = ['lastClientTxnId', 'user', 'preferences'];
        itemsToClear.forEach(item => {
          localStorage.removeItem(item);
          sessionStorage.removeItem(item);
        });

        toast.success('Logged out successfully');
        setOpen(false);
        window.location.href = '/login';
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Logout failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed. Redirecting anyway...');
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navItems: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboardIcon,
    },
    {
      href: '/dashboard/ipStock',
      label: 'IP Stock',
      icon: ServerIcon,
      badge: 'Buy Now'
    },
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
      label: 'Scripts',
      icon: NotebookText,
    },
    // Conditionally add Reseller Wallet
    ...(user?.userType === 'reseller' ? [
      {
        href: '/dashboard/reseller-wallet',
        label: 'Reseller Wallet',
        icon: Wallet,
        badge: 'Manage'
      },
      {
        href: '/dashboard/reseller-api-docs',
        label: 'API Documentation',
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

  const isActive = (href: string) => {
    return pathname === href;
  };

  const SidebarContent = ({ isMobile = false, isCollapsed = false }: { isMobile?: boolean; isCollapsed?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full bg- border-r border-border transition-all duration-300",
      isCollapsed && !isMobile ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className={cn(
        "border-b border-border",
        isCollapsed && !isMobile ? "p-4" : "p-5"
      )}>
        <div className={cn(
          "flex items-center gap-3",
          isCollapsed && !isMobile ? "justify-center" : "justify-center"
        )}>
          <img
            src='/ol.png'
            className={cn(
              "transition-all duration-200 hover:scale-105",
              isCollapsed && !isMobile ? "h-20 w-auto" : "h-16 w-auto"
            )}
            alt="OceanLinux"
          />
          {(!isCollapsed || isMobile) && (
            <h1 className="text-2xl font-bold bg-gradient-to-l from-primary to-foreground bg-clip-text text-transparent whitespace-nowrap">
              OceanLinux
            </h1>
          )}
        </div>

        {/* Backtick Labs Attribution */}
        {(!isCollapsed || isMobile) && (
          <div className='flex flex-col items-center gap-1.5 mt-3'>
            <div className="h-px w-12 bg-gradient-to-r from-transparent via-border to-transparent"></div>
            <div className='flex items-center gap-2 opacity-70 hover:opacity-100 transition-all duration-200 group'>
              <span className="text-[9px]  text-white-foreground font-medium uppercase tracking-wider">A Product of</span>
              <img src='/backtick.png' className='h-3.5 dark:invert-[0] invert-[100] w-auto transition-transform group-hover:scale-110' alt="Backtick" />
              <span className="text-[10px] font-semibold ">Backtick Labs</span>
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
                "hover:bg-muted/50",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
                isCollapsed && !isMobile ? "justify-center px-2" : ""
              )}
              title={isCollapsed && !isMobile ? item.label : undefined}
            >
              <item.icon className={cn(
                "flex-shrink-0 transition-transform group-hover:scale-110",
                isCollapsed && !isMobile ? "h-5 w-5" : "h-[18px] w-[18px]"
              )} />
              {(!isCollapsed || isMobile) && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <Badge
                      className={cn(
                        "text-[10px] px-2 py-0 h-5 font-semibold",
                        isActive(item.href)
                          ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
                          : "bg-primary text-primary-foreground border-primary shadow-sm"
                      )}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          ))}

          <Separator className="my-3" />

          {/* Account Items */}
          {accountItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => isMobile && setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                "hover:bg-muted/50",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
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

      {/* Footer */}
      <div className={cn(
        "border-t border-border",
        isCollapsed && !isMobile ? "p-3" : "p-3"
      )}>
        {/* Theme Toggle */}
        <div className={cn(
          "flex items-center mb-2",
          isCollapsed && !isMobile ? "justify-center" : "justify-between"
        )}>
          {(!isCollapsed || isMobile) && (
            <span className="text-xs text-muted-foreground">Theme</span>
          )}
          <ThemeToggle />
        </div>

        {/* Help Link */}
        {(!isCollapsed || isMobile) && (
          <Button
            onClick={() => {
              router.push('/support/tickets');
              isMobile && setOpen(false);
            }}
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/50 h-8 text-sm"
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            Help & Support
          </Button>
        )}

        <Separator className="my-2" />

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          variant="ghost"
          className={cn(
            "transition-all duration-200 text-red-500 hover:text-destructive hover:bg-destructive/10 h-8 text-sm",
            isCollapsed && !isMobile ? "w-full justify-center px-0" : "w-full justify-start"
          )}
          disabled={isLoggingOut}
          title={isCollapsed && !isMobile ? "Sign Out" : undefined}
        >
          {isLoggingOut ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
          ) : (
            <LogOutIcon className="h-4 w-4" />
          )}
          {(!isCollapsed || isMobile) && (
            <span className="ml-2">
              {isLoggingOut ? "Signing out..." : "Sign Out"}
            </span>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header with Menu Button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg- /95 backdrop-blur supports-[backdrop-filter]:bg-card/90 border-b border-border">
        <div className="flex items-center justify-between p-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 hover:bg-muted"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 border-r border-border">
              <SidebarContent isMobile />
            </SheetContent>
          </Sheet>

          <div className="flex justify-center items-center space-x-2">
            <img src='/ol.png' className='h-12 w-auto object-' alt="OceanLinux" />
          </div>

          <div className="flex items-center gap-1">
            <Button
              onClick={() => router.push('/support/tickets')}
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-muted"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
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
