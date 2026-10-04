/**
 * Protocol 0510 — v9
 * Flow: PIN → Loading/AR → Viewfinder → Scan → Sparkles → Video → Ending
 * BGM: starts on first PIN-screen touch, pauses during video, resumes on close
 * Heart counter: increments on scan, enables heart btn, updates bottom bar
 */

// ─── Targets ─────────────────────────────────────────────────────────────────
const TARGETS = [
  { index: 0, videoId: 'video-memorial', title: 'Uncle Memorial',  emoji: '🕊️', collected: false },
  { index: 1, videoId: 'video-montage',  title: 'Birthday Wishes', emoji: '🎂', collected: false },
];
const CORRECT_PIN = '0510';

// ─── BGM ─────────────────────────────────────────────────────────────────────
let bgm      = null;
let bgmMuted = false;

function getBgm() {
  if (!bgm) {
    bgm = document.getElementById('bgm-audio');
    if (!bgm) {
      bgm = new Audio('./assets/bgm_intro.mp3');
    }
    bgm.loop = true;
  }
  return bgm;
}

function startBGM() {
  if (bgmMuted) return;
  const audio = getBgm();
  if (audio && audio.paused) {
    audio.volume = 1.0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(err => {
        console.warn('BGM awaiting user gesture:', err);
      });
    }
  }
}

function initBGM() {
  startBGM();
}

function pauseBGM() {
  const audio = getBgm();
  if (audio) audio.pause();
}

function resumeBGM() {
  if (!bgmMuted) {
    startBGM();
  }
}

function duckBGM() {
  const audio = getBgm();
  if (audio) audio.volume = 0.12;
}

function unduckBGM() {
  const audio = getBgm();
  if (audio && !bgmMuted) audio.volume = 1.0;
}

function toggleBGM() {
  bgmMuted = !bgmMuted;
  const audio = getBgm();
  if (bgmMuted) {
    if (audio) audio.pause();
  } else {
    if (audio) {
      audio.volume = 1.0;
      audio.play().catch(() => {});
    }
  }
  updateAllMuteBtns();
}

function updateAllMuteBtns() {
  const icon = bgmMuted ? '🔇' : '🔊';
  ['bgm-toggle', 'vf-mute', 'player-mute', 'ending-mute'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
}

// ─── Heart / memory counter ───────────────────────────────────────────────────
let heartCount = 0;

function incrementHeart() {
  heartCount++;
  // Sync all .heart-count spans
  document.querySelectorAll('.heart-count').forEach(el => { el.textContent = heartCount; });
  // Enable heart buttons once first memory collected
  if (heartCount === 1) {
    ['vf-heart', 'pin-heart'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('disabled'); el.disabled = false; }
    });
  }
  updateBottomBar();
}

function resetHeartDisplay() {
  heartCount = 0;
  document.querySelectorAll('.heart-count').forEach(el => { el.textContent = '0'; });
  ['vf-heart', 'pin-heart'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('disabled'); el.disabled = true; }
  });
  updateBottomBar();
}

