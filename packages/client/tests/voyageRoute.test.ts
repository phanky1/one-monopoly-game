import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portGuide } from '../src/components/ports/portGuide.js';
import { atlasPoint, unwrapAtlasX } from '../src/components/ports/atlasGeometry.js';
import { voyageRoute } from '../src/components/ports/voyageRoute.js';

test('trans-Pacific replay takes the short date-line crossing both ways and frames both harbors', () => {
  for (const [start, finish] of [['JPTYO', 'USLAX'], ['USLAX', 'JPTYO'], ['SGSIN', 'VNVUT'], ['HKHKG', 'CNYTN']]) {
    const a = portGuide[start], b = portGuide[finish];
    const route = voyageRoute(a, b);
    const origin = atlasPoint(a), destination = atlasPoint(b);
    const unwrapped = unwrapAtlasX(destination.x, origin.x);
    const final = route.points.at(-1)!;
    assert.ok(Math.abs(final.x - (route.left + unwrapped * route.scale)) < 1e-7);
    assert.ok(Math.abs(final.y - (route.top + destination.y * route.scale)) < 1e-7);
    assert.ok(route.points.every(p => p.x >= 59 && p.x < 421 && p.y >= 34 && p.y < 191));
    assert.ok(route.points.slice(1).every((p, i) => Math.abs(p.x - route.points[i].x) < 18));
    if (Math.abs(destination.x - origin.x) > 180) assert.equal(route.mapOffsets.length, 2);
  }
});
