import { atlasPoint, atlasWidth, type GeographicPoint } from './atlasGeometry.js';
import { voyageWaypoints } from './voyageRoute.js';

export function getAtlasFreightWaypoints(origin: GeographicPoint, destination: GeographicPoint) {
  const points = voyageWaypoints(origin, destination);
  // The arrival camera starts on the destination's copy of the map, including at the date line.
  const shift = atlasWidth * Math.round((atlasPoint(destination).x - points.at(-1)!.x) / atlasWidth);
  return shift === 0 ? points : points.map(point => ({ x: point.x + shift, y: point.y }));
}

export function getAtlasFreightCamera(origin: GeographicPoint, destination: GeographicPoint, mapHeight: number, tilted: boolean) {
  const points = getAtlasFreightWaypoints(origin, destination);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const west = Math.min(...xs), east = Math.max(...xs), north = Math.min(...ys), south = Math.max(...ys);
  // The tilted chart shares its upper and lower edges with its caption and controls.
  const frameWidth = tilted ? 142 : 258;
  const frameHeight = tilted ? mapHeight * .13 : Math.max(12, mapHeight - 35);
  const scale = Math.min(100, frameWidth / Math.max(.01, east - west), frameHeight / Math.max(.01, south - north));
  // On a tilted board the freight caption takes more space than the heading.
  const centerY = (north + south) / 2 + (tilted ? 6 / scale : 0);
  return { x: (west + east) / 2, y: centerY, scale };
}
