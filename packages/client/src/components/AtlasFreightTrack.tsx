import { useMemo } from 'react';
import type { PortGuide } from './ports/portGuide.js';
import { getAtlasFreightWaypoints } from './ports/atlasFreightGeometry.js';

interface Point { x: number; y: number }
interface Props {
  origin: PortGuide;
  destination: PortGuide;
  camera: Point & { scale: number };
  mapHeight: number;
}

function PortMarker({ port, point, isOrigin, labelLeft }: { port: PortGuide; point: Point; isOrigin: boolean; labelLeft: boolean }) {
  const color = isOrigin ? '#17645f' : '#8c255c';
  const x = labelLeft ? -43 : 8;
  return <g transform={`translate(${point.x} ${point.y})`}
    data-atlas-route-origin={isOrigin ? port.code : undefined}
    data-atlas-route-destination={isOrigin ? undefined : port.code}>
    <title>{isOrigin ? 'Cảng xếp' : 'Cảng đến'} · {port.name}, {port.country}</title>
    {isOrigin
      ? <g><rect x="-5" y="-4" width="10" height="8" rx="1" fill={color} stroke="#fff9e8" strokeWidth="1.5" />
        <path d="M-2 -2v4M1 -2v4" stroke="#d6ecda" strokeWidth="1" /></g>
      : <circle r="4.6" fill={color} stroke="#fff9e8" strokeWidth="1.7" />}
    <rect x={x} y="-6" width="35" height="12" rx="2" fill={color} stroke="#fff6df" strokeWidth=".8" />
    <text x={x + 17.5} y="2.55" className="world-atlas-pin-code">{port.code}</text>
  </g>;
}

export function AtlasFreightTrack({ origin, destination, camera, mapHeight }: Props) {
  const route = useMemo(() => getAtlasFreightWaypoints(origin, destination), [origin, destination]);
  const points = route.map(point => ({
    x: 180 + (point.x - camera.x) * camera.scale, y: mapHeight / 2 + (point.y - camera.y) * camera.scale,
  }));
  const path = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const originPoint = points[0], destinationPoint = points.at(-1)!;
  const middle = Math.floor(points.length / 2);
  const tip = points[middle], tangent = points[middle + 1];
  const angle = Math.atan2(tangent.y - tip.y, tangent.x - tip.x) * 180 / Math.PI;
  const labelLeft = originPoint.x <= destinationPoint.x;
  return <g data-atlas-freight-track aria-hidden="true">
    <path d={path} fill="none" stroke="#fff7e1" strokeWidth="3.2" />
    <path data-atlas-route-line d={path} fill="none" stroke="#156966" strokeWidth="1.6" strokeDasharray="4 2" />
    {Math.hypot(destinationPoint.x - originPoint.x, destinationPoint.y - originPoint.y) > 25 &&
      <path transform={`translate(${tip.x} ${tip.y}) rotate(${angle})`} d="M-3.4 -2.8L2.5 0L-3.4 2.8Z"
        fill="#155c5b" stroke="#fff9e8" strokeWidth=".6" />}
    <PortMarker port={origin} point={originPoint} isOrigin labelLeft={labelLeft} />
    <PortMarker port={destination} point={destinationPoint} isOrigin={false} labelLeft={!labelLeft} />
  </g>;
}
