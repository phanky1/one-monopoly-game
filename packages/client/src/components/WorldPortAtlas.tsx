import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Crosshair, Dices, Globe2, Navigation, Waypoints, X } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { portGuide, type PortArrival, type PortGuide } from './ports/portGuide.js';
import { atlasPoint, atlasWidth as worldWidth, unwrapAtlasX } from './ports/atlasGeometry.js';
import type { HarborAtlasRoute } from './ports/harborAtlasRoute.js';
import { getAtlasFreightCamera } from './ports/atlasFreightGeometry.js';
import { AtlasFreightTrack } from './AtlasFreightTrack.js';
import './world-port-atlas.css';

// The coastline asset uses the same equirectangular WGS84 projection.
const harborScale = 14;
const ports = Object.values(portGuide);
const world = { x: 180, y: 90, scale: 1 };
type Camera = typeof world;
type Label = readonly [string, number, number];

const continents: readonly Label[] = [
  ['BẮC MỸ', -105, 49], ['NAM MỸ', -60, -15], ['CHÂU ÂU', 23, 54],
  ['CHÂU PHI', 18, 7], ['CHÂU Á', 85, 46], ['CHÂU ĐẠI DƯƠNG', 135, -25],
];
const countries: readonly Label[] = [
  ['Việt Nam', 107.8, 14.5], ['Thái Lan', 101, 16], ['Campuchia', 104.7, 12.6],
  ['Malaysia', 102.6, 4.3], ['Indonesia', 113, -7.3], ['Trung Quốc', 111, 30],
  ['Nhật Bản', 139.1, 37.7], ['Hàn Quốc', 127.8, 36.5], ['Philippines', 122.1, 12.8],
  ['Ấn Độ', 77.2, 22.3], ['Pakistan', 68.8, 28.6], ['Oman', 56.4, 20.4],
  ['UAE', 54.1, 23.8], ['Ả Rập Xê Út', 44.4, 24.3], ['Iran', 53.2, 32.6],
  ['Tây Ban Nha', -3.9, 40.4], ['Pháp', 2, 46.7], ['Ý', 12.7, 43],
  ['Đức', 10.6, 51.2], ['Anh', -1.8, 53.1], ['Ba Lan', 19.3, 52.1],
  ['Hà Lan', 5.5, 52.3], ['Thụy Điển', 15.5, 60.2], ['Hy Lạp', 22.1, 39.8],
  ['Thổ Nhĩ Kỳ', 34.5, 39.1], ['Ai Cập', 29.6, 26.6], ['Algeria', 3.3, 28.4],
  ['Hoa Kỳ', -100, 38.5], ['Canada', -104, 55.4], ['Mexico', -103, 24.2],
  ['Brazil', -51.5, -14.3], ['Argentina', -64.3, -35.7], ['Chile', -71, -32.8],
  ['Peru', -74.4, -9.2], ['Colombia', -73.1, 5], ['Panama', -80.6, 8.4],
  ['Australia', 134.3, -25.5],
];

function coordinates(port: PortGuide) {
  const lat = Math.abs(port.latitude).toFixed(2);
  const lon = Math.abs(port.longitude).toFixed(2);
  return `${lat}°${port.latitude < 0 ? 'S' : 'N'} · ${lon}°${port.longitude < 0 ? 'W' : 'E'}`;
}

interface Props {
  arrival: PortArrival;
  is3D: boolean;
  onClose: () => void;
  onOpenDeed?: () => void;
  dice?: readonly number[];
  focusTerminalOnArrival?: boolean;
  harborRoute?: HarborAtlasRoute | null;
  onOpenHarborFreight?: () => void;
  freight?: {
    status: string; actionLabel: string; onOpenTerminal: () => void;
    feeder?: { stops: { tileId: number; code: string; distanceNm: number }[]; open: (tileId?: number) => void };
  };
}

export function WorldPortAtlas(props: Props) {
  return <AtlasArrival key={props.arrival.id} {...props} />;
}

