'use client';
import React, { useState, useRef, useCallback } from 'react';
import { useSimulationStore } from '@/hooks/useSimulationStore';
import {
  moonEffectiveTempK, orbitalPeriodYr, EARTH_MASS_SOLAR,
} from '@/lib/trajectoryMath';
import type { TrajectoryFrame, SimulationMeta } from '@/lib/types';

interface OrbitOverlayProps {
  frame: TrajectoryFrame | null;
  frameIndex: number;
  totalFrames: number;
  meta: SimulationMeta | null;
}

function fmt(v: number, d = 4) { return v.toFixed(d); }

export function OrbitOverlay({ frame, frameIndex, totalFrames, meta }: OrbitOverlayProps) {
  const { params } = useSimulationStore();
  const [infoOpen,  setInfoOpen]  = useState(false);
  const [infoDragPos, setInfoDragPos] = useState<{ x: number; y: number } | null>(null);
  const infoDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isInfoDraggingRef = useRef(false);

  const onInfoGripMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const modal = (e.currentTarget as HTMLElement).closest('[data-info-modal]') as HTMLElement | null;
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    infoDragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    isInfoDraggingRef.current = true;

    const onMouseMove = (me: MouseEvent) => {
      if (!isInfoDraggingRef.current) return;
      setInfoDragPos({ x: me.clientX - infoDragOffsetRef.current.x, y: me.clientY - infoDragOffsetRef.current.y });
    };
    const onMouseUp = () => {
      isInfoDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  if (!frame || !meta) return null;

  const moonPlanetDist = frame.moon_planet_dist ?? 0;
  const planetStarDist = frame.planet_star_dist ?? 0;
  const moonSpeed      = frame.moon_speed ?? 0;
  const planetSpeed    = frame.planet_speed ?? 0;
  const rhill          = meta.rhill_AU ?? 0;
  const simTime        = frame.t_years ?? 0;

  // Moon–star distance (not stored directly in frame, computed from positions)
  const dx = frame.moon_x - frame.star_x;
  const dy = frame.moon_y - frame.star_y;
  const dz = frame.moon_z - frame.star_z;
  const moonStarDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Stability
  const escaped  = rhill > 0 && moonPlanetDist > rhill;
  const hillFrac = rhill > 0 ? moonPlanetDist / rhill : 0;

  // Habitability: moon within HZ band?
  const inHZ = moonStarDist >= meta.a_inner_au && moonStarDist <= meta.a_outer_au;

  // Moon effective surface temperature
  const moonTempK = moonEffectiveTempK(params.Ts, params.rs_solar, moonStarDist);

  // Orbital periods (Kepler's 3rd law in AU/yr/M_sun)
  const mpSolar   = params.mp_earth * EARTH_MASS_SOLAR;
  const mmSolar   = params.mm_earth * EARTH_MASS_SOLAR;
  const aMoonAU   = params.am_hill * (rhill || 0.01);  // moon semi-major axis (AU)
  const T_planet  = orbitalPeriodYr(params.ap_AU, params.ms_solar + mpSolar);
  const T_moon    = orbitalPeriodYr(aMoonAU, mpSolar + mmSolar);

  // Orbit counters (how many complete orbits in elapsed sim time)
  const planetOrbits = T_planet > 0 ? Math.floor(simTime / T_planet) : 0;
  const moonOrbits   = T_moon   > 0 ? Math.floor(simTime / T_moon)   : 0;

  return (
    <div id="tutorial-orbit-overlay" className="absolute top-3 left-3 pointer-events-none space-y-1.5">
      {/* Stability + habitability badges */}
      <div id="tutorial-stability-badges" className="space-y-1.5">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${
          escaped
            ? 'bg-red-900/70 text-red-300 border border-red-700/50'
            : 'bg-green-900/70 text-green-300 border border-green-700/50'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${escaped ? 'bg-red-400' : 'bg-green-400'}`} />
          {escaped ? 'Moon Escaped' : 'Stable'}
        </div>
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${
          inHZ
            ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-700/50'
            : 'bg-orange-900/70 text-orange-300 border border-orange-700/50'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${inHZ ? 'bg-emerald-400' : 'bg-orange-400'}`} />
          {inHZ ? 'Habitable' : 'Uninhabitable'}
        </div>
      </div>

      {/* Data readouts — no backdrop-blur so objects show through */}
      <div id="tutorial-orbit-data" className="relative bg-black/45 rounded px-2.5 py-2 space-y-1 border border-gray-700/40 min-w-[230px]">
        {/* Info button — pointer-events-auto overrides parent none */}
        <button
          onClick={() => setInfoOpen(v => !v)}
          title="About this readout"
          className="absolute -top-1.5 -right-6 w-5 h-5 flex items-center justify-center rounded-full
                     text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors
                     text-[11px] border border-gray-700/50 bg-gray-900/70 pointer-events-auto"
          style={{ pointerEvents: 'auto' }}
        >
          ℹ
        </button>

        {/* Info modal */}
        {infoOpen && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              style={{ pointerEvents: 'auto' }}
              onClick={() => setInfoOpen(false)}
            />
            <div
              data-info-modal
              className="fixed z-50 w-80 bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl p-5 space-y-3"
              style={infoDragPos
                ? { pointerEvents: 'auto', top: infoDragPos.y, left: infoDragPos.x }
                : { pointerEvents: 'auto', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
              }
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <div
                  onMouseDown={onInfoGripMouseDown}
                  title="Drag to reposition"
                  className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition-colors text-sm leading-none select-none"
                >⠿</div>
                <span className="text-xs font-semibold text-white">Live System Readout</span>
                <div className="ml-auto flex items-center gap-2">
                  {infoDragPos && (
                    <button onClick={() => setInfoDragPos(null)} title="Reset position" className="text-gray-600 hover:text-gray-300 text-[10px] transition-colors">↩</button>
                  )}
                  <button onClick={() => setInfoOpen(false)} className="text-gray-500 hover:text-white text-base leading-none">✕</button>
                </div>
              </div>
              <div className="space-y-2 text-xs text-gray-400 leading-relaxed">
                <p>All values update every frame as the animation plays or is scrubbed.</p>
                <ul className="space-y-1.5 pl-3 list-disc">
                  <li><span className="text-blue-300">Moon–Planet dist</span> — how far the moon is from the planet, in AU, plus what percentage of the planet's Hill radius (gravitational sphere of influence) that distance represents. Once this reaches 100% R_Hill the moon has escaped the planet.</li>
                  <li><span className="text-blue-300">Planet–Star dist</span> — how far the planet is from the star, in AU.</li>
                  <li><span className="text-blue-300">Moon–Star dist</span> — how far the moon is from the star, in AU. This is compared to the habitable zone inner and outer boundaries to decide whether liquid water could exist on the moon's surface.</li>
                  <li><span className="text-blue-300">Moon / Planet speed</span> — how fast the moon and planet are each moving through space at that instant, in AU per year.</li>
                  <li><span className="text-blue-300">Moon T_eff</span> — the equilibrium surface temperature the moon would reach by absorbing and re-emitting the star's radiation at its current distance. Roughly 200–350 K suggests conditions compatible with liquid water.</li>
                  <li><span className="text-blue-300">T_planet / T_moon</span> — how long one complete orbit takes for the planet (around the star) and the moon (around the planet), computed from their orbital radii.</li>
                  <li><span className="text-blue-300">Orbit counters</span> — how many full orbits the planet and moon have each completed since the simulation started.</li>
                </ul>
                <p className="text-gray-500 text-[10px]">Green values are within stable or habitable bounds; red values indicate an escaped or uninhabitable state at that frame.</p>
              </div>
            </div>
          </>
        )}

        <Row label="Time"   value={`${fmt(simTime, 3)} yr`} />
        <Row label="Frame"  value={`${frameIndex + 1} / ${totalFrames}`} />

        <Sep />
        <Row label="Moon–Planet"  value={`${fmt(moonPlanetDist, 4)} AU`} dim={`${fmt(hillFrac * 100, 1)}% R_Hill`} highlight={escaped ? 'red' : 'green'} />
        <Row label="Planet–Star"  value={`${fmt(planetStarDist, 4)} AU`} highlight={inHZ ? 'green' : 'red'} />
        <Row label="Moon–Star"    value={`${fmt(moonStarDist, 4)} AU`}   highlight={inHZ ? 'green' : 'red'} />

        <Sep />
        <Row label="Moon speed"   value={`${fmt(moonSpeed, 3)} AU/yr`} />
        <Row label="Planet speed" value={`${fmt(planetSpeed, 3)} AU/yr`} />

        <Sep />
        <Row label="Moon Teff"    value={`${moonTempK.toFixed(0)} K`} highlight={inHZ ? 'green' : 'red'} />
        {rhill > 0 && <Row label="R_Hill" value={`${fmt(rhill, 4)} AU`} />}

        <Sep />
        <Row label="T_planet" value={T_planet > 0 ? `${fmt(T_planet, 3)} yr` : '—'} />
        <Row label="T_moon"   value={T_moon   > 0 ? `${fmt(T_moon,   4)} yr` : '—'} />

        <Sep />
        <Row label="Planet orbits" value={`${planetOrbits}`} />
        <Row label="Moon orbits"   value={`${moonOrbits}`} />
      </div>
    </div>
  );
}

function Sep() {
  return <div className="border-t border-gray-700/40 my-1" />;
}

function Row({ label, value, dim, highlight }: { label: string; value: string; dim?: string; highlight?: 'green' | 'red' }) {
  const valueColor = highlight === 'green' ? 'text-green-400' : highlight === 'red' ? 'text-red-400' : 'text-blue-300';
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`${valueColor} font-mono text-right`}>
        {value}
        {dim && <span className="text-gray-500 ml-1">{dim}</span>}
      </span>
    </div>
  );
}
