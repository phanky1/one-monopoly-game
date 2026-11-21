export interface GeographicPoint { latitude: number; longitude: number }
export const atlasWidth = 360;

export function atlasPoint(point: GeographicPoint) {
  return { x: point.longitude + 180, y: 90 - point.latitude };
}

// Choose the copy of the point nearest its neighbor on the continuous world chart.
export function unwrapAtlasX(x: number, near: number) {
  return x + atlasWidth * Math.round((near - x) / atlasWidth);
}
