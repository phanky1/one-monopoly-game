import { PortBuilder, type PortModel } from './geometry.js';

type Point = [number, number, number];

function oakland() {
  const port = new PortBuilder();
  const enamel = '#e8f0df';
  const steel = '#66888c';
  for (const [x, y, scale] of [[-1.55, 1.8, .78], [2.15, -.15, 1]]) {
    function point(dx: number, dy: number, z: number): Point {
      return [x + dx * scale, y + dy * scale, z * scale];
    }
    for (const side of [-1, 1]) {
      port.beam(point(-1.2, side * .8, .15), point(-.66, side * .62, 3.55), .38 * scale, steel);
      port.beam(point(1.2, side * .8, .15), point(.82, side * .62, 3.55), .44 * scale, enamel);
    }
    port.box(point(.1, 0, 3.54), [3.4 * scale, 1.62 * scale, .57 * scale], enamel);
    port.box(point(1.36, 0, 3.92), [1.02 * scale, 1.42 * scale, .72 * scale], steel);
    const peak = point(.35, 0, 6.55);
    const tip = point(-3.05, 0, 7.36);
    port.beam(point(1.35, 0, 3.92), peak, .36 * scale, enamel);
    port.beam(point(-.69, 0, 3.82), peak, .32 * scale, enamel);
    port.beam(point(-1.37, 0, 3.62), tip, .52 * scale, enamel);
    port.beam(peak, tip, .17 * scale, steel);
  }
  port.box([-2.75, -1.65, .47], [2.25, 1.13, .94], '#b94e38');
  port.box([-.53, -1.6, .42], [1.8, 1.13, .84], '#456972');
  return port.build('Cần cẩu cảng Oakland');
}

function losAngeles() {
  const port = new PortBuilder();
  const cx = -.75;
  const cy = .25;
  const ivory = '#efe5cb';
  const iron = '#33484e';
  port.box([0, .2, .36], [8.25, 2.55, .72], '#63797b');
  for (const [x, y, size] of [[-3.6, -.95, .88], [-2.25, -1.22, .77], [1, -1.12, .87], [2.5, -1, .96], [3.85, -.65, .71]]) {
    port.cylinder([x, y, 0], size, .74, '#80918e', 5, size * .76);
  }
  port.cylinder([cx, cy, .7], 1.9, .67, iron, 8);
  port.cylinder([cx, cy, 1.37], 1.66, 1.26, ivory, 8);
  port.cylinder([cx, cy, 2.63], 1.84, .25, iron, 8);
  port.cylinder([cx, cy, 2.88], 1.42, 2.43, ivory, 8, 1.17);
  port.box([cx + .18, cy - 1.27, 3.9], [.37, .16, 1.05], '#496369');
  port.box([cx + 1.28, cy - .06, 3.9], [.16, .39, 1.05], '#496369');
  port.cylinder([cx, cy, 5.31], 1.38, .32, iron, 8);
  port.cylinder([cx, cy, 5.63], .83, .9, '#e9bc69', 8);
  port.beam([cx + .05, cy - .76, 5.65], [cx + .05, cy - .76, 6.53], .17, iron);
  port.cylinder([cx, cy, 6.53], 1.02, .7, iron, 8, .12);
  return port.build('Hải đăng Angels Gate');
}

function savannah() {
  const port = new PortBuilder();
  for (const [x, height, brick] of [[-2.25, 3.68, '#af6647'], [.65, 3.06, '#c47d53']] as const) {
    port.box([x, 1.05, height / 2], [2.88, 2.5, height], brick);
    port.roof([x, 1.05, height], 3.08, 2.72, .87, '#506366');
    for (const offset of [-.63, .63]) {
      port.box([x + offset, -.23, 2.24], [.54, .09, .82], '#364d50');
      port.box([x + offset, -.24, .72], [.78, .1, 1.44], '#654b42');
    }
  }
  port.box([.27, -1.83, .1], [6.6, 2.2, .2], '#719796');
  port.box([.65, -1.84, .58], [5.55, 1.43, .76], '#384f54');
  port.box([1.12, -1.8, 1.34], [3.43, 1.14, .82], '#f2e6c6');
  port.box([1.12, -1.8, 1.84], [3.8, 1.43, .23], '#984b3e');
  port.cylinder([2.25, -1.72, 1.96], .26, 1.22, '#384649', 6);
  const cx = -.85, cy = -2.65, cz = 1.48, radius = 1.15;
  const wheel: Point[] = Array.from({ length: 10 }, (_, index) => {
    const angle = index * Math.PI / 5;
    return [cx + Math.cos(angle) * radius, cy, cz + Math.sin(angle) * radius];
  });
  port.face(wheel, '#a44437');
  for (const angle of [0, Math.PI / 3, Math.PI * 2 / 3]) {
    const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
    port.beam([cx - dx, cy - .07, cz - dz], [cx + dx, cy - .07, cz + dz], .16, '#edb074');
  }
  port.box([cx, cy - .14, cz], [.35, .18, .35], '#593f38');
  return port.build('Kho bông và tàu bánh guồng Savannah');
}

