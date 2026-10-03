'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { TrajectoryFrame, SimulationMeta } from '@/lib/types';
import { useSimulationStore } from '@/hooks/useSimulationStore';

// ── Tuning knobs ────────────────────────────────────────────────────────────
const TRAIL_MAX        = 600;   // max trail points per body in the circular buffer
const TARGET_FPS       = 60;
const ORBIT_SPEED_RAD  = 0.08;  // rad/s — auto-rotate speed when not dragging

// Body visual radii expressed as fractions of the planet's semi-major axis.
const STAR_FRAC     = 0.05;
const PLANET_FRAC   = 0.02;
const MOON_FRAC     = 0.01;
const STAR_MIN_R    = 0.003;
const PLANET_MIN_R  = 0.002;
const MOON_MIN_R    = 0.001;

// HZ ring opacity
const HZ_OUTER_OPACITY = 0.13;
// ────────────────────────────────────────────────────────────────────────────

const STAR_BASE_R   = 0.06;
const PLANET_BASE_R = 0.025;
const MOON_BASE_R   = 0.012;

export type FocusTarget =
  | 'barycenter'
  | 'planet' | 'moon'
  | 'fp-star' | 'fp-planet' | 'fp-moon';  // hard-lock (no lerp) — zoom in for first-person

export interface SceneControls {
  frameIndex: number;
  totalFrames: number;
  isPlaying: boolean;
  speedMultiplier: number;
  webGLError: string | null;
  focusTarget: FocusTarget;
  setFrameIndex: (i: number) => void;
  setIsPlaying: (v: boolean) => void;
  setSpeedMultiplier: (v: number) => void;
  resetCamera: () => void;
  setFocusTarget: (t: FocusTarget) => void;
}

export interface BodyRadiiAU {
  star: number;
  planet: number;
  moon: number;
}

