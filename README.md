# 🎂 Protocol 0510 — Birthday AR Experience

A luxury dark navy & gold WebAR scavenger hunt and memory collection experience built with **MindAR**, **A-Frame**, and **Vite**.

---

## ✨ Experience Flow

1. **Mission Complete & PIN Authentication (`0510`)**:
   - Deep navy background with an ornate gold-bordered frame and Playfair Display serif typography.
   - Narrative: *"The stray heart has been found. A special visitor from heaven is awaiting your arrival. Enter the code to enter."*
   - Enter **0510** $\to$ boxes glow emerald green $\to$ advances automatically.
2. **Protocol Initiation**:
   - Loading sequence with golden spinner: *"Initiating Protocol 0510... Preparing your experience"*.
   - Seamlessly spins up MindAR camera tracking in the background.
3. **AR Viewfinder**:
   - Live camera viewfinder decorated with a custom golden rail border and corner brackets.
   - Bottom status guidance HUD and a top-right slide-out Menu button (`☰`).
4. **Scan & Golden Sparkle Particle Burst**:
   - Point the camera at a coaster target.
   - Upon detection, 32 golden sparkle particles burst outward from the screen center.
5. **Fullscreen Video Player**:
   - Video transitions smoothly onto the phone screen with an elegant gold border.
   - Complete on-screen playback controls: **Restart (⟲)**, **Play/Pause (⏸/▶)**, and **Close (✕)**.
   - Video continues playing smoothly even if the user moves their camera away from the physical coaster.
6. **Collected Memories Menu (`☰`)**:
   - Closing a video archives it into the slide-out Memories panel.
   - Each unlocked card can be replayed on demand at any time.

---

## 🎯 Coaster Targets

| Target Index | Physical Marker | Video Asset | Title |
| :--- | :--- | :--- | :--- |
| **0** | `marker1.jpg` | `memorial.mp4` | 🕊️ Uncle Memorial |
| **1** | `marker0.jpg` | `dummy.mp4` *(swap to `montage.mp4`)* | 🎂 Birthday Wishes |

---

## 🚀 Running the App Locally

1. Start the local HTTPS development server:
   ```bash
   npm run dev
   ```

2. Open the network URL printed by Vite on the target mobile device (e.g., `https://192.168.1.X:5173/`).
   *(Accept self-signed certificate warnings if prompted on local Wi-Fi).*

3. Enter PIN **`0510`** to begin!

---

## 🎬 Final Production Swap

When ready for the final birthday event:
In `index.html` (under `<a-assets>`), update the birthday video source:
```html
<!-- Switch src from ./assets/dummy.mp4 to ./assets/montage.mp4 -->
<video id="video-montage" src="./assets/montage.mp4" ...></video>
```
All assets are optimized (FastStart H.264) for instant, low-latency mobile playback.
