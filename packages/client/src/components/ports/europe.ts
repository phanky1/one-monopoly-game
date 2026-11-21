import { PortBuilder, type PortModel, type Vec3 } from './geometry.js';

type Point = readonly [number, number];

function ring(plan: readonly Point[], height: number): Vec3[] {
  return plan.map(([x, y]) => [x, y, height]);
}

// The two perimeters run in the same direction. Different outlines give the ferry
// a flared bow and let the bridge pylon narrow and lean as it rises.
function joinRings(b: PortBuilder, lower: Vec3[], upper: Vec3[], wall: string, cap?: string) {
  for (let i = 0; i < lower.length; i++) {
    const j = (i + 1) % lower.length;
    b.face([lower[i], lower[j], upper[j], upper[i]], wall);
  }
  if (cap) b.face(upper, cap);
}

function piraeus() {
  const b = new PortBuilder();
  b.face(ring([[-4.54, -2.92], [4.54, -2.92], [4.54, 1.65], [-4.54, 1.65]], .025), '#649aa0');
  const deck: Point[] = [
    [-4.2, -1.12], [-3.63, -1.42], [2.48, -1.42], [3.55, -.94], [4.65, 0],
    [3.55, .94], [2.48, 1.42], [-3.63, 1.42], [-4.2, 1.12],
  ];
  const keel = deck.map(([x, y]): Point => [x * .87, y * .87]);
  const waterline = deck.map(([x, y]): Point => [x * .945, y * .945]);
  joinRings(b, ring(keel, .17), ring(waterline, .56), '#a44835');
  joinRings(b, ring(waterline, .56), ring(deck, 1.55), '#254e67', '#d8b584');

  // Twin passenger decks with continuous dark glazing and a projecting bridge.
  b.box([-.35, 0, 1.96], [7.05, 2.43, .9], '#f6efdb');
  b.box([-.32, 0, 2.12], [6.77, 2.47, .25], '#326171');
  b.box([-.38, 0, 2.45], [7.14, 2.57, .18], '#fff7dc');
  b.box([-.22, .05, 2.75], [5.82, 2.04, .55], '#ece7cc');
  b.box([2.43, 0, 2.91], [1.09, 2.25, .43], '#295b70');
  b.box([2.4, 0, 3.17], [1.25, 2.43, .16], '#fff4d8');
  b.box([-.48, .05, 3.08], [5.42, 2.13, .17], '#faf4d9');
  for (const x of [-2.55, -1.86, 1.34]) {
    b.box([x, -1.22, 2.2], [.48, .31, .24], '#ef9a41');
  }

  for (const [x, color] of [[-1.65, '#d55d3e'], [.28, '#e9ae42']] as const) {
    b.cylinder([x, .08, 3.16], .57, 1.34, color, 8, .49);
    b.cylinder([x, .08, 4.5], .49, .29, '#35434a', 8, .48);
  }
  b.beam([2.28, .22, 3.22], [2.14, .22, 4.38], .12, '#566771');
  return b.build('Phà hai ống khói Piraeus');
}

function genoa() {
  const b = new PortBuilder();
  const rock: Point[] = [
    [-3.9, -1.15], [-2.4, -2.25], [1.8, -2.34], [3.05, -1.51],
    [3.2, .6], [1.57, 2.1], [-2.7, 1.8], [-4.02, .61],
  ];
  const terrace = rock.map(([x, y]): Point => [x * .85, y * .85]);
  joinRings(b, ring(rock, .15), ring(terrace, .98), '#868873', '#b3ad87');

  // The old keeper's house sits below the two stacked square masonry shafts.
  b.box([-2.08, -.5, 1.37], [1.83, 1.42, .82], '#d8c5a0');
  b.roof([-2.08, -.5, 1.78], 2.07, 1.64, .55, '#ac6146');
  b.box([.35, .12, 1.1], [2.85, 2.51, .35], '#aa9f84');
  b.box([.35, .12, 2.66], [2.24, 2.05, 2.8], '#d6cbb1');
  b.box([.35, .12, 4.09], [2.59, 2.39, .3], '#8b8979');
  b.box([.35, .12, 4.28], [2.45, 2.29, .12], '#eee2c4');
  b.box([.35, .12, 5.27], [1.57, 1.48, 1.97], '#d2c8ad');
  b.box([.35, .12, 6.3], [1.94, 1.84, .2], '#807f72');
  b.box([.35, .12, 6.45], [1.78, 1.68, .14], '#e8dabe');

  // Genoa's red cross on the seaward face.
  b.box([.35, -.919, 3.04], [.8, .05, .9], '#f5e9c9');
  b.box([.35, -.951, 3.04], [.16, .02, .8], '#ab3b33');
  b.box([.35, -.954, 3.08], [.68, .02, .16], '#ab3b33');
  for (const z of [1.68, 4.9, 5.72]) {
    const y = z < 4 ? -.915 : -.63;
    b.box([.38, y, z], [.22, .05, .37], '#576463');
  }
  b.cylinder([.35, .12, 6.52], .58, .74, '#466c70', 8);
  for (const [dx, dy] of [[-.3, -.49], [.3, -.49], [.49, .3]]) {
    b.beam([.35 + dx, .12 + dy, 6.52], [.35 + dx, .12 + dy, 7.26], .085, '#e1d7b9');
  }
  b.cylinder([.35, .12, 7.26], .79, .18, '#3a5157', 8);
  b.cylinder([.35, .12, 7.44], .71, .39, '#6e887e', 8, .12);
  return b.build('Hải đăng La Lanterna');
}

