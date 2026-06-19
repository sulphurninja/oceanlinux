'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DashboardSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
};

export default function DashboardSearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  className,
}: DashboardSearchInputProps) {
  const handleClear = onClear ?? (() => onChange(''));

  return (
    <div className={cn('premium-dashboard-search-wrap', className)}>
      <Search className="premium-dashboard-search-icon" aria-hidden="true" />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="premium-dashboard-search"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          aria-label="Clear search"
          className="premium-dashboard-search-clear"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
