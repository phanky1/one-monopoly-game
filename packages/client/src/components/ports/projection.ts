import type { PortModel, Vec3 } from './geometry.js';

export const PORT_HOME_ANGLE = Math.atan2(10, -18);
export const PORT_HOME_ELEVATION = Math.atan2(12, Math.hypot(10, 18));

export interface PortLight {
  x: number;
  y: number;
  exposure: number;
  overcast: number;
  moon: boolean;
}

export const studioLight: PortLight = { x: -.65, y: -.75, exposure: 1, overcast: 0, moon: false };

interface Surface {
  indices: number[];
  normal: Vec3;
  color: number[];
  doubleSided: boolean;
}

interface Mesh {
  vertices: Vec3[];
  surfaces: Surface[];
  centerX: number;
  centerY: number;
  radii: number[];
}

const meshCache = new WeakMap<PortModel, Mesh>();

function meshFor(model: PortModel): Mesh {
  const previous = meshCache.get(model);
  if (previous) return previous;
  const vertices: Vec3[] = [];
  const surfaces: Surface[] = [];
  const indices = new Map<string, number>();
  for (const face of model.faces) {
    if (face.points.length < 3) continue;
    const ids: number[] = [];
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < face.points.length; i++) {
      const a = face.points[i], b = face.points[(i + 1) % face.points.length];
      // Newell's normal also handles polygons whose first three points are collinear.
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
      const key = a.join(',');
      let id = indices.get(key);
      if (id === undefined) {
        id = vertices.length;
        vertices.push(a);
        indices.set(key, id);
      }
      ids.push(id);
    }
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-8) continue;
    const hex = face.color.slice(1);
    const rgb = Number.parseInt(hex.length === 3 ? [...hex].map(c => c + c).join('') : hex, 16);
    surfaces.push({ indices: ids, normal: [nx / length, ny / length, nz / length],
      color: [rgb >> 16, (rgb >> 8) & 255, rgb & 255], doubleSided: !!face.doubleSided });
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of vertices) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const radii = vertices.map(([x, y]) => Math.hypot(x - centerX, y - centerY));
  const mesh = { vertices, surfaces, centerX, centerY, radii };
  meshCache.set(model, mesh);
  return mesh;
}

// Orthographic software rasterization. A depth buffer keeps rear cranes behind nearer
// buildings, even when a long structure crosses the center of another polygon.
export function paintPort(ctx: CanvasRenderingContext2D, model: PortModel, yaw: number, elevation: number, light: PortLight, stableOrbit = false) {
  const { width, height } = ctx.canvas;
  if (!width || !height) return;
  const { vertices, surfaces, centerX, centerY, radii } = meshFor(model);
  if (!vertices.length) { ctx.clearRect(0, 0, width, height); return; }
  const sy = Math.sin(yaw), cy = Math.cos(yaw), se = Math.sin(elevation), ce = Math.cos(elevation);
  const u = new Float32Array(vertices.length), v = new Float32Array(vertices.length), d = new Float32Array(vertices.length);
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const [x, y, z] = vertices[i];
    const forward = sy * x + cy * y;
    u[i] = -cy * x + sy * y;
    v[i] = se * forward - ce * z;
    d[i] = ce * forward + se * z;
    left = Math.min(left, u[i]); right = Math.max(right, u[i]);
    top = Math.min(top, v[i]); bottom = Math.max(bottom, v[i]);
  }
  // Keep a fixed orbit envelope in the inspector, so the quay does not pulse in size while rotating.
  if (stableOrbit) {
    const centerU = -cy * centerX + sy * centerY, centerV = se * (sy * centerX + cy * centerY);
    const radius = Math.max(...radii);
    left = centerU - radius; right = centerU + radius;
    top = Infinity; bottom = -Infinity;
    for (let i = 0; i < vertices.length; i++) {
      const vertical = centerV - ce * vertices[i][2];
      top = Math.min(top, vertical - se * radii[i]);
      bottom = Math.max(bottom, vertical + se * radii[i]);
    }
  }
  const scale = .94 * Math.min(width / (right - left || 1), height / (bottom - top || 1));
  const ox = (width - (left + right) * scale) / 2, oy = (height - (top + bottom) * scale) / 2;
  for (let i = 0; i < vertices.length; i++) { u[i] = ox + u[i] * scale; v[i] = oy + v[i] * scale; }

  const img = ctx.createImageData(width, height);
  const depth = new Float32Array(width * height).fill(-Infinity);
  const lz = 1.35, ll = Math.hypot(light.x, light.y, lz);
  for (const face of surfaces) {
    const [nx, ny, nz] = face.normal;
    const forward = sy * nx + cy * ny;
    const facing = ce * forward + se * nz;
    if (Math.abs(facing) < 1e-6 || (!face.doubleSided && facing < 0)) continue;
    const sign = Math.sign(facing);
    const diffuse = Math.max(0, sign * (nx * light.x + ny * light.y + nz * lz) / ll);
    const shade = (.69 + .09 * light.overcast + (.39 - .18 * light.overcast) * diffuse + .045 * Math.max(0, nz * sign)) * light.exposure;
    const red = face.color[0] * shade * (light.moon ? .92 : 1);
    const green = face.color[1] * shade;
    const blue = face.color[2] * shade * (light.moon ? 1.12 : 1);
    const dx = -(-cy * nx + sy * ny) / (scale * facing);
    const dy = -(se * forward - ce * nz) / (scale * facing);
    const ids = face.indices;
    const origin = ids[0];
    const intercept = d[origin] - dx * u[origin] - dy * v[origin];
    let minY = height, maxY = 0;
    for (const i of ids) { minY = Math.min(minY, v[i]); maxY = Math.max(maxY, v[i]); }
    const hits: number[] = [];
    // Even/odd scanlines support concave custom faces, such as a notched gable.
    for (let y = Math.max(0, Math.ceil(minY - .5)); y < Math.min(height, Math.ceil(maxY - .5)); y++) {
      const scan = y + .5; hits.length = 0;
      for (let j = 0; j < ids.length; j++) {
        const a = ids[j], b = ids[(j + 1) % ids.length];
        if ((v[a] > scan) === (v[b] > scan)) continue;
        hits.push(u[a] + (scan - v[a]) * (u[b] - u[a]) / (v[b] - v[a]));
      }
      hits.sort((a, b) => a - b);
      for (let j = 0; j + 1 < hits.length; j += 2) {
        const start = Math.max(0, Math.ceil(hits[j] - .5)), end = Math.min(width, Math.ceil(hits[j + 1] - .5));
        let z = intercept + dx * (start + .5) + dy * scan;
        for (let x = start; x < end; x++, z += dx) {
          const i = y * width + x;
          if (z < depth[i] - .00001) continue;
          depth[i] = z;
          const p = i * 4;
          img.data[p] = red; img.data[p + 1] = green; img.data[p + 2] = blue; img.data[p + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
