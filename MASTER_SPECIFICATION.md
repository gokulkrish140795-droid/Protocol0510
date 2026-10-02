# AR Birthday Scavenger Hunt — Master Architectural Specification

> **Approved by:** The Director  
> **Lead Systems Architect & QA:** Gemini (Antigravity)  
> **Implementation Engineer:** Claude 4.6 Sonnet  
> **Last calibrated:** 2026-10-02 — 5-Target Final Architecture

---

## 1. Project Governance & Chain of Command

| Role | Entity | Responsibilities & Review Gates |
| :--- | :--- | :--- |
| **Director / Gatekeeper** | **The User** | Sole decision maker; holds final sign-off authority on every architecture plan, feature, and code diff. |
| **Lead Systems Architect & QA** | **Gemini (Antigravity)** | Blueprint author, constraint enforcement, and final QA verification. |
| **Implementation Engineer** | **Claude 4.6 Sonnet** | Produces implementation specs and executes clean code based on the approved blueprint. |

---

## 2. 5-Target Final Architecture

```
[ 1. CLEAN CAMERA VIEW ] ───► [ 2. ROOM SCANNING ]
                                      │
          ┌───────────────────────────┴──────────────────────────────────┐
          ▼ (Coasters Detected)                                          ▼ (Photo Frame Detected)
┌────────────────────────────────────────┐              ┌────────────────────────────────────────┐
│  SCAVENGER HUNT — COASTERS (0 & 1)     │              │  SILENT EASTER EGGS — FRAMES (2, 3, 4) │
│  - Proximity Radar & Sonar Active      │              │  - Zero radar / zero UI                │
│  - Pick & Place to Floor               │              │  - In-Frame 1:1 Planar Overlay          │
│  - LERP + Carry Hum + Reticle          │              │  - "Harry Potter" living portrait       │
│                                        │              │    plays flush inside physical frame    │
│  Target 0: Birthday Wishes (flat)      │              │  Target 2: Living Frame #1              │
│            → dummy.mp4 (→ montage.mp4) │              │  Target 3: Living Frame #2              │
│  Target 1: Uncle Memorial (CHROMA KEY) │              │  Target 4: Living Frame #3              │
│            → memorial.mp4              │              └────────────────────────────────────────┘
│            - Green Despill             │
│            - Holographic Rim Glow      │
└──────────────────┬─────────────────────┘
                   ▼ (BOTH coasters placed — frames never count)
┌──────────────────────────────────────┐
│  CELEBRATION OVERLAY & FANFARE       │
└──────────────────────────────────────┘
```

---

## 3. Target Roster

| Index | Type | Title | Video Asset | Shader | Notes |
|-------|------|-------|-------------|--------|-------|
| 0 | Coaster | Birthday Wishes | `dummy.mp4` → `montage.mp4`* | `flat` | *Swap src before final release |
| 1 | Coaster | Uncle Memorial | `memorial.mp4` | `chromakey` | Green despill + cyan/gold rim glow |
| 2 | Easter Egg | Living Frame #1 | `frame1_live.mp4` | `flat` | Silent loop, flush overlay |
| 3 | Easter Egg | Living Frame #2 | `frame2_live.mp4` | `flat` | Silent loop, flush overlay |
| 4 | Easter Egg | Living Frame #3 | `frame3_live.mp4` | `flat` | Silent loop, flush overlay |

---

## 4. Feature A: Green Screen Chroma Key Hologram (Target 1)

* **Shader Component:** `src/chromakey.js` (`shader: chromakey` via `AFRAME.registerShader`).
* **GLSL Shader Pipeline:**
  1. **Color Keying:** Distance from `#00FF00` → `smoothstep(threshold − smooth, threshold + smooth, dist)`.
  2. **Green Despill:** `color.g = min(color.g, max(color.r, color.b));` — eliminates edge halos.
  3. **Holographic Rim Glow:** Fresnel `rimFactor = 1 - dot(vNormal, vViewDir)`; mixes cyan/gold emission.
* **Result:** Uncle appears as a free-standing, edge-glowing hologram on the AR floor ring.

---

## 5. Feature B: Living Photo Frames (Targets 2–4)

* **Zero-Contamination Rules:** `isEasterEgg: true` gates every handler.
  * ❌ No radar vignette, sonar pings, "Pick Up" button, carry reticle, hum, memory card, or celebration count.
  * ✅ `targetFound` → `video.play()` (muted if a coaster is active); `targetLost` → `video.pause()`.
  * ✅ Flush `<a-video>` plane built dynamically at `position="0 0 0"` on first detection.

---

## 6. Asset Manifest

| # | File | Status |
|---|------|--------|
| 1 | `public/assets/dummy.mp4` | ✅ Present (Target 0 testing) |
| 2 | `public/assets/montage.mp4` | ⏳ Swap in on final release |
| 3 | `public/assets/memorial.mp4` | ✅ Present |
| 4 | `public/assets/frame1_live.mp4` | ✅ Present |
| 5 | `public/assets/frame2_live.mp4` | ✅ Present |
| 6 | `public/assets/frame3_live.mp4` | ✅ Present |
| 7 | `public/assets/targets.mind` | ✅ Present (must include all 5 markers, indices 0–4) |

---

## 7. iOS WebKit Rules (NEVER VIOLATE)

1. `playsinline webkit-playsinline` on ALL `<video>` elements.
2. `AudioContext` created/resumed ONLY inside a user-gesture handler.
3. `DeviceOrientationEvent.requestPermission()` called only from user gesture.
4. Use `-webkit-backdrop-filter` alongside `backdrop-filter`.
5. No `autoplay` — call `.play()` from code after user interaction.
6. Use `env(safe-area-inset-*)` for notch/home indicator padding.
7. HTTPS required — Vite basic-ssl handles this.
