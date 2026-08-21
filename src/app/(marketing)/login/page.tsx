import LoginPage from '@/components/component/LoginPage'
import { Suspense } from 'react'

type Props = {}

function LoginContent() {
  return <LoginPage />
}

export default function page({ }: Props) {
  return (
    <Suspense fallback={
      <div className="premium-auth-shell premium-auth-shell--centered flex-1 min-h-0 w-full max-w-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/50 text-sm">Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
