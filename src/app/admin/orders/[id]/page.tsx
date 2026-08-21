'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Admin entry point — redirects to the full server control UI
 * (start / stop / format / reboot) with a back link to admin.
 */
export default function AdminOrderManagePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.id as string;
  const userId = searchParams.get('userId');

  useEffect(() => {
    if (!orderId) return;
    const returnTo = userId
      ? `/admin/users/${userId}`
      : searchParams.get('returnTo') || '/admin/manageOrders';
    router.replace(`/dashboard/order/${orderId}?returnTo=${encodeURIComponent(returnTo)}`);
  }, [orderId, userId, router, searchParams]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
