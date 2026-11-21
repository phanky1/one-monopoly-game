import { atlasPoint, atlasWidth, unwrapAtlasX, type GeographicPoint } from './atlasGeometry.js';

const radians = Math.PI / 180;
const frameWidth = 480;
const frameHeight = 224;

function unitVector(point: GeographicPoint) {
  const latitude = point.latitude * radians;
  const longitude = point.longitude * radians;
  return [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
}

// The same great-circle geometry used for quoted mileage. It illustrates the two
// cargo ports, even when the player called at intermediate ports during the booking.
export function voyageWaypoints(origin: GeographicPoint, destination: GeographicPoint) {
  const a = unitVector(origin), b = unitVector(destination);
  const arc = Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, c, i) => sum + c * b[i], 0))));
  const sinArc = Math.sin(arc);
  let previous = atlasPoint(origin).x;
  return Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
    const w = sinArc > 1e-8 ? Math.sin((1 - t) * arc) / sinArc : 1 - t;
    const v = sinArc > 1e-8 ? Math.sin(t * arc) / sinArc : t;
    const [x, y, z] = a.map((n, j) => w * n + v * b[j]);
    const point = atlasPoint({
      latitude: Math.atan2(z, Math.hypot(x, y)) / radians,
      longitude: Math.atan2(y, x) / radians,
    });
    point.x = unwrapAtlasX(point.x, previous);
    previous = point.x;
    return point;
  });
}

export function voyageRoute(origin: GeographicPoint, destination: GeographicPoint) {
  const points = voyageWaypoints(origin, destination);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((frameWidth - 122) / Math.max(1.5, maxX - minX), (frameHeight - 70) / Math.max(1, maxY - minY));
  const left = frameWidth / 2 - (minX + maxX) * scale / 2;
  const top = frameHeight / 2 - (minY + maxY) * scale / 2;
  const screen = points.map(p => ({ x: left + p.x * scale, y: top + p.y * scale }));
  // A trans-Pacific frame can straddle either edge of the Natural Earth artwork.
  const mapOffsets = [-atlasWidth, 0, atlasWidth].filter(x => left + x * scale < frameWidth && left + (x + atlasWidth) * scale > 0);
  return { left, top, scale, points: screen, mapOffsets, path: screen.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') };
}