function updateBottomBar() {
  const countEl  = document.getElementById('bottom-count');
  const statusEl = document.getElementById('bottom-status');
  if (countEl)  countEl.textContent = heartCount;
  if (statusEl) {
    statusEl.textContent = heartCount === 0 ? 'None collected yet'
      : heartCount === 1 ? '1 memory unlocked ✦'
      : `${heartCount} memories unlocked ✦`;
  }
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────
let pinScreen, loadingScreen, vfOverlay, videoOverlay, endingScreen;
let pinBoxes, pinError;
let sparkleContainer;
let menuPanel, menuClose, menuList, menuEmpty;
let playerVideo, playerToggle, playerRestart, playerClose, playerTitle;
let playerUi, playerTapArea, playerSkip, playerBack5;
let replayBtn, sceneEl;
let controlsHideTimer = null;

// AR initialisation is one-time only
let arInitialized  = false;
let targetsSetup   = false;

// ─── Boot ─────────────────────────────────────────────────────────────────────
function init() {
  pinScreen     = document.getElementById('pin-screen');
  loadingScreen = document.getElementById('loading-screen');
  vfOverlay     = document.getElementById('vf-overlay');
  videoOverlay  = document.getElementById('video-overlay');
  endingScreen  = document.getElementById('ending-screen');

  pinBoxes = document.querySelectorAll('.pin-digit');
  pinError = document.getElementById('pin-error');

  sparkleContainer = document.getElementById('sparkle-container');

  menuPanel = document.getElementById('menu-panel');
  menuClose = document.getElementById('menu-close');
  menuList  = document.getElementById('menu-list');
  menuEmpty = document.getElementById('menu-empty');

  playerVideo   = document.getElementById('player-video');
  playerToggle  = document.getElementById('player-toggle');
  playerRestart = document.getElementById('player-restart');
  playerClose   = document.getElementById('player-close');
  playerTitle   = document.getElementById('player-title');
  playerUi      = document.getElementById('player-ui');
  playerTapArea = document.getElementById('player-tap-area');
  playerSkip    = document.getElementById('player-skip');
  playerBack5   = document.getElementById('player-back5');

  replayBtn = document.getElementById('replay-btn');
  sceneEl   = document.getElementById('ar-scene');

  setupPIN();
  setupPlayer();
  setupMenu();
  wireGlobalButtons();

  setTimeout(() => pinBoxes[0]?.focus(), 350);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

// ─── Wire up global buttons (mute / heart / back / restart) ──────────────────
function wireGlobalButtons() {
  // All mute / BGM buttons
  ['bgm-toggle', 'vf-mute', 'player-mute', 'ending-mute'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', toggleBGM);
  });

  // Heart / memories buttons → open menu panel
  ['vf-heart', 'pin-heart', 'ending-heart'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => menuPanel.classList.add('open'));
  });

  // Viewfinder BACK and RESTART → go back to PIN home screen
  document.getElementById('vf-back')?.addEventListener('click',    goHome);
  document.getElementById('vf-restart')?.addEventListener('click', goHome);
}


// ════════════════════════════════════════════════════════════════════════════
// PIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
function setupPIN() {
  // Global unlock on ANY mobile interaction (tap, touch, click, key)
  const unlockAudio = () => {
    startBGM();
  };
  ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });

  pinBoxes.forEach((box, i) => {
    box.addEventListener('input', e => {
      startBGM();
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && i < pinBoxes.length - 1) pinBoxes[i + 1].focus();
      const code = Array.from(pinBoxes).map(b => b.value).join('');
      if (code.length === 4) {
        code === CORRECT_PIN ? pinCorrect() : pinWrong();
      }
    });
    box.addEventListener('keydown', e => {
      startBGM();
      if (e.key === 'Backspace' && !box.value && i > 0) pinBoxes[i - 1].focus();
    });
  });
}

function pinCorrect() {
  pinBoxes.forEach(b => { b.classList.add('correct'); b.disabled = true; });
  pinError.classList.remove('show');
  startBGM(); // Explicitly trigger BGM on correct PIN
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


// ════════════════════════════════════════════════════════════════════════════
// AR START  (one-time init; subsequent calls just reveal viewfinder)
// ════════════════════════════════════════════════════════════════════════════
async function startAR() {
  if (arInitialized) {
    hide(loadingScreen);
    show(vfOverlay);
    resumeBGM();
    return;
  }

  try {
    // iOS gyro permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch (_) {}
    }

    if (!sceneEl.hasLoaded) {
      await new Promise(r => sceneEl.addEventListener('loaded', r, { once: true }));
    }

    const arSystem = sceneEl.systems['mindar-image-system'];
    if (!arSystem) throw new Error('MindAR not ready');

    const arReady = new Promise(res => {
      let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      sceneEl.addEventListener('arReady', ok, { once: true });
      setTimeout(ok, 10000); // fallback
    });

    arSystem.start();
    await arReady;
    arInitialized = true;

    // Force WebGL canvas transparent (called 3× to be safe on Android)
    const clearCanvas = () => { if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0); };
    clearCanvas();
    setTimeout(clearCanvas, 200);
    setTimeout(clearCanvas, 700);

    hide(loadingScreen);
    show(vfOverlay);
    resumeBGM();
    setupTargets();

  } catch (err) {
    console.error('AR init error:', err);
    hide(loadingScreen);
    show(vfOverlay);
    resumeBGM();
  }
}


