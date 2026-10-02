# Protocol0510 — Implementation Plan

> **Author:** Gemini Antigravity (Lead Systems Architect)
> **Audience:** Claude 4.6 Sonnet (Implementation Engineer)
> **Approved by:** The Director

---

## Chain of Command — READ THIS FIRST

1. **The Director** is the sole decision maker. All changes require Director approval.
2. **Gemini Antigravity (Architect)** writes specs, reviews code, and gates approvals.
3. **Claude Sonnet (Engineer)** implements code per spec. MUST pause after each phase and wait for approval.
4. **Do NOT freelance.** Flag deviations — never fix silently.

---

## Target Environment

- **Device:** iPhone 14 running Chrome (iOS WebKit engine)
- **Stack:** Vanilla JavaScript (ES modules), Vite 5.4+ (`@vitejs/plugin-basic-ssl`), MindAR 1.2.5, A-Frame 1.5.0, Web Audio API
- **No external dependencies.** Zero npm packages beyond Vite + basic-ssl. Zero CDN libs beyond A-Frame + MindAR.
- **Zero `.mp3` files.** All audio is procedural Web Audio synthesis.

---

## 5-Target Final Architecture (v2 — calibrated 2026-10-02)

### System Overview

```
TARGETS array (index → type):

  [0] Coaster #1  — Birthday Wishes    → dummy.mp4 (→ montage.mp4 on release)   flat
  [1] Coaster #2  — Uncle Memorial     → memorial.mp4                            CHROMA KEY HOLOGRAM
  ──────────────────────────────────────────────────────────────────────────────────────────────────
  [2] Frame #1    — Living Photo Frame → frame1_live.mp4   isEasterEgg: true
  [3] Frame #2    — Living Photo Frame → frame2_live.mp4   isEasterEgg: true
  [4] Frame #3    — Living Photo Frame → frame3_live.mp4   isEasterEgg: true
```

### Scalability Rule — CRITICAL

> **The TARGETS array is the single source of truth.**
> - Coaster count: `TARGETS.filter(t => !t.isEasterEgg).length` — **never hardcode `2`.**
> - Easter egg count: `TARGETS.filter(t => t.isEasterEgg).length` — **never hardcode `3`.**
> - Celebration triggers when: `COASTER_TARGETS.every(t => t.placed === true)` — frames NEVER counted.

---

## TARGETS Array Contract (`src/main.js`)

```js
const TARGETS = [
  // ── COASTERS (Scavenger Hunt) ──────────────────────────────────────────
  {
    index:       0,
    title:       'Birthday Wishes',
    // TESTING CONTRACT: src = dummy.mp4. SWAP → montage.mp4 before final release.
    videoId:     'video-montage',
    emoji:       '🎂',
    shader:      'flat',
    isEasterEgg: false,
    discovered:  false,
    placed:      false,
  },
  {
    index:       1,
    title:       'Uncle Memorial',
    videoId:     'video-memorial',
    emoji:       '🕊️',
    shader:      'chromakey',     // src/chromakey.js — green despill + rim glow
    isEasterEgg: false,
    discovered:  false,
    placed:      false,
  },
  // ── LIVING PHOTO FRAMES (Silent Easter Eggs) ───────────────────────────
  {
    index:       2,
    title:       'Living Frame 1',
    videoId:     'video-frame1',
    isEasterEgg: true,
    aspectRatio: null,            // default: w=1.2 h=1.6 (portrait 4×6)
  },
  {
    index:       3,
    title:       'Living Frame 2',
    videoId:     'video-frame2',
    isEasterEgg: true,
    aspectRatio: null,
  },
  {
    index:       4,
    title:       'Living Frame 3',
    videoId:     'video-frame3',
    isEasterEgg: true,
    aspectRatio: null,
  },
];

const COASTER_TARGETS    = TARGETS.filter(t => !t.isEasterEgg); // 2 coasters
const EASTER_EGG_TARGETS = TARGETS.filter(t =>  t.isEasterEgg); // 3 frames
```


