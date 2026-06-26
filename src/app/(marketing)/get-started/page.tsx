import { Suspense } from 'react'
import GetStartedPage from '@/components/component/GetStartedPage'

type Props = {}

function GetStartedContent() {
  return <GetStartedPage />
}

export default function page({ }: Props) {
  return (
    <Suspense fallback={
      <div className="premium-auth-shell premium-auth-shell--signup hero-premium-bg premium-auth-shell--centered flex-1 min-h-0 w-full max-w-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/50 text-sm">Loading...</p>
        </div>
      </div>
    }>
      <GetStartedContent />
    </Suspense>
  )
}
