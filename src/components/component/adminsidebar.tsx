'use client';

import React, { useState } from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose, SheetOverlay } from "@/components/ui/sheet";
import { ChevronDownIcon, LayoutDashboardIcon, LogOutIcon, LucideWaves, Menu, ReplyIcon, ServerIcon, UserIcon, XIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { useRouter } from 'next/navigation';

const AdminSidebar = () => {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const handleLogout = async () => {
        try {
            const response = await fetch('/api/logout', { method: 'GET' });
            const data = await response.json();
            console.log(data.message); // 'Logout successful'

            // Additional client-side cleanup
            localStorage.removeItem('token');
            router.push('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };


    return (
        <div className="flex">
            {/* Mobile Sidebar */}
            <Sheet open={open} onOpenChange={setOpen} >
                <SheetTrigger asChild className='lg:hidden'>
                    <Button variant="ghost" size="icon" className="p-4">
                        {/* <XIcon className="h-5 w-5" /> */}
                        <Menu className='absolute left-0 ml-2 top-6' />
                        <span className="sr-only">Open sidebar</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 lg:hidden">
                    {/* <SheetOverlay /> */}
                    {/* Sidebar Content */}
                    <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between p-4 shadow-md">
                            <Link href="/" prefetch={false}>
                                <h1 className="flex items-center gap-2 font-semibold">
                                    <LucideWaves className="h-6" />
                                    Ocean Linux
                                </h1>
                            </Link>
                            {/* <SheetClose asChild>
                <Button variant="ghost" size="icon">
                  <XIcon className="h-5 w-5" />
                  <span className="sr-only">Close sidebar</span>
                </Button>
              </SheetClose> */}
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <nav className="flex flex-col space-y-1 p-4">
                                {/* Navigation Links */}
                                <Link href="/admin/dashboard" prefetch={false}>
                                    <h1 className="flex items-center gap-2 rounded-md p-2 ">
                                        <LayoutDashboardIcon className="h-5 w-5" />
                                        Dashboard
                                    </h1>
                                </Link>
                                <Link href="/admin/ipStock" prefetch={false}>
                                    <h1 className="flex items-center gap-2 rounded-md p-2 ">
                                        <ServerIcon className="h-5 w-5" />
                                        Add IP Stock
                                    </h1>
                                </Link>
                                <Link href="/admin/orders" prefetch={false}>
                                    <h1 className="flex items-center gap-2 rounded-md p-2 ">
                                        <ReplyIcon className="h-5 w-5" />
                                        Update Orders
                                    </h1>
                                </Link>
                            </nav>
                        </div>
                        <div className="p-4 border-t">

                            <h1 onClick={handleLogout} className="flex items-center gap-2 rounded-md p-2 ">
                                <LogOutIcon className="h-5 w-5" />
                                Logout
                            </h1>

                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Permanent Sidebar for Large Screens */}
            <div className="hidden lg:flex  lg:flex-col lg:w-64 lg:h-screen lg:inset-y-0 lg:z-10 lg:bg-background lg:border-r lg:shadow-lg">
                <div className="flex items-center justify-between p-4 shadow-md">
                    <Link href="/" prefetch={false}>
                        <h1 className="flex items-center gap-2 font-semibold">
                            <LucideWaves className="h-6" />
                            Ocean Linux
                        </h1>
                    </Link>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <nav className="flex flex-col space-y-2 p-4">
                        <Link href="/admin/dashboard" prefetch={false}>
                            <h1 className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white -foreground">
                                <LayoutDashboardIcon className="h-5 w-5" />
                                Dashboard
                            </h1>
                        </Link>
                        <Link href="/admin/orders" prefetch={false}>
                            <h1 className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white -foreground">
                                <ReplyIcon className="h-5 w-5" />
                                Update Orders
                            </h1>
                        </Link>
                        <Link href="/admin/ipStock" prefetch={false}>
                            <h1 className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white -foreground">
                                <ServerIcon className="h-5 w-5" />
                                Add IP Stock
                            </h1>
                        </Link>
                        <Collapsible className="grid gap-2">
                            <CollapsibleTrigger className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white -foreground [&[data-state=open]>svg]:rotate-90">
                                <div className="flex items-center gap-2">
                                    <UserIcon className="h-5 w-5" />
                                    Account
                                </div>
                                <ChevronDownIcon className="h-4 w-4 transition-transform" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="grid gap-2 px-3">
                                <Link
                                    href="#"
                                    className="flex items-center gap-2 rounded-xl py-2 px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white -foreground"
                                    prefetch={false}
                                >
                                    My Account
                                </Link>
                                <Link
                                    href="/dashboard/changePassword"
                                    className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white -foreground"
                                    prefetch={false}
                                >
                                    Change Password
                                </Link>
                            </CollapsibleContent>
                        </Collapsible>
                    </nav>
                </div>
                <div className="p-4 border-t">

                    <h1 onClick={handleLogout} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-white -foreground">
                        <LogOutIcon className="h-5 w-5" />
                        Logout
                    </h1>


                </div>
            </div>
        </div>
    );
};

export default AdminSidebar;
