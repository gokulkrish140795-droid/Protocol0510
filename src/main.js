/**
 * AR Scavenger Hunt — Main Game Controller
 *
 * 2-TARGET ROSTER (v3 — living frames removed):
 *   Index 0 — COASTER: Uncle Memorial  → memorial.mp4  [Chroma Key] (marker1.jpg)
 *   Index 1 — COASTER: Birthday Wishes → dummy.mp4     [Flat]       (marker0.jpg)
 *
 * Floor-drop fix: holograms stay parented to cameraEl at a fixed
 * camera-relative offset. No world-space re-parent = no coordinate corruption.
 */

import './chromakey.js';

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

// ─── Application State Machine ────────────────────────────────────────────────
const STATE = {
  UNINITIALIZED: 'UNINITIALIZED',
  SCANNING:      'SCANNING',
  TARGET_FOUND:  'TARGET_FOUND',
  CARRYING:      'CARRYING',
  PLACED:        'PLACED'
};

let currentState         = STATE.UNINITIALIZED;
let activeTargetIndex    = null;
let currentCarriedEntity = null;
const placedEntities     = {}; // targetIndex → placed A-Frame entity

// Floor placement reticle
let floorReticle = null;

// ─── TARGETS — 2 coasters only ───────────────────────────────────────────────
const TARGETS = [
  // Target 0: Uncle Memorial (marker1.jpg in targets.mind)
  {
    index:       0,
    title:       'Uncle Memorial',
    videoId:     'video-memorial',
    emoji:       '🕊️',
    shader:      'chromakey',
    discovered:  false,
    placed:      false,
  },
  // Target 1: Birthday Wishes (marker0.jpg in targets.mind)
  {
    index:       1,
    title:       'Birthday Wishes',
    videoId:     'video-montage',
    emoji:       '🎂',
    shader:      'flat',
    discovered:  false,
    placed:      false,
  },
];

// ─── DOM Elements ─────────────────────────────────────────────────────────────
let sceneEl, cameraEl;
let mainActionBtn, guidanceBox;
let menuBtn, menuPanel, menuCloseBtn, sfxToggleRow, sfxToggle;
let progressList, emptyProgressMsg, restartSection, restartBtn;
let celebrationOverlay, celebrationRestartBtn;

function initApp() {
  sceneEl   = document.querySelector('#ar-scene');
  cameraEl  = document.querySelector('#main-camera');
  const vignetteEl = document.querySelector('#radar-vignette');

  mainActionBtn = document.querySelector('#main-action-btn');
  guidanceBox   = document.querySelector('#guidance-box');

  menuBtn      = document.querySelector('#menu-btn');
  menuPanel    = document.querySelector('#menu-panel');
  menuCloseBtn = document.querySelector('#menu-close');
  sfxToggleRow = document.querySelector('#sfx-toggle-row');
  sfxToggle    = document.querySelector('#sfx-toggle');

  progressList     = document.querySelector('#progress-list');
  emptyProgressMsg = document.querySelector('#empty-progress-msg');
  restartSection   = document.querySelector('#restart-section');
  restartBtn       = document.querySelector('#restart-btn');

  celebrationOverlay    = document.querySelector('#celebration-overlay');
  celebrationRestartBtn = document.querySelector('#celebration-restart-btn');

  initRadar(vignetteEl, cameraEl);
  setupUIEventListeners();
  setupMindAREventListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/* ─── UI Event Handling ──────────────────────────────────────────────────────── */
function setupUIEventListeners() {
  // Action button — handles all state transitions
  if (mainActionBtn) {
    mainActionBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent bubbling to any container listeners
      handleMainActionButton();
    });
  }

  // Guidance box tap also advances state
  if (guidanceBox) {
    guidanceBox.addEventListener('click', (e) => {
      e.stopPropagation();
      handleMainActionButton();
    });
  }

  menuBtn.addEventListener('click', () => {
    playDrawerTick();
    menuPanel.classList.toggle('open');
  });

  menuCloseBtn.addEventListener('click', () => {
    playDrawerTick();
    menuPanel.classList.remove('open');
  });

  sfxToggleRow.addEventListener('click', () => {
    const muted = toggleMute();
    sfxToggle.classList.toggle('active', !muted);
    sfxToggleRow.querySelector('span').textContent = muted ? '🔇 Sound Effects' : '🔊 Sound Effects';
    if (!muted) playDrawerTick();
  });

  restartBtn.addEventListener('click', restartScavengerHunt);
  celebrationRestartBtn.addEventListener('click', restartScavengerHunt);
}

