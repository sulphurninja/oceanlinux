import LoginPage from '@/components/component/LoginPage'
import { Suspense } from 'react'

type Props = {}

function LoginContent() {
  return <LoginPage />
}

export default function page({ }: Props) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border dark:border-none-4 border dark:border-none-primary border dark:border-none-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
