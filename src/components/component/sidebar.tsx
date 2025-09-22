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
  ChevronRightIcon,
  Plus,
  HelpCircle,
  PanelLeftClose,
  PanelLeft
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
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
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

  const SidebarContent = ({ isMobile = false, isCollapsed = false }: { isMobile?: boolean; isCollapsed?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full bg-foreground text-background dark:bg-background dark:text-foreground border-r border-background/20 dark:border-border/40 transition-all duration-300",
      isCollapsed && !isMobile ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className={cn(
        "border-b border-background/20 dark:border-border/40 transition-all duration-300",
        isCollapsed && !isMobile ? "p-2" : "p-4"
      )}>
        <div className={cn(
          "flex items-center transition-all duration-300",
          isCollapsed && !isMobile ? "justify-center" : "justify-center"
        )}>
          <div className="flex justify-center items-center gap-2">
            <div className="relative">
              <img
                src='/oceanlinux.png'
                className={cn(
                  "transition-all duration-300 hover:scale-105 dark:filter-none",
                  isCollapsed && !isMobile ? "h-14 w-auto" : "h-14 w-auto"
                )}
                alt="OceanLinux"
              />
            </div>

          </div>

          {/* Collapse Toggle (Desktop Only) */}
          {/* {!isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapsed}
              className="h-7 w-7 p-0 hover:bg-background/10 dark:hover:bg-accent/50 rounded-md text-background dark:text-foreground"
            >
              {isCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          )} */}
        </div>

        {/* Backtick Labs Attribution */}
        {(!isCollapsed || isMobile) && (
          <div className='flex justify-center items-center space-x-1 opacity-80 hover:opacity-100 transition-opacity mt-2'>
            <img src='/backtick.png' className='h-4 w-auto dark:filter-none' alt="Backtick" />
            <p className="text-xs text-background/70 dark:text-muted-foreground">A Product of Backtick Labs</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
        <nav className="space-y-1">
          {/* Main Navigation */}
          {(!isCollapsed || isMobile) && (
            <p className="text-xs font-semibold text-background/60 dark:text-muted-foreground uppercase tracking-wider mb-3 px-3">
              Main Menu
            </p>
          )}
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => isMobile && setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 relative",
                "hover:bg-background/10 dark:hover:bg-accent/50 hover:scale-[1.02] active:scale-[0.98]",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground rounded-l-none shadow-lg shadow-primary/20"
                  : "text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground",
                isCollapsed && !isMobile ? "justify-center px-2" : ""
              )}
              title={isCollapsed && !isMobile ? item.label : undefined}
            >
              <item.icon className={cn(
                "flex-shrink-0 transition-transform group-hover:scale-110",
                isCollapsed && !isMobile ? "h-5 w-5" : "h-4 w-4"
              )} />
              {(!isCollapsed || isMobile) && (
                <>
                  <span className="flex-1">{item.label}</span>
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
                </>
              )}
              {isActive(item.href) && (
                <div className="absolute inset-y-0 left-0 w-0.5 bg-primary-foreground rounded-r-full" />
              )}
            </Link>
          ))}

          <Separator className="my-4 bg-background/20 dark:bg-border" />

          {/* Account Section */}
          {/* {(!isCollapsed || isMobile) && (
            <p className="text-xs  font-semibold text-background/60 dark:text-muted-foreground uppercase tracking-wider my-4 pt-4 px-3">
              Account
            </p>
          )} */}
          <Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
            <CollapsibleTrigger className={cn(
              "group flex w-full items-center justify-between  mt-4 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              "hover:bg-background/10 dark:hover:bg-accent/50 text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground",
              "[&[data-state=open]>svg]:rotate-180",
              isCollapsed && !isMobile ? "justify-center px-2" : ""
            )}>
              <div className="flex items-center gap-3">
                <UserIcon className={cn(
                  "transition-transform group-hover:scale-110",
                  isCollapsed && !isMobile ? "h-5 w-5" : "h-4 w-4"
                )} />
                {(!isCollapsed || isMobile) && <span>Account</span>}
              </div>
              {(!isCollapsed || isMobile) && (
                <ChevronDownIcon className="h-4 w-4 transition-all duration-300" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className={cn(
              "space-y-1 pt-1",
              isCollapsed && !isMobile ? "hidden" : ""
            )}>
              {accountItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => isMobile && setOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-6 py-2 text-sm font-medium transition-all duration-200 ml-2",
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

          {/* Quick Action Card */}
          {(!isCollapsed || isMobile) && (
            <div className="mt-6">
              <Card className="bg-gradient-to-br from-primary/60 to-primary/90 border-primary/30 dark:border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Plus className="h-4 w-4 text-primary-foreground" />
                    <h3 className="text-sm font-semibold text-primary-foreground">Quick Actions</h3>
                  </div>
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start h-9 hover:bg-background/10 dark:hover:bg-primary/10 text-primary-foreground hover:text-primary-foreground"
                      onClick={() => {
                        router.push('/dashboard/ipStock');
                        isMobile && setOpen(false);
                      }}
                    >
                      <ServerIcon className="h-4 w-4 mr-2" />
                      <span className="text-sm">New Order</span>
                      <Badge variant="outline" className="ml-auto text-xs border-primary-foreground/30 text-primary-foreground/80">
                        Hot
                      </Badge>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </nav>
      </div>

      {/* Footer */}
      <div className={cn(
        "border-t border-background/20 dark:border-border/40 bg-foreground/95 dark:bg-card/50 transition-all duration-300",
        isCollapsed && !isMobile ? "p-2" : "p-3"
      )}>
        {/* Theme Toggle */}
        <div className={cn(
          "flex items-center mb-3",
          isCollapsed && !isMobile ? "justify-center" : "justify-between"
        )}>
          {(!isCollapsed || isMobile) && (
            <span className="text-xs font-medium text-background/70 dark:text-muted-foreground">Theme</span>
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
            className="w-full justify-start text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground hover:bg-background/10 dark:hover:bg-accent/50 h-8 text-xs mb-2"
          >
            <HelpCircle className="h-3 w-3 mr-2" />
            Help & Support
          </Button>
        )}

        <Separator className="mb-4 bg-background/20 dark:bg-border" />

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          variant="ghost"
          className={cn(
            "transition-all duration-200 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs",
            isCollapsed && !isMobile ? "w-full justify-center px-0" : "w-full justify-start"
          )}
          disabled={isLoggingOut}
          title={isCollapsed && !isMobile ? "Sign Out" : undefined}
        >
          {isLoggingOut ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
          ) : (
            <LogOutIcon className="h-3 w-3" />
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 dark:bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 dark:supports-[backdrop-filter]:bg-background/80 border-b border-border/40 dark:border-border/20">
        <div className="flex items-center justify-between p-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open sidebar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 border-r border-border/40 dark:border-border/20">
              <SidebarContent isMobile />
            </SheetContent>
          </Sheet>

          <div className="flex justify-center items-center space-x-2">
            <img src='/oceanlinux.png' className='h-12 w-auto object-contain' alt="OceanLinux" />
            {/* <span className="text-base font-semibold text-foreground">OceanLinux</span> */}
          </div>

          <div className="flex items-center gap-1">
            <Button
              onClick={() => router.push('/support/tickets')}
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={cn(
        "hidden lg:flex lg:flex-col lg:h-screen lg:fixed lg:inset-y-0 lg:z-10 transition-all duration-300 shadow-xl",
        collapsed ? "lg:w-16" : "lg:w-64"
      )}>
        <SidebarContent isCollapsed={collapsed} />
      </div>
    </>
  );
};

export default ResponsiveSidebar;
