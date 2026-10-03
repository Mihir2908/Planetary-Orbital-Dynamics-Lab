'use client';
import { cn } from '@/lib/utils';

interface AuroraLayerProps {
  className?: string;
  opacity?: number;
}

export function AuroraLayer({ className, opacity = 0.18 }: AuroraLayerProps) {
  return (
    <div
      aria-hidden
      className={cn('absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none', className)}
    >
      <div
        className="absolute inset-[-30%] animate-aurora blur-[18px]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(100deg, #3b82f6 10%, #818cf8 18%, #06b6d4 25%, #8b5cf6 32%, #3b82f6 40%)',
          backgroundSize: '300% 200%',
          opacity,
        }}
      />
    </div>
  );
}
