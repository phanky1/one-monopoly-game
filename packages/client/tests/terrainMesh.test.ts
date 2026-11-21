import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TERRAIN_RANGES, type TerrainVertex } from '../src/components/terrainMesh.js';

const tolerance = 1e-6;
const side = (a: TerrainVertex, b: TerrainVertex, c: TerrainVertex) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const key = (p: TerrainVertex) => [p.x, p.y, p.z].join(',');

function area(loop: readonly TerrainVertex[]) {
  return loop.reduce((sum, p, i) => {
    const q = loop[(i + 1) % loop.length];
    return sum + p.x * q.y - p.y * q.x;
  }, 0) / 2;
}

function onSurface(p: TerrainVertex, a: TerrainVertex, b: TerrainVertex, c: TerrainVertex) {
  const denominator = side(a, b, c);
  const wa = side(b, c, p) / denominator;
  const wb = side(c, a, p) / denominator;
  const wc = 1 - wa - wb;
  return Math.min(wa, wb, wc) >= -tolerance && Math.abs(wa * a.z + wb * b.z + wc * c.z - p.z) < tolerance;
}

for (const range of TERRAIN_RANGES) {
  describe(range.name, () => {
    it('covers the footprint with upward triangles, sharing all interior edges', () => {
      const edges = new Map<string, number>();
      let covered = 0;
      for (const face of range.faces) {
        const [a, b, c] = face.indices.map(i => range.vertices[i]);
        assert.ok([a, b, c].every(p => p && Number.isFinite(p.x + p.y + p.z) && p.z >= 0));
        const twiceArea = side(a, b, c);
        assert.ok(twiceArea > tolerance);
        covered += twiceArea / 2;
        face.indices.forEach((v, j) => {
          const w = face.indices[(j + 1) % 3];
          const edge = [Math.min(v, w), Math.max(v, w)].join(',');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        });
      }
      assert.ok(range.footprint.every(p => p.z === 0));
      assert.ok(Math.abs(covered - area(range.footprint)) < tolerance);
      assert.ok([...edges.values()].every(count => count === 1 || count === 2));
      assert.equal([...edges.values()].filter(count => count === 1).length, range.footprint.length);
      assert.equal(range.vertices.length - edges.size + range.faces.length, 1); // a single disk
    });

    it('has simple closed contour loops that trace their elevations on the mesh', () => {
      let last = 0;
      for (const { points, elevation } of range.contours) {
        assert.ok(elevation >= last && elevation > 0);
        last = elevation;
        assert.ok(points.length >= 3 && area(points) > tolerance);
        assert.equal(new Set(points.map(key)).size, points.length);
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          assert.equal(a.z, elevation);
          const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: elevation };
          for (const p of [a, midpoint]) {
            assert.ok(range.faces.some(({ indices: [i, j, k] }) =>
              onSurface(p, range.vertices[i], range.vertices[j], range.vertices[k])));
          }
          for (let j = i + 2; j < points.length; j++) {
            if (i === 0 && j === points.length - 1) continue;
            const c = points[j], d = points[(j + 1) % points.length];
            const crosses = side(a, b, c) * side(a, b, d) < -tolerance
              && side(c, d, a) * side(c, d, b) < -tolerance;
            assert.ok(!crosses, 'A contour crosses itself');
          }
        }
      }
    });
  });
}

it('cuts snow only above each snowy range’s summit snowline', () => {
  const snowyRanges = TERRAIN_RANGES.filter(range => range.faces.some(face => face.snow));
  assert.deepEqual(snowyRanges.map(range => range.id).sort(), ['andes', 'rockies']);
  for (const range of snowyRanges) {
    const snowline = Math.min(...range.faces.filter(face => face.snow)
      .flatMap(face => face.indices.map(i => range.vertices[i].z)));
    assert.ok(snowline > 0);
    for (const face of range.faces) {
      assert.ok(face.indices.every(i => face.snow
        ? range.vertices[i].z >= snowline - tolerance
        : range.vertices[i].z <= snowline + tolerance));
    }
  }
});
