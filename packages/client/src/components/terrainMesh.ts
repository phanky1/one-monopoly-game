/** Chart coordinates are east/right, south/down and elevation above the 480-unit map. */
export interface TerrainVertex { x: number; y: number; z: number }
export interface TerrainFace { indices: readonly [number, number, number]; snow: boolean }
export interface TerrainContour { elevation: number; points: readonly TerrainVertex[] }
export interface TerrainRange {
  id: string;
  name: string;
  vertices: readonly TerrainVertex[];
  faces: readonly TerrainFace[];
  /** Footprint and contours close from the last vertex back to the first. */
  footprint: readonly TerrainVertex[];
  contours: readonly TerrainContour[];
}

type Point = readonly [x: number, y: number];
type Station = readonly [x: number, y: number, summit: number, leftWidth: number, rightWidth: number, spurHeight?: number];
type Triangle = readonly [number, number, number];

const edgeKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;

function atElevation(a: TerrainVertex, b: TerrainVertex, z: number): TerrainVertex {
  const t = (z - a.z) / (b.z - a.z);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z };
}

function upward(vertices: readonly TerrainVertex[], i: number, j: number, k: number): Triangle {
  const [a, b, c] = [vertices[i], vertices[j], vertices[k]];
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0 ? [i, j, k] : [i, k, j];
}

/** Intersect the triangular surface with a horizontal plane. Shared edge IDs stitch
 * adjacent segments exactly, including separate summit islands above a saddle. */
function contourLoops(vertices: TerrainVertex[], triangles: Triangle[], elevation: number): TerrainContour[] {
  const points = new Map<string, TerrainVertex>();
  const neighbors = new Map<string, string[]>();
  for (const tri of triangles) {
    const hits: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3];
      if ((vertices[a].z > elevation) === (vertices[b].z > elevation)) continue;
      const key = edgeKey(a, b);
      if (!points.has(key)) points.set(key, atElevation(vertices[a], vertices[b], elevation));
      hits.push(key);
    }
    if (hits.length === 2) {
      const [a, b] = hits;
      if (!neighbors.has(a)) neighbors.set(a, []);
      if (!neighbors.has(b)) neighbors.set(b, []);
      neighbors.get(a)!.push(b);
      neighbors.get(b)!.push(a);
    }
  }

  const visited = new Set<string>();
  const loops: TerrainContour[] = [];
  for (const first of points.keys()) {
    if (visited.has(first)) continue;
    let current = first;
    let previous: string | undefined;
    const loop: TerrainVertex[] = [];
    do {
      visited.add(current);
      loop.push(points.get(current)!);
      const [a, b] = neighbors.get(current)!;
      const next = a === previous ? b : a;
      previous = current;
      current = next;
    } while (current !== first);
    const signedArea = loop.reduce((sum, p, i) => {
      const q = loop[(i + 1) % loop.length];
      return sum + p.x * q.y - p.y * q.x;
    }, 0);
    loops.push({ elevation, points: signedArea < 0 ? loop.reverse() : loop });
  }
  return loops;
}

/** Cut snow at a continuous elevation boundary, so the cap occupies only the
 * summit instead of whitening the whole facet from the peak to the foothills. */
function splitSnow(vertices: TerrainVertex[], triangles: Triangle[], snowline?: number): TerrainFace[] {
  const faces: TerrainFace[] = [];
  const seam = new Map<string, number>();
  for (const indices of triangles) {
    const high = indices.filter(i => snowline !== undefined && vertices[i].z > snowline);
    if (snowline === undefined || high.length === 0 || high.length === 3) {
      faces.push({ indices, snow: high.length === 3 });
      continue;
    }
    const lower: number[] = [], upper: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = indices[i], b = indices[(i + 1) % 3];
      const above = vertices[a].z > snowline;
      (above ? upper : lower).push(a);
      if (above === (vertices[b].z > snowline)) continue;
      const key = edgeKey(a, b);
      let middle = seam.get(key);
      if (middle === undefined) {
        middle = vertices.push(atElevation(vertices[a], vertices[b], snowline)) - 1;
        seam.set(key, middle);
      }
      lower.push(middle);
      upper.push(middle);
    }
    for (const polygon of [lower, upper]) {
      for (let j = 1; j < polygon.length - 1; j++) {
        faces.push({ indices: [polygon[0], polygon[j], polygon[j + 1]], snow: polygon === upper });
      }
    }
  }
  return faces;
}

