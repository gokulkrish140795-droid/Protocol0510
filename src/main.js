/**
 * Protocol 0510 — v7
 *
 * Architecture: AR canvas is always the base layer (never hidden).
 * Overlays sit on top. MindAR can initialize at full dimensions immediately.
 *
 * Flow: PIN → Loading (AR starts here) → VF overlay reveals → Scan → Sparkles → Video
 */

const TARGETS = [
  { index: 0, videoId: 'video-memorial', title: 'Uncle Memorial',  emoji: '🕊️', collected: false },
  { index: 1, videoId: 'video-montage',  title: 'Birthday Wishes', emoji: '🎂', collected: false },
];

const CORRECT_PIN = '0510';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
let pinScreen, loadingScreen, vfOverlay, videoOverlay;
let pinBoxes, pinError;
let scanGuidance, sparkleContainer;
let menuBtn, menuPanel, menuClose, menuList, menuEmpty;
let playerVideo, playerToggle, playerRestart, playerClose, playerTitle;
let sceneEl;

function init() {
  pinScreen     = document.getElementById('pin-screen');
  loadingScreen = document.getElementById('loading-screen');
  vfOverlay     = document.getElementById('vf-overlay');
  videoOverlay  = document.getElementById('video-overlay');

  pinBoxes  = document.querySelectorAll('.pin-digit');
  pinError  = document.getElementById('pin-error');

  scanGuidance     = document.getElementById('scan-guidance');
  sparkleContainer = document.getElementById('sparkle-container');

  menuBtn   = document.getElementById('menu-btn');
  menuPanel = document.getElementById('menu-panel');
  menuClose = document.getElementById('menu-close');
  menuList  = document.getElementById('menu-list');
  menuEmpty = document.getElementById('menu-empty');

  playerVideo   = document.getElementById('player-video');
  playerToggle  = document.getElementById('player-toggle');
  playerRestart = document.getElementById('player-restart');
  playerClose   = document.getElementById('player-close');
  playerTitle   = document.getElementById('player-title');

  sceneEl = document.getElementById('ar-scene');

  setupPIN();
  setupPlayer();
  setupMenu();

  // Auto-focus first PIN box
  setTimeout(() => pinBoxes[0]?.focus(), 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ─── Helper: show / hide overlay ─────────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

// ═══════════════════════════════════════════════════════════════════════════════
// PIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function setupPIN() {
  pinBoxes.forEach((box, i) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && i < pinBoxes.length - 1) pinBoxes[i + 1].focus();

      const code = Array.from(pinBoxes).map(b => b.value).join('');
      if (code.length === 4) {
        code === CORRECT_PIN ? pinCorrect() : pinWrong();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) pinBoxes[i - 1].focus();
    });
  });
}

