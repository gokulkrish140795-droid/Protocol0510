/**
 * AR Scavenger Hunt — Main Controller (v4 — reliable video plane)
 *
 * Key architecture decisions:
 *  - Video texture is bound manually via THREE.VideoTexture on plane `loaded`
 *    event, bypassing A-Frame's async material resolver (which silently fails
 *    on dynamically created elements in some A-Frame/browser combos).
 *  - Holograms stay parented to cameraEl after drop (camera-relative coords).
 *    No world-space re-parent = no coordinate corruption.
 *  - STATE.PLACED auto-advances to SCANNING after 3 s so the next coaster
 *    can be scanned without the user needing to tap a button.
 *  - Chromakey shader is temporarily replaced with flat+VideoTexture for both
 *    coasters so we confirm video playback works before adding effects.
 */

import {
  initAudio,
  playLockOn,
  playPickUp,
  playDropBeam,
  playDrawerTick,
  playCelebrationFanfare,
  toggleMute,
  startCarryingHum,
  stopCarryingHum,
  startAmbientDrone,
  stopAllAmbient
} from './audio.js';
import { initRadar, setRadarActive, setActiveTarget, triggerLockOnEffect } from './radar.js';
import { animateMaterialization } from './animations.js';

// ─── State ────────────────────────────────────────────────────────────────────
const STATE = {
  UNINITIALIZED: 'UNINITIALIZED',
  SCANNING:      'SCANNING',
  TARGET_FOUND:  'TARGET_FOUND',
  CARRYING:      'CARRYING',
  PLACED:        'PLACED',
};

let currentState         = STATE.UNINITIALIZED;
let activeTargetIndex    = null;
let currentCarriedEntity = null;
const placedEntities     = {};

let floorReticle       = null;
let autoScanTimer      = null; // timer to auto-return to SCANNING after placement

// ─── Targets ──────────────────────────────────────────────────────────────────
const TARGETS = [
  {
    index:      0,
    title:      'Uncle Memorial',
    videoId:    'video-memorial',
    emoji:      '🕊️',
    discovered: false,
    placed:     false,
  },
  {
    index:      1,
    title:      'Birthday Wishes',
    videoId:    'video-montage',
    emoji:      '🎂',
    discovered: false,
    placed:     false,
  },
];

// ─── DOM refs ─────────────────────────────────────────────────────────────────
let sceneEl, cameraEl;
let mainActionBtn, guidanceBox;
let menuBtn, menuPanel, menuCloseBtn, sfxToggleRow, sfxToggle;
let progressList, emptyProgressMsg, restartSection, restartBtn;
let celebrationOverlay, celebrationRestartBtn;

// ─── Init ─────────────────────────────────────────────────────────────────────
function initApp() {
  sceneEl  = document.querySelector('#ar-scene');
  cameraEl = document.querySelector('#main-camera');

  mainActionBtn = document.querySelector('#main-action-btn');
  guidanceBox   = document.querySelector('#guidance-box');
  menuBtn       = document.querySelector('#menu-btn');
  menuPanel     = document.querySelector('#menu-panel');
  menuCloseBtn  = document.querySelector('#menu-close');
  sfxToggleRow  = document.querySelector('#sfx-toggle-row');
  sfxToggle     = document.querySelector('#sfx-toggle');
  progressList     = document.querySelector('#progress-list');
  emptyProgressMsg = document.querySelector('#empty-progress-msg');
  restartSection   = document.querySelector('#restart-section');
  restartBtn       = document.querySelector('#restart-btn');
  celebrationOverlay    = document.querySelector('#celebration-overlay');
  celebrationRestartBtn = document.querySelector('#celebration-restart-btn');

  const vignetteEl = document.querySelector('#radar-vignette');
  initRadar(vignetteEl, cameraEl);
  setupUI();
  setupMindARListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ─── UI events ────────────────────────────────────────────────────────────────
function setupUI() {
  mainActionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleAction();
  });
  guidanceBox.addEventListener('click', (e) => {
    e.stopPropagation();
    handleAction();
  });

  menuBtn.addEventListener('click',      () => { playDrawerTick(); menuPanel.classList.toggle('open'); });
  menuCloseBtn.addEventListener('click', () => { playDrawerTick(); menuPanel.classList.remove('open'); });
  sfxToggleRow.addEventListener('click', () => {
    const muted = toggleMute();
    sfxToggle.classList.toggle('active', !muted);
    sfxToggleRow.querySelector('span').textContent = muted ? '🔇 Sound Effects' : '🔊 Sound Effects';
    if (!muted) playDrawerTick();
  });
  restartBtn.addEventListener('click', restartHunt);
  celebrationRestartBtn.addEventListener('click', restartHunt);
}