function santos() {
  const port = new PortBuilder();
  const cream = '#e3bd7b';
  const stone = '#f1d9a2';
  const patina = '#538077';
  port.box([-1.35, 1.05, 1.51], [4.55, 2.6, 3.02], cream);
  port.roof([-1.35, 1.05, 3.02], 4.85, 2.88, 1.05, '#aa5636');
  for (const x of [-2.72, -1.45, -.18]) {
    port.box([x, -.31, 1.3], [.58, .13, 1.48], '#70574b');
  }
  const cx = 1.35, cy = .24;
  port.box([cx, cy, 2.47], [2.15, 2.11, 4.94], stone);
  port.box([cx, cy, 3.62], [2.47, 2.35, .28], '#936e4c');
  const faceY = cy - 1.07, clockZ = 4.35;
  for (const [radius, y, color] of [[.57, faceY, '#8b6f53'], [.46, faceY - .03, '#ffedc6']] as const) {
    const dial: Point[] = Array.from({ length: 8 }, (_, index) => {
      const angle = index * Math.PI / 4;
      return [cx + Math.cos(angle) * radius, y, clockZ + Math.sin(angle) * radius];
    });
    port.face(dial, color);
  }
  port.beam([cx, faceY - .04, clockZ], [cx, faceY - .04, clockZ + .35], .12, '#514d40');
  port.beam([cx, faceY - .04, clockZ], [cx + .27, faceY - .04, clockZ - .14], .12, '#514d40');
  port.box([cx, cy, 5.06], [2.53, 2.42, .24], stone);
  port.cylinder([cx, cy, 5.18], 1.32, .87, patina, 8, .81);
  port.cylinder([cx, cy, 6.05], .72, .62, stone, 8);
  port.cylinder([cx, cy, 6.67], .89, .85, patina, 8, .12);
  for (const [x, y] of [[-2.45, -1.57], [-1.2, -1.53], [-1.82, -2.41]]) {
    port.cylinder([x, y, .08], .62, .76, '#aa8050', 6, .47);
  }
  return port.build('Tháp đồng hồ Sở Giao dịch Cà phê Santos');
}

function hongKong() {
  const port = new PortBuilder();
  port.box([-.1, 0, .12], [8.65, 2.44, .24], '#709b99');
  const hullFront: Point[] = [[-4.3, -.74, 1.76], [-3.18, -.74, .24], [3.09, -.74, .24], [4.05, -.74, 1.91], [2.64, -.74, 1.45], [-2.6, -.74, 1.3]];
  const hullBack: Point[] = hullFront.map(([x, y, z]) => [x, -y, z]);
  port.face(hullFront, '#743d30');
  port.face([...hullBack].reverse(), '#623c32');
  for (let i = 0; i < hullFront.length; i++) {
    const next = (i + 1) % hullFront.length;
    port.face([hullFront[i], hullBack[i], hullBack[next], hullFront[next]], '#b67d4a');
  }
  port.box([2.5, .06, 1.77], [1.52, 1.3, .72], '#a66a43');
  port.box([2.52, .06, 2.2], [1.77, 1.49, .19], '#543d37');
  for (const [mast, base, scale] of [[-1.95, 1.34, 1.04], [.94, 1.49, .79]]) {
    port.beam([mast, .04, base], [mast + .48 * scale, .04, base + 5.82 * scale], .21, '#564334');
    const profile = [[-1.19, 1.49, .61, .12], [-1.29, 1.56, 1.92, .33], [-.97, 1.39, 3.2, .54], [-.48, 1.06, 4.39, .72], [.13, .64, 5.21, .6]];
    const at = (x: number, h: number): Point => [mast + x * scale, -.16 + x * .09, base + h * scale];
    for (let band = 0; band < profile.length - 1; band++) {
      const [left, right, z, lift] = profile[band];
      const [leftTop, rightTop, zTop, liftTop] = profile[band + 1];
      port.face([at(left, z), at(right, z + lift), at(rightTop, zTop + liftTop), at(leftTop, zTop)], band % 2 === 0 ? '#b94532' : '#d75838');
      port.beam(at(left, z), at(right, z + lift), .13, '#783d30');
    }
  }
  return port.build('Thuyền buồm đỏ Hồng Kông');
}

function tokyo() {
  const port = new PortBuilder();
  const red = '#c84b32';
  const ivory = '#f4e7ca';
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      port.box([2.02 * x, 1.43 * y, .2], [.82, .73, .4], '#8a8c7a');
      port.beam([2.02 * x, 1.43 * y, .32], [1.03 * x, .79 * y, 2.15], .46, red);
      port.beam([1.03 * x, .79 * y, 2.15], [.75 * x, .51 * y, 3.65], .38, ivory);
      port.beam([.74 * x, .52 * y, 3.97], [.32 * x, .25 * y, 5.75], .28, red);
    }
  }
  port.beam([-1.44, -1.03, 1.3], [.76, -.51, 3.55], .22, red);
  port.beam([1.44, -1.03, 1.3], [-.76, -.51, 3.55], .22, red);
  port.box([0, 0, 3.7], [2.47, 1.84, .54], '#43565a');
  port.box([0, 0, 4.02], [2.63, 1.97, .2], ivory);
  port.box([0, 0, 5.78], [1.08, .81, .37], ivory);
  port.cylinder([0, 0, 5.97], .42, .89, red, 4, .23);
  port.cylinder([0, 0, 6.86], .23, .53, ivory, 4, .17);
  port.cylinder([0, 0, 7.39], .17, .57, red, 4, .07);
  port.box([-2.61, -1.53, .31], [2.88, 1.12, .62], '#526d71');
  port.box([-2.53, -1.53, .81], [1.43, .76, .39], ivory);
  return port.build('Tháp Tokyo bên cầu cảng');
}

export const pacificPorts: Record<string, PortModel> = {
  USOAK: oakland(),
  USLAX: losAngeles(),
  USSAV: savannah(),
  BRSSZ: santos(),
  HKHKG: hongKong(),
  JPTYO: tokyo(),
};