/**
 * Primary Contextual Action Button Handler
 */
async function handleMainActionButton() {
  switch (currentState) {
    case STATE.UNINITIALIZED:
      await startARSession();
      break;
    case STATE.TARGET_FOUND:
      pickUpMemory(activeTargetIndex);
      break;
    case STATE.CARRYING:
      dropMemoryOnFloor();
      break;
    case STATE.PLACED:
      enterScanningState();
      break;
  }
}

/**
 * Step 1: Initialize AR, iOS WebKit Permissions, and Web Audio
 */
async function startARSession() {
  initAudio();

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') {
        alert('Motion permission is required to anchor the holograms in your room.');
      }
    } catch (err) {
      console.warn('Orientation permission prompt bypassed:', err);
    }
  }

  guidanceBox.textContent = '📹 Requesting camera...';
  mainActionBtn.disabled  = true;

  try {
    if (!sceneEl.hasLoaded) {
      await new Promise(resolve => sceneEl.addEventListener('loaded', resolve, { once: true }));
    }

    if (sceneEl.renderer) {
      sceneEl.renderer.setClearColor(0x000000, 0);
    }

    const arSystem = sceneEl.systems['mindar-image-system'];
    if (!arSystem) throw new Error('MindAR system not found.');

    const arReadyPromise = new Promise((resolve, reject) => {
      let resolved = false;
      const onReady = () => { if (!resolved) { resolved = true; resolve(); } };
      const onError = (e) => { if (!resolved) { resolved = true; reject(e?.detail?.error || new Error('Camera failed')); } };
      sceneEl.addEventListener('arReady', onReady, { once: true });
      sceneEl.addEventListener('arError', onError, { once: true });
      // Safety timeout
      setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 8000);
    });

    guidanceBox.textContent = '⚙️ Loading AR tracking targets...';
    arSystem.start();

    // Nudge MindAR's own camera video — do NOT touch asset <video> elements.
    setTimeout(() => {
      const camVid = document.querySelector('.mindar-ui-overlay video');
      if (camVid && camVid.paused) camVid.play().catch(() => {});
      if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0);
    }, 600);

    await arReadyPromise;

  } catch (err) {
    console.error('MindAR start error:', err);
    guidanceBox.textContent = '⚠️ Camera blocked. Tap the lock icon in the address bar to allow camera access.';
    mainActionBtn.disabled = false;
    mainActionBtn.innerHTML = '<span>🔄 Retry Camera</span>';
    return;
  }

  mainActionBtn.disabled = false;
  createFloorReticle();
  enterScanningState();
}

function enterScanningState() {
  currentState      = STATE.SCANNING;
  activeTargetIndex = null;
  setActiveTarget(null);
  setRadarActive(true);

  guidanceBox.textContent = '🔍 Scan your room for a coaster...';
  mainActionBtn.innerHTML = '<span>Scanning...</span>';
  mainActionBtn.classList.add('secondary');
}

/* ─── MindAR Target Listeners ────────────────────────────────────────────────── */
function setupMindAREventListeners() {
  TARGETS.forEach(target => {
    const targetEl = document.querySelector(`#target-${target.index}`);
    if (!targetEl) return;
    attachCoasterListeners(target, targetEl);
  });
}

function attachCoasterListeners(target, targetEl) {
  targetEl.addEventListener('targetFound', () => {
    // Ignore if already placed or not in scanning state
    if (target.placed) return;
    if (currentState !== STATE.SCANNING) return;

    activeTargetIndex = target.index;
    setActiveTarget(targetEl);
    triggerLockOnEffect();
    playLockOn();

    attachRingToCoaster(target.index, targetEl);

    currentState = STATE.TARGET_FOUND;
    guidanceBox.textContent = `✨ Discovered: ${target.title}!`;
    mainActionBtn.innerHTML = '<span>⚡ Tap to "Pick Up" Memory</span>';
    mainActionBtn.classList.remove('secondary');
  });

  targetEl.addEventListener('targetLost', () => {
    if (target.placed) return;
    if (currentState === STATE.TARGET_FOUND && activeTargetIndex === target.index) {
      const existingRing = targetEl.querySelector('.hologram-container');
      if (existingRing) existingRing.remove();
      enterScanningState();
    }
  });
}

