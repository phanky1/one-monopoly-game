import { TERRAIN_RANGES } from './terrainMesh.js';

// Hypsometric tints share one scale across the chart, including the low coastal hills.
const elevationTints = ['#b2bf94', '#a5b28a', '#c8b78b', '#dbc59c', '#f0e2bd'];
const chartSummit = Math.max(...TERRAIN_RANGES.flatMap(range => range.vertices.map(point => point.z)));

function polygonPoints(points: readonly { x: number; y: number }[]) {
  return points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

export function ChartTerrainContours() {
  return (
    <g className="chart-terrain-contours" strokeLinejoin="round" aria-hidden="true">
      {TERRAIN_RANGES.map(range => {
        const summit = range.vertices.reduce((highest, vertex) => vertex.z > highest.z ? vertex : highest);
        return (
          <g key={range.id} data-terrain-range={range.id}>
            <polygon points={polygonPoints(range.footprint)} fill="#c6cba9" stroke="#879c80" strokeWidth=".85" />
            {range.contours.map((contour, index) => {
              const band = Math.min(elevationTints.length - 1, Math.floor(contour.elevation / chartSummit * elevationTints.length));
              return <polygon key={index} points={polygonPoints(contour.points)} fill={elevationTints[band]}
                stroke="#71856a" strokeWidth=".85" strokeOpacity=".9" />;
            })}
            <path transform={`translate(${summit.x} ${summit.y})`} d="m0-2.7 2.7 4.7h-5.4z"
              fill="#f8edc9" stroke="#425f54" strokeWidth="1" />
          </g>
        );
      })}
    </g>
  );
}