async function handleAction() {
  switch (currentState) {
    case STATE.UNINITIALIZED: await startAR(); break;
    case STATE.TARGET_FOUND:  pickUp(activeTargetIndex); break;
    case STATE.CARRYING:      drop(); break;
    case STATE.PLACED:        goScanning(); break;
  }
}

// ─── AR Session ───────────────────────────────────────────────────────────────
async function startAR() {
  initAudio();

  // iOS motion permission
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { await DeviceOrientationEvent.requestPermission(); } catch (_) {}
  }

  guidanceBox.textContent = '📹 Starting camera...';
  mainActionBtn.disabled  = true;

  try {
    if (!sceneEl.hasLoaded) {
      await new Promise(r => sceneEl.addEventListener('loaded', r, { once: true }));
    }
    if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0);

    const arSystem = sceneEl.systems['mindar-image-system'];
    if (!arSystem) throw new Error('MindAR not found');

    const ready = new Promise((res, rej) => {
      let done = false;
      const ok  = () => { if (!done) { done = true; res(); } };
      const err = (e) => { if (!done) { done = true; rej(e?.detail?.error || new Error('camera failed')); } };
      sceneEl.addEventListener('arReady', ok,  { once: true });
      sceneEl.addEventListener('arError', err, { once: true });
      setTimeout(ok, 9000); // fallback — proceed even if arReady never fires
    });

    guidanceBox.textContent = '⚙️ Loading AR...';
    arSystem.start();

    // Nudge MindAR camera video (never touch our asset <video> elements here)
    setTimeout(() => {
      const cv = document.querySelector('.mindar-ui-overlay video');
      if (cv && cv.paused) cv.play().catch(() => {});
      if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0);
    }, 700);

    await ready;
  } catch (e) {
    console.error(e);
    guidanceBox.textContent = '⚠️ Camera blocked — tap the lock icon in your browser to allow.';
    mainActionBtn.disabled  = false;
    mainActionBtn.innerHTML = '<span>🔄 Retry Camera</span>';
    return;
  }

  mainActionBtn.disabled = false;
  buildFloorReticle();
  goScanning();
}

// ─── State transitions ────────────────────────────────────────────────────────
function goScanning() {
  if (autoScanTimer) { clearTimeout(autoScanTimer); autoScanTimer = null; }
  currentState      = STATE.SCANNING;
  activeTargetIndex = null;
  setActiveTarget(null);
  setRadarActive(true);
  guidanceBox.textContent = '🔍 Scan a coaster...';
  mainActionBtn.innerHTML = '<span>Scanning...</span>';
  mainActionBtn.classList.add('secondary');
}

// ─── MindAR listeners ─────────────────────────────────────────────────────────
function setupMindARListeners() {
  TARGETS.forEach(t => {
    const el = document.querySelector(`#target-${t.index}`);
    if (!el) return;

    el.addEventListener('targetFound', () => {
      if (t.placed) return;                    // already in room — ignore
      if (currentState !== STATE.SCANNING) return; // not ready — ignore

      activeTargetIndex = t.index;
      setActiveTarget(el);
      triggerLockOnEffect();
      playLockOn();
      spawnRing(t.index, el);

      currentState = STATE.TARGET_FOUND;
      guidanceBox.textContent = `✨ ${t.title} found!`;
      mainActionBtn.innerHTML = '<span>⚡ Pick Up</span>';
      mainActionBtn.classList.remove('secondary');
    });

    el.addEventListener('targetLost', () => {
      if (t.placed) return;
      if (currentState === STATE.TARGET_FOUND && activeTargetIndex === t.index) {
        el.querySelector('.holo-container')?.remove();
        goScanning();
      }
    });
  });
}

