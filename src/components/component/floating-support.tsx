"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import WhatsAppWidget from './whatsapp-widget';

const FloatingSupport = () => {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    router.push('/support/tickets');
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
          aria-label="Get Support"
        >
          <div className="relative">
            <Headset
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
        <div
          className={cn(
            "absolute bottom-16 right-0 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-sm rounded-lg shadow-lg",
            "transition-all duration-200 transform whitespace-nowrap",
            "before:content-[''] before:absolute before:top-full before:right-4 before:border-4 before:border-transparent before:border-t-gray-900 dark:before:border-t-gray-800",
            isHovered
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-2 pointer-events-none"
          )}
        >
          Need Help? Contact Support
        </div>
      </div>
    </div>
  );
};

export default FloatingSupport;
