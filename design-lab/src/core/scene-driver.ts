import type * as Three from 'three';

export type StageVariant = 'velocity' | 'obsidian' | 'sonic';
export type StageMotion = 'running' | 'paused' | 'reduced';
export type StageController = { pulse: () => void; refresh?: () => void; dispose: () => void };

type StageOptions = {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  context: WebGL2RenderingContext;
  variant: StageVariant;
  signal: AbortSignal;
  getIntensity: () => number;
  onReady: () => void;
  onMotion: (motion: StageMotion) => void;
  onFallback: () => void;
};

type ThreeModule = typeof import('three');
type Ring = {
  mesh: Three.Mesh;
  material: Three.MeshBasicMaterial;
  opacity: number;
  phase: number;
};

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Soft intersecting light shafts sit behind the object, with no postprocessing.
const lightFragment = `
uniform float uTime;
uniform float uPulse;
uniform float uStrength;
uniform float uMode;
varying vec2 vUv;
float shaft(vec2 uv, float origin, float lean, float width) {
  float x = uv.x - origin - (1.0 - uv.y) * lean;
  float spread = width + (1.0 - uv.y) * 0.115;
  return exp(-x*x/(spread*spread)) * smoothstep(0.0, 0.35, uv.y);
}
void main() {
  vec2 uv = vUv;
  float edge = smoothstep(0.0, 0.16, uv.y) * (1.0-smoothstep(0.83, 1.0, uv.y));
  float sway = sin(uTime * 0.16) * 0.018;
  float whiteBeam = shaft(uv, 0.38+sway, -0.37, 0.016);
  float redBeam = shaft(uv, 0.77-sway, 0.30, 0.025);
  float gallery = 1.0-step(0.5, abs(uMode-1.0));
  float fine = 0.94 + 0.06 * sin(uv.y*51.0-uTime*0.3);
  vec3 white = vec3(0.69, 0.76, 0.87) * whiteBeam * (0.13+gallery*0.09);
  vec3 red = vec3(1.0, 0.025, 0.07) * redBeam * (0.15-gallery*0.08);
  float density = (whiteBeam+redBeam) * edge;
  gl_FragColor = vec4((white+red) * fine, density * edge * uStrength * (0.21+uPulse*0.12));
  #include <colorspace_fragment>
}`;

const floorFragment = `
uniform vec3 uColor;
uniform float uPulse;
varying vec2 vUv;
void main() {
  float radius = length((vUv-0.5)*2.0);
  float glow = exp(-radius*radius*5.5) * (1.0-smoothstep(0.65, 1.0, radius));
  gl_FragColor = vec4(uColor, glow*(0.18+uPulse*0.12));
  #include <colorspace_fragment>
}`;

/** Merge collinear pixel edges; every wall follows the original image alpha. */
function silhouetteSides(T: ThreeModule, image: HTMLImageElement, width: number, height: number, depth: number) {
  const mask = document.createElement('canvas');
  mask.width = image.naturalWidth;
  mask.height = image.naturalHeight;
  const context = mask.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Logo contour unavailable');
  context.drawImage(image, 0, 0);
  const w = mask.width;
  const h = mask.height;
  const pixels = context.getImageData(0, 0, w, h).data;
  const vertices: number[] = [];
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pixels[(y * w + x) * 4 + 3] >= 128;
  const point = (x: number, y: number, z: number) => [(x / w - 0.5) * width, (0.5 - y / h) * height, z];
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const a = point(x1, y1, 0);
    const b = point(x2, y2, 0);
    const c = point(x2, y2, -depth);
    const d = point(x1, y1, -depth);
    vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  for (let y = 0; y < h; y += 1) {
    let top = -1;
    let bottom = -1;
    for (let x = 0; x <= w; x += 1) {
      const isTop = x < w && opaque(x, y) && !opaque(x, y - 1);
      const isBottom = x < w && opaque(x, y) && !opaque(x, y + 1);
      if (isTop && top < 0) top = x;
      if (!isTop && top >= 0) { edge(top, y, x, y); top = -1; }
      if (isBottom && bottom < 0) bottom = x;
      if (!isBottom && bottom >= 0) { edge(x, y + 1, bottom, y + 1); bottom = -1; }
    }
  }
  for (let x = 0; x < w; x += 1) {
    let left = -1;
    let right = -1;
    for (let y = 0; y <= h; y += 1) {
      const isLeft = y < h && opaque(x, y) && !opaque(x - 1, y);
      const isRight = y < h && opaque(x, y) && !opaque(x + 1, y);
      if (isLeft && left < 0) left = y;
      if (!isLeft && left >= 0) { edge(x, y, x, left); left = -1; }
      if (isRight && right < 0) right = y;
      if (!isRight && right >= 0) { edge(x + 1, right, x + 1, y); right = -1; }
    }
  }
  const result = new T.BufferGeometry();
  result.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  result.computeVertexNormals();
  result.computeBoundingSphere();
  return result;
}

