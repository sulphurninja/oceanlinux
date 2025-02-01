import CTA from '@/components/landing/CTA'
import Features from '@/components/landing/Features'
import Footer from '@/components/landing/Footer'
import Header from '@/components/landing/Header'
import React from 'react'

type Props = {}

export default function page({ }: Props) {
    return (
        <div className="min-h-screen  text-white">
            <Header />
            <main className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="container mx-auto">
                    <h1 className="text-4xl font-bold mb-8 text-center">Ocean Linux Features</h1>
                    <p className="text-xl mb-12 text-center">
                        Discover the powerful features that make Ocean Linux the best choice for your VPS hosting needs.
                    </p>
                    <Features/>
                </div>
            </main>
            <Footer /></div>
    )
}