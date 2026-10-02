/**
 * Protocol 0510 — Main Controller v6
 *
 * Flow: PIN → Loading → AR Viewfinder → Scan → Sparkles → Fullscreen Video
 * Collected videos saved in menu for later replay.
 */

const TARGETS = [
  { index: 0, videoId: 'video-memorial', title: 'Uncle Memorial',  emoji: '🕊️', collected: false },
  { index: 1, videoId: 'video-montage',  title: 'Birthday Wishes', emoji: '🎂', collected: false },
];

const CORRECT_PIN = '0510';

// ─── DOM refs (set in init) ───────────────────────────────────────────────────
let pinScreen, loadingScreen, arScreen, videoOverlay;
let pinBoxes, pinError;
let scanGuidance, sparkleContainer;
let menuBtn, menuPanel, menuClose, menuList, menuEmpty;
let playerVideo, playerToggle, playerRestart, playerClose, playerTitle;
let sceneEl;

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  pinScreen      = document.getElementById('pin-screen');
  loadingScreen  = document.getElementById('loading-screen');
  arScreen       = document.getElementById('ar-screen');
  videoOverlay   = document.getElementById('video-overlay');

  pinBoxes       = document.querySelectorAll('.pin-digit');
  pinError       = document.getElementById('pin-error');

  scanGuidance      = document.getElementById('scan-guidance');
  sparkleContainer  = document.getElementById('sparkle-container');

  menuBtn    = document.getElementById('menu-btn');
  menuPanel  = document.getElementById('menu-panel');
  menuClose  = document.getElementById('menu-close');
  menuList   = document.getElementById('menu-list');
  menuEmpty  = document.getElementById('menu-empty');

  playerVideo   = document.getElementById('player-video');
  playerToggle  = document.getElementById('player-toggle');
  playerRestart = document.getElementById('player-restart');
  playerClose   = document.getElementById('player-close');
  playerTitle   = document.getElementById('player-title');

  sceneEl = document.getElementById('ar-scene');

  setupPinInput();
  setupPlayerControls();
  setupMenu();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 1: PIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════════
function setupPinInput() {
  pinBoxes.forEach((box, i) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;

      if (val && i < pinBoxes.length - 1) {
        pinBoxes[i + 1].focus();
      }

      // Check if all 4 digits are entered
      const code = Array.from(pinBoxes).map(b => b.value).join('');
      if (code.length === 4) {
        if (code === CORRECT_PIN) {
          onPinCorrect();
        } else {
          onPinWrong();
        }
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        pinBoxes[i - 1].focus();
      }
    });

    // Auto-focus first box
    if (i === 0) setTimeout(() => box.focus(), 300);
  });
}

function onPinCorrect() {
  pinBoxes.forEach(b => { b.classList.add('correct'); b.disabled = true; });
  pinError.classList.remove('show');

  setTimeout(() => {
    showScreen(loadingScreen);
    setTimeout(() => startAR(), 2500);
  }, 600);
}

