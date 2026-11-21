import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardLighting } from './boardLighting.js';
import { TERRAIN_RANGES, type TerrainVertex } from './terrainMesh.js';
import './terrain-relief.css';

const chartUnits = 480;

const ranges = TERRAIN_RANGES.map(range => ({
  id: range.id,
  faces: range.faces.map((face, index) => {
    const [ia, ib, ic] = face.indices;
    const a = range.vertices[ia], b = range.vertices[ib], c = range.vertices[ic];
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    return {
      index, snow: face.snow, vertices: [a, b, c] as const,
      center: { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 },
      normal: { x: nx / length, y: ny / length, z: nz / length },
    };
  }),
}));

type Face = (typeof ranges)[number]['faces'][number];

function rgb(r: number, g: number, b: number) {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}

function faceColor(face: Face, sky: BoardLighting): string {
  const moon = sky.body === 'moon';
  const directLight = Math.min(1, sky.shadowOpacity / (moon ? .32 : .44));
  const cloud = 1 - directLight;
  // The long shadows of dawn and dusk coincide with a more oblique light.
  const lightZ = sky.phase === 'day' || sky.phase === 'midnight' ? 1.35 : .58;
  const { x, y, z } = face.normal;
  const light = (x * sky.sourceX + y * sky.sourceY + z * lightZ) / Math.hypot(1, lightZ);
  const shade = (light - .4) * (moon ? 41 : 62) * directLight;
  const height = Math.min(1, face.center.z / 23);
  if (face.snow) {
    return moon ? rgb(181 + shade, 204 + shade, 213 + shade) : rgb(235 + shade - cloud * 10, 235 + shade, 217 + shade + cloud * 6);
  }
  // Green foothills give way to warmer, exposed stone along the ridges.
  const r = moon ? 83 + height * 32 : 149 + height * 31;
  const g = moon ? 108 + height * 19 : 157 - height * 8;
  const b = moon ? 113 + height * 23 : 125 - height * 2;
  return rgb(r + shade - 13 * cloud, g + shade, b + shade + 17 * cloud);
}

function point(x: number, y: number) {
  return x.toFixed(2) + ' ' + y.toFixed(2);
}

function project(vertex: TerrainVertex, camera: TerrainVertex) {
  // Intersect the ray from the camera through the elevated point with the printed chart.
  const t = vertex.z / (camera.z - vertex.z);
  return point(vertex.x + (vertex.x - camera.x) * t, vertex.y + (vertex.y - camera.y) * t);
}

function groundShadow(faces: readonly Face[], sky: BoardLighting): string {
  const sx = sky.shadowX * .073, sy = sky.shadowY * .073;
  return faces.map(face => {
    const [a, b, c] = face.vertices.map(v => ({ x: v.x + sx * v.z, y: v.y + sy * v.z }));
    // Make all shadow triangles wind the same way so overlaps form a single silhouette.
    const winding = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const corners = winding >= 0 ? [a, b, c] : [a, c, b];
    return 'M' + corners.map(v => point(v.x, v.y)).join('L') + 'Z';
  }).join('');
}

export const TerrainRelief = memo(function TerrainRelief({ sky }: { sky: BoardLighting }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState<TerrainVertex | null>(null);

  const painted = useMemo(() => ranges.map(range => ({
    ...range,
    shadow: groundShadow(range.faces, sky),
    faces: range.faces.map(face => ({ ...face, color: faceColor(face, sky) })),
  })), [sky]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const slab = svg?.closest<HTMLElement>('.chart-slab');
    const perspectivePlane = slab?.parentElement;
    if (!svg || !slab || !perspectivePlane) return;
    let frame = 0;

    function measure() {
      frame = 0;
      if (!svg || !slab || !perspectivePlane) return;
      const pixelsPerUnit = Math.min(svg.clientWidth, svg.clientHeight) / chartUnits;
      if (!pixelsPerUnit) return;
      const transform = getComputedStyle(slab).transform;
      const matrix = transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
      // The water, slab origin and perspective center are concentric squares in both layouts.
      const distance = parseFloat(getComputedStyle(perspectivePlane).perspective);
      if (!Number.isFinite(distance)) return;
      const eye = new DOMPoint(0, 0, distance).matrixTransform(matrix.inverse());
      const next = {
        x: chartUnits / 2 + eye.x / pixelsPerUnit,
        y: chartUnits / 2 + eye.y / pixelsPerUnit,
        z: eye.z / pixelsPerUnit,
      };
      setCamera(previous => previous && previous.x === next.x && previous.y === next.y && previous.z === next.z ? previous : next);
      if (slab.getAnimations().some(animation => (animation as CSSTransition).transitionProperty === 'transform'
          && animation.playState === 'running')) schedule();
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function trackTransition(event: TransitionEvent) {
      if (event.target === slab && event.propertyName === 'transform') schedule();
    }
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(svg);
    const viewport = slab.closest('.board-viewport');
    if (viewport) observer.observe(viewport);
    slab.addEventListener('transitionrun', trackTransition);
    slab.addEventListener('transitionend', trackTransition);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      slab.removeEventListener('transitionrun', trackTransition);
      slab.removeEventListener('transitionend', trackTransition);
    };
  }, []);

  return (
    <svg ref={svgRef} className="terrain-relief" viewBox="0 0 480 480" aria-hidden="true" focusable="false">
      {camera && <>
        <g className="terrain-shadows" fill="#193d44" opacity={sky.shadowOpacity * .74}>
          {painted.map(range => <path key={range.id} className="terrain-cast" d={range.shadow} />)}
        </g>
        {painted.map(range => {
          const visible = range.faces.flatMap(face => {
            const dx = camera.x - face.center.x, dy = camera.y - face.center.y, dz = camera.z - face.center.z;
            const n = face.normal;
            return n.x * dx + n.y * dy + n.z * dz > 0 ? [{ face, depth: dx * dx + dy * dy + dz * dz }] : [];
          }).sort((a, b) => b.depth - a.depth);
          return (
            <g key={range.id} className="terrain-range" data-range={range.id}>
              {visible.map(({ face }) => (
                <path key={face.index} className="terrain-face" data-snow={face.snow || undefined}
                  d={'M' + face.vertices.map(vertex => project(vertex, camera)).join('L') + 'Z'} fill={face.color} stroke={face.color} />
              ))}
            </g>
          );
        })}
      </>}
    </svg>
  );
}, (a, b) => a.sky.phase === b.sky.phase && a.sky.weather === b.sky.weather);
