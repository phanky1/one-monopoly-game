/** Harbour coordinates: X across the quay, Y away from the viewer, Z up. */
export type Vec3 = readonly [number, number, number];

export interface Face {
  readonly points: readonly Vec3[];
  readonly color: string;
  /** Open, hand-authored panels can be viewed and lit from either side. */
  readonly doubleSided?: boolean;
}

export interface PortModel {
  readonly label: string;
  readonly faces: readonly Face[];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function samePoint(a: Vec3, b: Vec3) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export class PortBuilder {
  private readonly faces: Face[] = [];

  /** Both rings wind toward the second end cap. Their points correspond one-to-one. */
  private prism(start: Vec3[], end: Vec3[], color: string, capColor = color) {
    this.faces.push({ points: [...start].reverse(), color }, { points: end, color: capColor });
    for (let i = 0; i < start.length; i++) {
      const next = (i + 1) % start.length;
      this.faces.push({ points: [start[i], start[next], end[next], end[i]], color });
    }
  }

  box(center: Vec3, size: Vec3, color: string, yaw = 0): this {
    if (!center.every(Number.isFinite) || !size.every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(yaw)) return this;
    const [x, y, z] = center;
    const [width, depth, height] = size;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const layer = (atZ: number) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([ix, iy]): Vec3 => {
      const u = ix * width / 2, v = iy * depth / 2;
      return [x + u * c - v * s, y + u * s + v * c, atZ];
    });
    this.prism(layer(z - height / 2), layer(z + height / 2), color);
    return this;
  }

  /** Set topRadius to zero for a conical roof, or radius to zero for a downward point. */
  cylinder(base: Vec3, radius: number, height: number, color: string, sides = 8, topRadius = radius): this {
    if (!base.every(Number.isFinite) || ![radius, topRadius, height, sides].every(Number.isFinite)
        || radius < 0 || topRadius < 0 || height <= 0 || (radius === 0 && topRadius === 0)) return this;
    const [x, y, z] = base;
    const count = Math.min(32, Math.max(3, Math.round(sides)));
    const ring = (r: number, atZ: number) => Array.from({ length: count }, (_, i): Vec3 => {
      const angle = (i + .5) * 2 * Math.PI / count;
      return [x + r * Math.cos(angle), y + r * Math.sin(angle), atZ];
    });
    if (radius > 0 && topRadius > 0) {
      this.prism(ring(radius, z), ring(topRadius, z + height), color);
    } else {
      const points = radius > 0 ? ring(radius, z) : ring(topRadius, z + height).reverse();
      const apex: Vec3 = [x, y, radius > 0 ? z + height : z];
      this.faces.push({ points: [...points].reverse(), color });
      for (let i = 0; i < count; i++) {
        this.faces.push({ points: [points[i], points[(i + 1) % count], apex], color });
      }
    }
    return this;
  }

  /** Square strut whose end faces meet the exact endpoints, including for vertical masts. */
  beam(from: Vec3, to: Vec3, width: number, color: string): this {
    if (!from.every(Number.isFinite) || !to.every(Number.isFinite) || !Number.isFinite(width) || width <= 0) return this;
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) return this;
    const axis: Vec3 = [dx / length, dy / length, dz / length];
    const u = cross(Math.abs(axis[2]) < .9 ? [0, 0, 1] : [0, 1, 0], axis);
    const v = cross(axis, u);
    const scale = width / (2 * Math.hypot(...u));
    const end = ([x, y, z]: Vec3) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): Vec3 =>
      [x + scale * (a * u[0] + b * v[0]), y + scale * (a * u[1] + b * v[1]), z + scale * (a * u[2] + b * v[2])]);
    this.prism(end(from), end(to), color);
    return this;
  }

  /** Gable ridge runs along X. The supplied centre lies on the horizontal eave plane. */
  roof(center: Vec3, width: number, depth: number, rise: number, color: string): this {
    if (!center.every(Number.isFinite) || ![width, depth, rise].every(n => Number.isFinite(n) && n > 0)) return this;
    const [x, y, z] = center;
    const gable = (atX: number): Vec3[] => [[atX, y - depth / 2, z], [atX, y + depth / 2, z], [atX, y, z + rise]];
    this.prism(gable(x - width / 2), gable(x + width / 2), color);
    return this;
  }

  /** Planar polygon, vertices in perimeter order. A repeated closing point is optional. */
  face(points: readonly Vec3[], color: string): this {
    if (points.some(p => !p.every(Number.isFinite))) return this;
    const polygon = points.filter((p, i) => i === 0 || !samePoint(p, points[i - 1]));
    if (polygon.length > 1 && samePoint(polygon[0], polygon[polygon.length - 1])) polygon.pop();
    if (polygon.length < 3) return this;
    // Newell's normal also handles concave polygons and collinear opening vertices.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (Math.hypot(nx, ny, nz) > 1e-9) this.faces.push({ points: polygon, color, doubleSided: true });
    return this;
  }

  /** An optional chamfered quay under the model. Its working surface is at Z = 0. */
  quay(): this {
    const rim = [[-4.55, -3.45], [4.55, -3.45], [4.9, -3.1], [4.9, 3.1],
                 [4.55, 3.45], [-4.55, 3.45], [-4.9, 3.1], [-4.9, -3.1]];
    const layer = (z: number): Vec3[] => rim.map(([x, y]) => [x, y, z]);
    this.prism(layer(-.34), layer(0), '#52686A', '#D7C6A2');
    return this;
  }

  build(label: string): PortModel {
    return { label, faces: [...this.faces] };
  }
}
