import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { RotateCcw, RotateCw, Scan } from 'lucide-react';
import type { PortModel } from './geometry.js';
import { portModels } from './portModels.js';
import { paintPort, PORT_HOME_ANGLE, PORT_HOME_ELEVATION, studioLight, type PortLight } from './projection.js';
import './port-miniature.css';

interface PortMiniatureProps {
  code: string;
  variant: 'tile' | 'detail';
  is3D?: boolean;
}

const paints = new Set<() => void>();
let paintFrame = 0;
function queuePaint(paint: () => void) {
  paints.add(paint);
  if (paintFrame) return;
  paintFrame = requestAnimationFrame(() => {
    paintFrame = 0;
    const next = [...paints];
    paints.clear();
    next.forEach(draw => draw());
  });
}

function readBoardLight(slab: HTMLElement): PortLight {
  const x = -parseFloat(slab.style.getPropertyValue('--cast-x'));
  const y = parseFloat(slab.style.getPropertyValue('--cast-y'));
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len === 0) return studioLight;
  return { x: x / len, y: y / len, exposure: parseFloat(slab.style.getPropertyValue('--model-exposure')) || 1,
    moon: slab.dataset.light === 'moon', overcast: slab.dataset.weather === 'storm' ? 1 : slab.dataset.weather === 'showers' ? .55 : 0 };
}

const boardObservers = new WeakMap<HTMLElement, { changes: Set<() => void>; observer: MutationObserver }>();
function watchBoard(slab: HTMLElement, paint: () => void): () => void {
  let entry = boardObservers.get(slab);
  if (!entry) {
    const changes = new Set<() => void>();
    const observer = new MutationObserver(() => changes.forEach(queuePaint));
    observer.observe(slab, { attributes: true, attributeFilter: ['data-sky-phase', 'data-weather', 'data-light'] });
    entry = { changes, observer };
    boardObservers.set(slab, entry);
  }
  entry.changes.add(paint);
  return () => {
    entry.changes.delete(paint);
    if (!entry.changes.size) { entry.observer.disconnect(); boardObservers.delete(slab); }
  };
}

function PortCanvas({ model, yaw, elevation, detail = false }: { model: PortModel; yaw: number; elevation: number; detail?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pose = useRef({ yaw, elevation });
  const drawRef = useRef<() => void>(() => {});
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const slab = canvas.closest<HTMLElement>('.chart-slab');
    const host = canvas.closest<HTMLElement>('[data-port-code]');
    const paint = () => {
      // Use the layout box: a tilted game board foreshortens getBoundingClientRect().
      const density = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
      const width = Math.round(canvas.clientWidth * density), height = Math.round(canvas.clientHeight * density);
      if (!width || !height) return;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      paintPort(ctx, model, pose.current.yaw, pose.current.elevation, slab ? readBoardLight(slab) : studioLight, detail);
      if (host) {
        host.dataset.portReady = 'true';
        host.dataset.portYaw = String(Math.round(pose.current.yaw * 180 / Math.PI));
      }
    };
    drawRef.current = paint;
    const resize = new ResizeObserver(() => queuePaint(paint));
    resize.observe(canvas);
    const unwatch = slab && watchBoard(slab, paint);
    queuePaint(paint);
    return () => {
      resize.disconnect();
      unwatch?.();
      paints.delete(paint);
      drawRef.current = () => {};
    };
  }, [model, detail]);
  useEffect(() => {
    pose.current = { yaw, elevation };
    queuePaint(drawRef.current);
  }, [yaw, elevation]);
  return <canvas ref={canvasRef} className="port-miniature-canvas" aria-hidden="true" />;
}

const step = Math.PI / 9;
const home = { yaw: PORT_HOME_ANGLE, elevation: PORT_HOME_ELEVATION };

function PortInspector({ code, model }: { code: string; model: PortModel }) {
  const [pose, setPose] = useState(home);
  const drag = useRef<{ id: number; x: number; y: number; yaw: number; elevation: number } | null>(null);
  const rotate = (dx: number, dy = 0) => setPose(previous => ({
    yaw: previous.yaw + dx,
    elevation: Math.max(.14, Math.min(1.22, previous.elevation + dy)),
  }));
  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowLeft': rotate(-step); break;
      case 'ArrowRight': rotate(step); break;
      case 'ArrowUp': rotate(0, step / 2); break;
      case 'ArrowDown': rotate(0, -step / 2); break;
      case 'Home': setPose(home); break;
      default: return;
    }
    event.preventDefault();
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ...pose };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const origin = drag.current;
    if (!origin || origin.id !== event.pointerId) return;
    setPose({ yaw: origin.yaw + (event.clientX - origin.x) * .016,
      elevation: Math.max(.14, Math.min(1.22, origin.elevation + (event.clientY - origin.y) * .008)) });
  }
  return (
    <figure className="port-miniature port-miniature-detail" data-port-code={code} data-port-variant="detail">
      <div className="port-miniature-stage" tabIndex={0} role="group" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
        aria-label={`Xoay mô hình ${model.label} bằng các phím mũi tên`}
        onKeyDown={keydown} onPointerDown={start} onPointerMove={move}
        onLostPointerCapture={() => { drag.current = null; }}>
        <PortCanvas model={model} {...pose} detail />
      </div>
      <figcaption className="port-miniature-caption">
        <span>{model.label}</span>
        <span className="port-miniature-controls">
          <button type="button" aria-label="Xoay mô hình sang trái" title="Xoay trái" onClick={() => rotate(-step)}><RotateCcw /></button>
          <button type="button" aria-label="Đặt lại góc nhìn" title="Góc nhìn ban đầu" onClick={() => setPose(home)}><Scan /></button>
          <button type="button" aria-label="Xoay mô hình sang phải" title="Xoay phải" onClick={() => rotate(step)}><RotateCw /></button>
        </span>
      </figcaption>
    </figure>
  );
}

export const PortMiniature = memo(function PortMiniature({ code, variant, is3D = true }: PortMiniatureProps) {
  const model = portModels[code];
  if (!model) return null;
  if (variant === 'detail') return <PortInspector key={code} code={code} model={model} />;
  return (
    <span className="port-miniature port-miniature-tile" data-port-code={code} data-port-variant="tile" aria-hidden="true">
      <PortCanvas model={model} yaw={PORT_HOME_ANGLE} elevation={is3D ? PORT_HOME_ELEVATION : .67} />
    </span>
  );
});