function ridge(id: string, name: string, start: Point, stations: readonly Station[], end: Point,
               levels: readonly number[], snowline?: number): TerrainRange {
  const vertices: TerrainVertex[] = [];
  const triangles: Triangle[] = [];
  const leftBank: TerrainVertex[] = [], rightBank: TerrainVertex[] = [];
  function add(x: number, y: number, z: number) {
    return vertices.push({ x, y, z }) - 1;
  }
  const nose = add(...start, 0);
  let last: number[] = [];
  stations.forEach(([x, y, z, leftWidth, rightWidth, spurHeight = 0], i) => {
    const previous = stations[i - 1] ?? start, next = stations[i + 1] ?? end;
    const dx = next[0] - previous[0], dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy);
    const tx = dx / length, ty = dy / length;
    // The two shoulders break at different distances and heights, creating
    // transverse spurs rather than matching slopes on either side of the crest.
    const flank = (across: number, along: number, height: number) =>
      add(x - ty * across + tx * along, y + tx * across + ty * along, height);
    const skew = i % 2 === 0 ? 1 : -1;
    // A signed spur places a secondary summit on the left (+) or right (−)
    // shoulder. The neighboring crest station can then form a genuine pass.
    const leftShoulder = spurHeight > 0 ? spurHeight : z * (i % 3 === 0 ? .48 : .32);
    const rightShoulder = spurHeight < 0 ? -spurHeight : z * (i % 3 === 1 ? .51 : .36);
    const row = [
      flank(leftWidth, 0, 0),
      flank(leftWidth * .53, skew * leftWidth * .14, leftShoulder),
      add(x, y, z),
      flank(-rightWidth * .46, -skew * rightWidth * .17, rightShoulder),
      flank(-rightWidth, 0, 0),
    ];
    leftBank.push(vertices[row[0]]);
    rightBank.push(vertices[row[4]]);
    for (let j = 0; j < 4; j++) {
      if (!last.length) {
        triangles.push(upward(vertices, nose, row[j], row[j + 1]));
      } else if ((i + j) % 2 === 0) {
        triangles.push(upward(vertices, last[j], row[j], row[j + 1]),
                       upward(vertices, last[j], row[j + 1], last[j + 1]));
      } else {
        triangles.push(upward(vertices, last[j], row[j], last[j + 1]),
                       upward(vertices, last[j + 1], row[j], row[j + 1]));
      }
    }
    last = row;
  });
  const tail = add(...end, 0);
  for (let j = 0; j < 4; j++) triangles.push(upward(vertices, last[j], tail, last[j + 1]));

  const footprint = [vertices[nose], ...rightBank, vertices[tail], ...leftBank.reverse()];
  const contours = levels.flatMap(level => contourLoops(vertices, triangles, level));
  return { id, name, vertices, footprint, contours, faces: splitSnow(vertices, triangles, snowline) };
}

// Georeferenced to the illustrated coastline in PacificChart. The eastern Andes
// narrow with the continent; the low Australian divide stays west of the coastal port.
export const TERRAIN_RANGES: readonly TerrainRange[] = [
  ridge('greater-khingan', 'Đại Hưng An', [15, 132], [
    [25, 119, 6, 7, 6], [38, 101, 18, 18, 11, 12], [44, 88, 12, 12, 16],
    [56, 75, 25, 23, 13], [70, 66, 15, 12, 23, -19], [78, 51, 22, 17, 12],
    [95, 38, 8, 9, 8],
  ], [108, 26], [3.3, 8.3, 13.3, 18.3]),
  ridge('rockies', 'Dãy Rocky', [335, 12], [
    [349, 20, 8, 7, 8], [364, 28, 18, 12, 12], [378, 40, 11, 13, 10],
    [396, 50, 30, 17, 16], [410, 65, 17, 13, 22, -20], [420, 78, 26, 15, 13],
    [426, 92, 13, 13, 10], [439, 104, 22, 14, 12, 11], [451, 121, 8, 7, 8],
  ], [461, 138], [3.3, 8.3, 14.3, 20.3, 25.3], 23.7),
  ridge('andes', 'Dãy Andes', [460, 225], [
    [454, 237, 7, 5, 6], [449, 252, 23, 9, 9], [447, 268, 15, 8, 13, -13],
    [444, 284, 31, 6, 16], [452, 297, 16, 8, 10], [453, 308, 24, 5, 14],
    [466, 329, 9, 6, 6], [469, 342, 6, 4, 4],
  ], [472, 354], [3.3, 8.3, 14.3, 20.3, 25.3], 22.7),
  ridge('great-dividing-range', 'Dãy Đông Úc', [127, 309], [
    [132, 316, 5, 4, 4], [137, 322, 10, 6, 4], [138, 330, 5, 5, 4],
    [142, 339, 12, 6, 4], [145, 347, 4, 4, 3],
  ], [144, 354], [2.3, 5.3, 8.3]),
];
