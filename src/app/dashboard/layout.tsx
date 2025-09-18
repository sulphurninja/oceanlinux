import ResponsiveSidebar from '@/components/component/sidebar'
import { AuthProvider } from '@/contexts/AuthContext'
import FloatingSupport from '@/components/component/floating-support'
import React from 'react'

type Props = { children: React.ReactNode }

export default function Layout({ children }: Props) {
    return (
        <AuthProvider>
            <div className='flex min-h-screen w-full bg-background'>
                <ResponsiveSidebar />
                <main className='flex-1 lg:ml-64 transition-all duration-300 ease-in-out'>
                    <div className='pt-16 lg:pt-0 min-h-screen'>
                        {children}
                    </div>
                </main>
                {/* Floating Support Button */}
                <FloatingSupport />
            </div>
        </AuthProvider>
    )
}
