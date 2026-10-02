/**
 * Protocol 0510 — v8
 *
 * FLOW: PIN entry → Loading/AR init → AR Viewfinder → Scan → Sparkles
 *       → Fullscreen Video (BGM ducked/paused) → Close → All collected → Ending page
 *
 * BGM: bgm_intro.mp3 plays from PIN correct, pauses during video, resumes on close.
 */

// ─── Target definitions ───────────────────────────────────────────────────────
const TARGETS = [
  { index: 0, videoId: 'video-memorial', title: '🕊️ Uncle Memorial',  emoji: '🕊️', collected: false },
  { index: 1, videoId: 'video-montage',  title: '🎂 Birthday Wishes', emoji: '🎂', collected: false },
];
const CORRECT_PIN = '0510';

// ─── BGM ──────────────────────────────────────────────────────────────────────
let bgm = null;
let bgmMuted = false;

function initBGM() {
  if (bgm) return;
  bgm = new Audio('./assets/bgm_intro.mp3');
  bgm.loop = true;
  bgm.volume = 1.0;
  bgm.play().catch(() => {});
}
function pauseBGM()  { if (bgm) bgm.pause(); }
function resumeBGM() { if (bgm && !bgmMuted) bgm.play().catch(() => {}); }
function duckBGM()   { if (bgm) { bgm.volume = 0.12; } }
function unduckBGM() { if (bgm && !bgmMuted) { bgm.volume = 1.0; } }
function toggleBGM() {
  bgmMuted = !bgmMuted;
  if (bgm) bgm.volume = bgmMuted ? 0 : 1.0;
  document.getElementById('bgm-toggle').textContent = bgmMuted ? '🔇' : '🔊';
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────
let pinScreen, loadingScreen, vfOverlay, videoOverlay, endingScreen;
let pinBoxes, pinError, bgmToggle;
let scanGuidance, sparkleContainer;
let menuBtn, menuPanel, menuClose, menuList, menuEmpty;
let endingMenuBtn;
let playerVideo, playerToggle, playerRestart, playerClose, playerTitle;
let replayBtn;
let sceneEl;

function init() {
  pinScreen    = document.getElementById('pin-screen');
  loadingScreen= document.getElementById('loading-screen');
  vfOverlay    = document.getElementById('vf-overlay');
  videoOverlay = document.getElementById('video-overlay');
  endingScreen = document.getElementById('ending-screen');

  pinBoxes  = document.querySelectorAll('.pin-digit');
  pinError  = document.getElementById('pin-error');
  bgmToggle = document.getElementById('bgm-toggle');

  scanGuidance     = document.getElementById('scan-guidance');
  sparkleContainer = document.getElementById('sparkle-container');

  menuBtn      = document.getElementById('menu-btn');
  menuPanel    = document.getElementById('menu-panel');
  menuClose    = document.getElementById('menu-close');
  menuList     = document.getElementById('menu-list');
  menuEmpty    = document.getElementById('menu-empty');
  endingMenuBtn= document.getElementById('ending-menu-btn');

  playerVideo   = document.getElementById('player-video');
  playerToggle  = document.getElementById('player-toggle');
  playerRestart = document.getElementById('player-restart');
  playerClose   = document.getElementById('player-close');
  playerTitle   = document.getElementById('player-title');

  replayBtn = document.getElementById('replay-btn');
  sceneEl   = document.getElementById('ar-scene');

  setupPIN();
  setupPlayer();
  setupMenu();
  if (bgmToggle) bgmToggle.addEventListener('click', toggleBGM);

  // Auto-focus first PIN digit
  setTimeout(() => pinBoxes[0]?.focus(), 350);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

// ══════════════════════════════════════════════════════════════════════════════
// PIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function setupPIN() {
  pinBoxes.forEach((box, i) => {
    box.addEventListener('input', e => {
      // Strip non-digits
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && i < pinBoxes.length - 1) pinBoxes[i + 1].focus();

      const code = Array.from(pinBoxes).map(b => b.value).join('');
      if (code.length === 4) {
        code === CORRECT_PIN ? pinCorrect() : pinWrong();
      }
    });

    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) pinBoxes[i - 1].focus();
    });
  });
}

