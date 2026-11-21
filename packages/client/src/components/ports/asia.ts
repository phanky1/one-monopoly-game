import { PortBuilder, type PortModel, type Vec3 } from './geometry.js';

type Plan = readonly (readonly [number, number])[];
const navy = '#274756', ivory = '#f0e3c3', teal = '#40868b', brass = '#db9a48';
const lagoon = '#659999', vermilion = '#c26144', berry = '#aa3d69';

function ring(plan: Plan, z: number): Vec3[] {
  return plan.map(([x, y]) => [x, y, z]);
}

// Two perimeter rings make a tapered hull, a raked tower or a sloping loading ramp.
function shell(b: PortBuilder, lower: Vec3[], upper: Vec3[], side: string, top: string) {
  b.face([...lower].reverse(), side);
  for (let i = 0; i < lower.length; i++) {
    const next = (i + 1) % lower.length;
    b.face([lower[i], lower[next], upper[next], upper[i]], side);
  }
  b.face(upper, top);
}

function singapore() {
  const b = new PortBuilder();
  for (const x of [-2.62, 0, 2.62]) {
    shell(b, ring([[x - .78, -1.2], [x + .78, -1.2], [x + .78, 1.06], [x - .78, 1.06]], .08),
      ring([[x - .62, -.44], [x + .62, -.44], [x + .62, 1.28], [x - .62, 1.28]], 5.75), ivory, ivory);
    b.face([[x - .46, -1.16, .52], [x + .46, -1.16, .52], [x + .38, -.54, 5.25], [x - .38, -.54, 5.25]], '#4c8693');
  }
  // SkyPark has a long cantilever past the western tower and a rounded, prow-like end.
  const skypark: Plan = [[-4.92, .28], [-4.25, -.62], [-3.35, -.83], [3.62, -.83],
    [4.17, -.47], [4.32, .52], [3.86, 1.42], [-3.83, 1.56], [-4.66, 1.08]];
  shell(b, skypark.map(([x, y]) => [x * .89, y * .89 + .05, 5.72]), ring(skypark, 6.48), '#b8aa87', ivory);
  b.box([-.08, .39, 6.57], [6.42, .89, .18], '#587d68');
  b.box([2.49, .4, 6.77], [1.01, .7, .31], '#729ca0');
  return b.build('Ba tháp và vườn treo Marina Bay Sands');
}

function catLai() {
  const b = new PortBuilder();
  b.box([0, -1.25, .1], [9.72, 3.68, .2], lagoon);
  const deck: Plan = [[-4.55, -2.33], [-3.95, -2.66], [2.92, -2.66], [4.62, -1.46],
    [3.02, -.28], [-3.96, -.28], [-4.55, -.58]];
  shell(b, deck.map(([x, y]) => [x * .88, -1.46 + (y + 1.46) * .88, .18]), ring(deck, 1.12), navy, '#b6aa86');
  b.box([-3.1, -1.48, 1.83], [1.62, 1.73, 1.44], ivory);
  b.box([-3.1, -2.35, 2.04], [1.12, .06, .34], navy);
  b.box([-3.1, -1.46, 2.64], [1.88, 1.89, .22], teal);
  b.box([-.98, -1.49, 1.7], [2.14, 1.68, 1.16], berry);
  b.box([1.23, -1.49, 1.7], [2.03, 1.68, 1.16], '#d89138');
  b.box([-.98, -1.49, 2.85], [2.14, 1.68, 1.14], '#d3714b');
  // Stagger the stacks along the riverbank so the low barge stays visible in front.
  b.box([-1.26, 1.58, .67], [2.97, 1.56, 1.29], teal);
  b.box([-1.26, 1.58, 1.97], [2.97, 1.56, 1.27], '#bf8a4c');
  b.box([1.9, 1.58, .67], [3.06, 1.56, 1.29], '#8b4762');
  return b.build('Sà lan chở container trên sông Đồng Nai');
}

function caiMep() {
  const b = new PortBuilder();
  const steel = '#367688', brace = '#76a7aa', boomY = -1.06;
  b.box([-.98, .42, .2], [6.84, 4.55, .4], '#b0a88d');
  for (const y of [-1.02, 1.87]) {
    b.beam([-3.74, y, .32], [-3.1, y, 4.62], .53, steel);
    b.beam([.62, y, .32], [.14, y, 4.62], .53, steel);
    b.beam([-3.42, y, 1.15], [.08, y, 4.46], .24, brace);
  }
  for (const x of [-3.1, .12]) b.beam([x, -1.12, 4.6], [x, 1.93, 4.6], .47, steel);
  b.box([-1.8, .43, 4.68], [4.12, 2.99, .48], steel);
  b.box([.26, boomY, 4.79], [8.67, .38, .49], '#e7a34a');
  b.box([.26, 1.88, 4.77], [8.67, .4, .47], steel);
  for (const x of [2.35, 4.46]) b.beam([x, boomY, 4.76], [x, 1.88, 4.76], .31, steel);
  b.beam([.23, boomY, 4.76], [2.35, 1.88, 4.76], .21, brace);
  b.beam([2.35, 1.88, 4.76], [4.46, boomY, 4.76], .21, brace);
  b.box([-2.91, .53, 5.27], [1.55, 1.79, .75], ivory);
  // A tall stay frame and two tension members carry the waterside extension.
  b.beam([-2.03, boomY, 4.85], [-1.64, boomY, 7.52], .38, steel);
  b.beam([-1.64, boomY, 7.52], [4.46, boomY, 4.91], .23, steel);
  b.beam([-3.91, boomY, 4.9], [-1.64, boomY, 7.52], .23, steel);
  b.box([2.94, -.81, 4.43], [.97, 1, .43], navy);
  b.beam([2.94, -.81, 4.27], [2.94, -.81, 2.4], .17, navy);
  b.box([2.94, -.81, 1.98], [2.24, 1.13, .84], berry);
  return b.build('Cẩu giàn vươn ra cầu cảng nước sâu Cái Mép');
}

