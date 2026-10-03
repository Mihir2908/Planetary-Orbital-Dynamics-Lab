'use client';
import { cn } from '@/lib/utils';

interface SpotlightNewProps {
  className?: string;
  color?: string;
}

export function SpotlightNew({ className, color = 'rgba(59,130,246,0.09)' }: SpotlightNewProps) {
  return (
    <div
      aria-hidden
      className={cn('absolute inset-0 pointer-events-none overflow-hidden rounded-[inherit]', className)}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full"
        style={{
          height: '55%',
          background: `radial-gradient(ellipse 75% 55% at 50% 0%, ${color} 0%, transparent 100%)`,
        }}
      />
    </div>
  );
}
