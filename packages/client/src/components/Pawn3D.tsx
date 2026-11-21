import React, { useLayoutEffect, useRef, useState } from 'react';
import { Player } from '@one-monopoly/shared';
import { Container, Fuel, Sailboat, Ship, Snowflake, TrainFront, Truck } from 'lucide-react';
import { TOKEN_CONFIG } from './TokenBadge.js';
import { TokenModel } from './TokenModel.js';
import './board-shadows.css';

interface Props {
  children?: React.ReactNode;
  player: Player;
  is3D: boolean;
  stackIndex: number;
  stackSize: number;
  heading: number;
  idle: boolean;
  exposure: number;
}

function GantryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 20h9M4 20V5l4-2 13 2v3H8v12M4 12l4-4M4 17l4-4" />
      <g className="chart-gantry-load">
        <path d="M17 8v6" />
        <rect x="13" y="14" width="8" height="4" rx=".7" />
      </g>
    </svg>
  );
}

const counterArt = {
  ONE_APUS: { Icon: Ship, idleMotion: 'hull' },
  ONE_MAGENTA: { Icon: Container, idleMotion: 'hull' },
  GANTRY_CRANE: { Icon: GantryIcon, idleMotion: 'hoist' },
  CONTAINER_TRUCK: { Icon: Truck, idleMotion: 'engine' },
  FREIGHT_TRAIN: { Icon: TrainFront, idleMotion: 'engine' },
  REEFER_TRUCK: { Icon: Snowflake, idleMotion: 'engine' },
  PILOT_BOAT: { Icon: Sailboat, idleMotion: 'hull' },
  BUNKER_BARGE: { Icon: Fuel, idleMotion: 'hull' },
};

const compassPoints: Record<number, string> = { 0: 'đông', 90: 'nam', 180: 'tây', 270: 'bắc' };

export const Pawn3D: React.FC<Props> = ({ player, is3D, stackIndex, stackSize, heading, idle, exposure, children }) => {
  const pawnRef = useRef<HTMLSpanElement>(null);
  const [camera, setCamera] = useState({ yaw: 0, tilt: 0 });

  useLayoutEffect(() => {
    if (!is3D) return;
    const pawn = pawnRef.current!;
    const viewport = pawn.closest('.board-viewport');
    const syncCamera = () => {
      const style = getComputedStyle(pawn);
      const yaw = parseFloat(style.getPropertyValue('--board-yaw')) || 0;
      const tilt = parseFloat(style.getPropertyValue('--board-tilt')) || 0;
      setCamera(previous => previous.yaw === yaw && previous.tilt === tilt ? previous : { yaw, tilt });
    };
    syncCamera();
    const observer = new ResizeObserver(syncCamera);
    observer.observe(viewport ?? pawn);
    return () => observer.disconnect();
  }, [is3D]);

  const cfg = TOKEN_CONFIG[player.token] || TOKEN_CONFIG.ONE_APUS;
  const direction = compassPoints[heading] ?? `${heading}°`;
  const label = `${player.name} (${cfg.label}), hướng ${direction}`;
  const columns = Math.min(stackSize, 2);
  const row = Math.floor(stackIndex / columns);
  const rowLength = Math.min(columns, stackSize - row * columns);
  const x = stackIndex % columns - (rowLength - 1) / 2;
  const y = row - (Math.ceil(stackSize / columns) - 1) / 2;
  const { Icon, idleMotion } = counterArt[player.token] || counterArt.ONE_APUS;
  const azimuth = heading + (is3D ? camera.yaw : 0);
  const radians = Math.PI / 180;
  // The tilted board compresses its vertical screen axis. Keep the fallback arrow on that path.
  const screenBearing = is3D
    ? Math.atan2(Math.sin(azimuth * radians) * Math.cos(camera.tilt * radians), Math.cos(azimuth * radians)) / radians
    : heading;
  // CSS interpolates rotation matrices along the short arc, including north to east.
  const cos = Math.cos(screenBearing * radians);
  const sin = Math.sin(screenBearing * radians);

  return (
    <span
      ref={pawnRef}
      className={is3D ? 'chart-model-pawn' : 'chart-counter'}
      data-grouped={stackSize > 1}
      data-tall={player.token === 'GANTRY_CRANE' ? '' : undefined}
      data-heading={heading}
      data-idle-motion={idle ? idleMotion : undefined}
      data-face-left={Math.cos(azimuth * radians) < -0.01 ? '' : undefined}
      title={label}
      role="img"
      aria-label={label}
      style={{
        '--vessel-color': cfg.color,
        '--stack-x': `${x * 96}%`,
        '--stack-y': `${y * (is3D ? 72 : 96)}%`,
      } as React.CSSProperties}
    >
      {is3D
        ? <TokenModel token={player.token} cameraOrbit={`${azimuth}deg ${camera.tilt}deg auto`} idle={idle} exposure={exposure} />
        : <Icon strokeWidth={2.2} aria-hidden="true" />}
      <span className="chart-pawn-heading" aria-hidden="true"
        style={{ transform: `matrix(${cos}, ${sin}, ${-sin}, ${cos}, 0, 0)` }} />
      {children}
    </span>
  );
};