/* ─── 3D Ring & Hologram Construction ───────────────────────────────────────── */
function attachRingToCoaster(targetIndex, targetElement) {
  const old = targetElement.querySelector('.hologram-container');
  if (old) old.remove();
  const container = createHologram3DStructure(targetIndex);
  targetElement.appendChild(container);
}

function createHologram3DStructure(targetIndex) {
  const target    = TARGETS[targetIndex];
  const container = document.createElement('a-entity');
  container.classList.add('hologram-container');
  container.dataset.targetIndex = targetIndex;

  // 1. Glowing AR Ring (Torus)
  const ring = document.createElement('a-torus');
  ring.classList.add('ar-ring-model');
  ring.setAttribute('radius',          '0.45');
  ring.setAttribute('radius-tubular',  '0.025');
  ring.setAttribute('rotation',        '90 0 0');
  ring.setAttribute('material',        'color: #00e5ff; emissive: #00e5ff; emissiveIntensity: 0.8; metalness: 0.2; roughness: 0.3');
  ring.setAttribute('animation__spin', 'property: rotation; to: 90 360 0; loop: true; dur: 6000; easing: linear');
  container.appendChild(ring);

  // 2. Hologram Light Beam (hidden until placed on floor)
  const beam = document.createElement('a-cylinder');
  beam.classList.add('hologram-beam');
  beam.setAttribute('radius',   '0.44');
  beam.setAttribute('height',   '1.6');
  beam.setAttribute('position', '0 0.8 0');
  beam.setAttribute('material', 'color: #00e5ff; transparent: true; opacity: 0; side: double');
  beam.setAttribute('visible',  'false');
  container.appendChild(beam);

  // 3. Video Plane (Portrait 9:16) — src MUST be inside material, not separate setAttribute
  const videoPlane = document.createElement('a-video');
  videoPlane.classList.add('video-screen');
  videoPlane.setAttribute('width',    '0.9');
  videoPlane.setAttribute('height',   '1.6');
  videoPlane.setAttribute('position', '0 0.8 0');
  videoPlane.setAttribute('visible',  'false');

  if (target.shader === 'chromakey') {
    videoPlane.setAttribute('material',
      `shader: chromakey; src: #${target.videoId}; colorThreshold: 0.35; smoothness: 0.1; rimStrength: 0.25`
    );
  } else {
    // src MUST be in the same setAttribute call — setting it separately gets overwritten
    videoPlane.setAttribute('material',
      `shader: flat; src: #${target.videoId}; side: double`
    );
  }

  container.appendChild(videoPlane);
  return container;
}

/* ─── Floor Placement Reticle ───────────────────────────────────────────────── */
function createFloorReticle() {
  if (floorReticle) return;
  floorReticle = document.createElement('a-ring');
  floorReticle.id = 'floor-reticle';
  floorReticle.setAttribute('radius-inner', '0.18');
  floorReticle.setAttribute('radius-outer', '0.22');
  floorReticle.setAttribute('rotation',     '-90 0 0');
  floorReticle.setAttribute('position',     '0 -0.6 -1.4');
  floorReticle.setAttribute('material',     'color: #00e5ff; transparent: true; opacity: 0.5; side: double');
  floorReticle.setAttribute('animation__pulse',
    'property: material.opacity; from: 0.3; to: 0.6; dur: 800; dir: alternate; loop: true; easing: easeInOutSine'
  );
  floorReticle.setAttribute('visible', 'false');
  cameraEl.appendChild(floorReticle);
}

