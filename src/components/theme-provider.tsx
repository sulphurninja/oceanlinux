'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, ThemeProviderProps } from 'next-themes'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const pathname = usePathname()

  // Define pages that should be forced to dark mode
  const forceDarkModePages = [
    '/',
    '/login',
    '/register',
    '/hosting',
    '/vps',
    '/series',
    '/live-chat',
    '/about',
    '/contact-us',
    '/privacy-policy',
    '/terms-and-conditions',
    '/refund-policy',
    '/knowledge-base',
    '/support',
    '/status',
    '/get-started'
  ]

  const shouldForceDark = forceDarkModePages.includes(pathname)

  useEffect(() => {
    if (shouldForceDark) {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      // For dashboard and other pages, let the theme system work normally
      document.documentElement.removeAttribute('data-theme')
    }
  }, [shouldForceDark, pathname])

  return (
    <NextThemesProvider
      {...props}
      forcedTheme={shouldForceDark ? 'dark' : undefined}
      attribute="class"
      defaultTheme="system"
      enableSystem={!shouldForceDark}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  )
}
