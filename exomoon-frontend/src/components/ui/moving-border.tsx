'use client';
import { useRef } from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { cn } from '@/lib/utils';

interface MovingBorderProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  duration?: number;
  containerClassName?: string;
}

export function MovingBorder({
  children,
  duration = 2800,
  className,
  containerClassName,
  disabled,
  ...props
}: MovingBorderProps) {
  const pathRef = useRef<SVGRectElement | null>(null);
  const progress = useMotionValue<number>(0);

  useAnimationFrame((time) => {
    if (disabled) return;
    const el = pathRef.current as unknown as SVGGeometryElement | null;
    const length = el?.getTotalLength?.();
    if (length) {
      progress.set((time * (length / duration)) % length);
    }
  });

  const x = useTransform(progress, (val) => {
    const el = pathRef.current as unknown as SVGGeometryElement | null;
    return el?.getPointAtLength?.(val)?.x ?? 0;
  });
  const y = useTransform(progress, (val) => {
    const el = pathRef.current as unknown as SVGGeometryElement | null;
    return el?.getPointAtLength?.(val)?.y ?? 0;
  });
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <div className={cn('relative overflow-hidden rounded p-[1px]', containerClassName)}>
      {/* Animated gradient dot travelling the border */}
      {!disabled && (
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            width="100%"
            height="100%"
          >
            <rect fill="none" width="100%" height="100%" rx="4" ref={pathRef} />
          </svg>
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 44,
              height: 44,
              background: 'radial-gradient(circle, rgba(96,165,250,0.85) 0%, rgba(59,130,246,0) 62%)',
              borderRadius: '50%',
              transform,
            }}
          />
        </div>
      )}
      <button disabled={disabled} className={cn('relative z-10', className)} {...props}>
        {children}
      </button>
    </div>
  );
}
