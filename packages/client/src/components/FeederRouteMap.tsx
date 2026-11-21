import { useId, useMemo } from 'react';
import type { PortGuide } from './ports/portGuide.js';
import { voyageRoute } from './ports/voyageRoute.js';
import './feeder-route-map.css';

interface Props { origin: PortGuide; destination: PortGuide; distanceNm: number; is3D: boolean }
interface Point { x: number; y: number }
const number = new Intl.NumberFormat('vi-VN');
const bound = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const center = { x: 240, y: 112 };

function HarborLabel({ port, at, other, departing }: { port: PortGuide; at: Point; other: Point; departing?: boolean }) {
  const side = at.x < other.x || (at.x === other.x && departing) ? -1 : 1;
  const above = at.y < other.y || (at.y === other.y && departing);
  const x = bound(at.x + 49 * side, 36, 444);
  const y = bound(at.y + (above ? -25 : 25), 24, 200);
  return <g className={departing ? 'feeder-map-from' : 'feeder-map-to'}>
    <path d={`M${at.x} ${at.y} L${x - 21 * side} ${y} H${x}`} className="feeder-map-leader" />
    <rect x={x - 28} y={y - 10} width="56" height="20" rx="3" />
    <text x={x} y={y + 4} textAnchor="middle">{port.code}</text>
  </g>;
}

function MooredShip({ is3D }: { is3D: boolean }) {
  // Local bow at (0, 0), exactly on the departure pin. The hull stays on the
  // opposite side of the pin from the proposed course, including on short legs.
  return is3D ? <g className="feeder-map-model">
    <path d="M-29 1 -19 8 -7 6 0 0 -7 8 -20 11 -30 5Z" fill="#1a3645" />
    <path d="M-29 5 -20 10 -7 7 -4 5 -7 9 -20 12 -29 7Z" fill="#9e3156" />
    <path d="M-30 1 -23 -5 -8 -6 0 0 -8 5 -20 7Z" fill="#e4b285" />
    <path d="m-26 -1 5 3 4 -3 -4 -3Z" fill="#466c75" /><path d="m-26 -1 5 3v-4l-5 -3Z" fill="#eee6ce" />
    <path d="m-21 2 4 -3v-4l-4 3Z" fill="#91afa7" /><path d="m-26 -5 5 3 4 -3 -5 -3Z" fill="#f6e9cc" />
    <path d="m-17 -3 4 2 4 -3 -4 -2Z M-14 2l4 2 4 -3 -4 -2Z" fill="#b44e73" />
    <path d="m-17 -3 4 2v3l-4 -2Z M-14 2l4 2v2l-4 -2Z" fill="#712e51" />
    <path d="m-13 -1 4 -3v3l-4 3Z M-10 4l4 -3v2l-4 3Z" fill="#82365f" />
  </g> : <g className="feeder-map-model">
    <path d="M0 0 -8 -5 -26 -5 -30 -3 -30 3 -26 5 -8 5Z" fill="#234b56" />
    <path d="m-4 0 -6 -3h-16v6h16Z" fill="#ddd1a5" />
    <path d="M-26 -4h5v8h-5Z" fill="#fff6df" />
    <path d="M-19 -3h5v6h-5Zm7 0h4v6h-4Z" fill="#9d3563" />
    <path d="M-27 -2h2v4h-2Z" fill="#557d83" />
  </g>;
}