// ════════════════════════════════════════════════════════════════════════════
// TARGET DETECTION
// ════════════════════════════════════════════════════════════════════════════
function setupTargets() {
  if (targetsSetup) return;
  targetsSetup = true;

  TARGETS.forEach(t => {
    const el = document.querySelector(`#target-${t.index}`);
    if (!el) return;

    el.addEventListener('targetFound', () => {
      if (t.collected) return; // already unlocked, do nothing
      duckBGM();
      playSparkles(() => {
        unduckBGM();
        t.collected = true;
        incrementHeart();
        addToMenu(t);
        openVideo(t);
      });
    });
  });
}


// ════════════════════════════════════════════════════════════════════════════
// SPARKLES
// ════════════════════════════════════════════════════════════════════════════
function playSparkles(onDone) {
  sparkleContainer.classList.add('active');
  sparkleContainer.innerHTML = '';
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 34; i++) {
    const s = document.createElement('div');
    s.classList.add('sparkle');
    const angle = (Math.PI * 2 * i) / 34 + (Math.random() - 0.5) * 0.4;
    const dist  = 55 + Math.random() * 140;
    const size  = 4 + Math.random() * 6;
    s.style.cssText = `
      left:${cx}px; top:${cy}px;
      width:${size}px; height:${size}px;
      --dx:${Math.cos(angle) * dist}px;
      --dy:${Math.sin(angle) * dist}px;
      animation-delay:${Math.random() * 0.25}s;
    `;
    sparkleContainer.appendChild(s);
  }
  setTimeout(() => {
    sparkleContainer.classList.remove('active');
    sparkleContainer.innerHTML = '';
    if (onDone) onDone();
  }, 1500);
}


// ════════════════════════════════════════════════════════════════════════════
// VIDEO PLAYER
// ════════════════════════════════════════════════════════════════════════════
function setupPlayer() {
  // Play / Pause
  playerToggle.addEventListener('click', () => {
    playerVideo.paused ? playerVideo.play().catch(() => {}) : playerVideo.pause();
    updateToggleIcon();
    keepControlsVisible();
  });
  playerVideo.addEventListener('play',  updateToggleIcon);
  playerVideo.addEventListener('pause', updateToggleIcon);

  // Restart (from beginning)
  playerRestart.addEventListener('click', () => {
    playerVideo.currentTime = 0;
    playerVideo.play().catch(() => {});
    keepControlsVisible();
  });

  // Skip back 5 s
  playerBack5?.addEventListener('click', () => {
    playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 5);
    keepControlsVisible();
  });

  // Skip forward 5 s
  playerSkip?.addEventListener('click', () => {
    playerVideo.currentTime = Math.min(
      playerVideo.currentTime + 5,
      playerVideo.duration || playerVideo.currentTime + 5
    );
    keepControlsVisible();
  });

  // Tap video → toggle controls fade
  playerTapArea.addEventListener('click', toggleControls);

  // ← BACK closes video
  playerClose.addEventListener('click', closeVideo);
}

function showControls() {
  playerUi.classList.remove('hidden-controls');
  clearTimeout(controlsHideTimer);
  // Auto-hide after 3 s while video is playing
  controlsHideTimer = setTimeout(() => {
    if (!playerVideo.paused) playerUi.classList.add('hidden-controls');
  }, 3000);
}

function keepControlsVisible() {
  playerUi.classList.remove('hidden-controls');
  clearTimeout(controlsHideTimer);
  controlsHideTimer = setTimeout(() => {
    if (!playerVideo.paused) playerUi.classList.add('hidden-controls');
  }, 3000);
}

function toggleControls() {
  if (playerUi.classList.contains('hidden-controls')) {
    showControls();
  } else {
    clearTimeout(controlsHideTimer);
    playerUi.classList.add('hidden-controls');
  }
}

