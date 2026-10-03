'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OrbitalHeroSection, type Planet } from '@/components/ui/orbital-hero-section';

function useNarrow(query = '(max-width: 767px)') {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const sync = () => setNarrow(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, [query]);
  return narrow;
}

// Two-body system: a planet (blue) and a moon (red) orbiting the central star.
// All six Keplerian elements are set so the two bodies have clearly distinct
// orbit planes and periods — the helical trails read as two separate paths
// rather than one messy tangle.
const EXOMOON_SYSTEM: Planet[] = [
  {
    name: 'Planet',
    a: 1.0,  e: 0.08, i: 2.5,
    node: 60, peri: 100, M0: 150,
    color: '#4488FF', size: 5.0, glow: 1.3,
  },
  {
    name: 'Moon',
    a: 0.45, e: 0.07, i: 6.5,
    node: 195, peri: 260, M0: 45,
    color: '#FF5555', size: 3.2, glow: 1.1,
  },
];

export default function LandingPage() {
  const narrow = useNarrow();

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <OrbitalHeroSection
        planets={EXOMOON_SYSTEM}
        compress={0.50}
        viewRadius={narrow ? 1.8 : 2.1}
        focus={narrow ? [0.5, 0.82] : [0.70, 0.44]}
        scrim={narrow ? 'top' : 'left'}
        scrimStrength={narrow ? 0.95 : 0.91}
        trailYears={4.0}
        yearSeconds={14}
        planeSpread={0.65}
        eccentricity={0.20}
        showOrbits={true}
        maxTurns={4}
        glow={narrow ? 0.65 : 1.0}
        lead={narrow ? 0.04 : 0.08}
        starCount={1200}
      >
        <div className={`
          flex h-full items-start px-6 pt-16
          sm:px-10
          md:items-center md:pt-0
          lg:px-20
        `}>
          <div className="max-w-[34rem]">
            {/* Eyebrow */}
            <p className="mb-4 text-[0.7rem] font-mono tracking-[0.22em] uppercase text-blue-400/60">
              Exomoon Orbital Integrator
            </p>

            {/* Heading */}
            <h1 className="text-[2.3rem] font-light leading-[1.06] tracking-[-0.03em] text-white sm:text-5xl lg:text-[4rem]">
              A 3-Body Planetary
              <br />
              Orbital Dynamics Lab
            </h1>

            {/* Subtitle */}
            <p className="mt-5 max-w-[27rem] text-[0.9rem] leading-relaxed text-white/50 md:mt-6">
              Not every moon survives. Configure any star-planet-moon system,
              simulate Newtonian three-body dynamics, and map stability and
              habitability across thousands of configurations — from exact physics
              to two-layer ML inference in seconds.
            </p>

            {/* CTA */}
            <div className="mt-8 md:mt-10">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 hover:gap-3"
              >
                Get Started
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            {/* Feature chips */}
            <div className="mt-8 flex flex-wrap gap-2 md:mt-9">
              {[
                'Numba-compiled leapfrog',
                'Habitable zone mapping',
                'Two-layer ML predictor',
                'NASA archive search',
              ].map(f => (
                <span
                  key={f}
                  className="rounded-full border border-white/10 px-3 py-0.5 text-[0.7rem] text-white/35 tracking-wide"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </OrbitalHeroSection>
    </main>
  );
}