---

## The 8-Step User Journey (NON-NEGOTIABLE CORE)

1. **Blind Scan:** Camera opens as 100% CLEAN viewfinder. No edge glows. No ambient pulse. Pure camera.
2. **First Discovery:** Camera finds coaster → edge vignette + sonar pings activate ONLY in proximity (Z-depth 2.5m→0.5m) → lock-on chime → cyan AR ring blooms.
3. **Pick & Place:** User taps "Pick Up" → ring LERPs to camera HUD (1.4m in front). User walks with floor reticle visible. Taps "Drop on Floor".
4. **Hologram Activation:** Ring lands → beam shoots up with rising particles → video plane unfolds with scanlines + shimmer SFX.
5. **Media Playback:** Video streams inline (`playsinline webkit-playsinline`). No iOS fullscreen hijack.
6. **Menu System:** Hamburger (☰) button top-right opens slide-in menu with SFX toggle, Saved Progress, and Restart.
7. **Manual Restoration:** From Saved Progress, tapping "Re-place" re-parents hologram back to camera (back to Step 3).
8. **Completion:** Both coasters discovered & placed → celebration overlay + fanfare + restart button.

> ⚠️ **Easter Egg targets (`isEasterEgg: true`) are entirely parallel — they NEVER enter the 8-step state machine.**

---

## State Machine

```
UNINITIALIZED ──"Start AR"──▶ SCANNING ──targetFound (coaster)──▶ TARGET_FOUND
                                  ▲                                      │
                                  │                               "Pick Up"
                              "Search Next"                              │
                                  │                                      ▼
                              PLACED ◀──"Drop on Floor"────────── CARRYING
                                  │
                     (all 3 coasters placed)
                                  │
                                  ▼
                             CELEBRATION ──"Restart"──▶ UNINITIALIZED

─────────────────────────────────────────────────────────────────────────────
  EASTER EGG PARALLEL TRACK (Targets 3–6, entirely decoupled):
  SCANNING ──targetFound──▶ frameVideo.play()
           ◀──targetLost──── frameVideo.pause()
─────────────────────────────────────────────────────────────────────────────
```

### State → UI Mapping

| State | Main Button | Guidance Text | Vignette | Menu | Reticle | Carry Hum |
|-------|------------|---------------|----------|------|---------|-----------| 
| UNINITIALIZED | "✨ Start Scavenger Hunt" | "Tap below to start..." | Hidden | Available | Hidden | Off |
| SCANNING | "Scanning..." (secondary) | "🔍 Scan your room..." | NONE | Available | Hidden | Off |
| TARGET_FOUND | "⚡ Pick Up Memory" | "✨ Discovered: {title}!" | Lock flash | Available | Hidden | Off |
| CARRYING | "📍 Drop on Floor" | "🚶 Move & aim at floor..." | Hidden | Available | Visible + pulsing | On |
| PLACED | "🔍 Search for Next" (secondary) | "🎉 Memory activated!" | Hidden | Available | Hidden | Off |
| CELEBRATION | N/A (overlay) | N/A | Hidden | Hidden | Hidden | Off |

---

## Phase 1 — Core Architecture: Menu System + Clean Camera

### Priority: 🔴 IMPLEMENT FIRST
### Files: `index.html`, `src/style.css`, `src/main.js`, `src/radar.js`

### Acceptance Criteria

- [ ] Camera opens with ZERO edge glow — pure clean viewfinder
- [ ] No target count hardcoded anywhere
- [ ] ☰ hamburger button visible top-right
- [ ] Menu: SFX toggle on, "No memories discovered yet", no Restart initially
- [ ] After first coaster discovery: memory card in Saved Progress, Restart visible
- [ ] Re-place from menu re-parents hologram to camera
- [ ] After all 3 coasters placed: celebration overlay fires
- [ ] Easter egg targets trigger zero coaster UI
- [ ] Restart clears all state, cards, 3D entities