/* ─── Step 3: Pick Up Memory ────────────────────────────────────────────────── */
function pickUpMemory(targetIndex) {
  const targetEl  = document.querySelector(`#target-${targetIndex}`);
  const container = targetEl ? targetEl.querySelector('.hologram-container') : null;
  if (!container) return;

  const target = TARGETS[targetIndex];

  // Register autoplay permission on this tap gesture (do NOT call vid.load — it voids the token)
  const vid = document.getElementById(target.videoId);
  if (vid) {
    vid.muted = true;
    const prePlay = vid.play();
    if (prePlay !== undefined) {
      prePlay.then(() => { vid.pause(); vid.currentTime = 0; }).catch(() => {});
    }
  }

  playPickUp();
  startCarryingHum();
  setRadarActive(false);

  // Re-parent to camera so entity follows phone movement
  currentCarriedEntity = container;
  cameraEl.appendChild(container);

  // Snap to camera-local position then lerp smoothly to carry position
  container.setAttribute('position', '0 0 -1.5');
  container.setAttribute('animation__carry',
    'property: position; to: 0 -0.35 -1.2; dur: 400; easing: easeOutCubic'
  );
  container.setAttribute('animation__tilt',
    'property: rotation; to: 15 0 0; dur: 400; easing: easeOutCubic'
  );

  if (floorReticle) floorReticle.setAttribute('visible', 'true');

  currentState = STATE.CARRYING;
  guidanceBox.textContent = '🚶 Aim at the floor then tap "Drop"...';
  mainActionBtn.innerHTML = '<span>📍 Tap to "Drop" on Floor</span>';
}

/* ─── Step 4: Drop Memory on Floor ──────────────────────────────────────────── */
function dropMemoryOnFloor() {
  if (!currentCarriedEntity) return;

  const targetIdx = parseInt(currentCarriedEntity.dataset.targetIndex, 10);
  const target    = TARGETS[targetIdx];
  const video     = document.getElementById(target.videoId);

  playDropBeam();
  stopCarryingHum();
  if (floorReticle) floorReticle.setAttribute('visible', 'false');

  // ── VIDEO: play immediately inside this tap gesture handler ──────────────
  if (video) {
    video.currentTime = 0;
    video.muted = false;
    video.play().catch(() => {
      // Browser blocked unmuted — fall back to muted so it at least shows
      video.muted = true;
      video.play().catch(e => console.error('Video failed completely:', e));
    });
  }

  // ── POSITION: camera-relative — NO world-space re-parent ─────────────────
  // Entity stays as cameraEl child. Fixed camera-relative floor offset:
  //   x: target 0 → left (-0.5), target 1 → right (+0.5)
  //   y: -0.85 (below camera eye = roughly floor level)
  //   z: -1.5  (1.5m ahead of phone)
  const offsetX   = targetIdx === 0 ? -0.5 : 0.5;
  const floorPos  = `${offsetX} -0.85 -1.5`;

  // Clear carry animations and snap upright
  currentCarriedEntity.removeAttribute('animation__carry');
  currentCarriedEntity.removeAttribute('animation__tilt');
  currentCarriedEntity.setAttribute('rotation', '0 0 0');

  // Animate drop to floor position using A-Frame's built-in animation component
  currentCarriedEntity.setAttribute('animation__drop',
    `property: position; to: ${floorPos}; dur: 600; easing: easeOutBack`
  );

  // Make ring, beam and video plane visible
  const ring      = currentCarriedEntity.querySelector('.ar-ring-model');
  const beam      = currentCarriedEntity.querySelector('.hologram-beam');
  const vidPlane  = currentCarriedEntity.querySelector('.video-screen');
  if (ring)     ring.setAttribute('visible', 'true');
  if (beam)     beam.setAttribute('visible', 'true');
  if (vidPlane) {
    vidPlane.setAttribute('visible', 'true');
    vidPlane.setAttribute('scale', '1 1 1');
  }

  placedEntities[targetIdx] = currentCarriedEntity;
  const entityRef = currentCarriedEntity;
  currentCarriedEntity = null; // null BEFORE async — entity is safe in entityRef

  // Trigger materialisation beam animation after drop lands (600ms)
  setTimeout(() => {
    animateMaterialization(entityRef, () => {
      // Safety: ensure video is still playing after animation
      if (video && video.paused) video.play().catch(() => {});
    });
  }, 620);

  markTargetDiscovered(targetIdx);
  currentState = STATE.PLACED;

  guidanceBox.textContent = '🎉 Memory activated! Tap below to search for more.';
  mainActionBtn.innerHTML = '<span>🔍 Search for Next Memory</span>';
  mainActionBtn.classList.add('secondary');
}

/**
 * Re-Place: pick up an already-placed hologram from the menu
 */
