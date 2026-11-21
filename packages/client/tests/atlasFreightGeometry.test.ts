import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atlasPoint } from '../src/components/ports/atlasGeometry.js';
import { getAtlasFreightCamera, getAtlasFreightWaypoints } from '../src/components/ports/atlasFreightGeometry.js';
import { portGuide } from '../src/components/ports/portGuide.js';

test('a cargo crossing the date line uses the short Pacific arc and lands on the displayed port', () => {
  for (const [from, to] of [['JPTYO', 'USOAK'], ['USOAK', 'JPTYO']]) {
    const points = getAtlasFreightWaypoints(portGuide[from], portGuide[to]);
    const finish = atlasPoint(portGuide[to]);
    assert.ok(Math.abs(points.at(-1)!.x - finish.x) < 1e-7);
    assert.ok(Math.abs(points.at(-1)!.y - finish.y) < 1e-7);
    assert.ok(points.slice(1).every((p, i) => Math.abs(p.x - points[i].x) < 10));
    assert.ok(Math.abs(points[0].x - finish.x) < 110);
    assert.ok(points.some(p => p.y < Math.min(points[0].y, finish.y) - 4), 'great-circle arc bends north');
  }
});

test('the flat and tilted chart frame the whole shipment and leave room for both waypoint labels', () => {
  for (const [from, to] of [['SGSIN','VNVUT'], ['VNSGN','VNVUT'], ['HKHKG','CNYTN'], ['JPTYO','USOAK'], ['USSAV','BRSSZ'], ['USLAX','NLRTM']]) {
    const origin = portGuide[from], destination = portGuide[to];
    for (const tilted of [false, true]) {
      for (const height of [90, 200, 360]) {
        const camera = getAtlasFreightCamera(origin, destination, height, tilted);
        assert.ok(Number.isFinite(camera.scale) && camera.scale > 0);
        const points = getAtlasFreightWaypoints(origin, destination);
        for (const point of points) {
          const x = (point.x - camera.x) * camera.scale + 180;
          const y = (point.y - camera.y) * camera.scale + height / 2;
          assert.ok(x >= 40 && x <= 320, `${from} → ${to} x=${x}`);
          assert.ok(y >= 9 && y <= height - 9, `${from} → ${to} y=${y}`);
        }
        if (from === 'VNSGN') {
          const first = points[0], last = points.at(-1)!;
          assert.ok(camera.scale * Math.hypot(first.x - last.x, first.y - last.y) > 13);
        }
      }
    }
  }
});
