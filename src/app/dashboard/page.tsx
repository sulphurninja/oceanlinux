'use client'

import Cards from '@/components/component/Cards'
import React from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboardIcon } from 'lucide-react';

type Props = {}

export default function Dashboard({ }: Props) {
    const { user } = useAuth();
    console.log(user, 'user')
    return (
        <div className='w-full'>
            <div className='h-16 flex items-center border-b gap-2 p-4'>
                <LayoutDashboardIcon />
                <h1 className='text-xl'>Dashboard</h1>
            </div>
            <div className=' '>
                <div className="welcome-back-banner mb-4 p-4 shadow rounded-xl md:flex items-center justify-between">
                    <div className="md:flex items-center">
                        <DotLottieReact
                            src="/welcome.lottie"
                            loop
                            autoplay
                            className="h-36"
                        />
                        <div>
                            <h2 className="md:text-2xl  font-bold text-muted-foreground">Hi {user?.name}, Welcome Back!</h2>
                            <p className="text-muted-foreground">Your overview of activities</p>
                        </div>
                    </div>

                </div>

                <Cards />
            </div>
        </div>
    )
}