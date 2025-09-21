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
  ServerIcon,
  UserIcon,
  Settings,
  Lock,
  ChevronRightIcon,
  Plus,
  Ticket,
  BookOpen,
  Activity,
  Sparkles,
  FileText,
  MessageSquare,
  Users,
  BarChart3,
  Megaphone
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

const AdminSidebar = () => {
  const [open, setOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
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
        const itemsToClear = ['lastClientTxnId', 'admin', 'preferences', 'token'];
        itemsToClear.forEach(item => {
          localStorage.removeItem(item);
          sessionStorage.removeItem(item);
        });

        toast.success('Logged out successfully');
        setOpen(false);
        window.location.href = '/admin/login';
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Logout failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed. Redirecting anyway...');
      window.location.href = '/admin/login';
    } finally {
      setIsLoggingOut(false);
    }
  };


  const navItems: NavItem[] = [
    {
      href: '/admin/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboardIcon,
    },
    {
      href: '/admin/users',
      label: 'Users',
      icon: Users,
      badge: 'Manage'
    },
    {
      href: '/admin/tickets',
      label: 'Support Tickets',
      icon: Ticket,
    },
    {
      href: '/admin/ipStock',
      label: 'IP Stock',
      icon: ServerIcon,
    },
    {
      href: '/admin/orders',
      label: 'Orders',
      icon: BarChart3,
    },
    {
      href: '/admin/announcements',
      label: 'Announcements',
      icon: Megaphone,
      badge: 'New'
    }
  ];

  const knowledgeItems: NavItem[] = [
    {
      href: '/admin/knowledge-base',
      label: 'All Articles',
      icon: FileText,
    },
    {
      href: '/admin/knowledge-base/new',
      label: 'Create Article',
      icon: Plus,
    },
    {
      href: '/admin/knowledge-base/generate',
      label: 'AI Generator',
      icon: Sparkles,
      badge: 'AI'
    }
  ];

  const systemItems: NavItem[] = [
    {
      href: '/admin/settings',
      label: 'System Settings',
      icon: Settings,
    },
    {
      href: '/admin/status',
      label: 'Server Status',
      icon: Activity,
    }
  ];

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Auto-expand sections based on current route
  useEffect(() => {
    if (pathname.includes('/admin/knowledge-base')) {
      setKnowledgeOpen(true);
    }
    if (pathname.includes('/admin/settings') || pathname.includes('/admin/status')) {
      setSystemOpen(true);
    }
  }, [pathname]);

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full bg-foreground text-background dark:bg-background dark:text-foreground border-r border-border/40 dark:border-border/20">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-background/20 dark:border-border/40">
        <div className='flex flex-col items-center space-y-3'>
          <div className="relative">
            <img src='/oceanlinux.png' className='h-16 w-auto lg:h-20 transition-all duration-300 hover:scale-105 dark:filter-none' alt="OceanLinux" />
          </div>

          <div className='flex items-center space-x-1 opacity-80 hover:opacity-100 transition-opacity'>
            <img src='/backtick.png' className='h-4 w-auto dark:filter-none' alt="Backtick" />
            <p className="text-xs text-background/70 dark:text-muted-foreground">Admin Panel</p>
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
                      "text-xs px-2 py-0.5",
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

          {/* Knowledge Base Section */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-background/60 dark:text-muted-foreground uppercase tracking-wider mb-3 px-3">
              Content Management
            </p>
            <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
              <CollapsibleTrigger className={cn(
                "group flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                "hover:bg-background/10 dark:hover:bg-accent/50 text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground",
                "[&[data-state=open]>svg]:rotate-180",
                pathname.includes('/admin/knowledge-base') && "bg-primary/20 dark:bg-primary/10"
              )}>
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="font-medium">Knowledge Base</span>
                </div>
                <ChevronDownIcon className="h-4 w-4 transition-all duration-300" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-2">
                {knowledgeItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-6 py-2.5 text-sm font-medium transition-all duration-200 ml-3 relative",
                      "hover:bg-background/10 dark:hover:bg-accent/30",
                      isActive(item.href)
                        ? "bg-primary text-primary-foreground"
                        : "text-background/70 dark:text-muted-foreground hover:text-background dark:hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 transition-transform group-hover:scale-110" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <Badge
                        variant={isActive(item.href) ? "secondary" : "outline"}
                        className={cn(
                          "text-xs px-2 py-0.5",
                          !isActive(item.href) && "border-background/30 dark:border-border text-background/80 dark:text-foreground"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                    {isActive(item.href) && (
                      <ChevronRightIcon className="h-3 w-3 ml-auto" />
                    )}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>

          <Separator className="my-6 bg-background/20 dark:bg-border" />

          {/* System Section */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-background/60 dark:text-muted-foreground uppercase tracking-wider mb-3 px-3">
              System
            </p>
            <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
              <CollapsibleTrigger className={cn(
                "group flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                "hover:bg-background/10 dark:hover:bg-accent/50 text-background/90 dark:text-foreground/80 hover:text-background dark:hover:text-foreground",
                "[&[data-state=open]>svg]:rotate-180",
                (pathname.includes('/admin/settings') || pathname.includes('/admin/status')) && "bg-primary/20 dark:bg-primary/10"
              )}>
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="font-medium">System</span>
                </div>
                <ChevronDownIcon className="h-4 w-4 transition-all duration-300" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-2">
                {systemItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-6 py-2.5 text-sm font-medium transition-all duration-200 ml-3 relative",
                      "hover:bg-background/10 dark:hover:bg-accent/30",
                      isActive(item.href)
                        ? "bg-primary text-primary-foreground"
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
                  router.push('/admin/knowledge-base/generate');
                  isMobile && setOpen(false);
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                <span className="text-sm">Generate Content</span>
                <Badge variant="outline" className="ml-auto text-xs border-background/30 dark:border-border text-background/80 dark:text-foreground">
                  AI
                </Badge>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="p-4 lg:p-6 border-t border-background/20 dark:border-border/40 bg-foreground/95 dark:bg-card/50">
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
            <span className="text-lg font-semibold">Admin Panel</span>
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

export default AdminSidebar;
