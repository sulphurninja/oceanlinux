
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function dashbord() {
  return (
    <div className="bg-background rounded-lg border p-6 w-full max-w-4xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WalletIcon className="w-6 h-6" />
              <span className="text-sm font-medium">Balance</span>
            </div>
            <Button variant="ghost" size="icon" className="text-primary-foreground/80 hover:text-primary-foreground">
              <MoveHorizontalIcon className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-1">
            <div className="text-4xl font-bold">₹1,234.56</div>
          </CardContent>
        </Card>
        <Card className="bg-secondary text-secondary-foreground">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ServerIcon className="w-6 h-6" />
              <span className="text-sm font-medium">Total VPS</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-secondary-foreground/80 hover:text-secondary-foreground"
            >
              <MoveHorizontalIcon className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-1">
            <div className="text-4xl font-bold">124</div>
          </CardContent>
        </Card>
        <Card className="bg-accent text-accent-foreground">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-6 h-6" />
              <span className="text-sm font-medium">Total Active</span>
            </div>
            <Button variant="ghost" size="icon" className="text-accent-foreground/80 hover:text-accent-foreground">
              <MoveHorizontalIcon className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-1">
            <div className="text-4xl font-bold">92</div>
          </CardContent>
        </Card>
        <Card className="bg-muted text-muted-foreground">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClockIcon className="w-6 h-6" />
              <span className="text-sm font-medium">Expired VPS</span>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground/80 hover:text-muted-foreground">
              <MoveHorizontalIcon className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-1">
            <div className="text-4xl font-bold">12</div>
            <div />
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="destructive">
          <PowerIcon className="mr-2 h-4 w-4" />
          Stop All Instances
        </Button>
      </div>
    </div>
  )
}

function ActivityIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  )
}


function ClockIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}


function MoveHorizontalIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="18 8 22 12 18 16" />
      <polyline points="6 8 2 12 6 16" />
      <line x1="2" x2="22" y1="12" y2="12" />
    </svg>
  )
}


function PowerIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
    </svg>
  )
}


function ServerIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  )
}


function WalletIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}


function XIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
