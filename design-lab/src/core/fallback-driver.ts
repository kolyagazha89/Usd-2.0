import type { StageController, StageMotion, StageVariant } from './scene-driver';

type FallbackOptions = {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  variant: StageVariant;
  signal: AbortSignal;
  reducedMotion: boolean;
  getIntensity: () => number;
  onMotion: (motion: StageMotion) => void;
};

type Point = { x: number; y: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** A projected Canvas2D light stage; the untouched original PNG stays above it. */
export function createFallbackStage(options: FallbackOptions): StageController {
  const { host, canvas, variant, signal, reducedMotion } = options;
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) {
    options.onMotion(reducedMotion ? 'reduced' : 'paused');
    return { pulse() {}, refresh() {}, dispose() {} };
  }
  const ctx = context;
  const mobile = window.matchMedia('(max-width: 740px), (pointer: coarse)');
  const listeners: Array<() => void> = [];
  const styleProperties = ['--stage-offset-x', '--stage-offset-y', '--stage-rx', '--stage-ry', '--stage-rz', '--stage-scale'];
  let width = 1;
  let height = 1;
  let unit = 1;
  let dpr = 1;
  let disposed = false;
  let frame = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let pulseAt = -100;
  let staticPulse = false;
  let visible = true;
  let motion: StageMotion | undefined;
  let targetX = 0;
  let targetY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let scroll = 0;
  let scrollTarget = 0;
  let scrollDirty = true;
  let resizeObserver: ResizeObserver | undefined;
  let intersectionObserver: IntersectionObserver | undefined;
  let cameraSin = 0;
  let cameraCos = 1;
  let yawSin = 0;
  let yawCos = 1;
  let centerX = 0;
  let centerY = 0;
  let seed = 4527;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dust = Array.from({ length: mobile.matches ? 22 : 36 }, (_, index) => ({
    x: (random() - 0.5) * 6.6,
    y: (random() - 0.5) * 4.7,
    z: -1.2 - random() * 1.5,
    phase: random() * Math.PI * 2,
    red: index % 4 === 0,
  }));

  function project(x: number, y: number, z: number): Point {
    const rotatedX = x * yawCos + z * yawSin;
    const rotatedZ = z * yawCos - x * yawSin;
    const viewY = y * cameraCos - rotatedZ * cameraSin;
    const viewZ = y * cameraSin + rotatedZ * cameraCos;
    const perspective = 6 / Math.max(1.25, 6 - viewZ);
    return { x: centerX + rotatedX * unit * perspective, y: centerY - viewY * unit * perspective };
  }

  function ringPath(radius: number, y: number, z: number, plane: 'floor' | 'vertical', start = 0, end = Math.PI * 2) {
    ctx.beginPath();
    const steps = Math.max(8, Math.round((mobile.matches ? 72 : 104) * (end - start) / (Math.PI * 2)));
    for (let i = 0; i <= steps; i += 1) {
      const angle = start + (end - start) * i / steps;
      const x = Math.cos(angle) * radius;
      const vertical = Math.sin(angle) * radius;
      const point = plane === 'floor'
        ? project(x, y + (variant === 'velocity' ? x * 0.075 : 0), z + vertical)
        : project(x, y + vertical, z + x * 0.11 + vertical * 0.045);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    if (end - start >= Math.PI * 2) ctx.closePath();
  }

  function ring(radius: number, y: number, z: number, plane: 'floor' | 'vertical', color: string, alpha: number, stroke = 1) {
    ringPath(radius, y, z, plane);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function glow(x: number, y: number, radiusX: number, radiusY: number, color: string, opacity: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, radiusY / Math.max(1, radiusX));
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusX);
    gradient.addColorStop(0, `rgba(${color},${opacity})`);
    gradient.addColorStop(0.42, `rgba(${color},${opacity * 0.42})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(-radiusX, -radiusX, radiusX * 2, radiusX * 2);
    ctx.restore();
  }

  function shaft(start: Point, end: Point, spread: number, rgb: string, opacity: number) {
    // Six translucent nested volumes give a soft edge without blur or filters.
    for (let i = 0; i < 6; i += 1) {
      const beamWidth = spread * (1 - i * 0.135);
      const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      gradient.addColorStop(0, `rgba(${rgb},0)`);
      gradient.addColorStop(0.22, `rgba(${rgb},${opacity * 0.42})`);
      gradient.addColorStop(0.66, `rgba(${rgb},${opacity})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(start.x - 3, start.y);
      ctx.lineTo(start.x + 3, start.y);
      ctx.lineTo(end.x + beamWidth, end.y);
      ctx.lineTo(end.x - beamWidth, end.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function floorLines(time: number, strength: number) {
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = 'rgba(239,47,65,.10)';
    ctx.beginPath();
    for (let i = -10; i <= 10; i += 1) {
      const a = project(i * 0.46, -1.5, -11);
      const b = project(i * 0.46, -1.5, 3.2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    const shift = (time * (0.6 + strength * 1.5)) % 0.66;
    for (let i = 0; i < 23; i += 1) {
      const z = -11 + i * 0.66 + shift;
      const a = project(-5, -1.5, z);
      const b = project(5, -1.5, z);
      ctx.strokeStyle = `rgba(239,47,65,${0.025 + clamp((z + 11) / 14.5, 0, 1) * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function plinth(pulse: number, time: number) {
    const top = -1.36;
    const bottom = -1.55;
    const radius = 1.44;
    const topCenter = project(0, top, -0.1);
    const bottomCenter = project(0, bottom, -0.1);
    const body = ctx.createLinearGradient(0, topCenter.y - unit * 0.1, 0, bottomCenter.y + unit * 0.2);
    body.addColorStop(0, '#20252d');
    body.addColorStop(0.5, '#11151b');
    body.addColorStop(1, '#080a0f');
    ctx.beginPath();
    for (let i = 0; i <= 52; i += 1) {
      const angle = i * Math.PI / 52;
      const point = project(Math.cos(angle) * radius, top, Math.sin(angle) * radius - 0.1);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    for (let i = 52; i >= 0; i -= 1) {
      const angle = i * Math.PI / 52;
      const point = project(Math.cos(angle) * radius, bottom, Math.sin(angle) * radius - 0.1);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ringPath(radius, top, -0.1, 'floor');
    const surface = ctx.createLinearGradient(topCenter.x - unit, topCenter.y - unit * 0.3, topCenter.x + unit, topCenter.y + unit * 0.3);
    surface.addColorStop(0, '#181c23');
    surface.addColorStop(0.45, '#101319');
    surface.addColorStop(1, '#080a0e');
    ctx.fillStyle = surface;
    ctx.fill();
    ring(radius, top, -0.1, 'floor', '#e5ecf7', 0.08 + pulse * 0.1, 4);
    ring(radius, top, -0.1, 'floor', '#dbe4f2', 0.65 + pulse * 0.25, 0.85);
    ring(radius, bottom, -0.1, 'floor', '#667489', 0.17, 0.6);
    ringPath(radius, top, -0.1, 'floor', time * 0.22 + 3.3, time * 0.22 + 4.0);
    ctx.strokeStyle = '#fbfdff';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    const a = project(-3, -1.35, -0.7);
    const b = project(2.7, -1.26, -1.3);
    const streak = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    streak.addColorStop(0, 'rgba(255,23,49,0)');
    streak.addColorStop(0.38, 'rgba(255,23,49,.7)');
    streak.addColorStop(0.65, 'rgba(255,23,49,.4)');
    streak.addColorStop(1, 'rgba(255,23,49,0)');
    ctx.strokeStyle = streak;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function draw(delta: number) {
    if (disposed) return;
    if (scrollDirty) {
      const rect = host.getBoundingClientRect();
      scrollTarget = clamp((window.innerHeight * 0.5 - rect.top - rect.height * 0.5) / Math.max(1, window.innerHeight), -1, 1);
      scrollDirty = false;
    }
    const strength = options.getIntensity();
    const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 5.8);
    pointerX += ((reducedMotion ? 0 : targetX) - pointerX) * ease;
    pointerY += ((reducedMotion ? 0 : targetY) - pointerY) * ease;
    scroll += ((reducedMotion ? 0 : scrollTarget) - scroll) * ease;
    const time = reducedMotion ? 0 : elapsed;
    const age = time - pulseAt;
    const pulse = reducedMotion ? (staticPulse ? 0.28 : 0) : age >= 0 ? Math.exp(-age * 2.5) * (1 - Math.exp(-age * 28)) : 0;
    const pitch = (variant === 'obsidian' ? 0.28 : variant === 'velocity' ? 0.22 : 0.1) + pointerY * 0.018 + scroll * 0.025;
    const yaw = pointerX * 0.055 + (variant === 'velocity' ? -0.055 : 0.025);
    cameraSin = Math.sin(pitch);
    cameraCos = Math.cos(pitch);
    yawSin = Math.sin(yaw);
    yawCos = Math.cos(yaw);
    centerX = width * 0.5 + pointerX * 3;
    centerY = height * 0.44 - scroll * 4;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    const floor = project(0, -1.43, -0.1);
    glow(floor.x, floor.y + unit * 0.06, unit * 3.1, unit * 0.62, variant === 'obsidian' ? '139,158,186' : '229,9,36', (variant === 'obsidian' ? 0.065 : 0.17) + pulse * 0.13);
    shaft(project(-2.1, 3.5, -2.4), project(0.8, -1.45, -1.4), unit * 0.6, '184,203,228', variant === 'obsidian' ? 0.011 : 0.007);
    shaft(project(2.4, 3.4, -1.9), project(-1.1, -1.5, -0.8), unit * 0.88, '255,25,49', variant === 'obsidian' ? 0.004 : 0.011 + pulse * 0.009);

    if (variant === 'velocity') {
      floorLines(time, strength);
      [1.4, 2.08, 2.91].forEach((radius, index) => {
        const r = radius * (1 + pulse * 0.055);
        ring(r, -1.39, -0.15, 'floor', '#ff1736', [0.08, 0.035, 0.018][index] + pulse * 0.025, 5);
        ring(r, -1.39, -0.15, 'floor', '#ff243f', [0.88, 0.38, 0.16][index] + pulse * 0.12, index === 0 ? 1.35 : 0.8);
      });
      if (!reducedMotion && age >= 0 && age < 1.7) {
        ring(1.1 + age * 2.5, -1.38, -0.15, 'floor', '#ff5770', (1 - age / 1.7) * 0.7, 1.5);
      }
    } else if (variant === 'obsidian') {
      plinth(pulse, time);
    } else {
      glow(centerX, centerY, unit * 2.7, unit * 2.6, '208,17,48', 0.055 + pulse * 0.035);
      [1.5, 1.84, 2.2, 2.59, 3.02, 3.5, 4.05].forEach((radius, index) => {
        const r = radius * (1 + Math.sin(time * 1.22 - index * 0.8) * 0.018 * strength + pulse * 0.045);
        const opacity = Math.max(0.045, 0.58 - index * 0.078) * (0.86 + Math.sin(time * 1.22 - index * 0.8) * 0.14);
        ring(r, 0, -0.95 - index * 0.04, 'vertical', '#fa2949', opacity, index < 2 ? 1.15 : 0.75);
        if (index < 3) ring(r, 0, -0.95 - index * 0.04, 'vertical', '#ff1739', 0.028, 5);
      });
      for (const mote of dust) {
        const point = project(mote.x, mote.y + Math.sin(time * 0.2 + mote.phase) * 0.055, mote.z);
        ctx.fillStyle = mote.red ? `rgba(255,65,91,${0.3 + pulse * 0.3})` : `rgba(192,207,231,${0.18 + pulse * 0.2})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, mote.red ? 1 : 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reducedMotion && age >= 0 && age < 2) {
        ring(1.25 + age * 2.2, 0, -0.92, 'vertical', '#ff8496', (1 - age / 2) * 0.7, 1.5);
      }
    }

    const float = reducedMotion ? 0 : Math.sin(time * 0.68) * 3 * strength;
    const baseTurn = variant === 'velocity' ? -8 : variant === 'obsidian' ? -6 : 5;
    host.style.setProperty('--stage-offset-x', `${(pointerX * 5).toFixed(2)}px`);
    host.style.setProperty('--stage-offset-y', `${(float - scroll * 4).toFixed(2)}px`);
    host.style.setProperty('--stage-rx', `${(-2 - pointerY * 3 + scroll).toFixed(2)}deg`);
    host.style.setProperty('--stage-ry', `${(baseTurn + pointerX * 7 + (reducedMotion ? 0 : Math.sin(time * 0.24) * 1.25 * strength)).toFixed(2)}deg`);
    host.style.setProperty('--stage-rz', `${((variant === 'velocity' ? -1.3 : 0) + (reducedMotion ? 0 : Math.sin(time * 0.19) * 0.35 * strength)).toFixed(2)}deg`);
    host.style.setProperty('--stage-scale', `${(1 + (reducedMotion ? 0 : pulse * 0.024)).toFixed(4)}`);
  }

  function tick(now: number) {
    if (disposed || motion !== 'running') return;
    frame = requestAnimationFrame(tick);
    if (lastFrame && now - lastFrame < 1000 / (mobile.matches ? 30 : 40)) return;
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.065) : 1 / 30;
    lastFrame = now;
    elapsed += delta;
    draw(delta);
  }

  function sync() {
    if (disposed) return;
    const next: StageMotion = reducedMotion ? 'reduced' : visible && !document.hidden ? 'running' : 'paused';
    if (motion === next) return;
    motion = next;
    options.onMotion(next);
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    if (next === 'running') frame = requestAnimationFrame(tick);
  }

  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    unit = Math.min(width * (mobile.matches ? 0.26 : 0.239), height * 0.272);
    dpr = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.3 : 1.6);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    scrollDirty = true;
    draw(1);
  }

  function listen(target: EventTarget, name: string, listener: EventListener, passive = false) {
    target.addEventListener(name, listener, { passive });
    listeners.push(() => target.removeEventListener(name, listener));
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    for (const remove of listeners) remove();
    signal.removeEventListener('abort', dispose);
    for (const property of styleProperties) host.style.removeProperty(property);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 1;
    canvas.height = 1;
  }

  if (signal.aborted) {
    dispose();
    return { pulse() {}, refresh() {}, dispose };
  }
  signal.addEventListener('abort', dispose, { once: true });
  listen(host, 'pointermove', ((event: PointerEvent) => {
    if (reducedMotion || event.pointerType === 'touch') return;
    const rect = host.getBoundingClientRect();
    targetX = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -1, 1);
    targetY = clamp((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1, -1, 1);
  }) as EventListener, true);
  listen(host, 'pointerleave', () => { targetX = 0; targetY = 0; });
  listen(window, 'scroll', () => { scrollDirty = true; }, true);
  listen(document, 'visibilitychange', sync);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
  } else listen(window, 'resize', resize, true);
  const rect = host.getBoundingClientRect();
  visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      sync();
    }, { threshold: 0.01 });
    intersectionObserver.observe(host);
  }
  resize();
  sync();
  return {
    pulse() {
      if (disposed) return;
      if (reducedMotion) { staticPulse = !staticPulse; draw(0); }
      else pulseAt = elapsed;
    },
    refresh() { if (!disposed && motion !== 'running') draw(0); },
    dispose,
  };
}