function loadOriginal(signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    function finish(error?: Error) {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve(image);
    }
    function aborted() {
      finish(new Error('Stage disposed'));
      image.src = '';
    }
    if (signal.aborted) { reject(new Error('Stage disposed')); return; }
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Original mark unavailable'));
    signal.addEventListener('abort', aborted, { once: true });
    image.src = '/assets/usd-original.png';
  });
}

export function createStage(options: StageOptions): StageController {
  const { host, canvas, variant, signal } = options;
  const geometries = new Set<Three.BufferGeometry>();
  const materials = new Set<Three.Material>();
  const textures = new Set<Three.Texture>();
  const removeListeners: Array<() => void> = [];
  const loading = new AbortController();
  let renderer: Three.WebGLRenderer | undefined;
  let scene: Three.Scene | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let intersectionObserver: IntersectionObserver | undefined;
  let disposed = false;
  let ready = false;
  let frame = 0;
  let elapsed = 0;
  let lastDraw = 0;
  let pulseAt = -100;
  let visible = true;
  let motion: StageMotion = 'paused';
  const geometry = <G extends Three.BufferGeometry>(value: G): G => { geometries.add(value); return value; };
  const material = <M extends Three.Material>(value: M): M => { materials.add(value); return value; };

  function dispose() {
    if (disposed) return;
    disposed = true;
    loading.abort();
    cancelAnimationFrame(frame);
    frame = 0;
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    for (const remove of removeListeners) remove();
    removeListeners.length = 0;
    signal.removeEventListener('abort', dispose);
    scene?.clear();
    for (const item of geometries) item.dispose();
    for (const item of materials) item.dispose();
    for (const item of textures) item.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = undefined;
    } else {
      options.context.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }

  function fallback() {
    if (disposed) return;
    options.onFallback();
    dispose();
  }

  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) dispose();

  async function initialize() {
    try {
      const [T, original] = await Promise.all([import('three'), loadOriginal(loading.signal)]);
      if (disposed || signal.aborted) return;
      const mobile = window.matchMedia('(max-width: 740px), (pointer: coarse)');
      renderer = new T.WebGLRenderer({ canvas, context: options.context, alpha: true, antialias: !mobile.matches, powerPreference: 'low-power', stencil: false });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.NoToneMapping;
      renderer.debug.onShaderError = () => { throw new Error('Stage shader unavailable'); };
      scene = new T.Scene();
      const camera = new T.PerspectiveCamera(34, 1, 0.1, 30);
      const model = new T.Group();
      model.name = 'Original USD / alpha silhouette extrusion';
      scene.add(model);
      const key = new T.DirectionalLight(0xf1f5ff, 2.4);
      key.position.set(-2.5, 3.5, 4);
      const fill = new T.DirectionalLight(0xf5f7ff, 1.25);
      fill.position.set(3, 0.5, 2);
      const rim = new T.PointLight(0xff142c, variant === 'obsidian' ? 3.5 : 7.5, 8, 2);
      rim.position.set(2.2, 0.5, -0.5);
      scene.add(key, fill, rim, new T.HemisphereLight(0xbcc6d7, 0x17111a, 1.25));

      const texture = new T.Texture(original);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      textures.add(texture);
      const logoWidth = 2.8;
      const logoHeight = logoWidth * original.naturalHeight / original.naturalWidth;
      const depth = variant === 'obsidian' ? 0.19 : 0.22;
      const faceGeometry = geometry(new T.PlaneGeometry(logoWidth, logoHeight));
      // This entire unmodified file is the only front face. No redrawing, tint, or lighting.
      const face = new T.Mesh(faceGeometry, material(new T.MeshBasicMaterial({
        map: texture, color: 0xffffff, transparent: true, alphaTest: 0.01, toneMapped: false,
      })));
      face.position.z = 0.002;
      face.renderOrder = 3;
      face.name = 'Exact original full-color front';
      model.add(face);
      const wall = new T.Mesh(geometry(silhouetteSides(T, original, logoWidth, logoHeight, depth)), material(new T.MeshStandardMaterial({
        color: 0xcbd0d7, metalness: 0.67, roughness: 0.34, side: T.DoubleSide,
      })));
      wall.name = 'Depth from original alpha contour';
      const back = new T.Mesh(faceGeometry, material(new T.MeshBasicMaterial({
        map: texture, color: 0x68717f, transparent: true, alphaTest: 0.1, side: T.DoubleSide, toneMapped: false,
      })));
      back.position.z = -depth;
      back.name = 'Original silhouette backing';
      model.add(wall, back);

      const lightUniforms = {
        uTime: { value: 0 }, uPulse: { value: 0 }, uStrength: { value: 1 },
        uMode: { value: variant === 'obsidian' ? 1 : variant === 'sonic' ? 2 : 0 },
      };
      const light = new T.Mesh(geometry(new T.PlaneGeometry(6.8, 4.6)), material(new T.ShaderMaterial({
        uniforms: lightUniforms, vertexShader, fragmentShader: lightFragment, transparent: true,
        depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
      })));
      light.position.set(0, 0.3, -1.25);
      light.renderOrder = -3;
      scene.add(light);

      const floorUniforms = {
        uColor: { value: new T.Color(variant === 'obsidian' ? 0x516070 : 0xe50924) },
        uPulse: { value: 0 },
      };
      const groundGlow = new T.Mesh(geometry(new T.PlaneGeometry(7, 7)), material(new T.ShaderMaterial({
        uniforms: floorUniforms, vertexShader, fragmentShader: floorFragment, transparent: true,
        depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide,
      })));
      groundGlow.rotation.x = -Math.PI / 2;
      groundGlow.position.set(0, -1.48, -0.1);
      groundGlow.renderOrder = -2;
      scene.add(groundGlow);

      const rings: Ring[] = [];
      const ringSegments = mobile.matches ? 88 : 128;
      function addRing(radius: number, tube: number, opacity: number, parent: Three.Object3D, color = 0xff223a) {
        const ringMaterial = material(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
        const ring = new T.Mesh(geometry(new T.TorusGeometry(radius, tube, 6, ringSegments)), ringMaterial);
        parent.add(ring);
        rings.push({ mesh: ring, material: ringMaterial, opacity, phase: rings.length * 0.77 });
        return ring;
      }

      let speedLines: Three.LineSegments | undefined;
      if (variant === 'velocity') {
        const track = new T.Group();
        track.position.set(0, -1.36, -0.25);
        track.rotation.set(-1.20, 0, -0.11);
        scene.add(track);
        [1.36, 2.03, 2.8].forEach((radius, index) => addRing(radius, index === 0 ? 0.013 : 0.007, [0.8, 0.42, 0.16][index], track));
        const positions: number[] = [];
        for (let i = -10; i <= 10; i += 1) {
          const x = i * 0.35;
          positions.push(x, -1.52, -5, x, -1.52, 3);
        }
        for (let i = 0; i < 21; i += 1) {
          const z = -5 + i * 0.38;
          positions.push(-3.7, -1.52, z, 3.7, -1.52, z);
        }
        const linesGeometry = geometry(new T.BufferGeometry());
        linesGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        speedLines = new T.LineSegments(linesGeometry, material(new T.LineBasicMaterial({ color: 0xdf243b, transparent: true, opacity: 0.115, depthWrite: false, toneMapped: false })));
        scene.add(speedLines);
      } else if (variant === 'obsidian') {
        const plinth = new T.Mesh(geometry(new T.CylinderGeometry(1.43, 1.46, 0.18, 64)), material(new T.MeshStandardMaterial({ color: 0x12151b, metalness: 0.62, roughness: 0.42 })));
        plinth.position.set(0, -1.45, -0.1);
        scene.add(plinth);
        const exhibit = new T.Group();
        exhibit.position.set(0, -1.352, -0.1);
        exhibit.rotation.x = -Math.PI / 2;
        scene.add(exhibit);
        addRing(1.425, 0.0065, 0.63, exhibit, 0xe6edf6);
        const lowerRim = addRing(1.455, 0.006, 0.17, exhibit, 0x9da8ba);
        lowerRim.position.z = -0.16;
        const streakGeometry = geometry(new T.BufferGeometry().setFromPoints([
          new T.Vector3(-2.5, -1.31, -0.4), new T.Vector3(-0.75, -1.32, -0.65), new T.Vector3(2.3, -1.14, -0.9),
        ]));
        scene.add(new T.Line(streakGeometry, material(new T.LineBasicMaterial({ color: 0xff1532, transparent: true, opacity: 0.72, toneMapped: false }))));
      } else {
        const field = new T.Group();
        field.position.set(0, 0.05, -0.85);
        field.rotation.set(0.16, -0.15, -0.025);
        scene.add(field);
        [1.5, 1.83, 2.18, 2.54, 2.93, 3.36, 3.83].forEach((radius, index) => {
          const ring = addRing(radius, index < 2 ? 0.012 : 0.007, Math.max(0.055, 0.51 - index * 0.074), field);
          ring.position.z = -index * 0.07;
        });
      }

      let dust: Three.Points | undefined;
      if (variant === 'sonic') {
        const count = mobile.matches ? 24 : 42;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        let seed = 4527;
        const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < count; i += 1) {
          positions.set([(random() - 0.5) * 6.2, (random() - 0.5) * 4.7, -0.6 - random() * 1.6], i * 3);
          const color = new T.Color(i % 4 === 0 ? 0xff2845 : 0xaebbd0);
          colors.set([color.r, color.g, color.b], i * 3);
        }
        const particles = geometry(new T.BufferGeometry());
        particles.setAttribute('position', new T.BufferAttribute(positions, 3));
        particles.setAttribute('color', new T.BufferAttribute(colors, 3));
        dust = new T.Points(particles, material(new T.PointsMaterial({ size: 0.015, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false })));
        scene.add(dust);
      }

      let targetX = 0;
      let targetY = 0;
      let pointerX = 0;
      let pointerY = 0;
      let scrollTarget = 0;
      let scroll = 0;
      let scrollDirty = true;
      let baseDistance = 6;
      const target = new T.Vector3(0, -0.04, -0.05);

      function updateScroll() {
        const rect = host.getBoundingClientRect();
        scrollTarget = Math.max(-1, Math.min(1, (window.innerHeight * 0.5 - rect.top - rect.height * 0.5) / Math.max(1, window.innerHeight)));
        scrollDirty = false;
      }

      function draw(delta: number) {
        if (disposed || !renderer || !scene) return;
        if (scrollDirty) updateScroll();
        const strength = options.getIntensity();
        const ease = 1 - Math.exp(-delta * 5.5);
        pointerX += (targetX - pointerX) * ease;
        pointerY += (targetY - pointerY) * ease;
        scroll += (scrollTarget - scroll) * ease;
        const age = elapsed - pulseAt;
        const pulse = age >= 0 ? Math.exp(-age * 2.65) * (1 - Math.exp(-age * 28)) : 0;
        const baseTurn = variant === 'velocity' ? -0.23 : variant === 'obsidian' ? -0.17 : 0.12;
        model.rotation.set(
          -0.025 - pointerY * 0.075 + scroll * 0.035,
          baseTurn + pointerX * 0.16 + Math.sin(elapsed * 0.28) * 0.04 * strength + scroll * 0.11,
          (variant === 'velocity' ? -0.035 : 0) + Math.sin(elapsed * 0.24) * 0.007 * strength,
        );
        model.position.set(0, 0.13 + Math.sin(elapsed * 0.72) * 0.024 * strength + scroll * 0.045, pulse * Math.sin(age * 16) * 0.048);
        model.scale.setScalar(1 + pulse * 0.018);
        camera.position.set(pointerX * 0.07, (variant === 'obsidian' ? 0.58 : 0.27) + scroll * 0.22, baseDistance + scroll * 0.13);
        camera.lookAt(target);
        lightUniforms.uTime.value = elapsed;
        lightUniforms.uPulse.value = pulse;
        lightUniforms.uStrength.value = 0.72 + strength * 0.55;
        floorUniforms.uPulse.value = pulse;
        rim.intensity = (variant === 'obsidian' ? 3.5 : 7.5) + pulse * 5;
        for (const ring of rings) {
          if (variant === 'sonic') {
            ring.mesh.scale.setScalar(1 + Math.sin(elapsed * 1.35 - ring.phase) * 0.025 * strength + pulse * 0.09);
            ring.material.opacity = Math.min(1, ring.opacity * (0.84 + Math.sin(elapsed * 1.35 - ring.phase) * 0.16) + pulse * 0.15);
          } else {
            ring.mesh.scale.setScalar(1 + pulse * (variant === 'velocity' ? 0.055 : 0.015));
            ring.material.opacity = Math.min(1, ring.opacity + pulse * 0.16);
          }
        }
        if (speedLines) speedLines.position.z = (elapsed * (0.55 + strength * 0.75)) % 0.38;
        if (dust) {
          dust.rotation.z = Math.sin(elapsed * 0.1) * 0.035;
          dust.position.y = Math.sin(elapsed * 0.25) * 0.08;
        }
        renderer.render(scene, camera);
      }

      function tick(now: number) {
        if (disposed || motion !== 'running') return;
        frame = requestAnimationFrame(tick);
        const interval = 1000 / (mobile.matches ? 30 : 48);
        if (lastDraw && now - lastDraw < interval) return;
        const delta = lastDraw ? Math.min((now - lastDraw) / 1000, 0.06) : 1 / 30;
        lastDraw = now;
        elapsed += delta;
        try { draw(delta); } catch { fallback(); }
      }

      function syncMotion() {
        if (disposed) return;
        const next: StageMotion = ready && visible && !document.hidden ? 'running' : 'paused';
        if (next === motion) return;
        motion = next;
        options.onMotion(next);
        cancelAnimationFrame(frame);
        frame = 0;
        lastDraw = 0;
        if (next === 'running') frame = requestAnimationFrame(tick);
      }

      function resize() {
        if (disposed || !renderer) return;
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.3 : 1.6));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        const halfFov = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
        baseDistance = Math.max(3.62 / (2 * halfFov), 3.46 / camera.aspect / (2 * halfFov));
        scrollDirty = true;
        if (ready && visible && !document.hidden) {
          try { draw(1 / 30); } catch { fallback(); }
        }
      }

      function listen(target: EventTarget, name: string, listener: EventListener, passive = false) {
        target.addEventListener(name, listener, { passive });
        removeListeners.push(() => target.removeEventListener(name, listener));
      }
      listen(host, 'pointermove', ((event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        const rect = host.getBoundingClientRect();
        targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1));
        targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1));
      }) as EventListener, true);
      listen(host, 'pointerleave', () => { targetX = 0; targetY = 0; });
      listen(window, 'scroll', () => { scrollDirty = true; }, true);
      listen(document, 'visibilitychange', syncMotion);
      listen(canvas, 'webglcontextlost', event => { event.preventDefault(); fallback(); });
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
      } else listen(window, 'resize', resize, true);
      const rect = host.getBoundingClientRect();
      visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(entries => {
          visible = entries[0]?.isIntersecting ?? false;
          syncMotion();
        }, { threshold: 0.01 });
        intersectionObserver.observe(host);
      }
      resize();
      draw(1);
      if (disposed || signal.aborted) return;
      ready = true;
      options.onReady();
      syncMotion();
    } catch {
      fallback();
    }
  }

  if (!disposed) void initialize();
  return { pulse: () => { if (!disposed && ready) pulseAt = elapsed; }, dispose };
}