function laemChabang() {
  const b = new PortBuilder();
  b.box([-.57, .08, .1], [8.59, 3.74, .2], lagoon);
  const deck: Plan = [[-4.68, .2], [-3.48, -1.46], [1.79, -1.46], [2.24, -1.12],
    [2.24, 1.46], [-3.33, 1.58]];
  shell(b, deck.map(([x, y]) => [x * .89, y * .89, .18]), ring(deck, 1.39), '#324d69', navy);
  const body: Plan = [[-3.79, -.66], [-3.02, -1.4], [1.87, -1.4], [2.16, -.96],
    [2.16, 1.25], [-3.34, 1.25]];
  shell(b, ring(body, 1.39), ring(body, 3.72), '#e2ce9f', ivory);
  b.box([-1.17, -1.43, 2.88], [3.55, .08, .47], '#487a87');
  b.box([-2.43, .04, 4.04], [1.58, 1.77, .65], ivory);
  b.box([-2.43, -.87, 4.13], [1.25, .08, .3], navy);
  b.box([.69, .56, 4.27], [.91, .87, 1.12], vermilion);
  // The stern door and its open quarter ramp identify this as a roll-on/roll-off carrier.
  b.box([2.17, -.12, 2.12], [.07, 1.35, 1.3], navy);
  const ramp: Vec3[] = [[2.16, -.81, 1.52], [4.82, -2.04, .29], [4.82, -.63, .29], [2.16, .66, 1.52]];
  shell(b, ramp.map(([x, y, z]) => [x, y, z - .17]), ramp, navy, '#c18844');
  b.beam(ramp[0], ramp[1], .14, '#f3d58a');
  b.beam(ramp[3], ramp[2], .14, '#f3d58a');
  for (const [x, color] of [[-.98, berry], [1.28, teal]] as const) {
    b.box([x, -2.72, .37], [1.39, .74, .52], color);
    b.box([x - .06, -2.72, .74], [.68, .66, .31], ivory);
  }
  return b.build('Tàu chở ô tô hạ cầu dẫn ở Laem Chabang');
}

function jebelAli() {
  const b = new PortBuilder();
  const pipe = '#b46b40';
  b.box([.02, .14, .12], [8.94, 5.57, .24], '#ccb085');
  for (const [x, y, radius, height] of [[-1.72, -.63, 1.69, 2.9], [1.91, 1.13, 1.38, 4.05]]) {
    b.cylinder([x, y, .23], radius, height * .67, '#dfc69b', 10);
    b.cylinder([x, y, .23 + height * .67], radius, .38, '#548489', 10);
    b.cylinder([x, y, .61 + height * .67], radius, height * .33 - .38, '#ead4a9', 10);
    b.cylinder([x, y, .23 + height], radius, .63, '#c69567', 10, .31);
  }
  b.cylinder([-3.41, 1.84, .24], .48, 4.66, '#c17e57', 8);
  b.cylinder([-3.41, 1.84, 4.9], .48, .54, ivory, 8);
  b.cylinder([-3.41, 1.84, 5.44], .43, .72, '#a15c49', 8);
  b.beam([-1.71, -1.8, .98], [-1.71, -2.56, .98], .37, pipe);
  b.beam([-1.71, -2.56, .98], [2.09, -2.56, .98], .37, pipe);
  b.beam([2.09, -2.56, .98], [2.09, -.17, .98], .37, pipe);
  return b.build('Bồn chứa và đường ống ở Jebel Ali');
}

function busan() {
  const b = new PortBuilder();
  b.box([0, .04, .09], [9.75, 4.18, .18], lagoon);
  b.box([0, 0, 1.68], [9.54, 1.98, .48], '#5a7884');
  b.box([0, 0, 1.95], [9.34, .19, .07], '#e2b76a');
  for (const x of [-2.54, 2.54]) {
    b.box([x, 0, .42], [1.27, 2.82, .59], '#b5b2a1');
    for (const y of [-1.01, 1.01]) {
      b.beam([x, y, .65], [x, y * .88, 5.82], .43, ivory);
    }
    b.beam([x, -.98, 3.22], [x, .98, 3.22], .37, '#b39f7d');
    b.beam([x, -.93, 5.66], [x, .93, 5.66], .49, ivory);
  }
  for (const y of [-1.03, 1.03]) {
    const cable: Vec3[] = [[-4.62, y, 1.93], [-2.54, y, 5.61], [-1.29, y, 3.84],
      [0, y, 3.27], [1.29, y, 3.84], [2.54, y, 5.61], [4.62, y, 1.93]];
    for (let i = 1; i < cable.length; i++) b.beam(cable[i - 1], cable[i], .24, '#4b8396');
    for (const [x, , z] of cable.slice(2, 5)) b.beam([x, y, 1.86], [x, y, z], .16, '#668d94');
  }
  return b.build('Cầu treo Gwangan bắc qua vịnh Busan');
}

export const asiaPorts: Record<string, PortModel> = {
  SGSIN: singapore(), VNSGN: catLai(), VNVUT: caiMep(),
  THLCH: laemChabang(), AEJEA: jebelAli(), KRPUS: busan(),
};
