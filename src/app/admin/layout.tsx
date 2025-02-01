'use client'

import AdminSidebar from '@/components/component/adminsidebar'
import React, { useEffect, useState } from 'react'

type Props = { children: React.ReactNode }

export default function Layout({ children }: Props) {
    const [role, setRole] = useState("");

    useEffect(() => {
        const fetchIPStocks = async () => {
            const response = await fetch('/api/users/me');
            const data = await response.json();
            setRole(data.role);
        };
        fetchIPStocks();
    }, []);

    console.log(role, 'role')



    return (
        <div className='flex overflow-hidden  w-full'>
            <AdminSidebar />
            {role && role === "Admin" ? (
                <div className='w-full '>
                    {children}
                </div>
            ) : "Sorry, You're Not authorized to access the Admin Panel :)"}
        </div>

    )
}