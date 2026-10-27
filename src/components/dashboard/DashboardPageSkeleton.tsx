import { Loader2 } from "lucide-react";

export default function PageLoader() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-label="Loading" />
    </div>
  );
}

export const PlanListSkeleton = PageLoader;