function pinCorrect() {
  pinBoxes.forEach(b => { b.classList.add('correct'); b.disabled = true; });
  pinError.classList.remove('show');

  // Start BGM immediately on correct PIN (user gesture context)
  initBGM();

  setTimeout(() => {
    hide(pinScreen);
    show(loadingScreen);
    startAR();
  }, 700);
}

function pinWrong() {
  pinBoxes.forEach(b => b.classList.add('wrong'));
  pinError.classList.add('show');
  setTimeout(() => {
    pinBoxes.forEach(b => { b.classList.remove('wrong'); b.value = ''; });
    pinError.classList.remove('show');
    pinBoxes[0].focus();
  }, 900);
}

// ══════════════════════════════════════════════════════════════════════════════
// AR START
// ══════════════════════════════════════════════════════════════════════════════
async function startAR() {
  try {
    // iOS gyro permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch (_) {}
    }

    // Wait for A-Frame to bootstrap
    if (!sceneEl.hasLoaded) {
      await new Promise(r => sceneEl.addEventListener('loaded', r, { once: true }));
    }

    const arSystem = sceneEl.systems['mindar-image-system'];
    if (!arSystem) throw new Error('MindAR system not available');

    const arReady = new Promise(res => {
      let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      sceneEl.addEventListener('arReady', ok, { once: true });
      setTimeout(ok, 10000); // 10s fallback
    });

    arSystem.start();
    await arReady;

    // Force WebGL canvas transparent — call 3× to guarantee
    const makeTransparent = () => {
      if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0);
    };
    makeTransparent();
    setTimeout(makeTransparent, 200);
    setTimeout(makeTransparent, 700);

    hide(loadingScreen);
    show(vfOverlay);
    setupTargets();

  } catch (err) {
    console.error('AR start error:', err);
    hide(loadingScreen);
    show(vfOverlay);
    scanGuidance.textContent = '⚠️ Camera blocked — please allow camera access and reload.';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TARGET DETECTION
// ══════════════════════════════════════════════════════════════════════════════
function setupTargets() {
  TARGETS.forEach(t => {
    const el = document.querySelector(`#target-${t.index}`);
    if (!el) return;

    el.addEventListener('targetFound', () => {
      if (t.collected) {
        scanGuidance.textContent = `${t.emoji} Already saved! Open ☰ to replay.`;
        return;
      }
      scanGuidance.textContent = `✨ ${t.title} detected!`;
      duckBGM(); // Duck BGM for sparkle moment
      playSparkles(() => {
        unduckBGM();
        t.collected = true;
        addToMenu(t);
        openVideo(t);

        // If both collected, queue ending screen
        if (TARGETS.every(x => x.collected)) {
          playerVideo.addEventListener('pause', maybeShowEnding, { once: false });
        }
      });
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SPARKLES
// ══════════════════════════════════════════════════════════════════════════════
function playSparkles(onDone) {
  sparkleContainer.classList.add('active');
  sparkleContainer.innerHTML = '';

  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;

  for (let i = 0; i < 34; i++) {
    const spark = document.createElement('div');
    spark.classList.add('sparkle');
    const angle = (Math.PI * 2 * i) / 34 + (Math.random() - 0.5) * 0.4;
    const dist  = 55 + Math.random() * 140;
    const size  = 4 + Math.random() * 6;
    spark.style.cssText = `
      left:${cx}px; top:${cy}px;
      width:${size}px; height:${size}px;
      --dx:${Math.cos(angle)*dist}px;
      --dy:${Math.sin(angle)*dist}px;
      animation-delay:${Math.random()*0.25}s;
    `;
    sparkleContainer.appendChild(spark);
  }

  setTimeout(() => {
    sparkleContainer.classList.remove('active');
    sparkleContainer.innerHTML = '';
    if (onDone) onDone();
  }, 1500);
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO PLAYER
// ══════════════════════════════════════════════════════════════════════════════
function setupPlayer() {
  playerToggle.addEventListener('click', () => {
    playerVideo.paused ? playerVideo.play().catch(()=>{}) : playerVideo.pause();
    updateToggleIcon();
  });
  playerVideo.addEventListener('play',  updateToggleIcon);
  playerVideo.addEventListener('pause', updateToggleIcon);

  playerRestart.addEventListener('click', () => {
    playerVideo.currentTime = 0;
    playerVideo.play().catch(()=>{});
  });

  playerClose.addEventListener('click', closeVideo);
}

function openVideo(target) {
  const srcEl = document.getElementById(target.videoId);
  if (!srcEl) return;

  pauseBGM(); // Stop BGM while video plays

  playerVideo.src   = srcEl.src;
  playerVideo.loop  = true;
  playerTitle.textContent = target.title;

  show(videoOverlay);

  playerVideo.currentTime = 0;
  playerVideo.muted = false;
  playerVideo.play().catch(() => {
    playerVideo.muted = true;
    playerVideo.play().catch(e => console.error('Video play failed:', e));
  });
  updateToggleIcon();
}

function closeVideo() {
  playerVideo.pause();
  playerVideo.src = '';
  hide(videoOverlay);
  resumeBGM(); // Resume BGM when video closed
  scanGuidance.textContent = '🔍 Point camera at a coaster';

  // Show ending if all collected
  if (TARGETS.every(t => t.collected)) {
    setTimeout(() => showEndingScreen(), 600);
  }
}

function updateToggleIcon() {
  playerToggle.textContent = playerVideo.paused ? '▶' : '⏸';
}

function maybeShowEnding() {
  // Cleanup — we use the closeVideo path instead
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDING SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function showEndingScreen() {
  show(endingScreen);
  launchEndingSparkles();
}

function launchEndingSparkles() {
  const container = document.getElementById('ending-sparkles');
  if (!container) return;
  // Create floating gold sparkles at random positions
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('div');
    const size = 4 + Math.random() * 5;
    s.style.cssText = `
      position:absolute;
      width:${size}px; height:${size}px;
      border-radius:50%;
      background:#d4a84c;
      box-shadow:0 0 8px #d4a84c;
      left:${Math.random()*100}vw;
      top:${60 + Math.random()*40}vh;
      animation: sparkle-fly 2.5s ease-out ${Math.random()*1.5}s forwards;
      --dx:${(Math.random()-0.5)*200}px;
      --dy:${-(40+Math.random()*120)}px;
    `;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 5000);
  }
}

// Replay memories from ending screen
if (document.readyState !== 'loading') {
  document.getElementById('replay-btn')?.addEventListener('click', () => {
    hide(endingScreen);
    menuPanel.classList.add('open');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════════════════
function setupMenu() {
  menuBtn?.addEventListener('click', () => menuPanel.classList.add('open'));
  menuClose?.addEventListener('click', () => menuPanel.classList.remove('open'));
  endingMenuBtn?.addEventListener('click', () => menuPanel.classList.add('open'));

  replayBtn?.addEventListener('click', () => {
    hide(endingScreen);
    menuPanel.classList.add('open');
  });
}

function addToMenu(target) {
  menuEmpty.style.display = 'none';
  if (menuList.querySelector(`#mc-${target.index}`)) return;

  const card = document.createElement('div');
  card.classList.add('menu-card');
  card.id = `mc-${target.index}`;
  card.innerHTML = `
    <div class="menu-card-info">
      <h4>${target.emoji} ${target.title.replace(/^[^ ]+ /, '')}</h4>
      <p>Tap to replay</p>
    </div>
    <button class="menu-card-play" aria-label="Play">▶</button>`;
  card.addEventListener('click', () => {
    menuPanel.classList.remove('open');
    openVideo(target);
  });
  menuList.appendChild(card);
}