function openVideo(target) {
  const srcEl = document.getElementById(target.videoId);
  if (!srcEl) return;

  pauseBGM();

  playerVideo.src  = srcEl.src;
  playerVideo.loop = true;
  playerTitle.textContent = `${target.emoji} ${target.title}`;

  show(videoOverlay);

  playerVideo.currentTime = 0;
  playerVideo.muted = false;
  playerVideo.play().catch(() => {
    playerVideo.muted = true;
    playerVideo.play().catch(e => console.error('Video play failed:', e));
  });
  updateToggleIcon();
  showControls();
}

function closeVideo() {
  playerVideo.pause();
  playerVideo.src = '';
  clearTimeout(controlsHideTimer);
  playerUi.classList.remove('hidden-controls');
  hide(videoOverlay);
  resumeBGM();

  // Both memories collected? Show ending after brief delay
  if (TARGETS.every(t => t.collected)) {
    setTimeout(showEndingScreen, 600);
  }
}

function updateToggleIcon() {
  playerToggle.textContent = playerVideo.paused ? '▶' : '⏸';
}


// ════════════════════════════════════════════════════════════════════════════
// ENDING SCREEN
// ════════════════════════════════════════════════════════════════════════════
function showEndingScreen() {
  show(endingScreen);
  launchEndingSparkles();
}

function launchEndingSparkles() {
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('div');
    const sz = 4 + Math.random() * 5;
    s.style.cssText = `
      position:fixed; width:${sz}px; height:${sz}px; border-radius:50%;
      background:#d4a84c; box-shadow:0 0 8px #d4a84c;
      left:${Math.random() * 100}vw; top:${60 + Math.random() * 36}vh;
      animation: sparkle-fly 2.5s ease-out ${Math.random() * 1.5}s forwards;
      --dx:${(Math.random() - 0.5) * 200}px;
      --dy:${-(40 + Math.random() * 120)}px;
      pointer-events:none; z-index:56;
    `;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 5000);
  }
}


// ════════════════════════════════════════════════════════════════════════════
// MENU
// ════════════════════════════════════════════════════════════════════════════
function setupMenu() {
  menuClose?.addEventListener('click', () => menuPanel.classList.remove('open'));

  replayBtn?.addEventListener('click', () => {
    hide(endingScreen);
    menuPanel.classList.add('open');
  });

  document.getElementById('home-btn')?.addEventListener('click', goHome);
}

function addToMenu(target) {
  menuEmpty.style.display = 'none';
  if (menuList.querySelector(`#mc-${target.index}`)) return;
  const card = document.createElement('div');
  card.classList.add('menu-card');
  card.id = `mc-${target.index}`;
  card.innerHTML = `
    <div class="menu-card-info">
      <h4>${target.emoji} ${target.title}</h4>
      <p>Tap to replay</p>
    </div>
    <button class="menu-card-play" aria-label="Play">▶</button>`;
  card.addEventListener('click', () => {
    menuPanel.classList.remove('open');
    openVideo(target);
  });
  menuList.appendChild(card);
}


// ════════════════════════════════════════════════════════════════════════════
// GO HOME  (resets full experience, returns to PIN screen)
// ════════════════════════════════════════════════════════════════════════════
function goHome() {
  // Stop video
  playerVideo.pause();
  playerVideo.src = '';
  clearTimeout(controlsHideTimer);
  playerUi.classList.remove('hidden-controls');

  // Pause BGM
  pauseBGM();

  // Reset targets
  TARGETS.forEach(t => { t.collected = false; });

  // Reset heart counter
  resetHeartDisplay();

  // Reset PIN
  pinBoxes.forEach(b => { b.value = ''; b.disabled = false; b.classList.remove('correct', 'wrong'); });
  pinError.classList.remove('show');

  // Clear memories menu
  menuList.querySelectorAll('.menu-card').forEach(c => c.remove());
  menuEmpty.style.display = '';

  // Hide everything, show PIN
  hide(endingScreen);
  hide(videoOverlay);
  hide(vfOverlay);
  hide(loadingScreen);
  menuPanel.classList.remove('open');
  show(pinScreen);

  setTimeout(() => pinBoxes[0]?.focus(), 300);
}
