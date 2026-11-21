import assert from 'node:assert/strict';
import { it } from 'node:test';
import { getBoardLighting } from '../src/components/boardLighting.js';

const skyAt = (turnCount: number, activePlayerIndex: number, stormActive = false) =>
  getBoardLighting({ turnCount, activePlayerIndex, playerCount: 3, stormActive });

it('advances the sun and moon from the shared turn, including across round boundaries', () => {
  const cycle = [skyAt(1, 0), skyAt(1, 1), skyAt(1, 2), skyAt(2, 0), skyAt(2, 1), skyAt(2, 2)];
  assert.deepEqual(cycle.map(sky => sky.phase), ['dawn', 'day', 'dusk', 'moonrise', 'midnight', 'moonset']);
  assert.deepEqual(skyAt(3, 0), cycle[0]);
  assert.ok(cycle[0].sourceX > 0 && cycle[2].sourceX < 0);
  for (const sky of cycle) {
    assert.ok(sky.sourceX * sky.shadowX + sky.sourceY * sky.shadowY < 0);
  }
  assert.ok(Math.hypot(cycle[0].shadowX, cycle[0].shadowY) > Math.hypot(cycle[1].shadowX, cycle[1].shadowY));
});

it('softens the same light source for a storm during the day or night', () => {
  for (const round of [1, 2]) {
    const clear = skyAt(round, 0);
    const storm = skyAt(round, 0, true);
    assert.equal(clear.weather, 'clear');
    assert.equal(storm.weather, 'storm');
    assert.equal(clear.phase, storm.phase);
    assert.equal(clear.sourceX, storm.sourceX);
    assert.equal(clear.sourceY, storm.sourceY);
    assert.ok(storm.shadowOpacity < clear.shadowOpacity);
    assert.ok(storm.shadowBlur > clear.shadowBlur);
    assert.ok(Math.hypot(storm.shadowX, storm.shadowY) < Math.hypot(clear.shadowX, clear.shadowY));
  }
});

it('recreates passing showers from the shared turn and lets a drawn storm take precedence', () => {
  const turn = { turnCount: 3, activePlayerIndex: 0, playerCount: 2 };
  const rain = getBoardLighting(turn);
  assert.equal(rain.weather, 'showers');
  assert.deepEqual(getBoardLighting({ ...turn }), rain);
  const storm = getBoardLighting({ ...turn, stormActive: true });
  assert.equal(storm.weather, 'storm');
  assert.equal(storm.phase, rain.phase);
  assert.ok(rain.shadowOpacity > storm.shadowOpacity);
  assert.ok(rain.shadowBlur < storm.shadowBlur);
  assert.equal(getBoardLighting({ ...turn, turnCount: 4 }).weather, 'clear');
});