---

## Phase 2 — Polish Features

### Priority: 🟡 IMPLEMENT AFTER PHASE 1 IS VERIFIED

| Order | Feature | Files | Risk |
|-------|---------|-------|------|
| 1 | Floor placement reticle | `main.js` | 🟢 Low |
| 2 | Carrying hum | `audio.js`, `main.js` | 🟢 Low |
| 3 | Ambient room drone | `audio.js`, `main.js` | 🟢 Low |
| 4 | Beam particle rise | `animations.js` | 🟢 Low |
| 5 | Holographic scanlines | `animations.js` | 🟢 Low |
| 6 | Pickup/Drop LERP | `main.js` | 🟡 Medium |

### Acceptance Criteria

- [ ] While carrying: floor reticle (cyan pulsing ring) visible
- [ ] While carrying: 220Hz triangle hum audible (stops on drop)
- [ ] After 1st placement: ambient drone fades in; after 3rd: third harmonic layer
- [ ] During beam-up: 10 cyan particles rise and fade
- [ ] Video plane has subtle horizontal scanlines overlay
- [ ] Pick up / Drop: smooth ~400ms LERP (easeOutBack)
- [ ] Celebration/Restart: all audio stops, particles cleaned up
- [ ] No regressions

---

## Phase 3 — Feature A: Chroma Key Hologram (Target 1)

### Priority: 🟠 IMPLEMENT AFTER PHASE 2 IS VERIFIED
### Files: CREATE `src/chromakey.js`; MODIFY `src/main.js`

#### GLSL Fragment Shader Pipeline

| Step | Operation |
|------|-----------|
| 1 | `vec4 color = texture2D(map, vUv);` — sample video texture |
| 2 | Compute RGB distance from `#00FF00`; `alpha = 1.0 - smoothstep(threshold - smooth, threshold + smooth, dist)` |
| 3 | **Green Despill:** `color.g = min(color.g, max(color.r, color.b));` |
| 4 | **Fresnel Rim Glow:** `rimFactor = 1.0 - dot(normalize(vNormal), normalize(vViewDir))`; mix cyan/gold emission at edges |
| 5 | `gl_FragColor = vec4(color.rgb + rimEmission, alpha);` — discard if `alpha < 0.05` |

#### Shader Uniforms

| Uniform | Type | Default | Purpose |
|---------|------|---------|---------|
| `src` | map | — | Video texture |
| `keyColor` | color | `#00FF00` | Chroma key target |
| `colorThreshold` | float | `0.4` | Key sensitivity |
| `smoothness` | float | `0.08` | Edge anti-alias |
| `rimStrength` | float | `0.35` | Fresnel glow intensity |

#### Acceptance Criteria

- [ ] Green pixels fully transparent; silhouette clean
- [ ] Zero green fringing (despill active)
- [ ] Cyan/gold rim glow visible at silhouette edges
- [ ] No shader errors in console
- [ ] Coaster pick/place flow unaffected

---

## Phase 4 — Feature B: Living Photo Frames (Targets 3–6)

### Priority: 🟠 IMPLEMENT AFTER PHASE 3 IS VERIFIED
### Files: MODIFY `index.html`, `src/main.js`

#### Zero-Contamination Rules (MUST NOT trigger for `isEasterEgg: true`):

| Coaster Feature | Easter Egg Behaviour |
|-----------------|---------------------|
| Radar vignette | ❌ None |
| Sonar audio pings | ❌ None |
| "Pick Up" button | ❌ None |
| "Drop on Floor" mechanic | ❌ None |
| Carry reticle | ❌ None |
| Carry hum audio | ❌ None |
| Memory card in menu | ❌ None |
| Counted in celebration trigger | ❌ Never |
| Beam animation | ❌ None |
| Scanlines overlay | ❌ None |

#### `targetFound` / `targetLost` Handler Logic

