"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy, Ticket, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import WhatsAppWidget from './whatsapp-widget';

const FloatingSupport = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex flex-col items-end gap-3 max-[480px]:bottom-20">
      <div
        id="site-help-menu"
        role="group"
        aria-label="Help options"
        hidden={!open}
        className={cn(
          "premium-glass-card p-3 flex-col gap-2 min-w-[14rem]",
          open ? "flex" : "hidden"
        )}
      >
        <WhatsAppWidget variant="menu" />
        <button
          type="button"
          onClick={() => router.push('/dashboard/support/tickets')}
          className="premium-btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <Ticket className="h-4 w-4" aria-hidden="true" />
          Raise Ticket
        </button>
      </div>

      <button
        type="button"
        className="premium-btn-primary inline-flex items-center gap-2 rounded-full px-5 min-h-14"
        aria-expanded={open}
        aria-controls="site-help-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <LifeBuoy className="h-5 w-5" aria-hidden="true" />}
        {open ? 'Close' : 'Help'}
      </button>
    </div>
  );
};

export default FloatingSupport;