function onPinWrong() {
  pinBoxes.forEach(b => b.classList.add('wrong'));
  pinError.classList.add('show');

  setTimeout(() => {
    pinBoxes.forEach(b => { b.classList.remove('wrong'); b.value = ''; });
    pinBoxes[0].focus();
  }, 800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 2: LOADING → AR START
// ═══════════════════════════════════════════════════════════════════════════════
async function startAR() {
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

    const ready = new Promise(res => {
      let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      sceneEl.addEventListener('arReady', ok, { once: true });
      setTimeout(ok, 10000);
    });

    arSystem.start();
    await ready;

    if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0);

    showScreen(arScreen);
    setupTargets();

  } catch (e) {
    console.error('AR start failed:', e);
    scanGuidance.textContent = '⚠️ Camera blocked. Allow camera and reload.';
    showScreen(arScreen);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 3: AR VIEWFINDER — Target Detection
// ═══════════════════════════════════════════════════════════════════════════════
function setupTargets() {
  TARGETS.forEach(t => {
    const el = document.querySelector(`#target-${t.index}`);
    if (!el) return;

    el.addEventListener('targetFound', () => {
      if (t.collected) return; // already got this one

      scanGuidance.textContent = `✨ ${t.title} detected!`;

      // Sparkle effect → then open video
      playSparkles(() => {
        t.collected = true;
        addToMenu(t);
        openVideo(t);
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARKLE EFFECT
// ═══════════════════════════════════════════════════════════════════════════════
function playSparkles(onDone) {
  sparkleContainer.classList.add('active');
  sparkleContainer.innerHTML = '';

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const count = 30;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.classList.add('sparkle');

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist  = 60 + Math.random() * 120;
    const dx    = Math.cos(angle) * dist;
    const dy    = Math.sin(angle) * dist;

    spark.style.left = `${cx}px`;
    spark.style.top  = `${cy}px`;
    spark.style.setProperty('--dx', `${dx}px`);
    spark.style.setProperty('--dy', `${dy}px`);
    spark.style.animationDelay = `${Math.random() * 0.3}s`;
    spark.style.width  = `${4 + Math.random() * 5}px`;
    spark.style.height = spark.style.width;

    sparkleContainer.appendChild(spark);
  }

  setTimeout(() => {
    sparkleContainer.classList.remove('active');
    sparkleContainer.innerHTML = '';
    if (onDone) onDone();
  }, 1400);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO OVERLAY (fullscreen player)
// ═══════════════════════════════════════════════════════════════════════════════
let currentVideoSrc = null;

function openVideo(target) {
  const srcVideo = document.getElementById(target.videoId);
  if (!srcVideo) return;

  // Copy source to the player video element
  playerVideo.src = srcVideo.src;
  playerVideo.loop = true;
  playerTitle.textContent = target.title;

  showScreen(videoOverlay);

  playerVideo.currentTime = 0;
  playerVideo.muted = false;
  playerVideo.play().catch(() => {
    playerVideo.muted = true;
    playerVideo.play().catch(e => console.error('Play failed:', e));
  });

  currentVideoSrc = target;
  updateToggleIcon();
}

function setupPlayerControls() {
  playerToggle.addEventListener('click', () => {
    if (playerVideo.paused) {
      playerVideo.play().catch(() => {});
    } else {
      playerVideo.pause();
    }
    updateToggleIcon();
  });

  playerVideo.addEventListener('play',  updateToggleIcon);
  playerVideo.addEventListener('pause', updateToggleIcon);

  playerRestart.addEventListener('click', () => {
    playerVideo.currentTime = 0;
    playerVideo.play().catch(() => {});
  });

  playerClose.addEventListener('click', () => {
    playerVideo.pause();
    playerVideo.src = '';
    currentVideoSrc = null;
    showScreen(arScreen);
    scanGuidance.textContent = '🔍 Point camera at a coaster';
  });
}

function updateToggleIcon() {
  playerToggle.textContent = playerVideo.paused ? '▶' : '⏸';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU (collected videos)
// ═══════════════════════════════════════════════════════════════════════════════
function setupMenu() {
  menuBtn.addEventListener('click',   () => menuPanel.classList.add('open'));
  menuClose.addEventListener('click', () => menuPanel.classList.remove('open'));
}

function addToMenu(target) {
  menuEmpty.style.display = 'none';

  if (menuList.querySelector(`#menu-card-${target.index}`)) return;

  const card = document.createElement('div');
  card.classList.add('menu-card');
  card.id = `menu-card-${target.index}`;
  card.innerHTML = `
    <div class="menu-card-info">
      <h4>${target.emoji} ${target.title}</h4>
      <p>Tap to replay</p>
    </div>
    <button class="menu-card-play">▶</button>
  `;

  card.addEventListener('click', () => {
    menuPanel.classList.remove('open');
    openVideo(target);
  });

  menuList.appendChild(card);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════
function showScreen(screen) {
  [pinScreen, loadingScreen, arScreen, videoOverlay].forEach(s => {
    s.classList.remove('active');
  });
  screen.classList.add('active');
}
