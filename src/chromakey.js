/**
 * Chroma Key Shader — A-Frame Custom Material
 * Phase 3, Feature A: Green Screen Hologram for Target 1 (Uncle Memorial)
 *
 * Pipeline (in order):
 *   1. Sample video texture
 *   2. Chroma key: distance from #00FF00 → compute alpha with smoothstep
 *   3. Green Despill: color.g = min(color.g, max(color.r, color.b))
 *   4. Fresnel Rim Glow: cyan/gold emission at silhouette edges
 *   5. Output: discard pixels where alpha < 0.05
 *
 * Usage in A-Frame:
 *   <a-video material="shader: chromakey; src: #video-memorial; colorThreshold: 0.4; smoothness: 0.08; rimStrength: 0.35">
 */

AFRAME.registerShader('chromakey', {
  schema: {
    src:            { type: 'map',   is: 'uniform' },
    keyColor:       { type: 'color', is: 'uniform', default: '#00FF00' },
    colorThreshold: { type: 'float', is: 'uniform', default: 0.4 },
    smoothness:     { type: 'float', is: 'uniform', default: 0.08 },
    rimStrength:    { type: 'float', is: 'uniform', default: 0.35 },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vUv       = uv;
      vNormal   = normalize(normalMatrix * normal);
      // View direction in eye space: camera is at origin, so viewDir = -position
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir  = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `,

  fragmentShader: /* glsl */`
    uniform sampler2D src;
    uniform vec3  keyColor;
    uniform float colorThreshold;
    uniform float smoothness;
    uniform float rimStrength;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      // 1. Sample video texture
      vec4 texColor = texture2D(src, vUv);
      vec3 color    = texColor.rgb;

      // 2. Chroma key — distance from key color in RGB space
      float dist  = distance(color, keyColor);
      float alpha = smoothstep(
        colorThreshold - smoothness,
        colorThreshold + smoothness,
        dist
      );

      // Discard near-transparent pixels early (saves fill-rate on iOS)
      if (alpha < 0.05) discard;

      // 3. Green Despill — kills residual green halo on edges
      color.g = min(color.g, max(color.r, color.b));

      // 4. Fresnel Rim Glow
      //    rimFactor → 0 at face-on, 1 at grazing edges
      float rimFactor = 1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0);
      rimFactor = pow(rimFactor, 2.5);  // sharpen rim band

      // Alternate cyan (#00e5ff) / gold (#ffcc44) — split by UV.y for variety
      vec3 cyanColor = vec3(0.0,  0.898, 1.0);
      vec3 goldColor = vec3(1.0,  0.8,   0.267);
      vec3 rimColor  = mix(cyanColor, goldColor, step(0.5, vUv.y));

      vec3 rimEmission = rimColor * rimFactor * rimStrength;

      // 5. Final composite
      gl_FragColor = vec4(color + rimEmission, alpha);
    }
  `,

  init: function (data) {
    AFRAME.Shader.prototype.init.call(this, data);
    this.material.transparent = true;
    this.material.side = THREE.DoubleSide;
    this.material.depthWrite = false;
  },

  /**
   * update — called whenever schema properties change.
   * Keeps uniforms in sync and ensures video texture is bound.
   */
  update: function (data) {
    AFRAME.Shader.prototype.update.call(this, data);
    if (!this.material || !this.material.uniforms) return;

    if (data.src) {
      let videoEl = null;
      if (typeof data.src === 'string') {
        videoEl = document.querySelector(data.src);
      } else if (data.src instanceof HTMLVideoElement) {
        videoEl = data.src;
      }
      if (videoEl && (!this.material.uniforms.src.value || !(this.material.uniforms.src.value instanceof THREE.Texture))) {
        const tex = new THREE.VideoTexture(videoEl);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.format = THREE.RGBAFormat;
        this.material.uniforms.src.value = tex;
      }
    }

    if (data.keyColor && this.material.uniforms.keyColor) {
      this.material.uniforms.keyColor.value.set(data.keyColor);
    }
    if (data.colorThreshold !== undefined && this.material.uniforms.colorThreshold) {
      this.material.uniforms.colorThreshold.value = data.colorThreshold;
    }
    if (data.smoothness !== undefined && this.material.uniforms.smoothness) {
      this.material.uniforms.smoothness.value = data.smoothness;
    }
    if (data.rimStrength !== undefined && this.material.uniforms.rimStrength) {
      this.material.uniforms.rimStrength.value = data.rimStrength;
    }
  },
});
