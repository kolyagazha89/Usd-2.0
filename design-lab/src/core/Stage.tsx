import { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowUpRight } from 'lucide-react';
import { createFallbackStage } from './fallback-driver';
import type { StageController, StageMotion, StageVariant } from './scene-driver';
import './stage.css';

type StageProps = {
  variant: StageVariant;
  className?: string;
  intensity?: number;
  onPulse?: () => void;
};

/** The original image stays visible until a complete first WebGL frame exists. */
export default function Stage({ variant, className = '', intensity = 0.5, onPulse }: StageProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallbackCanvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<StageController | null>(null);
  const intensityRef = useRef(intensity);
  const onPulseRef = useRef(onPulse);
  const [ready, setReady] = useState(false);
  const [motion, setMotion] = useState<StageMotion>('paused');
  const [pulses, setPulses] = useState(0);

  intensityRef.current = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0.5;
  onPulseRef.current = onPulse;

  useEffect(() => {
    const node = host.current;
    const surface = canvas.current;
    const lightSurface = fallbackCanvas.current;
    if (!node || !surface || !lightSurface) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const device = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const economical = Boolean(device.connection?.saveData) || (device.deviceMemory ?? 8) <= 2;
    let disposed = false;
    let generation = 0;
    let pending: AbortController | undefined;
    let webglAttempted = false;
    let fallbackController: StageController | null = null;
    let webglController: StageController | null = null;

    function restart() {
      const currentGeneration = ++generation;
      pending?.abort();
      controller.current?.dispose();
      webglController?.dispose();
      fallbackController?.dispose();
      controller.current = null;
      webglController = null;
      fallbackController = null;
      setReady(false);
      setMotion(reduced.matches ? 'reduced' : 'paused');
      const abort = new AbortController();
      pending = abort;
      const valid = () => !disposed && !abort.signal.aborted && generation === currentGeneration;
      const onMotion = (next: StageMotion) => { if (valid()) setMotion(next); };

      function startFallback() {
        if (!valid()) return;
        setReady(false);
        if (!fallbackController) {
          fallbackController = createFallbackStage({
            host: node!, canvas: lightSurface!, variant, signal: abort.signal,
            reducedMotion: reduced.matches, getIntensity: () => intensityRef.current, onMotion,
          });
        }
        controller.current = fallbackController;
      }
      startFallback();
      if (reduced.matches || economical || webglAttempted) return;

      // Defer one microtask so React's development effect cleanup creates no context.
      void Promise.resolve().then(async () => {
        if (!valid()) return;
        webglAttempted = true;
        let context: WebGL2RenderingContext | null = null;
        let handedOff = false;
        try {
          const small = window.matchMedia('(max-width: 740px), (pointer: coarse)').matches;
          // Preflight the real canvas once. This same context belongs to Three later.
          context = surface!.getContext('webgl2', {
            alpha: true, antialias: !small, powerPreference: 'low-power', stencil: false,
          });
          if (!context || context.isContextLost()) return;
          const { createStage } = await import('./scene-driver');
          if (!valid()) return;
          webglController = createStage({
            host: node!, canvas: surface!, context, variant, signal: abort.signal,
            getIntensity: () => intensityRef.current,
            onReady: () => {
              if (!valid()) return;
              fallbackController?.dispose();
              fallbackController = null;
              controller.current = webglController;
              setReady(true);
            },
            onMotion,
            onFallback: startFallback,
          });
          handedOff = true;
        } catch {
          startFallback();
        } finally {
          if (context && !handedOff) context.getExtension('WEBGL_lose_context')?.loseContext();
        }
      });
    }

    restart();
    reduced.addEventListener('change', restart);
    return () => {
      disposed = true;
      generation += 1;
      reduced.removeEventListener('change', restart);
      pending?.abort();
      controller.current?.dispose();
      webglController?.dispose();
      fallbackController?.dispose();
      controller.current = null;
    };
  }, [variant]);

  useEffect(() => { controller.current?.refresh?.(); }, [intensity]);

  function pulse() {
    controller.current?.pulse();
    setPulses(count => count + 1);
    onPulseRef.current?.();
  }

  return (
    <div
      ref={host}
      className={`stage-surface stage-surface--${variant} ${className}`.trim()}
      data-renderer={ready ? 'webgl' : 'fallback'}
      data-motion={motion}
      data-pulse={pulses}
    >
      <canvas
        key={variant}
        ref={canvas}
        className="stage-canvas"
        role="img"
        aria-label="Объёмный знак USD. Реагирует на движение курсора и прокрутку."
        aria-hidden={!ready}
      />
      <canvas ref={fallbackCanvas} className="stage-fallback-canvas" aria-hidden="true" />
      <img
        className="stage-original"
        src="/assets/usd-original.png"
        width="529"
        height="474"
        alt="Оригинальный знак USD"
        aria-hidden={ready}
        decoding="async"
        fetchPriority="high"
        draggable="false"
      />
      {!ready && <span className="stage-mode-note">Облегчённый режим</span>}
        <button type="button" className="stage-pulse" aria-label="Запустить визуальный импульс" onClick={pulse}>
          <AudioLines size={17} strokeWidth={1.3} aria-hidden="true" />
          <span>Импульс</span>
          <ArrowUpRight className="stage-pulse__key" size={15} strokeWidth={1.2} aria-hidden="true" />
        </button>
      <span className="stage-announcement" role="status" aria-live="polite">
        {pulses > 0 ? motion === 'reduced' ? `Импульс ${pulses} выбран. Анимация отключена.` : `Визуальный импульс ${pulses} запущен.` : ''}
      </span>
    </div>
  );
}