function CargoRouteSummary({ route, paidRent, openDesk }: { route: HarborAtlasRoute; paidRent?: number; openDesk?: () => void }) {
  const { origin, destination, quote } = route;
  const available = route.kind === 'available';
  return <div className="world-atlas-cargo-summary" data-atlas-cargo-summary={route.kind}>
    <div className="world-atlas-cargo-ports">
      <span><b>{origin.name}</b>{origin.country !== origin.name && <small>{origin.country}</small>}</span>
      <ArrowRight aria-label="đến" role="img" />
      <span><b>{destination.name}</b>{destination.country !== destination.name && <small>{destination.country}</small>}</span>
    </div>
    <div className="world-atlas-cargo-terms">
      <b>{available ? 'Cước nếu dỡ hàng' : 'Cước đã thanh toán'}</b>
      {openDesk && <button type="button" className="world-atlas-deed" data-atlas-cargo-desk
        aria-controls="harbor-freight-desk" onClick={openDesk}>{available ? 'Vận tải cảng' : 'Xem biên lai'}<ChevronRight aria-hidden="true" /></button>}
      <span>Cước tàu ({route.playerName}) <strong data-atlas-cargo-net={quote.carrierNet}>${quote.carrierNet}M</strong>
        {' · Phí bến'}{quote.operatorName && ` (${quote.operatorName})`}{' '}
        <strong data-atlas-cargo-fee={quote.handlingFee}>${quote.handlingFee}M</strong></span>
      {paidRent !== undefined && <span>Tiền thuê đã trả <strong data-atlas-cargo-rent={paidRent}>${paidRent}M</strong></span>}
    </div>
  </div>;
}

