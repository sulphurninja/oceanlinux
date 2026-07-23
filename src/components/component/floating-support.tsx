"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import WhatsAppWidget from './whatsapp-widget';
import { floatingActionTooltip } from './floatingActionTooltip';

const FloatingSupport = () => {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    router.push('/dashboard/support/tickets');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
      {/* WhatsApp Widget - Above Support Button */}
      <WhatsAppWidget />

      {/* Support Button */}
      <div className="relative">
        <Button
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all duration-300 ease-in-out",
            "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800",
            "hover:shadow-xl hover:shadow-blue-500/25 hover:scale-110 active:scale-95",
            "border-2 border-blue-200 dark:border-blue-400/30",
            isHovered && "h-16 w-16"
          )}
          size="icon"
          aria-label="Raise Ticket"
        >
          <div className="relative">
            <Ticket
              className={cn(
                "h-6 w-6 text-white transition-all duration-300",
                isHovered && "h-7 w-7"
              )}
            />

            {/* Pulse animation ring */}
            <div className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
          </div>
        </Button>

        {/* Tooltip */}
        <div className={floatingActionTooltip(isHovered)}>
          Raise Ticket
        </div>
      </div>
    </div>
  );
};

export default FloatingSupport;