function valencia() {
  const b = new PortBuilder();
  // Alternating cantilevers leave open terraces around offset glass cores.
  const levels = [
    { x: -.25, y: -.15, z: .55, width: 8.75, depth: 5.48 },
    { x: .49, y: -.46, z: 2.28, width: 7.85, depth: 4.61 },
    { x: -.62, y: .1, z: 4.02, width: 6.87, depth: 4.12 },
    { x: .3, y: .23, z: 5.8, width: 6.51, depth: 3.57 },
  ];
  for (const {x, y, z, width, depth} of levels) {
    const w = width / 2, d = depth / 2;
    const plan: Point[] = [
      [x - w, y - d + .4], [x - w + .56, y - d], [x + w, y - d],
      [x + w, y + d - .53], [x + w - .7, y + d], [x - w, y + d],
    ];
    const lower = ring(plan, z - .42);
    joinRings(b, lower, ring(plan, z), '#f5f8ef', '#e5ebe4');
    b.face([...lower].reverse(), '#bcbba8');
  }
  for (const [x, y, z, w, d] of [[-.72, .29, .55, 5.16, 2.95], [.12, .36, 2.28, 4.32, 2.28], [-.38, .32, 4.02, 3.81, 1.94]]) {
    b.box([x, y, z + .69], [w, d, 1.38], '#386b76');
    for (const dx of [-.29, .23]) {
      b.box([x + dx * w, y - d / 2, z + .69], [.11, .12, 1.38], '#b7c6b9');
    }
  }
  for (const [x, y, z] of [[2.7, -1.55, .55], [-2.25, -1.27, 2.28], [2.08, -.95, 4.02]]) {
    b.box([x, y, z + .68], [.17, .18, 1.36], '#d6d6c5');
  }
  b.beam([-2.52, -2.63, 2.53], [3.88, -2.63, 2.53], .085, '#98b2af');
  for (const x of [-2.52, .67, 3.88]) b.beam([x, -2.63, 2.28], [x, -2.63, 2.53], .06, '#899f9d');
  return b.build('Khán đài đua buồm Veles e Vents');
}

function hamburg() {
  const b = new PortBuilder();
  const left = -4.1, right = 4.1, front = -1.93;
  const rear = (x: number) => 1.61 + (x - left) * .09;
  const footprint: Point[] = [[left, front], [right, front], [right, rear(right)], [left, rear(left)]];
  joinRings(b, ring(footprint, .2), ring(footprint, 2.53), '#a25743', '#8d604e');
  joinRings(b, ring(footprint, 2.53), ring(footprint, 2.84), '#e2d3ac');
  for (const x of [-3.5, -2.4, -1.3, -.2, .9, 2, 3.1]) {
    b.face([[x, front - .01, .66], [x + .34, front - .01, .66], [x + .34, front - .01, 1.85], [x, front - .01, 1.85]], '#5e514d');
    b.face([[x, front - .01, 2], [x + .34, front - .01, 2], [x + .34, front - .01, 2.25], [x, front - .01, 2.25]], '#66534c');
  }

  // A curved glass crown rises out of the two end corners of the brick warehouse.
  const waves = [
    [-4.1, 6.83, 5.56], [-3.55, 6.16, 5.16], [-2.66, 5.67, 5.0], [-1.73, 5.52, 5.22],
    [-.69, 5.75, 5.97], [.12, 6.33, 6.82], [1.05, 5.75, 6.02], [1.96, 5.55, 5.83],
    [2.87, 5.88, 6.14], [3.52, 6.41, 6.62], [4.1, 7.47, 7.09],
  ];
  for (let i = 0; i < waves.length - 1; i++) {
    const [x, top, back] = waves[i], [nx, nTop, nBack] = waves[i + 1];
    const a: Vec3 = [x, front, top], c: Vec3 = [nx, rear(nx), nBack];
    const n: Vec3 = [nx, front, nTop], d: Vec3 = [x, rear(x), back];
    b.face([[x, front, 2.84], [nx, front, 2.84], n, a], i % 3 === 1 ? '#719fa5' : '#86adb5');
    b.face([[nx, rear(nx), 2.84], [x, rear(x), 2.84], d, c], '#7897a6');
    b.face([a, n, c], '#dce1d8');
    b.face([a, c, d], '#c8d4d2');
  }
  b.face([[left, rear(left), 2.84], [left, front, 2.84], [left, front, waves[0][1]], [left, rear(left), waves[0][2]]], '#7e9ea9');
  b.face([[right, front, 2.84], [right, rear(right), 2.84], [right, rear(right), waves.at(-1)![2]], [right, front, waves.at(-1)![1]]], '#658d9c');
  for (const z of [3.71, 4.7]) {
    b.face([[left, front - .02, z], [right, front - .02, z], [right, front - .02, z + .07], [left, front - .02, z + .07]], '#b7cecf');
  }
  return b.build('Nhà hòa nhạc Elbphilharmonie');
}

