import ResponsiveSidebar from '@/components/component/sidebar'
import { AuthProvider } from '@/contexts/AuthContext'
import React from 'react'

type Props = { children: React.ReactNode }

export default function Layout({ children }: Props) {
    return (
        <AuthProvider>
            <div className='flex min-h-screen bg-background safe-area-top'>
                <ResponsiveSidebar />
                <main className='flex-1 lg:ml-72 min-h-screen'>
                    <div className='pt-16 lg:pt-0 min-h-full safe-area-bottom'>
                        {children}
                    </div>
                </main>
            </div>
        </AuthProvider>
    )
}