// ─── Ring + Hologram structure ────────────────────────────────────────────────
function spawnRing(targetIndex, targetEl) {
  targetEl.querySelector('.holo-container')?.remove();
  const c = buildHologram(targetIndex);
  targetEl.appendChild(c);
}

function buildHologram(targetIndex) {
  const target = TARGETS[targetIndex];
  const c = document.createElement('a-entity');
  c.classList.add('holo-container');
  c.dataset.targetIndex = targetIndex;

  // ── 1. Spinning ring ──────────────────────────────────────────────────────
  const ring = document.createElement('a-torus');
  ring.classList.add('holo-ring');
  ring.setAttribute('radius',          '0.45');
  ring.setAttribute('radius-tubular',  '0.025');
  ring.setAttribute('rotation',        '90 0 0');
  ring.setAttribute('material',        'color: #00e5ff; emissive: #00e5ff; emissiveIntensity: 0.8');
  ring.setAttribute('animation__spin', 'property: rotation; to: 90 360 0; loop: true; dur: 6000; easing: linear');
  c.appendChild(ring);

  // ── 2. Glow beam (hidden until placed) ────────────────────────────────────
  const beam = document.createElement('a-cylinder');
  beam.classList.add('holo-beam');
  beam.setAttribute('radius',   '0.44');
  beam.setAttribute('height',   '1.6');
  beam.setAttribute('position', '0 0.8 0');
  beam.setAttribute('material', 'color: #00e5ff; transparent: true; opacity: 0; side: double');
  beam.setAttribute('visible',  'false');
  c.appendChild(beam);

  // ── 3. Video plane — THREE.VideoTexture bound on `loaded` ─────────────────
  const plane = document.createElement('a-plane');
  plane.classList.add('holo-video');
  plane.setAttribute('width',    '0.9');
  plane.setAttribute('height',   '1.6');
  plane.setAttribute('position', '0 0.8 0');
  plane.setAttribute('visible',  'false');
  // Start with a basic material; we'll replace it with VideoTexture on loaded
  plane.setAttribute('material', 'color: #000000; side: double; transparent: false');

  plane.addEventListener('loaded', () => {
    const videoEl = document.getElementById(target.videoId);
    if (!videoEl) return;
    const mesh = plane.getObject3D('mesh');
    if (!mesh) return;
    // Replace A-Frame material with direct THREE.js VideoTexture
    const tex = new THREE.VideoTexture(videoEl);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    mesh.material = new THREE.MeshBasicMaterial({
      map:         tex,
      side:        THREE.DoubleSide,
      transparent: false,
    });
    mesh.material.needsUpdate = true;
    console.log(`[AR] VideoTexture bound for target ${targetIndex} (${target.videoId})`);
  });

  c.appendChild(plane);
  return c;
}

// ─── Floor reticle ────────────────────────────────────────────────────────────
function buildFloorReticle() {
  if (floorReticle) return;
  floorReticle = document.createElement('a-ring');
  floorReticle.setAttribute('radius-inner', '0.18');
  floorReticle.setAttribute('radius-outer', '0.22');
  floorReticle.setAttribute('rotation',     '-90 0 0');
  floorReticle.setAttribute('position',     '0 -0.7 -1.5');
  floorReticle.setAttribute('material',     'color: #00e5ff; transparent: true; opacity: 0.5; side: double');
  floorReticle.setAttribute('animation__pulse',
    'property: material.opacity; from: 0.25; to: 0.6; dur: 800; dir: alternate; loop: true; easing: easeInOutSine'
  );
  floorReticle.setAttribute('visible', 'false');
  cameraEl.appendChild(floorReticle);
}

