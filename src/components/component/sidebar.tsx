'use client';

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  LucideWaves,
  Menu,
  NotebookText,
  ReceiptIndianRupee,
  ServerIcon,
  UserIcon,
  XIcon,
  ShoppingBag,
  Settings,
  Lock,
  Bell,
  CreditCard
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { toast } from 'sonner';

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
      // Call the logout API to clear the httpOnly cookie
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Important: Include cookies in the request
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Clear any localStorage items (if any)
        const itemsToClear = ['lastClientTxnId', 'user', 'preferences'];
        itemsToClear.forEach(item => {
          localStorage.removeItem(item);
          sessionStorage.removeItem(item);
        });

        toast.success('Logged out successfully');

        // Close mobile sidebar if open
        setOpen(false);

        // Force redirect and reload to ensure clean state
        window.location.href = '/login';

      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Logout failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed. Redirecting anyway...');

      // Even if logout API fails, redirect to login
      // The server will handle invalid tokens appropriately
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
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="items-center justify-center p-4 lg:p-6 border-b bg-gradient-to-r from-primary/5 to-transparent">
        <div className='flex items-center justify-center'>
          <img src='/oceanlinux.png' className='h-20 lg:h-24' />
        </div>

        <div className='flex items-center justify-center scale-90'>
          <img src='/backtick.png' className='h-5 lg:h-6' />
          <p className="text-xs lg:text-sm text-muted-foreground">A Product of Backtick Labs</p>
        </div>

        <Link href="/" className="flex items-center gap-3">
          {/* <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <LucideWaves className="h-5 w-5 text-primary" />
          </div> */}
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 lg:p-6">
        <nav className="space-y-1 lg:space-y-2">
          {/* Main Navigation */}
          <div className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => isMobile && setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 lg:py-3 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent/50 hover:scale-[1.02] active:scale-[0.98]",
                  isActive(item.href)
                    ? "bg-primary text-white border border-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <Badge variant="secondary" className="text-xs px-1.5 lg:px-2 py-0.5">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            ))}
          </div>

          <Separator className="my-3 lg:my-4" />

          {/* Account Section */}
          <div className="space-y-1">
            <Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
              <CollapsibleTrigger className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2.5 lg:py-3 text-sm font-medium transition-all duration-200",
                "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                "[&[data-state=open]>svg]:rotate-180"
              )}>
                <div className="flex items-center gap-3">
                  <UserIcon className="h-4 w-4 lg:h-5 lg:w-5" />
                  Account
                </div>
                <ChevronDownIcon className="h-4 w-4 transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-2">
                {accountItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-6 py-2 text-sm font-medium transition-all duration-200",
                      "hover:bg-accent/30 ml-3",
                      isActive(item.href)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </nav>

        {/* Quick Actions */}
        <div className="mt-6 lg:mt-8">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 lg:mb-3">
            Quick Actions
          </h3>
          <div className="space-y-1.5 lg:space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start h-8 lg:h-9"
              onClick={() => {
                router.push('/dashboard/ipStock');
                isMobile && setOpen(false);
              }}
            >
              <ServerIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-2" />
              <span className="text-xs lg:text-sm">New Order</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start h-8 lg:h-9"
              onClick={() => {
                // Add billing functionality
                isMobile && setOpen(false);
              }}
            >
              <CreditCard className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-2" />
              <span className="text-xs lg:text-sm">Billing</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 lg:p-6 border-t bg-muted/20">
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-9"
          size="sm"
        >
          {isLoggingOut ? (
            <>
              <div className="h-4 w-4 mr-3 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
              <span className="text-sm">Signing out...</span>
            </>
          ) : (
            <>
              <LogOutIcon className="h-4 w-4 lg:h-5 lg:w-5 mr-3" />
              <span className="text-sm">Logout</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sidebar */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-3 left-3 z-50 lg:hidden bg-background/80 backdrop-blur-sm border shadow-md h-9 w-9"
          >
            <Menu className="h-4 w-4" />
            <span className="sr-only">Open sidebar</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] sm:w-80 p-0">
          <SidebarContent isMobile />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-72 lg:h-screen lg:fixed lg:inset-y-0 lg:z-10 lg:bg-background lg:border-r lg:shadow-sm">
        <SidebarContent />
      </div>
    </>
  );
};

export default ResponsiveSidebar;