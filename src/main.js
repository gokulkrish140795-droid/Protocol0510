/**
 * AR Scavenger Hunt — Main Game Controller
 * Orchestrates MindAR, iOS WebKit permissions, 3D parenting,
 * Proximity Radar, Audio SFX, and the Menu Panel.
 *
 * Phase 2: Floor Reticle (#2), Carrying Hum (#6), Ambient Drone (#5), LERP (#1).
 * Phase 3: Chroma Key Hologram — shader applied to Target 1 via chromakey.js.
 * Phase 4: Living Photo Frames — Targets 2–4, isEasterEgg: true, zero coaster UI.
 *
 * 5-TARGET ROSTER (v2 — calibrated 2026-10-02):
 *   Index 0 — COASTER: Uncle Memorial    → memorial.mp4  [Chroma Key] (marker1.jpg)
 *   Index 1 — COASTER: Birthday Wishes   → dummy.mp4 (swap → montage.mp4 on release) (marker0.jpg)
 *   Index 2 — EASTER EGG FRAME: Wedding  → frame1_live.mp4 (marker2.jpg: 15.5cm x 11.0cm, ratio 1.409)
 *   Index 3 — EASTER EGG FRAME: River    → frame2_live.mp4 (marker3.jpg: 16.5cm x 11.5cm, ratio 1.435)
 *   Index 4 — EASTER EGG FRAME: A2 Stage → frame3_live.mp4 (marker4.jpg: 59.4cm x 42.0cm, ratio 1.414)
 */

// Phase 3: chromakey.js must register AFRAME.registerShader('chromakey') before
// any A-Frame component tries to use material="shader: chromakey".
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

// Feature #2: Floor placement reticle
let floorReticle = null;

// ─── TARGETS — Single Source of Truth ────────────────────────────────────────
//
//  isEasterEgg: true  → parallel track; zero coaster UI; excluded from celebration.
//  shader: 'chromakey'→ custom GLSL material registered by chromakey.js.
//  aspectRatio        → { w, h } for frame <a-video>. null = use defaults below.
//
//  Frame defaults: portrait ISO ratio (1.0 x 1.414)
//    width  = FRAME_DEFAULT_W = 1.0
//    height = FRAME_DEFAULT_H = 1.414
//
const FRAME_DEFAULT_W = 1.0;
const FRAME_DEFAULT_H = 1.414;

const TARGETS = [
  // ── COASTERS (Scavenger Hunt) ─────────────────────────────────────────────
  // Target 0: Uncle Memorial (marker1.jpg in targets.mind)
  {
    index:       0,
    title:       'Uncle Memorial',
    videoId:     'video-memorial',
    emoji:       '🕊️',
    shader:      'chromakey',   // Phase 3 — GLSL green despill + fresnel rim glow
    isEasterEgg: false,
    discovered:  false,
    placed:      false,
  },
  // Target 1: Birthday Wishes (marker0.jpg in targets.mind)
  {
    index:       1,
    title:       'Birthday Wishes',
    // TESTING CONTRACT: videoId points to dummy.mp4 for current mobile testing.
    // PRODUCTION SWAP: change videoId to 'video-montage' src in index.html
    //                  from ./assets/dummy.mp4 → ./assets/montage.mp4 before release.
    videoId:     'video-montage',
    emoji:       '🎂',
    shader:      'flat',
    isEasterEgg: false,
    discovered:  false,
    placed:      false,
  },

  // ── LIVING PHOTO FRAMES (Silent Easter Eggs) ──────────────────────────────
  // Calibrated with exact marker image aspect ratios to fit flush inside frame borders:
  // Target 2: Wedding Photo Frame (marker2.jpg: 3198x3699 -> ratio 1.157)
  {
    index:       2,
    title:       'Living Frame (Wedding)',
    videoId:     'video-frame1',
    isEasterEgg: true,
    aspectRatio: { w: 1.0, h: 1.157 },
  },
  // Target 3: River Photo Frame (marker3.jpg: 3000x4000 -> ratio 1.333, matches frame2_live.mp4 exactly)
  {
    index:       3,
    title:       'Living Frame (River)',
    videoId:     'video-frame2',
    isEasterEgg: true,
    aspectRatio: { w: 1.0, h: 1.333 },
  },
  // Target 4: A2 Stage Photo Frame (marker4.jpg: 2732x4096 -> ratio 1.500)
  {
    index:       4,
    title:       'Living Frame (A2 Stage)',
    videoId:     'video-frame3',
    isEasterEgg: true,
    aspectRatio: { w: 1.0, h: 1.500 },
  },
];