// ─── Pick Up ──────────────────────────────────────────────────────────────────
function pickUp(targetIndex) {
  const targetEl  = document.querySelector(`#target-${targetIndex}`);
  const container = targetEl?.querySelector('.holo-container');
  if (!container) return;

  const target = TARGETS[targetIndex];
  const vid    = document.getElementById(target.videoId);

  // Grab autoplay permission on this tap — muted silent pre-play then pause
  if (vid) {
    vid.muted = true;
    vid.play().then(() => { vid.pause(); vid.currentTime = 0; }).catch(() => {});
  }

  playPickUp();
  startCarryingHum();
  setRadarActive(false);

  // Re-parent to camera so the ring follows the phone
  currentCarriedEntity = container;
  cameraEl.appendChild(container);

  // Snap just in front then animate to carry position
  container.setAttribute('position', '0 0 -1.8');
  container.setAttribute('animation__carry',
    'property: position; to: 0 -0.3 -1.2; dur: 450; easing: easeOutCubic'
  );

  if (floorReticle) floorReticle.setAttribute('visible', 'true');

  currentState = STATE.CARRYING;
  guidanceBox.textContent = '👇 Aim at the floor — tap to Drop';
  mainActionBtn.innerHTML = '<span>📍 Drop</span>';
}

// ─── Drop ─────────────────────────────────────────────────────────────────────
function drop() {
  if (!currentCarriedEntity) return;

  const targetIdx = parseInt(currentCarriedEntity.dataset.targetIndex, 10);
  const target    = TARGETS[targetIdx];
  const vid       = document.getElementById(target.videoId);

  playDropBeam();
  stopCarryingHum();
  if (floorReticle) floorReticle.setAttribute('visible', 'false');

  // ── Play video NOW — we are inside a tap gesture handler ─────────────────
  if (vid) {
    vid.currentTime = 0;
    vid.muted       = false;
    vid.play().catch(() => {
      // Autoplay blocked unmuted — fall back to muted so it still shows
      vid.muted = true;
      vid.play().catch(err => console.error('[AR] Video play failed:', err));
    });
  }

  // ── Position — camera-relative, no world-space re-parent ─────────────────
  // target 0 → slightly left, target 1 → slightly right; 1.5 m ahead, ~floor level
  const ox       = targetIdx === 0 ? -0.45 : 0.45;
  const finalPos = `${ox} -0.85 -1.5`;

  // Clear carry animation, reset tilt, animate to floor position
  currentCarriedEntity.removeAttribute('animation__carry');
  currentCarriedEntity.setAttribute('rotation', '0 0 0');
  currentCarriedEntity.setAttribute('animation__drop',
    `property: position; to: ${finalPos}; dur: 600; easing: easeOutBack`
  );

  // Make all parts visible
  const ring  = currentCarriedEntity.querySelector('.holo-ring');
  const beam  = currentCarriedEntity.querySelector('.holo-beam');
  const plane = currentCarriedEntity.querySelector('.holo-video');
  if (ring)  ring.setAttribute('visible', 'true');
  if (beam)  beam.setAttribute('visible', 'true');
  if (plane) { plane.setAttribute('visible', 'true'); plane.setAttribute('scale', '1 1 1'); }

  placedEntities[targetIdx] = currentCarriedEntity;
  const ref = currentCarriedEntity;
  currentCarriedEntity = null;

  // Run materialization beam after drop animation lands
  setTimeout(() => {
    animateMaterialization(ref, () => {
      if (vid && vid.paused) vid.play().catch(() => {});
    });
  }, 630);

  markDiscovered(targetIdx);
  currentState = STATE.PLACED;

  guidanceBox.textContent = '🎉 Placed! Auto-scanning next coaster in 3s...';
  mainActionBtn.innerHTML = '<span>🔍 Scan Next</span>';
  mainActionBtn.classList.add('secondary');

  // Auto-return to scanning after 3 seconds so user doesn't have to tap
  autoScanTimer = setTimeout(goScanning, 3000);
}