export function FeederRouteMap({ origin, destination, distanceNm, is3D }: Props) {
  const route = useMemo(() => voyageRoute(origin, destination), [origin, destination]);
  const id = useId();
  const scale = Math.min(80, route.scale);
  const zoom = scale / route.scale;
  const project = (p: Point) => ({ x: center.x + (p.x - center.x) * zoom, y: center.y + (p.y - center.y) * zoom });
  const from = project(route.points[0]), to = project(route.points[route.points.length - 1]);
  const world = project({ x: route.left, y: route.top });
  const step = [.25, .5, 1, 2, 5, 10].find(degrees => degrees * scale >= 32) ?? 10;
  const compass = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  // Keep an axonometric ship upright, even on a southbound or westbound route.
  const shipTransform = is3D
    ? `scale(${to.x < from.x ? -1 : 1} 1) rotate(${bound(Math.atan2(to.y - from.y, Math.abs(to.x - from.x)) * 180 / Math.PI, -18, 18)})`
    : `rotate(${compass})`;
  const midX = (center.x - world.x) / scale, midY = (center.y - world.y) / scale;
  const detail = distanceNm < 100;
  const middle = project(route.points[Math.floor(route.points.length / 2)]);
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const labelSide = to.y > from.y ? 1 : -1;
  const labelX = (to.y - from.y) * labelSide / length, labelY = (from.x - to.x) * labelSide / length;
  const nmPerPx = 60 * Math.cos((origin.latitude + destination.latitude) * Math.PI / 360) / scale;
  const scaleMiles = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(miles => miles / nmPerPx >= 28) ?? 500;
  const scaleLength = scaleMiles / nmPerPx;
  const svgWorld = <image href="/images/world-atlas.svg" width="360" height="180" />;

  return <svg className="feeder-route-map" viewBox="0 0 480 224" role="img" data-feeder-map
    data-origin={origin.code} data-destination={destination.code}
    aria-label={`Dự kiến nối cảng từ ${origin.name} (${origin.code}) đến ${destination.name} (${destination.code}), ${number.format(distanceNm)} hải lý. Tàu đang ở ${origin.name}.`}>
    <defs>
      <pattern id={id + '-grid'} width={step * scale} height={step * scale} x={world.x} y={world.y} patternUnits="userSpaceOnUse">
        <path d={`M${step * scale} 0H0V${step * scale}`} fill="none" stroke="#5b8781" strokeWidth=".7" opacity=".55" />
      </pattern>
      <linearGradient id={id + '-sea'} x2=".75" y2="1"><stop stopColor="#d5e9df" /><stop offset="1" stopColor="#a4d0c9" /></linearGradient>
      {detail && <filter id={id + '-shore'} filterUnits="userSpaceOnUse" x="0" y="0" width="480" height="224" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius=".8" result="edge" />
        <feFlood floodColor="#6c8b7c" /><feComposite in2="edge" operator="in" result="shore" />
        <feFlood floodColor="#e5dfbf" /><feComposite in2="SourceAlpha" operator="in" />
        <feMerge><feMergeNode in="shore" /><feMergeNode /></feMerge>
      </filter>}
      <mask id={id + '-trace'} maskUnits="userSpaceOnUse" x="-12" y="-12" width="504" height="248">
        <path key={origin.code + destination.code} d={route.path} pathLength="1" className="feeder-map-trace" />
      </mask>
    </defs>
    <rect width="480" height="224" fill={`url(#${id}-sea)`} />
    <g filter={detail ? `url(#${id}-shore)` : undefined}>
      <g transform={`translate(${world.x} ${world.y}) scale(${scale})`}>
        {route.mapOffsets.map(offset => <g key={offset} transform={`translate(${offset} 0)`}>{svgWorld}</g>)}
      </g>
    </g>
    <rect width="480" height="224" fill={`url(#${id}-grid)`} />
    <g transform={`translate(240 112) scale(${zoom}) translate(-240 -112)`} mask={`url(#${id}-trace)`}>
      <path d={route.path} fill="none" stroke="#fff6dd" strokeWidth="4.4" vectorEffect="non-scaling-stroke" />
      <path d={route.path} data-feeder-course fill="none" stroke="#98315f" strokeWidth="2.25"
        strokeDasharray="5 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </g>
    <HarborLabel port={origin} at={from} other={to} departing />
    <HarborLabel port={destination} at={to} other={from} />
    <g transform={`translate(${to.x} ${to.y})`}><path d="M0 -6 6 0 0 6 -6 0Z" fill="#fff6de" stroke="#9b315e" strokeWidth="2" />
      <circle r="1.8" fill="#94315d" /></g>
    <circle cx={from.x} cy={from.y} r="4.2" fill="#214954" stroke="#fff8df" strokeWidth="1.4" />
    <g data-feeder-ship={is3D ? '3d' : '2d'} transform={`translate(${from.x} ${from.y}) ${shipTransform}`}><MooredShip is3D={is3D} /></g>
    <text className="feeder-map-distance" x={middle.x + labelX * 13} y={middle.y + labelY * 16 + 3}
      textAnchor={labelX > .45 ? 'start' : 'middle'}>{number.format(distanceNm)} hải lý</text>
    <g className="feeder-map-north" transform="translate(15 12)">
      <path d="M7 1 13 19 7 15 1 19Z" fill="#f8f5df" stroke="#34585c" /><path d="M7 1V15L1 19Z" fill="#34585c" />
      <text x="7" y="30" textAnchor="middle">B</text>
    </g>
    {detail && <svg x="12" y="145" width="102" height="67" viewBox="0 0 102 67" className="feeder-map-inset">
      <title>Vị trí hai cảng trên bản đồ khu vực</title>
      <rect width="102" height="67" fill="#b6d8ce" />
      <g transform={`translate(${51 - midX * 8} ${32 - midY * 8}) scale(8)`}>
        {route.mapOffsets.map(offset => <g key={offset} transform={`translate(${offset} 0)`}>{svgWorld}</g>)}
      </g>
      <circle cx="51" cy="32" r="5" fill="none" stroke="#a03160" strokeWidth="1.5" />
      <circle cx="51" cy="32" r="1.5" fill="#8c204e" />
      <rect x=".75" y=".75" width="100.5" height="65.5" fill="none" stroke="#5b7972" strokeWidth="1.5" />
    </svg>}
    <g className="feeder-map-scale" transform="translate(467 211)">
      <path d={`M${-scaleLength} -4V0H0V-4`} fill="none" stroke="#385e5c" strokeWidth="1.5" />
      <text x={-scaleLength / 2} y="-6" textAnchor="middle">{scaleMiles} hl</text>
    </g>
  </svg>;
}