function AtlasArrival({ arrival, is3D, onClose, onOpenDeed, dice, freight, focusTerminalOnArrival, harborRoute, onOpenHarborFreight }: Props) {
  const { port, origin } = arrival;
  const focus = atlasPoint(port);
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<'port' | 'world' | 'cargo'>('port');
  const overview = view === 'world';
  const route = view === 'cargo' ? harborRoute : null;
  const [camera, setCamera] = useState<Camera>(() => reduceMotion ? { ...focus, scale: harborScale } : world);
  const currentCamera = useRef(camera);
  const map = useRef<SVGSVGElement>(null);
  const overviewButton = useRef<HTMLButtonElement>(null);
  const terminalButton = useRef<HTMLButtonElement>(null);
  const routeButton = useRef<HTMLButtonElement>(null);
  const routeBack = useRef<HTMLButtonElement>(null);
  const requestedFocus = useRef<'port' | 'cargo' | null>(null);
  const [mapSize, setMapSize] = useState({ height: 180, overviewScale: 1 });
  const { height: mapHeight, overviewScale } = mapSize;

  useEffect(() => {
    if (focusTerminalOnArrival && !document.hidden && !document.querySelector('dialog[open]') &&
        (document.activeElement === document.body || document.activeElement?.matches('[data-desk-feeder-chart], [data-atlas-feeder]'))) {
      terminalButton.current?.focus({ preventScroll: true });
    }
  }, [focusTerminalOnArrival]);

  useEffect(() => {
    if (arrival.playerName) return;
    const frame = requestAnimationFrame(() => overviewButton.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [arrival.id, arrival.playerName]);

  useEffect(() => {
    if (view !== 'cargo' || harborRoute) return;
    setView('port');
    if (document.activeElement === document.body) overviewButton.current?.focus({ preventScroll: true });
  }, [view, harborRoute]);

  function toggleRoute(open: boolean) {
    const next = open ? 'cargo' : 'port';
    requestedFocus.current = next;
    setView(next);
  }

  useLayoutEffect(() => {
    if (view !== requestedFocus.current) return;
    requestedFocus.current = null;
    (view === 'cargo' ? routeBack : routeButton).current?.focus({ preventScroll: true });
  }, [view]);

  useLayoutEffect(() => {
    const el = map.current;
    if (!el) return;
    const resize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      const height = worldWidth * el.clientHeight / el.clientWidth;
      const styles = getComputedStyle(el);
      const radians = (cssVariable: string) =>
        is3D ? parseFloat(styles.getPropertyValue(cssVariable)) * Math.PI / 180 : 0;
      const yaw = radians('--board-yaw');
      const stretch = 1 / Math.cos(radians('--board-tilt'));
      // Fit the entire north-up world inside the projected chart, including its corners.
      const widthNeeded = worldWidth * Math.abs(Math.cos(yaw)) + 180 * stretch * Math.abs(Math.sin(yaw));
      const heightNeeded = worldWidth * Math.abs(Math.sin(yaw)) + 180 * stretch * Math.abs(Math.cos(yaw));
      setMapSize({ height, overviewScale: Math.min(1, worldWidth / widthNeeded, height / heightNeeded) });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [is3D]);

  const cargoOrigin = route?.origin, cargoDestination = route?.destination;
  const routeCamera = useMemo(() => cargoOrigin && cargoDestination
    ? getAtlasFreightCamera(cargoOrigin, cargoDestination, mapHeight, is3D) : null, [cargoOrigin, cargoDestination, mapHeight, is3D]);
  const target = routeCamera ?? (overview ? { ...world, scale: overviewScale } : { ...focus, scale: harborScale });
  const { x: targetX, y: targetY, scale: targetScale } = target;
  useEffect(() => {
    const target = { x: targetX, y: targetY, scale: targetScale };
    const start = currentCamera.current;
    if (start.x === target.x && start.y === target.y && start.scale === target.scale) return;
    const apply = (next: Camera) => { currentCamera.current = next; setCamera(next); };
    if (reduceMotion) { apply(target); return; }
    const startingAt = performance.now();
    let frame = 0;
    const move = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - startingAt) / 1050));
      if (t === 1) { apply(target); return; }
      const ease = t * t * (3 - 2 * t);
      apply({
        x: start.x + (target.x - start.x) * ease,
        y: start.y + (target.y - start.y) * ease,
        scale: start.scale * (target.scale / start.scale) ** ease,
      });
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, targetX, targetY, targetScale]);

  const project = (x: number, y: number) => ({
    x: (x - camera.x) * camera.scale + 180,
    y: (y - camera.y) * camera.scale + mapHeight / 2,
  });
  const marker = project(focus.x, focus.y);
  const from = !route && origin && origin.code !== port.code ? atlasPoint(origin) : null;
  // Unwrap the preceding port across the date line for trans-Pacific passages.
  if (from) from.x = unwrapAtlasX(from.x, focus.x);
  const labels: { name: string; x: number; y: number }[] = [];
  const cargoMarkers = route && [route.origin, route.destination].map(port =>
    project(unwrapAtlasX(port.longitude + 180, camera.x), 90 - port.latitude));
  const regional = camera.scale > 2.5;
  for (const [name, longitude, latitude] of regional ? countries : continents) {
    const point = project(route ? unwrapAtlasX(longitude + 180, camera.x) : longitude + 180, 90 - latitude);
    if (point.x < 13 || point.x > 347 || point.y < 10 || point.y > mapHeight - 5) continue;
    if (Math.abs(point.x - marker.x) < name.length * 2.1 + 7 && Math.abs(point.y - marker.y) < 9) continue;
    // Leave both UN/LOCODE tags legible at either end of a cargo route.
    if (cargoMarkers?.some(pin => Math.abs(point.x - pin.x) < name.length * 2.1 + 44 &&
        Math.abs(point.y - pin.y) < 14)) continue;
    if (labels.some(other => Math.abs(other.x - point.x) < (other.name.length + name.length) * 2.1 + 3 &&
          Math.abs(other.y - point.y) < 10)) continue;
    labels.push({ name, ...point });
  }
  return (
    <section className={`world-port-atlas${is3D ? ' world-port-atlas-tilted' : ''}`}
      aria-label={`Hải đồ cảng ${port.name}`} data-port-code={port.code}
      data-view={route ? 'cargo' : overview ? 'world' : 'port'} data-latitude={port.latitude} data-longitude={port.longitude}
      data-has-freight={freight ? '' : undefined}
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        const atlas = event.currentTarget;
        if (!atlas.contains(event.target as Node) || atlas.ownerDocument.querySelector('dialog[open]')) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}>
      <div className="world-atlas-sheet">
        <header className="world-atlas-heading">
          <div>
            {overview
              ? <h3>Bản đồ thế giới</h3>
              : route ? <>
                <span className="world-atlas-arrival">{route.quote.distanceNm.toLocaleString('vi-VN')} hải lý</span>
                <h3>Tuyến lô hàng</h3>
              </> : <>
                <span className="world-atlas-arrival">{arrival.playerName ? `${arrival.playerName} · Cập cảng` : 'Hải đồ cảng'}</span>
                <h3>{port.name} <span>{port.country}</span></h3>
              </>}
          </div>
          <nav aria-label="Điều khiển hải đồ">
            {route && <button type="button" ref={routeBack} className="world-atlas-toggle" data-atlas-cargo-back
              aria-label={`Về cảng ${port.name}`} title={`Về cảng ${port.name}`} onClick={() => toggleRoute(false)}>
              <Crosshair aria-hidden="true" /><span>Về cảng</span>
            </button>}
            <button ref={overviewButton} type="button" className="world-atlas-toggle" onClick={() => setView(overview ? 'port' : 'world')}
              aria-label={overview ? `Quay lại cảng ${port.name}` : 'Xem bản đồ thế giới'}>
              {overview ? <Crosshair aria-hidden="true" /> : <Globe2 aria-hidden="true" />}
              {!route && <span>{overview ? 'Về cảng' : 'Toàn cầu'}</span>}
            </button>
            <button type="button" className="world-atlas-close" onClick={onClose}
              aria-label="Trở về bàn cờ" title="Trở về bàn cờ"><X aria-hidden="true" /></button>
          </nav>
        </header>
        <div className="world-atlas-map-window">
          <svg ref={map} className="world-atlas-map" viewBox={`0 0 360 ${mapHeight}`}
            data-camera-x={camera.x} data-camera-y={camera.y} data-camera-scale={camera.scale}
            role="img" aria-label={route
              ? `Lô hàng từ ${route.origin.name}, ${route.origin.country} đến ${port.name}, ${port.country}`
              : `Vị trí ${port.name}, ${port.country}. ${coordinates(port)}`}>
            <defs>
              <pattern id="world-atlas-grid" width="15" height="15" patternUnits="userSpaceOnUse">
                <path d="M15 0H0V15" fill="none" stroke="#608d93" strokeWidth={.65 / camera.scale} opacity=".5" />
              </pattern>
            </defs>
            <g className="world-atlas-geography">
              <g transform={`translate(180 ${mapHeight / 2}) scale(${camera.scale}) translate(${-camera.x} ${-camera.y})`}>
                {(route || camera.scale > 1 ? [-360, 0, 360] : [0]).map(offset => (
                  <g key={offset} transform={`translate(${offset} 0)`}>
                    <image href="/images/world-atlas.svg" width="360" height="180" />
                    <rect width="360" height="180" fill="url(#world-atlas-grid)" />
                    {from && <path d={`M${from.x} ${from.y}L${focus.x} ${focus.y}`} stroke="#9c3460"
                      fill="none" strokeDasharray="3 3" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />}
                    {ports.filter(other => other.code !== port.code && other.code !== route?.origin.code).map(other => (
                      <circle key={other.code} cx={other.longitude + 180} cy={90 - other.latitude}
                        r={1.5 / camera.scale} fill="#376a73" stroke="#f6f5dc" strokeWidth={.55 / camera.scale} />
                    ))}
                  </g>
                ))}
              </g>
              <g className={regional ? 'world-atlas-countries' : 'world-atlas-continents'} aria-hidden="true">
                {labels.map(label => <text key={label.name} x={label.x} y={label.y}>{label.name}</text>)}
              </g>
              {!overview && regional && freight?.feeder?.stops.map(stop => {
                const other = portGuide[stop.code];
                const point = project(unwrapAtlasX(other.longitude + 180, camera.x), 90 - other.latitude);
                if (point.x < 7 || point.x > 353 || point.y < 7 || point.y > mapHeight - 7) return null;
                const dx = point.x - marker.x, dy = point.y - marker.y;
                const distance = Math.hypot(dx, dy);
                const lift = distance > 0 && distance < 14 ? 14 / distance : 1;
                const x = marker.x + dx * lift, y = marker.y + dy * lift;
                return <g key={stop.code} className="world-atlas-feeder-pin" aria-hidden="true"
                  data-atlas-feeder-pin={stop.tileId} onClick={() => freight.feeder?.open(stop.tileId)}>
                  <title>{other.name} · {stop.distanceNm} hải lý</title>
                  {lift > 1 && <path d={`M${point.x} ${point.y}L${x} ${y}`} stroke="#326b73" />}
                  <circle cx={x} cy={y} r="7" fill="transparent" />
                  <circle cx={x} cy={y} r="3.5" fill="#f6f3da" stroke="#23616b" strokeWidth="1.5" />
                  <circle cx={x} cy={y} r="1.3" fill="#23616b" />
                </g>;
              })}
              {route ? <AtlasFreightTrack origin={route.origin} destination={route.destination} camera={camera} mapHeight={mapHeight} />
                : <g className="world-atlas-destination" transform={`translate(${marker.x} ${marker.y})`} aria-hidden="true">
                <circle r="7.5" fill="#a5195b" opacity=".16" />
                <circle r="3.8" fill="#ac185f" stroke="#fffaf0" strokeWidth="1.3" />
                <g transform="translate(6 -12)">
                  <rect width="32" height="12" rx="2" fill="#792148" stroke="#fff7e8" strokeWidth=".75" />
                  <text x="16" y="8.4" className="world-atlas-pin-code">{port.code}</text>
                </g>
              </g>}
            </g>
          </svg>
        </div>
        <footer className="world-atlas-caption">
          {route ? <CargoRouteSummary route={route} paidRent={arrival.paidRent} openDesk={onOpenHarborFreight} /> : <>
          <div className="world-atlas-meta">
            <span className="world-atlas-coordinates">{coordinates(port)}</span>
            {dice && dice.length === 2 && <span className="world-atlas-roll"
              aria-label={`Lần gieo vừa rồi: ${dice[0]} và ${dice[1]}${dice[0] === dice[1] ? ', gieo đôi' : ''}`}>
              <Dices aria-hidden="true" />{dice[0]} + {dice[1]}
            </span>}
            {!overview && harborRoute && <button type="button" ref={routeButton} data-atlas-cargo-route
              className="world-atlas-deed world-atlas-cargo-toggle" onClick={() => toggleRoute(true)}>
              <Waypoints aria-hidden="true" />Tuyến lô hàng
            </button>}
            {onOpenDeed && <button type="button" className="world-atlas-deed" data-atlas-deed
              aria-haspopup="dialog" aria-label={`Xem sổ cảng ${port.name}`} onClick={onOpenDeed}>
              Sổ cảng<ChevronRight aria-hidden="true" />
            </button>}
          </div>
          <p>{overview ? `${port.name} · ${port.country}` : port.fact}</p>
          </>}
          {freight && <div className="world-atlas-freight" data-atlas-freight>
            <span role="status" aria-atomic="true">{freight.status}</span>
            {freight.feeder && <button type="button" className="world-atlas-feeder-open" data-atlas-feeder aria-haspopup="dialog"
              aria-label={`So sánh ${freight.feeder.stops.length} cảng nối chuyến`} onClick={() => freight.feeder?.open()}>
              <Navigation aria-hidden="true" />Nối chuyến
            </button>}
            <button ref={terminalButton} type="button" data-atlas-terminal onClick={freight.onOpenTerminal}>
              {freight.actionLabel}<ChevronRight aria-hidden="true" />
            </button>
          </div>}
        </footer>
      </div>
    </section>
  );
}
