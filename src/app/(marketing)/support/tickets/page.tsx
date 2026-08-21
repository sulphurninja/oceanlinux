'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Legacy public URL → dashboard support (same sidebar layout). */
export default function LegacySupportTicketRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params?.ticketId ? String(params.ticketId) : '';

  useEffect(() => {
    router.replace(
      ticketId
        ? `/dashboard/support/tickets/${ticketId}`
        : '/dashboard/support/tickets',
    );
  }, [router, ticketId]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
