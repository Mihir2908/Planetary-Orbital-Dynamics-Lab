'use client';
import React, { useEffect, useState, useMemo, useCallback } from 'react';

interface TutorialStep {
  title: string;
  body: string;
  targetId: string | null;
  cardSide: 'below' | 'above' | 'left' | 'right' | 'center';
  requiresSim?: boolean;
}

const STEPS: TutorialStep[] = [
  {
    title: 'Welcome to the Exomoon Orbital Integrator',
    body: 'This tool lets you simulate and analyse the orbital stability and habitability of exomoons around distant planets. Follow this quick tour to discover the key features — or click Skip to jump straight in.',
    targetId: null,
    cardSide: 'center',
  },
  {
    title: '3D Orbit Canvas',
    body: 'The main view renders the three-body system in 3D. Yellow = star, blue = planet, red = moon. Drag to rotate, scroll to zoom. The green shell is the star\'s habitable zone (HZ). After running an ML prediction a violet shell shows the predicted stable+habitable orbit range for the selected moon mass.',
    targetId: 'tutorial-canvas-area',
    cardSide: 'center',
    requiresSim: true,
  },
  {
    title: 'Body Legend',
    body: 'This legend identifies the three bodies. Use the Star, Planet, and Moon buttons below it to open parameter panels — set stellar temperature, planet mass, moon orbit radius, and more.',
    targetId: 'tutorial-legend',
    cardSide: 'below',
    requiresSim: true,
  },
  {
    title: 'Stability & Habitability Status',
    body: 'These badges update live as the animation plays. Green "Stable" means the moon is within the Hill sphere. "Habitable" means the moon\'s distance from the star falls within the computed habitable zone. Both badges change colour in real time — red/orange signals an escaped or uninhabitable moon.',
    targetId: 'tutorial-stability-badges',
    cardSide: 'right',
    requiresSim: true,
  },
  {
    title: 'Live System Readout',
    body: 'This panel streams live per-frame data: moon–planet distance as a fraction of the Hill radius, planet–star distance, orbital speeds, moon equilibrium temperature, orbital periods, and cumulative orbit counts. All values update continuously as you scrub or play the animation.',
    targetId: 'tutorial-orbit-data',
    cardSide: 'right',
    requiresSim: true,
  },
  {
    title: 'Star Parameters',
    body: 'Click Star to open the stellar panel. Set the star\'s mass, radius, and surface temperature. These determine the habitable zone boundaries shown as the green shell in the 3D view.',
    targetId: 'tutorial-star-fab',
    cardSide: 'below',
  },
  {
    title: 'Planet & Moon Parameters',
    body: 'Click Planet or Moon to configure those bodies. The moon\'s orbit is expressed in Hill radii — the planet\'s gravitational sphere of influence. A value below ~0.5 Hill radii is typically stable; retrograde orbits remain stable up to ~0.9 Hill radii.',
    targetId: 'tutorial-moon-fab',
    cardSide: 'below',
  },
  {
    title: 'NASA Archive Search',
    body: 'Type in the search box to look up any confirmed exoplanet from the NASA Exoplanet Archive. Selecting a result auto-fills all stellar and planetary parameters — then adjust the moon settings and hit Run.',
    targetId: 'tutorial-nasa-search',
    cardSide: 'below',
  },
  {
    title: 'Run Simulation',
    body: 'Click Run to submit a full three-body simulation to the physics backend. The Numba-compiled leapfrog integrator runs on the cloud and returns the trajectory in roughly 10–60 seconds. The 3D canvas updates automatically when the job completes.',
    targetId: 'tutorial-run-btn',
    cardSide: 'below',
  },
  {
    title: 'Playback Controls',
    body: 'Once a simulation completes, the playback bar appears at the bottom. Scrub through time, play/pause the animation, or change the speed multiplier. The ⊙ Zoom-to-Fit button resets the camera to frame all three bodies if you get lost.',
    targetId: 'tutorial-playback',
    cardSide: 'above',
    requiresSim: true,
  },
  {
    title: 'EDA — Exploratory Data Analysis',
    body: 'Click EDA to open time-series plots of moon-planet distance, orbital speeds, and more. Useful for identifying escape events or studying the quantitative dynamics of your simulated system.',
    targetId: 'tutorial-eda-fab',
    cardSide: 'below',
  },
  {
    title: 'ML Stability Predictor',
    body: 'Click ML to open the stability predictor. Layer 1 runs the MLP classifier across a 50×50 grid of moon mass and orbit radius — results appear in seconds with no simulation needed. Layer 2 runs the physics integrator across the same grid for higher fidelity.',
    targetId: 'tutorial-ml-fab',
    cardSide: 'below',
  },
  {
    title: 'Mini Orbit View',
    body: 'The mini orbit view shows the moon\'s orbit around the planet up close. After an ML prediction, dashed arcs mark the predicted stable orbit bounds — cyan inner edge, violet outer edge. Roche and Hill limit rings appear when previewing individual grid cells.',
    targetId: 'tutorial-mini-orbit',
    cardSide: 'above',
    requiresSim: true,
  },
  {
    title: 'AI Agent Chatbot',
    body: 'The chat button opens the AI agent. Ask it to run simulations, look up exoplanet data from the NASA archive, analyse stability from cached results, or trigger trajectory previews. Try: "Simulate Kepler-442 b with a 0.01 Earth-mass moon for 10 years".',
    targetId: 'tutorial-chat-fab',
    cardSide: 'left',
  },
  {
    title: "You're all set!",
    body: 'That covers the main features. Hit Run with the default parameters to see the system in action, or search for a known exoplanet to begin. You can reopen this tutorial any time via the ? button in the bottom-right corner.',
    targetId: null,
    cardSide: 'center',
  },
];