// Derived subsets — computed once; never hardcode counts anywhere.
// Celebration fires when COASTER_TARGETS.every(t => t.placed) — never when frames trigger.
const COASTER_TARGETS    = TARGETS.filter(t => !t.isEasterEgg); // length: 2
const EASTER_EGG_TARGETS = TARGETS.filter(t =>  t.isEasterEgg); // length: 3

// ─── DOM Elements ─────────────────────────────────────────────────────────────
let sceneEl, cameraEl, worldRootEl;
let mainActionBtn, guidanceBox;
let menuBtn, menuPanel, menuCloseBtn, sfxToggleRow, sfxToggle;
let progressList, emptyProgressMsg, restartSection, restartBtn;
let celebrationOverlay, celebrationRestartBtn;

function initApp() {
  sceneEl      = document.querySelector('#ar-scene');
  cameraEl     = document.querySelector('#main-camera');
  worldRootEl  = document.querySelector('#world-holograms-root');
  const vignetteEl = document.querySelector('#radar-vignette');

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

  initRadar(vignetteEl, cameraEl);
  setupUIEventListeners();
  setupMindAREventListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/* ─── UI Event Handling ────────────────────────────────────────────────────── */
function setupUIEventListeners() {
  if (mainActionBtn) {
    mainActionBtn.addEventListener('click', handleMainActionButton);
  }

  // Allow tapping guidance prompt or action button to advance AR states
  if (guidanceBox) {
    guidanceBox.addEventListener('click', () => {
      handleMainActionButton();
    });
  }

  // Allow tapping anywhere on the viewport / floor while carrying to drop!
  const arContainer = document.querySelector('#ar-container');
  if (arContainer) {
    arContainer.addEventListener('click', (e) => {
      if (currentState === STATE.CARRYING) {
        dropMemoryOnFloor();
      }
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
    // Wait for A-Frame scene to finish loading DOM entities
    if (!sceneEl.hasLoaded) {
      await new Promise(resolve => sceneEl.addEventListener('loaded', resolve, { once: true }));
    }

    // Enforce transparent clearColor on Three.js WebGL renderer
    if (sceneEl.renderer) {
      sceneEl.renderer.setClearColor(0x000000, 0);
    }

    const arSystem = sceneEl.systems['mindar-image-system'];
    if (!arSystem) {
      throw new Error('MindAR system not found.');
    }

    // Set up promise to wait for MindAR to finish loading camera & compiled targets
    const arReadyPromise = new Promise((resolve, reject) => {
      let resolved = false;

      const onReady = () => {
        if (resolved) return;
        resolved = true;
        sceneEl.removeEventListener('arReady', onReady);
        sceneEl.removeEventListener('arError', onError);
        resolve();
      };

      const onError = (e) => {
        if (resolved) return;
        resolved = true;
        sceneEl.removeEventListener('arReady', onReady);
        sceneEl.removeEventListener('arError', onError);
        reject(e?.detail?.error || new Error('Camera access failed'));
      };

      sceneEl.addEventListener('arReady', onReady, { once: true });
      sceneEl.addEventListener('arError', onError, { once: true });

      // Safety timeout: transition after 8 seconds if arReady didn't emit but camera started
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 8000);
    });

    guidanceBox.textContent = '⚙️ Loading AR tracking targets...';
    arSystem.start();

    // Ensure MindAR's camera video stream plays (NOT the asset videos).
    // MindAR injects its own <video> into .mindar-ui-overlay — target that specifically.
    const checkVideo = () => {
      // Try MindAR's overlay video first; fall back to any video with autoplay attribute
      const videoEl = document.querySelector('.mindar-ui-overlay video')
                   || document.querySelector('video[autoplay]');
      if (videoEl && videoEl.paused) {
        videoEl.play().catch(e => console.warn('Camera video play caught:', e));
      }
      if (sceneEl.renderer) {
        sceneEl.renderer.setClearColor(0x000000, 0);
      }
    };
    setTimeout(checkVideo, 500);

    await arReadyPromise;

  } catch (err) {
    console.error('MindAR start error:', err);
    guidanceBox.textContent = '⚠️ Camera blocked. Please tap the lock icon in the address bar to allow camera access.';
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

/* ─── MindAR Target Detection Listeners ─────────────────────────────────────── */
function setupMindAREventListeners() {
  TARGETS.forEach(target => {
    const targetEl = document.querySelector(`#target-${target.index}`);
    if (!targetEl) return;

    if (target.isEasterEgg) {
      // Phase 4: Easter Egg parallel track — fully decoupled from coaster state machine
      attachEasterEggListeners(target, targetEl);
    } else {
      // Coaster scavenger hunt track — full state machine + radar + pick/place
      attachCoasterListeners(target, targetEl);
    }
  });
}

/**
 * Phase 4: Easter Egg handler — play/pause only; zero coaster logic runs.
 *
 * Audio guard: if any coaster video is currently playing when the frame is
 * detected, the frame video plays muted. When a coaster video starts playing
 * (in dropMemoryOnFloor), any active frame videos are also muted.
 */
function attachEasterEggListeners(target, targetEl) {
  let lostTimeout = null;

  targetEl.addEventListener('targetFound', () => {
    if (lostTimeout) {
      clearTimeout(lostTimeout);
      lostTimeout = null;
    }

    const vid = document.getElementById(target.videoId);
    if (!vid) return;

    // Audio guard: check if any coaster is playing
    const anyCoasterPlaying = COASTER_TARGETS.some(ct => {
      const v = document.getElementById(ct.videoId);
      return v && !v.paused;
    });
    vid.muted = anyCoasterPlaying;

    // Inject flush planar video overlay on first detection
    let plane = targetEl.querySelector('.frame-video-plane');
    if (!plane) {
      attachFrameVideoPlane(target, targetEl);
    } else {
      const w = target.aspectRatio ? target.aspectRatio.w : FRAME_DEFAULT_W;
      const h = target.aspectRatio ? target.aspectRatio.h : FRAME_DEFAULT_H;
      plane.setAttribute('width',  w);
      plane.setAttribute('height', h);
      plane.setAttribute('visible', 'true');
    }

    if (vid.paused) {
      vid.play().catch(e => console.warn(`Frame ${target.index} play blocked:`, e));
    }
  });

  targetEl.addEventListener('targetLost', () => {
    // Debounce targetLost by 1500ms to eliminate stutter and pausing from hand jitter
    if (lostTimeout) clearTimeout(lostTimeout);
    lostTimeout = setTimeout(() => {
      const vid = document.getElementById(target.videoId);
      if (vid) vid.pause();
      const plane = targetEl.querySelector('.frame-video-plane');
      if (plane) plane.setAttribute('visible', 'false');
      lostTimeout = null;
    }, 1500);
  });
}

/**
 * Phase 4: Builds the flush planar <a-video> inside an Easter Egg target entity.
 * Sits at position 0 0 0.002 on the marker plane — flush overlay without clipping or parallax float.
 */
function attachFrameVideoPlane(target, targetEl) {
  const w = target.aspectRatio ? target.aspectRatio.w : FRAME_DEFAULT_W;
  const h = target.aspectRatio ? target.aspectRatio.h : FRAME_DEFAULT_H;

  const plane = document.createElement('a-video');
  plane.classList.add('frame-video-plane');
  // CRITICAL: src must be in the material attribute — a separate setAttribute('src') gets
  // overwritten when material is set later. Include both in one call.
  plane.setAttribute('material', `shader: flat; src: #${target.videoId}; side: double`);
  plane.setAttribute('width',    w);
  plane.setAttribute('height',   h);
  plane.setAttribute('position', '0 0 0.002');
  targetEl.appendChild(plane);
}

/**
 * Coaster listeners — full state machine, radar, pick/place.
 */

function attachCoasterListeners(target, targetEl) {
  targetEl.addEventListener('targetFound', () => {
    // FIX 3: Ignore if this coaster is already placed in the room
    if (target.placed) return;
    if (currentState !== STATE.SCANNING) return;

    // Pre-buffer video element so it's ready to play on first tap
    const vid = document.getElementById(target.videoId);
    // Do NOT call vid.load() here — it resets readyState and kills the autoplay permission token

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

/* ─── 3D Ring & Hologram Construction ─────────────────────────────────────── */
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

  // 2. Hologram Light Beam
  const beam = document.createElement('a-cylinder');
  beam.classList.add('hologram-beam');
  beam.setAttribute('radius',   '0.44');
  beam.setAttribute('height',   '1.6');
  beam.setAttribute('position', '0 0.8 0');
  beam.setAttribute('material', 'color: #00e5ff; transparent: true; opacity: 0; side: double');
  beam.setAttribute('visible',  'false');
  container.appendChild(beam);

  // 3. Video Plane (Portrait 9:16)
  const videoPlane = document.createElement('a-video');
  videoPlane.classList.add('video-screen');
  videoPlane.setAttribute('src',      `#${target.videoId}`);
  videoPlane.setAttribute('width',    '0.9');
  videoPlane.setAttribute('height',   '1.6');
  videoPlane.setAttribute('position', '0 0.8 0');
  videoPlane.setAttribute('visible',  'false');

  if (target.shader === 'chromakey') {
    videoPlane.setAttribute('material',
      `shader: chromakey; src: #${target.videoId}; colorThreshold: 0.35; smoothness: 0.1; rimStrength: 0.25`
    );
  } else {
    // CRITICAL: include src in the same setAttribute call as the shader.
    // Setting src separately then overwriting with material strips the texture binding.
    videoPlane.setAttribute('material',
      `shader: flat; src: #${target.videoId}; side: double`
    );
  }

  container.appendChild(videoPlane);
  return container;
}

/* ─── Feature #2: Floor Placement Reticle ─────────────────────────────────── */
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

/* ─── Feature #1: LERP — easeOutBack smooth interpolation ─────────────────── */
function lerpEntity(entity, targetPos, duration, onComplete) {
  const startPos  = {
    x: entity.object3D.position.x,
    y: entity.object3D.position.y,
    z: entity.object3D.position.z
  };
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const t       = Math.min(1, elapsed / duration);
    const c1      = 1.70158;
    const c3      = c1 + 1;
    const ease    = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

    entity.object3D.position.x = startPos.x + (targetPos.x - startPos.x) * ease;
    entity.object3D.position.y = startPos.y + (targetPos.y - startPos.y) * ease;
    entity.object3D.position.z = startPos.z + (targetPos.z - startPos.z) * ease;

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      entity.object3D.position.set(targetPos.x, targetPos.y, targetPos.z);
      if (onComplete) onComplete();
    }
  }
  requestAnimationFrame(tick);
}

/* ─── Step 3 & 4: Pick & Place Re-Parenting (LERP + Hum + Reticle) ─────────── */
function pickUpMemory(targetIndex) {
  const targetEl  = document.querySelector(`#target-${targetIndex}`);
  const container = targetEl ? targetEl.querySelector('.hologram-container') : null;
  if (!container) return;

  const target = TARGETS[targetIndex];
  // Register autoplay permission token for this video on the user's tap gesture.
  // CRITICAL: do NOT call vid.load() — it resets readyState and voids the token.
  const vid = document.getElementById(target.videoId);
  if (vid) {
    vid.muted = true;
    const prePlay = vid.play();
    if (prePlay !== undefined) {
      prePlay.then(() => {
        vid.pause();
        vid.currentTime = 0;
      }).catch(() => {});
    }
  }

  playPickUp();
  startCarryingHum();
  setRadarActive(false);

  const worldPos = new THREE.Vector3();
  container.object3D.getWorldPosition(worldPos);

  currentCarriedEntity = container;
  cameraEl.appendChild(container);

  const cameraWorldPos  = new THREE.Vector3();
  const cameraWorldQuat = new THREE.Quaternion();
  cameraEl.object3D.getWorldPosition(cameraWorldPos);
  cameraEl.object3D.getWorldQuaternion(cameraWorldQuat);
  const localPos = worldPos.sub(cameraWorldPos).applyQuaternion(cameraWorldQuat.invert());
  container.object3D.position.copy(localPos);

  lerpEntity(container, { x: 0, y: -0.35, z: -1.2 }, 400, () => {
    container.setAttribute('rotation', '15 0 0');
  });

  if (floorReticle) floorReticle.setAttribute('visible', 'true');

  currentState = STATE.CARRYING;
  guidanceBox.textContent = '🚶 Move & aim at the floor where you want to place it...';
  mainActionBtn.innerHTML = '<span>📍 Tap to "Drop" on Floor</span>';
}

function dropMemoryOnFloor() {
  if (!currentCarriedEntity) return;

  const targetIdx = parseInt(currentCarriedEntity.dataset.targetIndex, 10);
  const target    = TARGETS[targetIdx];
  const video     = document.getElementById(target.videoId);

  playDropBeam();
  stopCarryingHum();
  if (floorReticle) floorReticle.setAttribute('visible', 'false');

  // Mute any active Easter Egg frame videos while coaster plays
  EASTER_EGG_TARGETS.forEach(et => {
    const fv = document.getElementById(et.videoId);
    if (fv && !fv.paused) fv.muted = true;
  });

  // CRITICAL FIX 1: Play video IMMEDIATELY inside user gesture tap handler!
  if (video) {
    video.currentTime = 0;
    video.muted = false;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Unmuted autoplay restricted, attempting muted playback:', err);
        video.muted = true;
        video.play().catch(e => console.error('Video playback completely failed:', e));
      });
    }
  }

  // CRITICAL FIX 3: Dedicated side-by-side floor positions for Target 0 (-0.45) & Target 1 (+0.45)
  // Ensures both holograms stand side-by-side in your room without occluding each other!
  const slotX = targetIdx === 0 ? -0.45 : 0.45;
  const targetFloorPos = { x: slotX, y: -0.4, z: -1.3 };

  worldRootEl.appendChild(currentCarriedEntity);
  currentCarriedEntity.object3D.position.set(slotX, 0, -1.3);
  currentCarriedEntity.setAttribute('rotation', '0 0 0');

  // Guarantee 3D components are visible and scaled properly
  const ring       = currentCarriedEntity.querySelector('.ar-ring-model');
  const beam       = currentCarriedEntity.querySelector('.hologram-beam');
  const videoPlane = currentCarriedEntity.querySelector('.video-screen');
  if (ring)       ring.setAttribute('visible', 'true');
  if (beam)       beam.setAttribute('visible', 'true');
  if (videoPlane) {
    videoPlane.setAttribute('visible', 'true');
    videoPlane.setAttribute('scale', '1 1 1');
  }

  placedEntities[targetIdx] = currentCarriedEntity;
  const entityRef = currentCarriedEntity;

  lerpEntity(entityRef, targetFloorPos, 400, () => {
    animateMaterialization(entityRef, () => {
      // Safety check: ensure video is running
      if (video && video.paused) {
        video.play().catch(() => {});
      }
    });
  });

  markTargetDiscovered(targetIdx);
  currentCarriedEntity = null;
  currentState         = STATE.PLACED;

  guidanceBox.textContent = '🎉 Memory activated! Tap below to search for more.';
  mainActionBtn.innerHTML = '<span>🔍 Search for Next Memory</span>';
  mainActionBtn.classList.add('secondary');
}

/**
 * Drift Recovery: Re-Pick a placed memory from the Menu
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

  const beam       = existing.querySelector('.hologram-beam');
  const videoPlane = existing.querySelector('.video-screen');
  if (beam)       beam.setAttribute('visible', 'false');
  if (videoPlane) videoPlane.setAttribute('visible', 'false');

  currentCarriedEntity = existing;
  cameraEl.appendChild(existing);
  existing.setAttribute('position', '0 -0.35 -1.2');
  existing.setAttribute('rotation', '15 0 0');

  if (floorReticle) floorReticle.setAttribute('visible', 'true');

  activeTargetIndex = targetIndex;
  currentState      = STATE.CARRYING;

  guidanceBox.textContent = '🚶 Re-positioning memory: Aim at floor and tap Drop...';
  mainActionBtn.innerHTML = '<span>📍 Tap to "Drop" on Floor</span>';
  mainActionBtn.classList.remove('secondary');
}

function toggleVideoPlayback(targetIndex) {
  const video = document.getElementById(TARGETS[targetIndex].videoId);
  if (!video) return;
  playDrawerTick();
  video.paused ? video.play() : video.pause();
}

/* ─── Progress Tracking, Menu Updates & Celebration ───────────────────────── */
function markTargetDiscovered(targetIndex) {
  const target      = TARGETS[targetIndex];
  target.discovered = true;
  target.placed     = true;

  emptyProgressMsg.style.display = 'none';
  restartSection.style.display   = 'block';

  // Prevent duplicate memory cards in Saved Progress menu
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

  // Feature #5: One ambient drone layer per coaster placed
  const placedCount = COASTER_TARGETS.filter(t => t.placed).length;
  startAmbientDrone(placedCount);

  // ── CELEBRATION CHECK ────────────────────────────────────────────────────
  // Fires ONLY when both coasters are placed.
  // EASTER_EGG_TARGETS are NEVER counted — this check is coaster-only by design.
  const allCoastersPlaced = COASTER_TARGETS.every(t => t.placed);
  if (allCoastersPlaced) {
    setTimeout(() => triggerCelebration(), 1500);
  }
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

  // Reset coaster state
  COASTER_TARGETS.forEach(target => {
    target.discovered = false;
    target.placed     = false;
    const video = document.getElementById(target.videoId);
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  });

  // Pause Easter Egg frame videos (they resume naturally on next targetFound)
  EASTER_EGG_TARGETS.forEach(target => {
    const video = document.getElementById(target.videoId);
    if (video) video.pause();
  });

  // Clear dynamically created progress cards
  progressList.querySelectorAll('.memory-card').forEach(card => card.remove());
  emptyProgressMsg.style.display = 'block';
  restartSection.style.display   = 'none';

  if (floorReticle) floorReticle.setAttribute('visible', 'false');

  // Clear 3D world holograms
  while (worldRootEl.firstChild) {
    worldRootEl.removeChild(worldRootEl.firstChild);
  }
  Object.keys(placedEntities).forEach(k => delete placedEntities[k]);
  currentCarriedEntity = null;

  enterScanningState();
}