function rotterdam() {
  const b = new PortBuilder();
  b.face(ring([[-3.64, -3.1], [3.64, -3.1], [3.64, 3.04], [-3.64, 3.04]], .025), '#6395a2');
  b.box([0, 0, 1.28], [9.6, 2.11, .42], '#74868b');
  b.box([0, 0, 1.53], [9.62, 2.24, .14], '#ddddcb');
  for (const x of [-4.12, 4.12]) b.box([x, 0, .59], [.75, 1.5, .98], '#7f8a81');
  // The two lower legs merge into one tilted, tapered "swan neck".
  for (const y of [-1.13, 1.13]) {
    b.beam([-2.15, y, .5], [-1.04, .0, 3.66], .62, '#d8ded2');
  }
  const shaft = (x: number, z: number, w: number, d: number) => ring([
    [x - w, -d], [x + w, -d], [x + w, d], [x - w, d],
  ], z);
  const knee = shaft(-1.04, 3.45, .43, .32);
  const elbow = shaft(-1.67, 6.8, .35, .25);
  joinRings(b, knee, elbow, '#f2efdc');
  joinRings(b, elbow, shaft(-2.33, 7.75, .17, .22), '#f2efdc', '#fcf4de');
  for (const y of [-1, 1]) {
    for (const [j, x] of [.13, 1.2, 2.35, 3.48, 4.49].entries()) {
      b.beam([-1.67 - j * .1, .18 * y, 6.72 + j * .17], [x, y, 1.6], .105, '#dce2d7');
    }
    b.beam([-2.13, .19 * y, 7.48], [-4.4, y, 1.6], .135, '#92a9ac');
  }
  return b.build('Cầu Erasmus');
}

function yantian() {
  const b = new PortBuilder();
  // Three connected coastal spurs rise immediately behind the quay.
  const ridge: Vec3[] = [[-4.62, 2.55, .2], [-3.12, 2.7, 4.22], [-1.85, 2.48, 3.29], [-.52, 2.81, 5.72], [.65, 2.48, 3.46], [1.96, 2.69, 4.08], [3.52, 2.74, .2]];
  for (let i = 0; i < ridge.length - 1; i++) {
    const a = ridge[i], n = ridge[i + 1];
    const foot: Vec3 = [a[0], .62 + (i % 2) * .18, .2];
    const nextFoot: Vec3 = [n[0], .62 + ((i + 1) % 2) * .18, .2];
    b.face([foot, nextFoot, n], i % 2 ? '#577d69' : '#769175');
    b.face([foot, n, a], i % 2 ? '#689476' : '#4c786c');
    const rearA: Vec3 = [a[0], 3.35, .2], rearN: Vec3 = [n[0], 3.35, .2];
    b.face([rearN, rearA, a], '#698472');
    b.face([rearN, a, n], '#698472');
  }
  for (const [x, y, z, color] of [
    [-3.22, -1.64, .65, '#b45945'], [-1.32, -1.64, .65, '#3b8791'],
    [.58, -1.64, .65, '#d0a04e'], [-3.22, -.35, .65, '#467785'],
    [-1.32, -.35, .65, '#d59c47'], [-2.68, -.35, 1.55, '#c56543'],
    [-.78, -.35, 1.55, '#568b89'],
  ] as const) b.box([x, y, z], [1.78, 1.04, .88], color);

  // A high rail crane reaches out over the berth, clear of the hillside.
  const orange = '#d88337';
  for (const y of [-2.25, -.45]) {
    b.beam([1.21, y, .2], [1.67, y, 3.47], .3, orange);
    b.beam([2.72, y, .2], [2.39, y, 3.47], .3, orange);
  }
  b.box([2.06, -1.35, 3.53], [1.55, 2.14, .38], orange);
  b.box([2.27, -2.16, 4.37], [.3, .34, 1.61], orange);
  b.box([2.21, -2.15, 3.74], [4.95, .49, .33], '#e59b47');
  b.beam([2.24, -2.15, 5.14], [4.54, -2.15, 3.86], .13, '#5c6360');
  b.beam([2.24, -2.15, 5.14], [.0, -2.15, 3.86], .13, '#5c6360');
  b.beam([3.91, -2.16, 3.6], [3.91, -2.16, 1.99], .09, '#4f6165');
  b.box([3.91, -2.16, 1.92], [1.05, .27, .18], '#c7793d');
  return b.build('Bến container Yantian');
}

export const europePorts: Record<string, PortModel> = {
  GRPIR: piraeus(),
  ITGOA: genoa(),
  ESVLC: valencia(),
  DEHAM: hamburg(),
  NLRTM: rotterdam(),
  CNYTN: yantian(),
};