export function useOrbitScene(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  frames: TrajectoryFrame[] | null,
  meta: SimulationMeta | null,
  bodyRadii?: BodyRadiiAU
): SceneControls {
  const [frameIndex, setFrameIndexState] = useState(0);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [speedMultiplier, setSpeedMultiplierState] = useState(1);
  const [webGLError, setWebGLError] = useState<string | null>(null);
  const [focusTarget, setFocusTargetState] = useState<FocusTarget>('barycenter');

  const frameIndexRef = useRef(0);
  const isPlayingRef  = useRef(false);
  const speedRef      = useRef(1);
  const framesRef     = useRef<TrajectoryFrame[] | null>(null);

  const rendererRef      = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef      = useRef<EffectComposer | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const sceneRef         = useRef<THREE.Scene | null>(null);
  const cameraRef        = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef      = useRef<OrbitControls | null>(null);
  const rafRef           = useRef<number | null>(null);

  // Auto-rotate state (Motion.dev-style: constant spin + spring release after drag)
  const isDraggingRef      = useRef(false);
  const autoRotVelRef      = useRef(ORBIT_SPEED_RAD);
  const prevAzimuthRef     = useRef(0);
  const frameAzimuthVelRef = useRef(0);

  // Focus target ref (used inside RAF closure — not state, no stale closure issue)
  const focusTargetRef  = useRef<FocusTarget>('barycenter');
  // true for the frames after entering fp-* mode until camera reaches CLOSE_R
  const fpZoomActiveRef = useRef(false);

  const starRef   = useRef<THREE.Mesh | null>(null);
  const planetRef = useRef<THREE.Mesh | null>(null);
  const moonRef   = useRef<THREE.Mesh | null>(null);

  // Three world-space trails: [star (yellow), planet (blue), moon (red)]
  // Ring buffers are written sequentially; display buffers are reordered copies.
  // Separating them eliminates the jump artifact where Three.js draws a line
  // from the newest point back to position[0] when the ring wraps.
  const trailRingBufs  = useRef<Float32Array[]>([]);   // raw ring (write here)
  const trailGeomRefs  = useRef<THREE.BufferGeometry[]>([]);
  const trailLinesRef  = useRef<THREE.Line[]>([]);
  const trailHeadsRef  = useRef<number[]>([0, 0, 0]);  // next write index per trail
  const trailFillsRef  = useRef<number[]>([0, 0, 0]);  // valid point count per trail

  const hzOuterRef = useRef<THREE.Mesh | null>(null);
  const hzInnerRef = useRef<THREE.Mesh | null>(null);

  // ML stability annulus (purple shell between predicted am_min and am_max)
  const mlShellRef = useRef<THREE.Mesh | null>(null);

  const setFrameIndex      = useCallback((i: number) => { frameIndexRef.current = i; setFrameIndexState(i); }, []);
  const setIsPlaying       = useCallback((v: boolean) => { isPlayingRef.current = v; setIsPlayingState(v); }, []);
  const setSpeedMultiplier = useCallback((v: number) => { speedRef.current = v; setSpeedMultiplierState(v); }, []);
  const setFocusTarget     = useCallback((t: FocusTarget) => {
    focusTargetRef.current = t;
    setFocusTargetState(t);
    // Trigger auto fly-in when entering a lock mode
    fpZoomActiveRef.current = t.startsWith('fp-');
  }, []);

  // ── ML store state ───────────────────────────────────────────────────────────
  const { mlPrediction, mlMassIdx } = useSimulationStore();

  // ── Scene initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, failIfMajorPerformanceCaveat: false });
    } catch (err) {
      const isVSCode = /Electron\//.test(navigator.userAgent);
      const msg = err instanceof Error ? err.message : String(err);
      setWebGLError(
        isVSCode
          ? `3D view unavailable in VS Code's browser (${msg}). Open http://localhost:3000 in Chrome or Edge for full functionality.`
          : `WebGL unavailable — ${msg}. Enable hardware acceleration (Chrome/Edge: Settings → System → Use hardware acceleration when available → relaunch).`
      );
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x050a14);
    rendererRef.current = renderer;

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    canvas.parentElement?.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    sceneRef.current = scene;

    // Enhanced starfield — 3 spectral layers at pixel-space size (sizeAttenuation: false)
    // so stars stay crisp at all zoom levels without scaling with the scene.
    const mkStarField = (n: number, color: number, size: number) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 400;
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false })));
    };
    mkStarField(2000, 0xffffff, 1.8);  // bright white — prominent stars
    mkStarField(3000, 0xadd8ff, 1.2);  // blue-white — mid-brightness
    mkStarField(5000, 0x9999bb, 0.8);  // cool dim — faint background

    const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.0001, 500);
    camera.position.set(0, 3, 6);
    cameraRef.current = camera;

    // EffectComposer + UnrealBloom — star's high emissiveIntensity (3.0) crosses the
    // luminance threshold (0.75); planets/moon stay at 0.3 so they do NOT bloom.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.6,   // strength
      0.25,  // radius — tight halo, star only
      0.8,   // luminance threshold
    ));
    // OutputPass must be last: applies renderer.outputColorSpace (sRGB) conversion.
    // Without it, EffectComposer outputs linear values to the canvas and the whole
    // scene looks washed out / lighter than a direct renderer.render() would.
    composer.addPass(new OutputPass());
    composerRef.current = composer;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.001;
    controls.maxDistance = 200;
    controlsRef.current = controls;

    // Motion.dev-style auto-rotate: constant spin with spring-decay after drag release.
    // Drag velocity is measured as azimuthal angle delta per frame, handed to autoRotVel
    // so the scene continues in the drag direction and decays back to ORBIT_SPEED_RAD.
    autoRotVelRef.current  = ORBIT_SPEED_RAD;
    prevAzimuthRef.current = controls.getAzimuthalAngle();
    isDraggingRef.current  = false;

    const onPD = () => { isDraggingRef.current = true; };
    const onPU = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const v = Math.max(-2.4, Math.min(2.4, frameAzimuthVelRef.current));
      autoRotVelRef.current = v !== 0 ? v : ORBIT_SPEED_RAD;
    };
    canvas.addEventListener('pointerdown', onPD);
    canvas.addEventListener('pointerup',   onPU);

    const mkSphere = (r: number, color: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 24),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
      );
      scene.add(m);
      return m;
    };
    starRef.current   = mkSphere(STAR_BASE_R,   0xFFDD00);
    // High emissive so the star exceeds the bloom luminance threshold (planets stay at 0.3)
    (starRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.0;
    planetRef.current = mkSphere(PLANET_BASE_R, 0x4488FF);
    moonRef.current   = mkSphere(MOON_BASE_R,   0xFF5555);

    const mkLabel = (text: string, color: string) => {
      const div = document.createElement('div');
      div.textContent = text;
      div.style.cssText = `font-size:10px;color:${color};font-family:monospace;pointer-events:none;`;
      return new CSS2DObject(div);
    };
    starRef.current.add(mkLabel('★ Star', '#FFD700'));
    planetRef.current.add(mkLabel('● Planet', '#88AAFF'));
    moonRef.current.add(mkLabel('◦ Moon', '#FF8888'));

    // Three world-space trails: star, planet, moon.
    // Each trail has a ring buffer (write) and a display buffer (ordered copy).
    // The display buffer is what Three.js renders — always in chronological order
    // (oldest → newest), so there is no jump segment when the ring wraps around.
    const trailColors = [0xFFDD00, 0x4488FF, 0xFF5555];
    const trailOpacities = [0.40, 0.40, 0.50];
    trailColors.forEach((color, idx) => {
      const ringBuf = new Float32Array(TRAIL_MAX * 3).fill(0);
      const dispBuf = new Float32Array(TRAIL_MAX * 3).fill(0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(dispBuf, 3));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color, opacity: trailOpacities[idx], transparent: true })
      );
      // Disable frustum culling: bounding sphere is stale when the camera zooms
      // close to a body and Three.js incorrectly culls the trail lines.
      line.frustumCulled = false;
      scene.add(line);
      trailRingBufs.current[idx] = ringBuf;
      trailGeomRefs.current[idx] = geo;
      trailLinesRef.current[idx] = line;
      trailHeadsRef.current[idx] = 0;
      trailFillsRef.current[idx] = 0;
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      labelRenderer.setSize(w, h);
      composerRef.current?.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(canvas.parentElement!);

    // RAF loop
    let lastTime = 0;
    const tick = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const delta = timestamp - lastTime;
      if (delta < 1000 / TARGET_FPS) return;
      lastTime = timestamp;

      const f = framesRef.current;
      if (f && f.length > 0) {
        if (isPlayingRef.current) {
          const next = frameIndexRef.current + speedRef.current;
          const clamped = next >= f.length ? 0 : next;
          frameIndexRef.current = clamped;
          setFrameIndexState(Math.floor(clamped));
        }
        updateScene(Math.floor(frameIndexRef.current));
      }

      // ── Motion.dev-style auto-rotate with spring-decay after drag release ────
      const seconds = Math.min(delta / 1000, 0.05);
      const az = controls.getAzimuthalAngle();
      let dAz = az - prevAzimuthRef.current;
      if (dAz >  Math.PI) dAz -= Math.PI * 2;
      if (dAz < -Math.PI) dAz += Math.PI * 2;
      frameAzimuthVelRef.current = dAz / Math.max(seconds, 0.001);
      prevAzimuthRef.current = az;

      if (!isDraggingRef.current) {
        // Exponential spring: velocity decays back toward ORBIT_SPEED_RAD each frame
        autoRotVelRef.current += (ORBIT_SPEED_RAD - autoRotVelRef.current) * 0.025;
        controls.rotateLeft(-autoRotVelRef.current * seconds);
      }

      // ── Focus target — orbit (lerp) or lock (hard-snap) to body ─────────
      const ft = focusTargetRef.current;
      if      (ft === 'planet'    && planetRef.current) controls.target.lerp(planetRef.current.position, 0.1);
      else if (ft === 'moon'      && moonRef.current)   controls.target.lerp(moonRef.current.position,   0.1);
      else if (ft === 'fp-star'   && starRef.current)   controls.target.copy(starRef.current.position);
      else if (ft === 'fp-planet' && planetRef.current) controls.target.copy(planetRef.current.position);
      else if (ft === 'fp-moon'   && moonRef.current)   controls.target.copy(moonRef.current.position);
      else {
        // barycenter — drift back to origin
        controls.target.x *= 0.95;
        controls.target.y *= 0.95;
        controls.target.z *= 0.95;
      }

      // ── Auto fly-in when entering a lock mode ────────────────────────────
      // OrbitControls reads camera.position at the START of update() to derive
      // its spherical coordinates. Setting camera.position here (before update)
      // is the correct way to programmatically zoom without accessing internals.
      if (fpZoomActiveRef.current) {
        const fpBody =
          ft === 'fp-star'   ? starRef.current :
          ft === 'fp-planet' ? planetRef.current :
          ft === 'fp-moon'   ? moonRef.current  : null;
        if (fpBody) {
          const baseR =
            ft === 'fp-star'   ? STAR_BASE_R   :
            ft === 'fp-planet' ? PLANET_BASE_R :
                                 MOON_BASE_R;
          const bodyVisualR = fpBody.scale.x * baseR;
          const closeR = Math.max(bodyVisualR * 6, 0.003);

          const offset = camera.position.clone().sub(fpBody.position);
          const dist   = offset.length();
          if (dist > closeR) {
            // Zoom in 8% per frame — reaches closeR from 5 AU in ~0.6 s at 60 fps
            camera.position.copy(fpBody.position)
              .addScaledVector(offset.normalize(), dist * 0.92);
          } else {
            fpZoomActiveRef.current = false; // body fills viewport — stop auto-zoom
          }
        } else {
          fpZoomActiveRef.current = false;
        }
      }

      controls.update();
      composerRef.current?.render();
      labelRenderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      composerRef.current?.dispose();
      composerRef.current = null;
      canvas.removeEventListener('pointerdown', onPD);
      canvas.removeEventListener('pointerup',   onPU);
      labelRenderer.domElement.remove();
    };
  }, [canvasRef]);

  // ── Update scene when frames / meta change ───────────────────────────────
  useEffect(() => {
    framesRef.current = frames;

    if (!frames || frames.length === 0) return;

    // Reset playback and all trail state; auto-start so both MiniOrbitViews
    // animate immediately when new frames arrive (cell click or physics Run).
    frameIndexRef.current = 0;
    setFrameIndexState(0);
    isPlayingRef.current = true;
    setIsPlayingState(true);
    trailHeadsRef.current = [0, 0, 0];
    trailFillsRef.current = [0, 0, 0];
    trailRingBufs.current.forEach(b => b.fill(0));
    trailGeomRefs.current.forEach(g => {
      g.setDrawRange(0, 0);
      const attr = g.attributes.position as THREE.BufferAttribute;
      (attr.array as Float32Array).fill(0);
      attr.needsUpdate = true;
    });

    // ── Resize body spheres ──────────────────────────────────────────────────
    let apEst = 0;
    for (const f of frames) {
      const d = Math.sqrt((f.planet_x - f.star_x) ** 2 + (f.planet_y - f.star_y) ** 2);
      if (d > apEst) apEst = d;
    }
    if (apEst > 0) {
      let starR: number, planetR: number, moonR: number;
      if (bodyRadii && bodyRadii.star > 0) {
        const maxActual = Math.max(bodyRadii.star, bodyRadii.planet, bodyRadii.moon);
        const targetMax = Math.max(apEst * STAR_FRAC, STAR_MIN_R);
        const sf = targetMax / maxActual;
        starR   = Math.max(bodyRadii.star   * sf, STAR_MIN_R);
        planetR = Math.max(bodyRadii.planet * sf, PLANET_MIN_R);
        moonR   = Math.max(bodyRadii.moon   * sf, MOON_MIN_R);
      } else {
        starR   = Math.max(apEst * STAR_FRAC,   STAR_MIN_R);
        planetR = Math.max(apEst * PLANET_FRAC, PLANET_MIN_R);
        moonR   = Math.max(apEst * MOON_FRAC,   MOON_MIN_R);
      }
      // Cap planet/moon visual radii at the estimated Roche limit (= 2.44 × physical
      // planet radius for equal-density bodies), which is the minimum distance any
      // moon can stably orbit. Guarantees the planet sphere never envelops the moon.
      // Falls back to 1.5 % of rhill when bodyRadii is absent (typical rocky estimate).
      const rocheEstAU =
        bodyRadii && bodyRadii.planet > 0 ? bodyRadii.planet * 2.44
        : meta?.rhill_AU                  ? meta.rhill_AU * 0.015
        : Infinity;
      if (isFinite(rocheEstAU)) {
        planetR = Math.min(planetR, rocheEstAU);
        moonR   = Math.min(moonR,   rocheEstAU * 0.4);
      }
      if (starRef.current)   starRef.current.scale.setScalar(starR   / STAR_BASE_R);
      if (planetRef.current) planetRef.current.scale.setScalar(planetR / PLANET_BASE_R);
      if (moonRef.current)   moonRef.current.scale.setScalar(moonR   / MOON_BASE_R);
    }

    // ── HZ shells ──────────────────────────────────────────────────────────
    const scene = sceneRef.current;
    if (!scene || !meta) return;

    if (hzOuterRef.current) {
      scene.remove(hzOuterRef.current);
      hzOuterRef.current.geometry.dispose();
      (hzOuterRef.current.material as THREE.Material).dispose();
      hzOuterRef.current = null;
    }
    if (hzInnerRef.current) {
      scene.remove(hzInnerRef.current);
      hzInnerRef.current.geometry.dispose();
      (hzInnerRef.current.material as THREE.Material).dispose();
      hzInnerRef.current = null;
    }

    const { a_inner_au, a_outer_au } = meta;

    // ShaderMaterial on the outer sphere: for each surface fragment, cast a ray
    // from the camera through the fragment and check if it first intersects the
    // inner sphere.  Fragments whose ray hits the inner sphere are discarded —
    // they're "above" the interior, not the shell — so only the true shell
    // (between a_inner_au and a_outer_au) is rendered, with no interior tint.
    const shellMat = new THREE.ShaderMaterial({
      uniforms: {
        uInnerR2: { value: a_inner_au * a_inner_au },
        uColor:   { value: new THREE.Color(0x00cc44) },
        uOpacity: { value: HZ_OUTER_OPACITY },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldPos;
        void main() {
          vec4 wp   = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uInnerR2;
        uniform vec3  uColor;
        uniform float uOpacity;
        varying vec3  vWorldPos;
        void main() {
          // Ray from camera toward this outer-sphere surface point.
          // Inner sphere is centred at world origin.
          vec3  oc   = cameraPosition;
          vec3  dir  = normalize(vWorldPos - cameraPosition);
          float b    = dot(oc, dir);
          float c    = dot(oc, oc) - uInnerR2;
          float disc = b * b - c;
          // disc > 0  →  ray intersects inner sphere.
          // t1 = -b - sqrt(disc) > 0  →  entry point is in front of camera,
          // i.e. the inner sphere lies between the camera and this fragment.
          if (disc > 0.0 && (-b - sqrt(disc)) > 0.0) discard;
          gl_FragColor = vec4(uColor, uOpacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hzShell = new THREE.Mesh(
      new THREE.SphereGeometry(a_outer_au, 48, 48),
      shellMat,
    );
    scene.add(hzShell);
    hzOuterRef.current = hzShell;

    // Auto-fit camera to this simulation's extent, then save that position as
    // the reset target so Zoom-to-Fit always snaps back to the per-sim fitted view.
    const allX = frames.map(f => Math.max(Math.abs(f.star_x), Math.abs(f.planet_x), Math.abs(f.moon_x)));
    const maxExtent = Math.max(...allX, a_outer_au) * 1.5;
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, maxExtent * 0.6, maxExtent * 1.2);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
      controlsRef.current.saveState(); // reset() will return here, not to construction-time (0,3,6)
    }

  }, [frames, meta]);

  // ── Per-frame scene update ───────────────────────────────────────────────
  const updateScene = useCallback((idx: number) => {
    const f = framesRef.current;
    if (!f || idx >= f.length) return;
    const frame = f[idx];

    // All three bodies: star (0), planet (1), moon (2)
    const bodies = [
      { mesh: starRef.current,   x: frame.star_x,   y: frame.star_y,   z: frame.star_z },
      { mesh: planetRef.current, x: frame.planet_x, y: frame.planet_y, z: frame.planet_z },
      { mesh: moonRef.current,   x: frame.moon_x,   y: frame.moon_y,   z: frame.moon_z },
    ];

    bodies.forEach(({ mesh, x, y, z }, bi) => {
      if (!mesh) return;
      mesh.position.set(x, y, z);

      const ring = trailRingBufs.current[bi];
      const geo  = trailGeomRefs.current[bi];
      if (!ring || !geo) return;

      const head = trailHeadsRef.current[bi];
      const fill = trailFillsRef.current[bi];

      // Write new position to ring buffer
      ring[head * 3]     = x;
      ring[head * 3 + 1] = y;
      ring[head * 3 + 2] = z;

      const newHead = (head + 1) % TRAIL_MAX;
      const newFill = Math.min(fill + 1, TRAIL_MAX);
      trailHeadsRef.current[bi] = newHead;
      trailFillsRef.current[bi] = newFill;

      // Copy ring → display buffer in chronological order (oldest → newest).
      // When the ring hasn't wrapped yet (newFill < TRAIL_MAX), oldest is index 0.
      // After wrapping, oldest is newHead (the slot about to be overwritten next).
      // This reordering removes the line-jump artifact that occurs when Three.js
      // draws positions[0..N] in buffer order across a wrap boundary.
      const attr = geo.attributes.position as THREE.BufferAttribute;
      const disp = attr.array as Float32Array;
      const oldestIdx = newFill < TRAIL_MAX ? 0 : newHead;
      for (let i = 0; i < newFill; i++) {
        const srcIdx = (oldestIdx + i) % TRAIL_MAX;
        disp[i * 3]     = ring[srcIdx * 3];
        disp[i * 3 + 1] = ring[srcIdx * 3 + 1];
        disp[i * 3 + 2] = ring[srcIdx * 3 + 2];
      }
      attr.needsUpdate = true;
      geo.setDrawRange(0, newFill);
    });
  }, []);

  // ── ML stability annulus ─────────────────────────────────────────────────────
  // When the user moves the moon-mass slider in MlMapOverlay the shell updates
  // in real time to show the valid orbital-radius band for that mass (Hill radii
  // converted to AU using the current simulation's rhill_AU from meta).
  // Uses the identical ShaderMaterial as the HZ shell but violet (0x8b5cf6).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clean up any previous ML shell
    if (mlShellRef.current) {
      scene.remove(mlShellRef.current);
      mlShellRef.current.geometry.dispose();
      (mlShellRef.current.material as THREE.Material).dispose();
      mlShellRef.current = null;
    }

    // Need both a prediction and a rhill_AU from the current sim to draw the shell
    if (!mlPrediction || !meta?.rhill_AU) return;

    const amRange = mlPrediction.validAmPerMm[mlMassIdx];
    if (!amRange) return;   // no valid orbit at this mass

    const rhill      = meta.rhill_AU;
    const amInnerAU  = amRange[0] * rhill;
    const amOuterAU  = amRange[1] * rhill;

    if (amOuterAU <= amInnerAU || amOuterAU <= 0) return;

    // Reuse the same GLSL shader as the HZ shell — only uColor changes
    const shellMat = new THREE.ShaderMaterial({
      uniforms: {
        uInnerR2: { value: amInnerAU * amInnerAU },
        uColor:   { value: new THREE.Color(0x8b5cf6) },   // violet-500
        uOpacity: { value: 0.18 },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldPos;
        void main() {
          vec4 wp   = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uInnerR2;
        uniform vec3  uColor;
        uniform float uOpacity;
        varying vec3  vWorldPos;
        void main() {
          vec3  oc   = cameraPosition;
          vec3  dir  = normalize(vWorldPos - cameraPosition);
          float b    = dot(oc, dir);
          float c    = dot(oc, oc) - uInnerR2;
          float disc = b * b - c;
          if (disc > 0.0 && (-b - sqrt(disc)) > 0.0) discard;
          gl_FragColor = vec4(uColor, uOpacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mlShell = new THREE.Mesh(
      new THREE.SphereGeometry(amOuterAU, 48, 48),
      shellMat,
    );
    scene.add(mlShell);
    mlShellRef.current = mlShell;

  }, [mlPrediction, mlMassIdx, meta]);

  return {
    frameIndex,
    totalFrames: frames?.length ?? 0,
    isPlaying,
    speedMultiplier,
    webGLError,
    focusTarget,
    setFrameIndex,
    setIsPlaying,
    setSpeedMultiplier,
    resetCamera: () => { controlsRef.current?.reset(); },
    setFocusTarget,
  };
}
