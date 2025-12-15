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
      href: '/admin/manageOrders',
      label: 'Orders',
      icon: BarChart3,
    },
    {
      href: '/admin/announcements',
      label: 'Announcements',
      icon: Megaphone,
      badge: 'New'
    },
    {
      href: '/admin/settings',
      label: 'Site Settings',
      icon: Settings,
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
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className='flex flex-col items-center space-y-3'>
          <div className="relative">
            <img src='/oceanlinux.png' className='h-14 w-auto transition-all duration-300 hover:scale-105' alt="OceanLinux" />
          </div>

          <div className='flex items-center space-x-1 opacity-70 hover:opacity-100 transition-opacity'>
            <img src='/backtick.png' className='h-3.5 w-auto' alt="Backtick" />
            <p className="text-[10px] text-muted-foreground">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <nav className="space-y-1.5">
          {/* Main Navigation */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              Main Menu
            </p>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => isMobile && setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 relative",
                  "hover:bg-muted/50",
                  isActive(item.href)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/80 hover:text-foreground"
                )}
              >
                <item.icon className="h-[18px] w-[18px] flex-shrink-0 transition-transform group-hover:scale-105" />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.badge && (
                  <Badge
                    variant={isActive(item.href) ? "secondary" : "outline"}
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-5 font-medium",
                      !isActive(item.href) && "bg-muted border-border"
                    )}
                  >
                    {item.badge}
                  </Badge>
                )}
              </Link>
            ))}
          </div>

          <Separator className="my-4" />

          {/* Knowledge Base Section */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              Content
            </p>
            <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
              <CollapsibleTrigger className={cn(
                "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-muted/50 text-foreground/80 hover:text-foreground",
                "[&[data-state=open]>svg]:rotate-180",
                pathname.includes('/admin/knowledge-base') && "bg-muted/30"
              )}>
                <div className="flex items-center gap-3">
                  <BookOpen className="h-[18px] w-[18px] transition-transform group-hover:scale-105" />
                  <span className="font-medium">Knowledge Base</span>
                </div>
                <ChevronDownIcon className="h-4 w-4 transition-all duration-300" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-1.5">
                {knowledgeItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ml-2",
                      "hover:bg-muted/50",
                      isActive(item.href)
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 transition-transform group-hover:scale-105" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <Badge
                        variant={isActive(item.href) ? "default" : "outline"}
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-5 font-medium",
                          !isActive(item.href) && "bg-muted border-border"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                    {isActive(item.href) && (
                      <ChevronRightIcon className="h-3.5 w-3.5 ml-auto" />
                    )}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>

          <Separator className="my-4" />

          {/* System Section */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              System
            </p>
            <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
              <CollapsibleTrigger className={cn(
                "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-muted/50 text-foreground/80 hover:text-foreground",
                "[&[data-state=open]>svg]:rotate-180",
                (pathname.includes('/admin/settings') || pathname.includes('/admin/status')) && "bg-muted/30"
              )}>
                <div className="flex items-center gap-3">
                  <Settings className="h-[18px] w-[18px] transition-transform group-hover:scale-105" />
                  <span className="font-medium">Settings</span>
                </div>
                <ChevronDownIcon className="h-4 w-4 transition-all duration-300" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-1.5">
                {systemItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && setOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ml-2",
                      "hover:bg-muted/50",
                      isActive(item.href)
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 transition-transform group-hover:scale-105" />
                    <span>{item.label}</span>
                    {isActive(item.href) && (
                      <ChevronRightIcon className="h-3.5 w-3.5 ml-auto" />
                    )}
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </nav>

        {/* Quick Actions Card */}
        <Card className="mt-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Quick Action</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start h-9 bg-card hover:bg-muted border-border"
              onClick={() => {
                router.push('/admin/knowledge-base/generate');
                isMobile && setOpen(false);
              }}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">AI Generate</span>
              <Badge className="ml-auto text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground">
                AI
              </Badge>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-card">
        {/* Theme Toggle */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground">Appearance</span>
          <ThemeToggle />
        </div>

        <Separator className="mb-3" />

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-9 text-sm font-medium transition-all duration-200"
          size="sm"
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <>
              <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
              <span>Signing out...</span>
            </>
          ) : (
            <>
              <LogOutIcon className="h-4 w-4 mr-2" />
              <span>Sign Out</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header with Menu Button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 border-b border-border">
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
            <SheetContent side="left" className="w-72 p-0 border-r border-border">
              <SidebarContent isMobile />
            </SheetContent>
          </Sheet>

          <div className="flex items-center space-x-2">
            <img src='/oceanlinux.png' className='h-8 w-auto' alt="OceanLinux" />
            <span className="text-base font-semibold">Admin</span>
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-72 lg:h-screen lg:fixed lg:inset-y-0 lg:z-10">
        <SidebarContent />
      </div>
    </>
  );
};

export default AdminSidebar;