// ─── Re-place from menu ───────────────────────────────────────────────────────
function rePlaceHologram(targetIndex) {
  const existing = placedEntities[targetIndex];
  if (!existing) return;

  menuPanel.classList.remove('open');
  playDrawerTick();
  playPickUp();
  startCarryingHum();

  const vid = document.getElementById(TARGETS[targetIndex].videoId);
  if (vid) vid.pause();

  existing.querySelector('.holo-beam')?.setAttribute('visible', 'false');
  existing.querySelector('.holo-video')?.setAttribute('visible', 'false');

  existing.removeAttribute('animation__drop');
  cameraEl.appendChild(existing);
  existing.setAttribute('position', '0 -0.3 -1.2');
  existing.setAttribute('rotation', '15 0 0');

  if (floorReticle) floorReticle.setAttribute('visible', 'true');
  if (autoScanTimer) { clearTimeout(autoScanTimer); autoScanTimer = null; }

  currentCarriedEntity = existing;
  activeTargetIndex    = targetIndex;
  currentState         = STATE.CARRYING;

  guidanceBox.textContent = '👇 Aim at floor — tap to Drop';
  mainActionBtn.innerHTML = '<span>📍 Drop</span>';
  mainActionBtn.classList.remove('secondary');
}

function togglePlay(targetIndex) {
  const vid = document.getElementById(TARGETS[targetIndex].videoId);
  if (!vid) return;
  playDrawerTick();
  vid.paused ? vid.play() : vid.pause();
}

// ─── Progress & Celebration ───────────────────────────────────────────────────
function markDiscovered(targetIndex) {
  const target      = TARGETS[targetIndex];
  target.discovered = true;
  target.placed     = true;

  emptyProgressMsg.style.display = 'none';
  restartSection.style.display   = 'block';

  if (!progressList.querySelector(`#card-${targetIndex}`)) {
    const card = document.createElement('div');
    card.classList.add('memory-card');
    card.id = `card-${targetIndex}`;
    card.innerHTML = `
      <div class="memory-card-header">
        <div class="memory-thumb">${target.emoji}</div>
        <div class="memory-info"><h4>${target.title}</h4><p>✅ Placed</p></div>
      </div>
      <div class="card-actions">
        <button class="btn-small btn-replace interactive" data-t="${targetIndex}">📍 Re-place</button>
        <button class="btn-small btn-toggle-play interactive" data-t="${targetIndex}">▶ Play/Pause</button>
      </div>`;
    card.querySelector('.btn-replace').addEventListener('click',      e => rePlaceHologram(+e.target.dataset.t));
    card.querySelector('.btn-toggle-play').addEventListener('click',  e => togglePlay(+e.target.dataset.t));
    progressList.appendChild(card);
  }

  startAmbientDrone(TARGETS.filter(t => t.placed).length);

  if (TARGETS.every(t => t.placed)) setTimeout(triggerCelebration, 1500);
}

function triggerCelebration() {
  stopAllAmbient();
  playCelebrationFanfare();
  celebrationOverlay.classList.add('visible');
}

function restartHunt() {
  celebrationOverlay.classList.remove('visible');
  menuPanel.classList.remove('open');
  playDrawerTick();
  stopAllAmbient();
  stopCarryingHum();
  if (autoScanTimer) { clearTimeout(autoScanTimer); autoScanTimer = null; }

  TARGETS.forEach(t => {
    t.discovered = false;
    t.placed     = false;
    const v = document.getElementById(t.videoId);
    if (v) { v.pause(); v.currentTime = 0; }
  });

  progressList.querySelectorAll('.memory-card').forEach(c => c.remove());
  emptyProgressMsg.style.display = 'block';
  restartSection.style.display   = 'none';
  if (floorReticle) floorReticle.setAttribute('visible', 'false');

  Object.values(placedEntities).forEach(e => e?.parentNode?.removeChild(e));
  Object.keys(placedEntities).forEach(k => delete placedEntities[k]);
  currentCarriedEntity = null;

  goScanning();
}
