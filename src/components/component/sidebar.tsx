'use client';

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  Menu,
  NotebookText,
  ReceiptIndianRupee,
  ServerIcon,
  UserIcon,
  ShoppingBag,
  Settings,
  Lock,
  Sparkles,
  ChevronRightIcon,
  Plus,
  HelpCircle
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Card, CardContent } from "@/components/ui/card";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const ResponsiveSidebar = () => {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
      label: 'My Orders',
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
    }
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

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full bg-foreground text-background dark:bg-background dark:text-foreground border-r border-border/40 dark:border-border/20">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-background/20 dark:border-border/40">
        <div className='flex flex-col items-center space-y-3'>
          <div className="relative">
            <img src='/oceanlinux.png' className='h-16 w-auto lg:h-20 transition-all duration-300 hover:scale-105   dark:filter-none' alt="OceanLinux" />

          </div>

          <div className='flex items-center space-x-1 opacity-80 hover:opacity-100 transition-opacity'>
            <img src='/backtick.png' className='h-4 w-auto   dark:filter-none' alt="Backtick" />
            <p className="text-xs text-background/70 dark:text-muted-foreground">A Product of Backtick Labs</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 lg:p-6">
        <nav className="space-y-2">
          {/* Main Navigation */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-background/60 dark:text-muted-foreground uppercase tracking-wider mb-3 px-3">
              Main Menu
            </p>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => isMobile && setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl rounded-l-none px-3 py-3 text-sm font-medium transition-all duration-200 relative",
                  "hover:bg-background/10 dark:hover:bg-accent/50 hover:scale-[1.02] active:scale-[0.98]",
                  isActive(item.href)
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground hover:bg-background/15 dark:hover:bg-accent"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0 transition-transform group-hover:scale-110" />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.badge && (
                  <Badge
                    variant={isActive(item.href) ? "secondary" : "outline"}
                    className={cn(
                      "text-xs px-2 py-0.5 animate-pulse",
                      !isActive(item.href) && "border-background/30 dark:border-border text-background/80 dark:text-foreground"
                    )}
                  >
                    {item.badge}
                  </Badge>
                )}
                {isActive(item.href) && (
                  <div className="absolute inset-y-0 left-0 w-1 bg-primary-foreground rounded-r-full" />
                )}
              </Link>
            ))}
          </div>

          <Separator className="my-6 bg-background/20 dark:bg-border" />

          {/* Account Section */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-background/60 dark:text-muted-foreground uppercase tracking-wider mb-3 px-3">
              Account
            </p>
            <Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
              <CollapsibleTrigger className={cn(
                "group flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                "hover:bg-background/10 dark:hover:bg-accent/50 text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground",
                "[&[data-state=open]>svg]:rotate-180"
              )}>
                <div className="flex items-center gap-3">
                  <UserIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="font-medium">Account</span>
                </div>
                <ChevronDownIcon className="h-4 w-4 transition-all duration-300" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-2">
                {accountItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-6 py-2.5 text-sm font-medium transition-all duration-200 ml-3 relative",
                      "hover:bg-background/10 dark:hover:bg-accent/30",
                      isActive(item.href)
                        ? "bg-background/15 dark:bg-accent text-background dark:text-accent-foreground"
                        : "text-background/70 dark:text-muted-foreground hover:text-background dark:hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 transition-transform group-hover:scale-110" />
                    <span>{item.label}</span>
                    {isActive(item.href) && (
                      <ChevronRightIcon className="h-3 w-3 ml-auto" />
                    )}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </nav>

        {/* Quick Actions Card */}
        <Card className="mt-6 bg-gradient-to-br  to-primary/90 border-primary/30 from-primary/60  dark:border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-background dark:text-foreground">Quick Actions</h3>
            </div>
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-9 hover:bg-background/10 dark:hover:bg-primary/10 text-background dark:text-foreground hover:text-background dark:hover:text-foreground"
                onClick={() => {
                  router.push('/dashboard/ipStock');
                  isMobile && setOpen(false);
                }}
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                <span className="text-sm">New Order</span>
                <Badge variant="outline" className="ml-auto text-xs border-background/30 dark:border-border text-background/80 dark:text-foreground">
                  Hot
                </Badge>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="p-2 lg:p-6 border-t border-background/20 dark:border-border/40 bg-foreground/95 dark:bg-card/50">
        <div className="mb-4">
            <Button
              onClick={() => {
                router.push('/support/tickets')
              }}
              variant="ghost"
              className="w-full justify-start text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground hover:bg-background/10 dark:hover:bg-accent/50 h-10 transition-all duration-200"
              size="sm"
            >
              <HelpCircle className="h-4 w-4 mr-3" />
              <span className="text-sm">Help & Support</span>
            </Button>
          </div>
        {/* Theme Toggle */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-background/70 dark:text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>

        <Separator className="mb-4 bg-background/20 dark:bg-border" />

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-10 transition-all duration-200"
          size="sm"
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <>
              <div className="h-4 w-4 mr-3 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
              <span className="text-sm">Signing out...</span>
            </>
          ) : (
            <>
              <LogOutIcon className="h-4 w-4 mr-3" />
              <span className="text-sm">Sign Out</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header with Menu Button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 dark:border-border/20">
        <div className="flex items-center justify-between p-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SidebarContent isMobile />
            </SheetContent>
          </Sheet>

          <div className="flex items-center space-x-2">
            <img src='/oceanlinux.png' className='h-8 w-auto' alt="OceanLinux" />
            <span className="text-lg font-semibold">OceanLinux</span>
          </div>
          {/* Help/Support Button */}
          <div className="mb-4">
            <Button
              onClick={() => {
                router.push('/support/tickets')
              }}
              variant="ghost"
              className="w-full justify-start text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground hover:bg-background/10 dark:hover:bg-accent/50 h-10 transition-all duration-200"
              size="sm"
            >
              <HelpCircle className="h-4 w-4 mr-3" />
              <span className="text-sm">Help & Support</span>
            </Button>
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-80 lg:h-screen lg:fixed lg:inset-y-0 lg:z-10">
        <SidebarContent />
      </div>
    </>
  );
};

export default ResponsiveSidebar;