```js
// In targetFound handler:
if (target.isEasterEgg) {
  const vid = document.getElementById(target.videoId);
  const coasterActive = TARGETS
    .filter(t => !t.isEasterEgg)
    .some(t => t.videoElement && !t.videoElement.paused);
  vid.muted = coasterActive;   // audio guard
  vid.play();
  return;                      // ← bail out; zero coaster logic runs
}
// ... coaster logic continues below

// In targetLost handler:
if (target.isEasterEgg) {
  document.getElementById(target.videoId).pause();
  return;
}
```

#### `<a-video>` Sizing for Each Frame

Default fallback (portrait 3:4): `width="1.2" height="1.6"`
Director must confirm physical frame aspect ratios — see Resources table below.

#### `index.html` Additions Required

```html
<!-- In <a-assets> -->
<video id="video-coaster3"  src="/assets/coaster3.mp4"     playsinline webkit-playsinline loop></video>
<video id="video-frame1"    src="/assets/frame1_live.mp4"  playsinline webkit-playsinline loop></video>
<video id="video-frame2"    src="/assets/frame2_live.mp4"  playsinline webkit-playsinline loop></video>
<video id="video-frame3"    src="/assets/frame3_live.mp4"  playsinline webkit-playsinline loop></video>
<video id="video-frame4"    src="/assets/frame4_live.mp4"  playsinline webkit-playsinline loop></video>

<!-- In <a-scene> -->
<a-entity id="target-2" mindar-image-target="targetIndex: 2"> ... </a-entity>
<a-entity id="target-3" mindar-image-target="targetIndex: 3"> ... </a-entity>
<a-entity id="target-4" mindar-image-target="targetIndex: 4"> ... </a-entity>
<a-entity id="target-5" mindar-image-target="targetIndex: 5"> ... </a-entity>
<a-entity id="target-6" mindar-image-target="targetIndex: 6"> ... </a-entity>
```

#### Acceptance Criteria

- [ ] All 4 frames detected → respective video plays flush inside frame
- [ ] Camera away → video pauses
- [ ] Zero coaster UI appears for any frame target
- [ ] Frame targets NOT counted in celebration trigger
- [ ] Audio guard: frame video muted when any coaster video is active
- [ ] `targets.mind` compiled with all 7 targets (indices 0–6)

---

## iOS WebKit Rules (NEVER VIOLATE)

1. `playsinline webkit-playsinline` on ALL `<video>` elements
2. `AudioContext` created/resumed ONLY inside a user-gesture handler
3. `DeviceOrientationEvent.requestPermission()` called only from user gesture
4. Use `-webkit-backdrop-filter` alongside `backdrop-filter`
5. No `autoplay` — call `.play()` from code after user interaction
6. Use `env(safe-area-inset-*)` for notch/home indicator padding
7. HTTPS required — Vite basic-ssl handles this

---

## 📋 Asset Manifest (5-Target Calibration — v2)

> All Phase 3 & 4 assets are now present. `dummy.mp4` is the testing stand-in for Target 0.

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `public/assets/dummy.mp4` | ✅ Present | Target 0 testing stand-in |
| 2 | `public/assets/montage.mp4` | ⏳ Swap on release | Change `#video-montage` src in `index.html` |
| 3 | `public/assets/memorial.mp4` | ✅ Present | Must be pure `#00FF00` green screen |
| 4 | `public/assets/frame1_live.mp4` | ✅ Present | Target 2 Easter Egg |
| 5 | `public/assets/frame2_live.mp4` | ✅ Present | Target 3 Easter Egg |
| 6 | `public/assets/frame3_live.mp4` | ✅ Present | Target 4 Easter Egg |
| 7 | `public/assets/targets.mind` | ✅ Present | Must include all 5 markers (indices 0–4). Recompile via https://hiukim.github.io/mind-ar-js-doc/tools/compile if adding markers. |
| 8 | **Frame aspect ratios (×3)** | ⏳ Director to confirm | Used to set `<a-video>` w/h. Default: 1.2 × 1.6 (portrait 4×6). |
