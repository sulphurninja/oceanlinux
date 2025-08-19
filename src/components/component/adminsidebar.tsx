'use client';

import React, { useState } from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import {
  ChevronDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  LucideWaves,
  Menu,
  ReplyIcon,
  ServerIcon,
  UserIcon,
  ExternalLink,
  Play,
  Boxes
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { useRouter, usePathname } from 'next/navigation';

const AdminSidebar = () => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'GET' }).catch(() => {});
      localStorage.removeItem('token');
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const isActive = (path: string) => pathname === path;

  const NavLink = ({ href, children, icon: Icon }: { href: string; children: React.ReactNode; icon: any }) => (
    <Link href={href} prefetch={false}>
      <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-accent ${
        isActive(href) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}>
        <Icon className="h-4 w-4" />
        {children}
      </div>
    </Link>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-6 border-b">
        <LucideWaves className="h-8 w-8" />
        <div>
          <h1 className="font-bold text-lg">Ocean Linux</h1>
          <p className="text-xs text-muted-foreground">Admin Panel</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <NavLink href="/admin/dashboard" icon={LayoutDashboardIcon}>
          Dashboard
        </NavLink>

        <div className="pt-4">
          <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Order Management
          </h3>
          <div className="space-y-1">
            <NavLink href="/admin/manageOrders" icon={ReplyIcon}>
              Manage Orders
            </NavLink>
            <NavLink href="/admin/bulk-provision" icon={Play}>
              Bulk Provision
            </NavLink>
          </div>
        </div>

        <div className="pt-4">
          <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Infrastructure
          </h3>
          <div className="space-y-1">
            <NavLink href="/admin/ipStock" icon={ServerIcon}>
              Add IP Stock
            </NavLink>
            <NavLink href="/admin/manageIpStock" icon={Boxes}>
              Manage IP Stock
            </NavLink>
            <NavLink href="/admin/products" icon={ExternalLink}>
              Hostycare Products
            </NavLink>
          </div>
        </div>

        <div className="pt-4">
          <Collapsible className="space-y-1">
            <CollapsibleTrigger className="flex items-center justify-between w-full rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground [&[data-state=open]>svg]:rotate-90">
              <div className="flex items-center gap-3">
                <UserIcon className="h-4 w-4" />
                Account
              </div>
              <ChevronDownIcon className="h-4 w-4 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-7 space-y-1">
              <Link
                href="/dashboard/changePassword"
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
                prefetch={false}
              >
                Change Password
              </Link>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
        >
          <LogOutIcon className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sidebar */}
      <div className="lg:hidden">
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-background border-b">
          <div className="flex items-center gap-2">
            <LucideWaves className="h-6 w-6" />
            <span className="font-semibold">Ocean Linux</span>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:w-80 lg:flex-col lg:border-r lg:bg-muted/10">
        <SidebarContent />
      </div>
    </>
  );
};

export default AdminSidebar;
