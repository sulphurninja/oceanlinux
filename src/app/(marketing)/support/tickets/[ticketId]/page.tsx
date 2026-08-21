'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Legacy ticket detail URL → dashboard support detail. */
export default function LegacySupportTicketDetailRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = String(params?.ticketId || '');

  useEffect(() => {
    if (ticketId) {
      router.replace(`/dashboard/support/tickets/${ticketId}`);
    } else {
      router.replace('/dashboard/support/tickets');
    }
  }, [router, ticketId]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
