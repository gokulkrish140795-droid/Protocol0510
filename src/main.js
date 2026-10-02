/**
 * AR Scavenger Hunt — v5 SIMPLE
 *
 * Scan coaster → video appears on the target and plays.
 * Target lost → video pauses.
 * That's it. No rings, no beams, no pickup, no drop.
 */

// ─── DOM refs ─────────────────────────────────────────────────────────────────
let sceneEl, cameraEl;
let mainActionBtn, guidanceBox;

function initApp() {
  sceneEl       = document.querySelector('#ar-scene');
  cameraEl      = document.querySelector('#main-camera');
  mainActionBtn = document.querySelector('#main-action-btn');
  guidanceBox   = document.querySelector('#guidance-box');

  mainActionBtn.addEventListener('click', startAR);
  guidanceBox.addEventListener('click',   startAR);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ─── Start AR ─────────────────────────────────────────────────────────────────
let arStarted = false;

async function startAR() {
  if (arStarted) return;
  arStarted = true;

  guidanceBox.textContent = '📹 Starting camera...';
  mainActionBtn.style.display = 'none';

  try {
    // iOS motion permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch (_) {}
    }

    if (!sceneEl.hasLoaded) {
      await new Promise(r => sceneEl.addEventListener('loaded', r, { once: true }));
    }

    const arSystem = sceneEl.systems['mindar-image-system'];
    if (!arSystem) throw new Error('MindAR not found');

    const ready = new Promise((res) => {
      let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      sceneEl.addEventListener('arReady', ok, { once: true });
      setTimeout(ok, 10000);
    });

    arSystem.start();
    await ready;

    if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0);

    guidanceBox.textContent = '🔍 Point camera at a coaster...';
    setupTargets();

  } catch (e) {
    console.error(e);
    guidanceBox.textContent = '⚠️ Camera blocked. Allow camera access and reload.';
    arStarted = false;
  }
}

// ─── Target setup — scan = play, lost = pause ─────────────────────────────────
function setupTargets() {
  const targets = [
    { index: 0, videoId: 'video-memorial', title: 'Uncle Memorial' },
    { index: 1, videoId: 'video-montage',  title: 'Birthday Wishes' },
  ];

  targets.forEach(t => {
    const el = document.querySelector(`#target-${t.index}`);
    if (!el) return;

    let videoPlane = null;  // created once on first detection

    el.addEventListener('targetFound', () => {
      guidanceBox.textContent = `▶ Playing: ${t.title}`;

      if (!videoPlane) {
        videoPlane = createVideoPlane(t.videoId);
        el.appendChild(videoPlane);
      }

      videoPlane.setAttribute('visible', 'true');

      const vid = document.getElementById(t.videoId);
      if (vid) {
        vid.currentTime = 0;
        vid.muted = false;
        vid.play().catch(() => {
          vid.muted = true;
          vid.play().catch(err => console.error('Play failed:', err));
        });
      }
    });

    el.addEventListener('targetLost', () => {
      guidanceBox.textContent = '🔍 Point camera at a coaster...';
      const vid = document.getElementById(t.videoId);
      if (vid) vid.pause();
      if (videoPlane) videoPlane.setAttribute('visible', 'false');
    });
  });
}

// ─── Create a simple video plane with THREE.VideoTexture ──────────────────────
function createVideoPlane(videoId) {
  const plane = document.createElement('a-plane');
  plane.setAttribute('width',    '0.9');
  plane.setAttribute('height',   '1.6');
  plane.setAttribute('position', '0 0 0.01'); // just above marker surface
  plane.setAttribute('material', 'color: #000; side: double');

  plane.addEventListener('loaded', () => {
    const videoEl = document.getElementById(videoId);
    if (!videoEl) { console.error('Video element not found:', videoId); return; }

    const mesh = plane.getObject3D('mesh');
    if (!mesh) { console.error('Mesh not ready'); return; }

    const tex = new THREE.VideoTexture(videoEl);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    mesh.material = new THREE.MeshBasicMaterial({
      map:  tex,
      side: THREE.DoubleSide,
    });
    mesh.material.needsUpdate = true;
    console.log('[AR] VideoTexture bound:', videoId);
  });

  return plane;
}