function pinCorrect() {
  pinBoxes.forEach(b => { b.classList.add('correct'); b.disabled = true; });
  pinError.classList.remove('show');
  setTimeout(() => {
    hide(pinScreen);
    show(loadingScreen);
    startAR(); // start AR while loading screen is showing
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

// ═══════════════════════════════════════════════════════════════════════════════
// AR START
// ═══════════════════════════════════════════════════════════════════════════════
async function startAR() {
  try {
    // iOS gyro permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch (_) {}
    }

    // Wait for A-Frame scene to finish bootstrapping
    if (!sceneEl.hasLoaded) {
      await new Promise(r => sceneEl.addEventListener('loaded', r, { once: true }));
    }

    const arSystem = sceneEl.systems['mindar-image-system'];
    if (!arSystem) throw new Error('MindAR system not found');

    const arReady = new Promise(res => {
      let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      sceneEl.addEventListener('arReady', ok, { once: true });
      setTimeout(ok, 10000); // fallback after 10s
    });

    arSystem.start();
    await arReady;

    // Force WebGL canvas transparent (call a few times to be sure)
    const makeTransparent = () => {
      if (sceneEl.renderer) sceneEl.renderer.setClearColor(0x000000, 0);
    };
    makeTransparent();
    setTimeout(makeTransparent, 200);
    setTimeout(makeTransparent, 600);

    // Show viewfinder, hide loading
    hide(loadingScreen);
    show(vfOverlay);

    setupTargets();

  } catch (err) {
    console.error('AR failed:', err);
    hide(loadingScreen);
    show(vfOverlay);
    scanGuidance.textContent = '⚠️ Camera blocked — allow camera access and reload.';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TARGET DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
function setupTargets() {
  TARGETS.forEach(t => {
    const el = document.querySelector(`#target-${t.index}`);
    if (!el) return;

    el.addEventListener('targetFound', () => {
      if (t.collected) {
        // Already collected — just show menu hint
        scanGuidance.textContent = `${t.emoji} Already collected! Open ☰ to replay.`;
        return;
      }
      scanGuidance.textContent = `✨ ${t.title} detected!`;
      playSparkles(() => {
        t.collected = true;
        addToMenu(t);
        openVideo(t);
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARKLES
// ═══════════════════════════════════════════════════════════════════════════════
function playSparkles(onDone) {
  sparkleContainer.classList.add('active');
  sparkleContainer.innerHTML = '';

  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;

  for (let i = 0; i < 32; i++) {
    const spark  = document.createElement('div');
    spark.classList.add('sparkle');

    const angle  = (Math.PI * 2 * i) / 32 + (Math.random() - 0.5) * 0.4;
    const dist   = 50 + Math.random() * 130;
    const dx     = Math.cos(angle) * dist;
    const dy     = Math.sin(angle) * dist;
    const size   = 4 + Math.random() * 5;

    spark.style.left  = `${cx}px`;
    spark.style.top   = `${cy}px`;
    spark.style.width = spark.style.height = `${size}px`;
    spark.style.setProperty('--dx', `${dx}px`);
    spark.style.setProperty('--dy', `${dy}px`);
    spark.style.animationDelay = `${Math.random() * 0.25}s`;

    sparkleContainer.appendChild(spark);
  }

  setTimeout(() => {
    sparkleContainer.classList.remove('active');
    sparkleContainer.innerHTML = '';
    if (onDone) onDone();
  }, 1500);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO PLAYER
// ═══════════════════════════════════════════════════════════════════════════════
function setupPlayer() {
  playerToggle.addEventListener('click', () => {
    playerVideo.paused ? playerVideo.play().catch(() => {}) : playerVideo.pause();
    updateIcon();
  });
  playerVideo.addEventListener('play',  updateIcon);
  playerVideo.addEventListener('pause', updateIcon);

  playerRestart.addEventListener('click', () => {
    playerVideo.currentTime = 0;
    playerVideo.play().catch(() => {});
  });

  playerClose.addEventListener('click', closeVideo);
}

function openVideo(target) {
  const src = document.getElementById(target.videoId);
  if (!src) return;

  playerVideo.src   = src.src;
  playerVideo.loop  = true;
  playerTitle.textContent = `${target.emoji} ${target.title}`;

  show(videoOverlay);

  playerVideo.currentTime = 0;
  playerVideo.muted = false;
  playerVideo.play().catch(() => {
    playerVideo.muted = true;
    playerVideo.play().catch(e => console.error('Video play failed:', e));
  });
  updateIcon();
}

function closeVideo() {
  playerVideo.pause();
  playerVideo.src = '';
  hide(videoOverlay);
  scanGuidance.textContent = '🔍 Point camera at a coaster';
}

function updateIcon() {
  playerToggle.textContent = playerVideo.paused ? '▶' : '⏸';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════════════════════════════════════════
function setupMenu() {
  menuBtn.addEventListener('click',   () => menuPanel.classList.add('open'));
  menuClose.addEventListener('click', () => menuPanel.classList.remove('open'));
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
    <button class="menu-card-play">▶</button>`;
  card.addEventListener('click', () => {
    menuPanel.classList.remove('open');
    openVideo(target);
  });
  menuList.appendChild(card);
}
