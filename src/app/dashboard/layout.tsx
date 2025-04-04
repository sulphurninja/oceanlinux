
import ResponsiveSidebar from '@/components/component/sidebar'
import { AuthProvider } from '@/contexts/AuthContext'
import React from 'react'

type Props = { children: React.ReactNode }

export default function Layout({ children }: Props) {
    return (
        <AuthProvider>
            <div className='flex overflow-hidden h-full  w-full'>
                <ResponsiveSidebar />
                <div className='w-full md:ml-64 '>
                    {children}
                </div>

            </div>
        </AuthProvider>
    )
}