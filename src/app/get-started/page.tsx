import { Suspense } from 'react'
import GetStartedPage from '@/components/component/GetStartedPage'

type Props = {}

function GetStartedContent() {
  return <GetStartedPage />
}

export default function page({ }: Props) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8  dark:border-none-4 border dark:border-none-primary dark:border-none-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <GetStartedContent />
    </Suspense>
  )
}
