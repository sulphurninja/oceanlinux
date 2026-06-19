import { Suspense } from 'react'
import GetStartedPage from '@/components/component/GetStartedPage'

type Props = {}

function GetStartedContent() {
  return <GetStartedPage />
}

export default function page({ }: Props) {
  return (
    <Suspense fallback={
      <div className="premium-auth-shell hero-premium-bg premium-auth-shell--centered h-full">
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
