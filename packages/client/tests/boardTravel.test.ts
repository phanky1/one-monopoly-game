import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OneMonopolyEngine } from '@one-monopoly/shared';
import { buildTravelFrames, type TravelFrame } from '../src/components/boardTravel.js';

function roll(tile: number, dice: [number, number]) {
  const game = OneMonopolyEngine.createGame('chart', [
    { id: 'captain', name: 'Captain', token: 'ONE_APUS' },
    { id: 'pilot', name: 'Pilot', token: 'PILOT_BOAT' },
  ]);
  game.players[0].position = tile;
  game.opsDeck = ['OPS-02']; // Offshore storm.
  game.marketDeck = ['MKT-04']; // Go directly to Singapore.
  return OneMonopolyEngine.dispatch(game, { type: 'ROLL_DICE', forcedDice: dice });
}

const poses = (frames: TravelFrame[]) => frames.map(({ tile, heading }) => [tile, heading]);

describe('board travel playback', () => {
  it('travels clockwise and turns at the corner before leaving it', () => {
    const frames = buildTravelFrames({ tile: 7, heading: 270 }, 'captain', roll(7, [1, 2]).events);

    assert.deepEqual(poses(frames), [[7, 270], [8, 270], [8, 0], [9, 0], [10, 0]]);
  });

  it('passes through GO exactly once and turns up the left side', () => {
    const frames = buildTravelFrames({ tile: 30, heading: 180 }, 'captain', roll(30, [1, 2]).events);

    assert.deepEqual(poses(frames), [[30, 180], [31, 180], [0, 180], [0, 270], [1, 270]]);
  });

  it('stops on the storm and animates the chosen drift backwards around a corner', () => {
    const draw = roll(16, [1, 1]);
    const approach = buildTravelFrames({ tile: 16, heading: 90 }, 'captain', draw.events);
    assert.deepEqual(poses(approach), [[16, 90], [17, 90], [18, 90]]);
    const drift = OneMonopolyEngine.dispatch(draw.state, { type: 'RESOLVE_STORM', choice: 'DRIFT' });
    const frames = buildTravelFrames(approach.at(-1)!, 'captain', drift.events);
    assert.deepEqual(poses(frames), [[18, 270], [17, 270], [16, 270], [16, 180], [15, 180]]);
    assert.deepEqual(buildTravelFrames({ tile: 0, heading: 270 }, 'pilot', drift.events), []);
  });

  it('keeps a ship in place when it hires the tug', () => {
    const draw = roll(4, [1, 1]);
    const tug = OneMonopolyEngine.dispatch(draw.state, { type: 'RESOLVE_STORM', choice: 'TUG' });
    assert.deepEqual(buildTravelFrames({ tile: 6, heading: 270 }, 'captain', tug.events), []);
  });

  it('moves directly from the card space to its named destination', () => {
    const frames = buildTravelFrames({ tile: 23, heading: 90 }, 'captain', roll(23, [1, 2]).events);

    assert.deepEqual(poses(frames), [[23, 90], [24, 90], [24, 180], [25, 180], [26, 180], [0, 270]]);
    assert.deepEqual(frames.filter((frame) => frame.gliding).map((frame) => frame.tile), [24, 25, 26]);
  });

  it('visits the go-to-hold space before transferring directly to customs', () => {
    const frames = buildTravelFrames({ tile: 21, heading: 90 }, 'captain', roll(21, [1, 2]).events);

    assert.deepEqual(poses(frames), [[21, 90], [22, 90], [23, 90], [24, 90], [8, 0]]);
    assert.deepEqual(frames.filter((frame) => frame.gliding).map((frame) => frame.tile), [22, 23, 24]);
  });

  it('leaves the observing player in place during the other player’s roll and transfer', () => {
    assert.deepEqual(buildTravelFrames({ tile: 21, heading: 90 }, 'pilot', roll(21, [1, 2]).events), []);
  });
});

it('turns toward the booked sailing leg, then crosses the chart directly to the destination', () => {
  const leg = buildTravelFrames({ tile: 0, heading: 270 }, 'captain', [
    { type: 'SHIP_STEPPED', playerId: 'captain', from: 0, to: 17 },
  ], true);
  assert.deepEqual(leg.map(frame => frame.tile), [0, 17]);
  assert.ok(leg[0].heading > 270 && leg[0].heading < 360);
  assert.equal(leg[1].heading, leg[0].heading);
  assert.equal(leg[1].gliding, true);
  assert.ok(leg[1].duration > 400);
});