function rePlaceHologram(targetIndex) {
  const existing = placedEntities[targetIndex];
  if (!existing) return;

  menuPanel.classList.remove('open');
  playDrawerTick();
  playPickUp();
  startCarryingHum();

  const video = document.getElementById(TARGETS[targetIndex].videoId);
  if (video) video.pause();

  const beam     = existing.querySelector('.hologram-beam');
  const vidPlane = existing.querySelector('.video-screen');
  if (beam)     beam.setAttribute('visible', 'false');
  if (vidPlane) vidPlane.setAttribute('visible', 'false');

  // Re-parent back to camera
  existing.removeAttribute('animation__drop');
  cameraEl.appendChild(existing);
  existing.setAttribute('position', '0 -0.35 -1.2');
  existing.setAttribute('rotation', '15 0 0');

  if (floorReticle) floorReticle.setAttribute('visible', 'true');

  currentCarriedEntity = existing;
  activeTargetIndex    = targetIndex;
  currentState         = STATE.CARRYING;

  guidanceBox.textContent = '🚶 Re-positioning: Aim at floor and tap Drop...';
  mainActionBtn.innerHTML = '<span>📍 Tap to "Drop" on Floor</span>';
  mainActionBtn.classList.remove('secondary');
}

function toggleVideoPlayback(targetIndex) {
  const video = document.getElementById(TARGETS[targetIndex].videoId);
  if (!video) return;
  playDrawerTick();
  video.paused ? video.play() : video.pause();
}

/* ─── Progress Tracking, Menu & Celebration ──────────────────────────────────── */
function markTargetDiscovered(targetIndex) {
  const target      = TARGETS[targetIndex];
  target.discovered = true;
  target.placed     = true;

  emptyProgressMsg.style.display = 'none';
  restartSection.style.display   = 'block';

  if (!progressList.querySelector(`#card-target-${targetIndex}`)) {
    const card = document.createElement('div');
    card.classList.add('memory-card');
    card.id = `card-target-${targetIndex}`;
    card.innerHTML = `
      <div class="memory-card-header">
        <div class="memory-thumb">${target.emoji}</div>
        <div class="memory-info">
          <h4>${target.title}</h4>
          <p>✅ Discovered & Placed</p>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-small btn-replace interactive" data-target="${targetIndex}">📍 Re-place</button>
        <button class="btn-small btn-toggle-play interactive" data-target="${targetIndex}">▶ Play/Pause</button>
      </div>
    `;
    card.querySelector('.btn-replace').addEventListener('click', (e) => {
      rePlaceHologram(parseInt(e.target.dataset.target, 10));
    });
    card.querySelector('.btn-toggle-play').addEventListener('click', (e) => {
      toggleVideoPlayback(parseInt(e.target.dataset.target, 10));
    });
    progressList.appendChild(card);
  }

  const placedCount = TARGETS.filter(t => t.placed).length;
  startAmbientDrone(placedCount);

  // Celebration fires when BOTH coasters are placed
  const allPlaced = TARGETS.every(t => t.placed);
  if (allPlaced) setTimeout(() => triggerCelebration(), 1500);
}

function triggerCelebration() {
  stopAllAmbient();
  playCelebrationFanfare();
  celebrationOverlay.classList.add('visible');
}

function restartScavengerHunt() {
  celebrationOverlay.classList.remove('visible');
  menuPanel.classList.remove('open');
  playDrawerTick();
  stopAllAmbient();
  stopCarryingHum();

  TARGETS.forEach(target => {
    target.discovered = false;
    target.placed     = false;
    const video = document.getElementById(target.videoId);
    if (video) { video.pause(); video.currentTime = 0; }
  });

  progressList.querySelectorAll('.memory-card').forEach(card => card.remove());
  emptyProgressMsg.style.display = 'block';
  restartSection.style.display   = 'none';

  if (floorReticle) floorReticle.setAttribute('visible', 'false');

  // Remove any placed holograms from camera
  Object.values(placedEntities).forEach(entity => {
    if (entity && entity.parentNode) entity.parentNode.removeChild(entity);
  });
  Object.keys(placedEntities).forEach(k => delete placedEntities[k]);
  currentCarriedEntity = null;

  enterScanningState();
}
