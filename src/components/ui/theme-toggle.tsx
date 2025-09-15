'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function ThemeToggle({
  variant = 'ghost',
  size = 'sm',
  className
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant={variant}
        size={size}
        className={cn('relative overflow-hidden', className)}
        disabled
      >
        <div className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className={cn(
        'relative overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95',
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        <Sun
          className={cn(
            'h-4 w-4 transition-all duration-500 ease-in-out',
            theme === 'dark'
              ? 'rotate-90 scale-0 opacity-0'
              : 'rotate-0 scale-100 opacity-100'
          )}
        />
        <Moon
          className={cn(
            'absolute h-4 w-4 transition-all duration-500 ease-in-out',
            theme === 'dark'
              ? 'rotate-0 scale-100 opacity-100'
              : '-rotate-90 scale-0 opacity-0'
          )}
        />
      </div>
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
