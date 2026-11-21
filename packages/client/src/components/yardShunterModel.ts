import { PortBuilder, type Vec3 } from './ports/geometry.js';

// X points towards the tractor's nose. The gooseneck and trailer sit behind the cab.
function wheel(model: PortBuilder, x: number, side: number, radius: number) {
  const y = side * .9;
  const ring = (atY: number, r: number): Vec3[] => Array.from({ length: 14 }, (_, i) => {
    const a = i * Math.PI / 7;
    return [x + r * Math.cos(a), atY, radius + r * Math.sin(a)];
  });
  const inner = ring(y - side * .16, radius);
  const outer = ring(y + side * .16, radius);
  for (let i = 0; i < outer.length; i++) {
    const next = (i + 1) % outer.length;
    model.face([inner[i], inner[next], outer[next], outer[i]], '#243137');
  }
  model.face(outer, '#26373c');
  model.face(ring(y + side * .18, radius * .55), '#a5b8b7');
  model.face(ring(y + side * .20, radius * .27), '#354c54');
}

export function buildYardShunter(loaded: boolean) {
  const m = new PortBuilder();
  const steel = '#416575', chassis = '#e17d32', cab = '#e6b843', glass = '#245864';
  // Two narrow parallel rails and cross-members leave an open skeletal chassis.
  for (const y of [-.8, .8]) m.box([-1.65, y, .94], [5.85, .21, .32], steel);
  for (const x of [-4.45, -2.9, -1.05, 1.14]) m.box([x, 0, .95], [.22, 1.95, .25], chassis);
  m.box([2.52, 0, .84], [3.15, 1.87, .48], '#29434a');
  m.box([1.68, 0, 1.17], [1.59, 1.76, .25], '#9daead');
  m.box([3.12, 0, 1.37], [1.74, 1.86, .83], cab);
  m.box([3.14, -.10, 2.11], [1.36, 1.60, .89], '#f1e3b5');
  m.box([3.83, -.1, 2.20], [.035, 1.39, .50], glass);
  for (const side of [-1, 1]) {
    const y = -.10 + side * .81;
    m.box([3.24, y, 2.19], [.86, .032, .46], glass);
    m.box([2.65, y, 2.19], [.18, .032, .46], glass);
    m.box([3.98, side * .63, 1.53], [.055, .28, .18], '#fff7bf');
    for (const axle of [-3.78, -2.72, 1.70, 3.46]) wheel(m, axle, side, axle < 0 ? .46 : .54);
  }
  m.box([3.12, -.10, 2.62], [1.56, 1.81, .13], cab);
  m.cylinder([3.1, -.45, 2.69], .13, .23, '#fd6d32', 8);
  m.box([4.04, 0, .95], [.22, 2.0, .24], '#759091');
  if (loaded) {
    const magenta = '#c94776';
    m.box([-1.66, 0, 1.99], [5.70, 2.06, 1.82], magenta);
    for (const y of [-1.04, 1.04]) {
      for (let x = -4.25; x < 1; x += .42) m.box([x, y, 1.98], [.086, .045, 1.52], '#e16488');
      for (const z of [1.13, 2.86]) m.box([-1.66, y, z], [5.70, .05, .09], '#8c3258');
    }
  }
  return m.build(loaded ? 'Đầu kéo chở hàng xuất' : 'Đầu kéo mang moóc rỗng');
}
