# Protocol 0510 — Comprehensive Issues, Root Causes & Status Registry

> **Purpose:** Centralized register of all reported issues, architectural root causes, and current resolution status. Updated per user instruction for token conservation and transparency.

---

## 1. Active Issues Under Immediate Resolution

### Issue 1.1: Dummy Video Audio Plays Right From App Start (No Scanning)
* **User Symptom:** "and the dummy video's audio played right from start without even scanning"
* **Exact Root Cause:**
  In [`src/main.js`](./src/main.js) (lines 306–316), a helper function intended to un-pause the WebRTC mobile camera stream executed:
  ```javascript
  const videoEl = document.querySelector('#ar-container video') || document.querySelector('video[autoplay]');
  if (videoEl) videoEl.play();
  ```
  Because `<a-scene>` is inside `#ar-container`, the DOM query `document.querySelector('#ar-container video')` selects the **first `<video>` element inside `<a-assets>`**, which is `<video id="video-montage" src="./assets/dummy.mp4">`! 
  Therefore, the moment the user clicked "Start Scavenger Hunt", `dummy.mp4` was immediately started with audio unmuted in the background before any marker was scanned.
* **Resolution Plan:**
  Remove `#ar-container video` selector. Only target the actual MindAR camera stream video element (`document.querySelector('.mindar-ui-overlay ~ video')` or `sceneEl.querySelector('video')` filtered by class/device stream, never `<a-assets>`).

---

### Issue 1.2: Dummy Video Collected Ring Doesn't Play When Placed on Floor
* **User Symptom:** "The dummy's collected ring didn't played when i tapped and placed the video."
* **Exact Root Causes:**
  1. **Missing `src` on Material:** In [`src/main.js`](./src/main.js) (lines 517–519), `createHologram3DStructure` created `<a-video>` and then executed:
     ```javascript
     videoPlane.setAttribute('material', 'shader: flat; side: double');
     ```
     Overwriting `material` without specifying `src: #${target.videoId}` stripped the video texture from the plane, rendering a blank/invisible material!
  2. **`vid.load()` Resetting Media Pipeline:** In `pickUpMemory` (line 582), calling `vid.load()` synchronously reset `dummy.mp4` to `readyState 0 (HAVE_NOTHING)`, causing subsequent `.play()` calls on floor placement to abort or fail.
* **Resolution Plan:**
  1. Fix material assignment: `videoPlane.setAttribute('material', 'shader: flat; side: double; src: #' + target.videoId)`.
  2. Remove disruptive `vid.load()` during pickup.

---

### Issue 1.3: Uncle Memorial Coaster Not Scanning / No Ring Appearing
* **User Symptom:** "still uncle memorial not scanned at all not even ring came up"
* **Exact Root Causes:**
  1. **Target Index / Marker Alignment:** In `targets.mind`, verify whether Target Index 0 corresponds to `marker1.jpg` (Uncle Memorial) or `marker0.jpg` (Birthday Wishes).
  2. **MindAR Feature Detection:** `marker1.jpg` feature tracking density and lighting contrast needs verification against the compiled `targets.mind` file.
  3. **Event Listener Registration:** Ensure `target-0` in `index.html` matches `targetIndex: 0` in `main.js`.
* **Resolution Plan:**
  Inspect exact target metadata inside `targets.mind` using binary parser script, align `targetIndex` in `index.html` and `main.js`, and test feature points.

---

## 2. Previously Identified & Addressed Issues

### Issue 2.1: Background Glitch / Harsh Audio Loop
* **User Symptom:** Constant harsh electronic buzz / glitch looping through mobile phone speakers.
* **Root Causes:**
  - `startAmbientDrone` in `src/audio.js` ran an 80Hz sawtooth wave oscillator continuously.
  - `startCarryingHum` ran a 220Hz oscillator.
  - `playRadarPing` fired rapid oscillator beeps.
  - Coupled with Issue 1.1 where `dummy.mp4` audio was playing in the background from startup.
* **Status:** Procedural background oscillators disabled. Only clean event sound effects remain.

---

### Issue 2.2: Living Photo Frames Shaking & Stuttering
* **User Symptom:** Video planes vibrating rapidly on camera and stuttering/pausing constantly.
* **Root Causes:**
  - Raw 4K 60fps video files (565MB total) overwhelmed mobile WebGL texture bandwidth.
  - Lack of 1-Euro tracking filter in MindAR `<a-scene>`.
  - Immediate `targetLost` handler paused playback on 1-frame tracking drops.
* **Status:**
  - Converted all 4K videos to 1080p 30fps FastStart (size dropped by 82% to ~100MB).
  - Configured `filterMinCF: 0.001; filterBeta: 10; missTolerance: 8;` on `mindar-image`.
  - Added 1.5s debounce on `targetLost` to stop micro-pausing.

---

### Issue 2.3: Living Photo Frame Aspect Ratio Mismatch
* **User Symptom:** Video plane hovering weirdly outside physical wooden picture frame.
* **Root Cause:**
  - River Frame (`marker3.jpg` is 3000x4000, ratio 1.333; `frame2_live.mp4` is 1080x1440, ratio 1.333). Code previously forced `h: 1.435` (stretched 8% too tall).
  - Wedding Frame (`marker2.jpg` is 3198x3699, ratio 1.157). Code previously forced `h: 1.409` (stretched 22% too tall).
* **Status:** Calibrated `aspectRatio` in `TARGETS` to exact marker ratios (1.333 and 1.157) and set flush depth `z: 0.002`.

---

### Issue 2.4: Uncle Memorial Hologram Invisibility on Floor Placement
* **User Symptom:** Uncle memorial video did not appear as a hologram beaming up from dropped ring.
* **Root Causes:**
  - `memorial.mp4` was 142MB (4K 60fps) with `moov` at file end; phone stalled buffering.
  - `src/chromakey.js` did not bind `THREE.VideoTexture` to WebGL `uniforms.src.value`.
  - Experimental scanline overlay mesh sat directly in front of the video plane.
* **Status:** Video optimized to 12.3MB FastStart; `chromakey.js` updated with Three.js VideoTexture binding; scanline mesh removed.

---

### Issue 2.5: Tap-to-Drop Floor Placement
* **User Symptom:** Pointing at floor did not place hologram.
* **Root Cause:** Click listener was only bound to small `#main-action-btn` at bottom of screen. Tapping floor or camera view was ignored.
* **Status:** Added viewport-wide touch listener so tapping anywhere on screen triggers floor placement.

---

### Issue 2.6: Ring Overwrite / Disappearance on Second Pick
* **User Symptom:** Second ring replaced first ring or caused double collection.
* **Root Cause:** Both holograms shared identical floor coordinates `(0, -0.4, -1.3)` and lacked duplicate placement guard.
* **Status:** Separate slots assigned (`x: -0.45` for Uncle, `x: +0.45` for Birthday Wishes) with `target.placed` guard.
