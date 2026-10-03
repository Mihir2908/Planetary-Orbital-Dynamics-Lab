'use client';
import React, { useEffect, useId, useRef } from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { cn } from '@/lib/utils';

// Moving gradient blob that follows the spring-smoothed position with a multiplier
function GradientBlob({
  springX,
  springY,
  color,
  opacity,
  multiplier,
}: {
  springX: MotionValue<number>;
  springY: MotionValue<number>;
  color: string;
  opacity: number;
  multiplier: number;
}) {
  const x = useTransform(springX, (v) => v * multiplier);
  const y = useTransform(springY, (v) => v * multiplier);
  const background = useMotionTemplate`radial-gradient(circle at ${x}px ${y}px, ${color} 0%, transparent 55%)`;
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      style={{ opacity, background }}
    />
  );
}

interface NoiseBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  // dark space-theme gradient colors (default: deep blue/violet/indigo)
  gradientColors?: [string, string, string];
  noiseOpacity?: number;
  speed?: number;
}

export function NoiseBackground({
  children,
  className,
  gradientColors = [
    'rgba(30,58,138,0.75)',   // blue-900
    'rgba(46,16,101,0.60)',   // violet-900
    'rgba(12,74,110,0.55)',   // sky-900
  ],
  noiseOpacity = 0.035,
  speed = 0.06,
}: NoiseBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '_');

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 55, damping: 18 });
  const springY = useSpring(y, { stiffness: 55, damping: 18 });

  const velRef = useRef({ x: 0.4, y: 0.3 });
  const lastChangeRef = useRef(0);

  // Seed initial position at the center of the container
  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    x.set(width / 2);
    y.set(height / 2);
  }, [x, y]);

  useAnimationFrame((time) => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const pad = 32;

    // Randomly redirect every 2–4 seconds
    if (time - lastChangeRef.current > 2000 + Math.random() * 2000) {
      const angle = Math.random() * Math.PI * 2;
      const mag = speed * (0.5 + Math.random() * 0.5);
      velRef.current = { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
      lastChangeRef.current = time;
    }

    let nx = x.get() + velRef.current.x * 16;
    let ny = y.get() + velRef.current.y * 16;

    // Bounce off walls
    if (nx < pad || nx > width - pad || ny < pad || ny > height - pad) {
      const angle = Math.random() * Math.PI * 2;
      const mag = speed * (0.5 + Math.random() * 0.5);
      velRef.current = { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
      lastChangeRef.current = time;
      nx = Math.max(pad, Math.min(width - pad, nx));
      ny = Math.max(pad, Math.min(height - pad, ny));
    }

    x.set(nx);
    y.set(ny);
  });

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden', className)}>
      {/* Three gradient blobs at different multipliers for parallax depth */}
      <GradientBlob springX={springX} springY={springY} color={gradientColors[0]} opacity={0.28} multiplier={1} />
      <GradientBlob springX={springX} springY={springY} color={gradientColors[1]} opacity={0.20} multiplier={0.7} />
      <GradientBlob springX={springX} springY={springY} color={gradientColors[2]} opacity={0.16} multiplier={1.3} />

      {/* SVG fractal noise texture — avoids external CDN dependency */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: noiseOpacity }}
        aria-hidden
      >
        <defs>
          <filter id={`noise_${uid}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.88" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#noise_${uid})`} />
      </svg>

      {children}
    </div>
  );
}
