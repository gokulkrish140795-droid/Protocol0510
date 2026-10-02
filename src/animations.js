/**
 * Holographic Materialization & Deployment Animations
 * Handles the visual "beam up" sequence when placing the ring on the floor.
 * Phase 2 additions: Beam Particle Rise (#8), Holographic Scanlines (#3).
 */

export function animateMaterialization(entityContainer, onComplete) {
  if (!entityContainer) return;

  const ring = entityContainer.querySelector('.ar-ring-model');
  const beam = entityContainer.querySelector('.hologram-beam');
  const videoPlane = entityContainer.querySelector('.video-screen');

  // Step 1: Base ring landing pulse
  if (ring) {
    ring.setAttribute('scale', '0.2 0.2 0.2');
    ring.setAttribute('animation__expand', {
      property: 'scale',
      to: '1 1 1',
      dur: 400,
      easing: 'easeOutBack'
    });
  }

  // Step 2: Vertical light beam shoots up
  if (beam) {
    beam.setAttribute('visible', 'true');
    beam.setAttribute('scale', '1 0.01 1');
    beam.setAttribute('material', 'opacity', 0);
    
    beam.setAttribute('animation__rise', {
      property: 'scale',
      to: '1 1 1',
      dur: 500,
      delay: 200,
      easing: 'easeOutCubic'
    });

    beam.setAttribute('animation__glow', {
      property: 'material.opacity',
      to: 0.45,
      dur: 400,
      delay: 200,
      easing: 'easeInOutSine'
    });
  }

  // Feature #8: Beam particles rise through cylinder
  setTimeout(() => spawnBeamParticles(entityContainer), 200);

  // Step 3: Video plane unfolds upward from center
  if (videoPlane) {
    videoPlane.setAttribute('visible', 'true');
    videoPlane.setAttribute('scale', '0.01 0.01 0.01');

    videoPlane.setAttribute('animation__unfold', {
      property: 'scale',
      to: '1 1 1',
      dur: 700,
      delay: 450,
      easing: 'easeOutElastic'
    });
  }

  // Feature #3: Holographic scanlines overlay on video plane
  if (videoPlane) {
    setTimeout(() => addScanlineOverlay(entityContainer), 500);
  }

    // Step 4: Beam fades to subtle ambient aura
  setTimeout(() => {
    if (beam) {
      beam.setAttribute('animation__settle', {
        property: 'material.opacity',
        to: 0.15,
        dur: 600,
        easing: 'easeOutQuad'
      });
    }
    // Guarantee video plane, beam and ring are fully visible and at 1 1 1 scale
    if (videoPlane) {
      videoPlane.setAttribute('visible', 'true');
      videoPlane.setAttribute('scale', '1 1 1');
    }
    if (beam) {
      beam.setAttribute('visible', 'true');
      beam.setAttribute('scale', '1 1 1');
    }
    if (ring) {
      ring.setAttribute('visible', 'true');
      ring.setAttribute('scale', '1 1 1');
    }
    if (onComplete) onComplete();
  }, 900);
}

/* --------------------------------------------------------------------------
   Feature #8: Beam Particle Rise
   10 small cyan spheres rise through the beam cylinder and fade out
   -------------------------------------------------------------------------- */
function spawnBeamParticles(container, count = 10) {
  const beamRadius = 0.4;
  const beamHeight = 1.6;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('a-sphere');
    particle.setAttribute('radius', '0.015');
    particle.setAttribute('material', 'color: #00e5ff; emissive: #00e5ff; emissiveIntensity: 1.0; transparent: true; opacity: 0.8');

    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * beamRadius * 0.7;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const startY = Math.random() * 0.3;

    particle.setAttribute('position', `${x.toFixed(3)} ${startY.toFixed(3)} ${z.toFixed(3)}`);

    const delay = 300 + i * 80;
    particle.setAttribute('animation__rise', {
      property: 'position',
      to: `${x.toFixed(3)} ${beamHeight} ${z.toFixed(3)}`,
      dur: 1200 + Math.random() * 400,
      delay: delay,
      easing: 'easeInQuad'
    });
    particle.setAttribute('animation__fade', {
      property: 'material.opacity',
      from: 0.8,
      to: 0,
      dur: 400,
      delay: delay + 1000,
      easing: 'easeOutQuad'
    });

    container.appendChild(particle);

    // Auto-cleanup after animation completes
    setTimeout(() => {
      if (particle.parentNode) particle.parentNode.removeChild(particle);
    }, delay + 1600);
  }
}

/* --------------------------------------------------------------------------
   Feature #3: Holographic Video Scanlines
   Canvas-generated horizontal scanline texture overlaid on the video plane
   -------------------------------------------------------------------------- */
function addScanlineOverlay(container) {
  const videoPlane = container.querySelector('.video-screen');
  const w = videoPlane ? parseFloat(videoPlane.getAttribute('width')) || 0.9 : 0.9;
  const h = videoPlane ? parseFloat(videoPlane.getAttribute('height')) || 1.6 : 1.6;

  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 128; y++) {
    ctx.fillStyle = (y % 4 < 2) ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0)';
    ctx.fillRect(0, y, 2, 1);
  }

  const scanPlane = document.createElement('a-plane');
  scanPlane.classList.add('scanline-overlay');
  scanPlane.setAttribute('width', (w * 1.01).toFixed(2));
  scanPlane.setAttribute('height', (h * 1.01).toFixed(2));
  scanPlane.setAttribute('position', '0 0.8 0.005');
  scanPlane.setAttribute('material', 'shader: flat; transparent: true; side: double');

  scanPlane.addEventListener('loaded', () => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 16);
    const mesh = scanPlane.getObject3D('mesh');
    if (mesh && mesh.material) {
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
    }
  });

  container.appendChild(scanPlane);
}