const CARD_W   = 340;
const CARD_PAD = 16;
const MARGIN   = 12;
const HL_PAD   = 8;

interface HighlightRect { x: number; y: number; w: number; h: number }

interface TutorialOverlayProps {
  onClose: () => void;
  simReady: boolean;
  startStep?: number;
}

export function TutorialOverlay({ onClose, simReady, startStep = 0 }: TutorialOverlayProps) {
  const filteredSteps = useMemo(
    () => simReady ? STEPS : STEPS.filter(s => !s.requiresSim),
    [simReady]
  );

  const [step, setStep] = useState(() => Math.min(startStep, filteredSteps.length - 1));
  const [hl,   setHl]   = useState<HighlightRect | null>(null);
  const [vp,   setVp]   = useState({ w: window.innerWidth, h: window.innerHeight });

  const s      = filteredSteps[step] ?? filteredSteps[0];
  const isLast = step === filteredSteps.length - 1;

  const measure = useCallback(() => {
    if (!s?.targetId) { setHl(null); return; }
    const el = document.getElementById(s.targetId);
    if (!el) { setHl(null); return; }
    const r = el.getBoundingClientRect();
    setHl({ x: r.left - HL_PAD, y: r.top - HL_PAD, w: r.width + HL_PAD * 2, h: r.height + HL_PAD * 2 });
  }, [s?.targetId]);

  useEffect(() => {
    const t = setTimeout(measure, 60);
    return () => clearTimeout(t);
  }, [measure]);

  useEffect(() => {
    const onResize = () => { setVp({ w: window.innerWidth, h: window.innerHeight }); measure(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  const next = () => { if (isLast) { onClose(); } else { setStep(v => v + 1); } };
  const prev = () => setStep(v => Math.max(0, v - 1));

  // ── Card positioning ──────────────────────────────────────────────────────
  let cardStyle: React.CSSProperties;
  if (!hl || s.cardSide === 'center') {
    cardStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: CARD_W };
  } else {
    const cx = hl.x + hl.w / 2;
    const clampLeft = (l: number) => Math.max(MARGIN, Math.min(vp.w - CARD_W - MARGIN, l));

    if (s.cardSide === 'below') {
      cardStyle = { position: 'fixed', top: hl.y + hl.h + CARD_PAD, left: clampLeft(cx - CARD_W / 2), width: CARD_W };
    } else if (s.cardSide === 'above') {
      if (hl.y < vp.h / 2) {
        // Element in top half — place card below it to avoid going off-screen
        cardStyle = { position: 'fixed', top: hl.y + hl.h + CARD_PAD, left: clampLeft(cx - CARD_W / 2), width: CARD_W };
      } else {
        const bottom = vp.h - hl.y + CARD_PAD;
        cardStyle = { position: 'fixed', bottom, left: clampLeft(cx - CARD_W / 2), width: CARD_W };
      }
    } else if (s.cardSide === 'left') {
      const preferred = hl.x - CARD_W - CARD_PAD;
      const left = preferred < MARGIN ? hl.x + hl.w + CARD_PAD : preferred;
      const top  = Math.max(MARGIN, Math.min(vp.h - 280, hl.y + hl.h / 2 - 110));
      cardStyle = { position: 'fixed', top, left, width: CARD_W };
    } else {
      // right
      const left = Math.min(hl.x + hl.w + CARD_PAD, vp.w - CARD_W - MARGIN);
      const top  = Math.max(MARGIN, Math.min(vp.h - 280, hl.y + hl.h / 2 - 110));
      cardStyle = { position: 'fixed', top, left, width: CARD_W };
    }
  }

  return (
    <div className="fixed inset-0 z-[200]" style={{ pointerEvents: 'none' }}>
      {/* SVG overlay with spotlight cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'auto' }}
        onClick={onClose}
      >
        {hl ? (
          <>
            <defs>
              <mask id="tut-spotlight-mask">
                <rect width={vp.w} height={vp.h} fill="white" />
                <rect x={hl.x} y={hl.y} width={hl.w} height={hl.h} rx="7" fill="black" />
              </mask>
            </defs>
            <rect width={vp.w} height={vp.h} fill="rgba(0,0,0,0.62)" mask="url(#tut-spotlight-mask)" />
            <rect x={hl.x} y={hl.y} width={hl.w} height={hl.h} rx="7" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          </>
        ) : (
          <rect width={vp.w} height={vp.h} fill="rgba(0,0,0,0.62)" />
        )}
      </svg>

      {/* Card */}
      <div
        style={{ ...cardStyle, pointerEvents: 'auto' }}
        className="bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-500 tracking-wider uppercase">
            Step {step + 1} / {filteredSteps.length}
          </span>
          <div className="flex gap-1">
            {filteredSteps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === step ? 'bg-blue-400' : 'bg-gray-700 hover:bg-gray-500'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-1.5">{s.title}</h3>
          <p className="text-xs text-gray-400 leading-relaxed">{s.body}</p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-0.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((step + 1) / filteredSteps.length) * 100}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Skip Tutorial
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="px-3 py-1.5 text-xs rounded text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              onClick={next}
              className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              {isLast ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
