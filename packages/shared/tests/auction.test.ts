import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_TILES, SECRET_MISSIONS } from '../src/boardData.js';
import { OneMonopolyEngine } from '../src/gameEngine.js';
import type { GameAction, GameState } from '../src/types.js';

const { createGame, dispatch } = OneMonopolyEngine;
const players = [
  { id: 'a', name: 'A', token: 'ONE_APUS' as const },
  { id: 'b', name: 'B', token: 'ONE_MAGENTA' as const },
  { id: 'c', name: 'C', token: 'PILOT_BOAT' as const },
];

function land(game = createGame('auction', players), tileId = 3) {
  game.players[game.activePlayerIndex].position = tileId - 3;
  return dispatch(game, { type: 'ROLL_DICE', forcedDice: [1, 2] });
}

function answer(state: GameState, amount?: number) {
  assert.ok(state.auction);
  const { id: auctionId, revision } = state.auction;
  return dispatch(state, amount === undefined
    ? { type: 'AUCTION_PASS', auctionId, revision }
    : { type: 'AUCTION_BID', auctionId, revision, amount });
}

describe('property auctions', () => {
  it('rotates clockwise, keeps passes final, and charges only the winner at the actual bid', () => {
    const game = createGame('mission', players);
    game.properties[1].ownerId = 'b';
    game.properties[4].ownerId = 'b';
    game.players[1].secretMission = { ...SECRET_MISSIONS.find(mission => mission.id === 'MISSION-5')! };
    const landed = land(game);
    assert.equal(landed.state.phase, 'AWAITING_BUY_DECISION');
    assert.deepEqual(dispatch(landed.state, { type: 'END_TURN' }), { state: landed.state, events: [] });
    const start = dispatch(landed.state, { type: 'SKIP_BUY' });
    assert.equal(start.state.phase, 'AWAITING_AUCTION');
    assert.deepEqual(start.events, [{ type: 'AUCTION_STARTED', tileId: 3 }]);
    assert.deepEqual(start.state.auction, {
      id: 1, revision: 0, tileId: 3, bidderId: 'b', highestBid: 0, leaderId: null, passedIds: [],
    });

    const opening = answer(start.state, 20);
    assert.equal(opening.state.auction?.bidderId, 'c');
    const pass = answer(opening.state);
    assert.deepEqual(pass.state.auction?.passedIds, ['c']);
    assert.equal(pass.state.auction?.bidderId, 'a');
    const raise = answer(JSON.parse(JSON.stringify(pass.state)), 40);
    assert.equal(raise.state.auction?.bidderId, 'b');
    const finalBid = answer(raise.state, 50);
    assert.equal(finalBid.state.auction?.bidderId, 'a');
    assert.equal(finalBid.state.auction?.revision, 4);
    assert.equal(finalBid.state.activePlayerIndex, 0);
    assert.deepEqual(finalBid.state.players.map(player => player.balance), [1500, 1500, 1500]);
    assert.equal(finalBid.state.properties[3].ownerId, null);

    const result = answer(finalBid.state);
    assert.equal(result.state.phase, 'END_OF_TURN');
    assert.equal(result.state.activePlayerIndex, 0);
    assert.equal(result.state.auction, null);
    assert.equal(result.state.properties[3].ownerId, 'b');
    assert.equal(result.state.players[1].secretMission?.isCompleted, true);
    assert.deepEqual(result.state.players.map(player => player.balance), [1500, 1800, 1500]);
    assert.deepEqual(result.events.filter(e => e.type === 'TILE_PURCHASED'), [
      { type: 'TILE_PURCHASED', playerId: 'b', tileId: 3, price: 50 },
    ]);
    assert.deepEqual(result.events.filter(e => e.type === 'AUCTION_ENDED'), [
      { type: 'AUCTION_ENDED', tileId: 3, winnerId: 'b', price: 50 },
    ]);
    assert.deepEqual(result.events.filter(e => e.type === 'BALANCE_CHANGED').map(e => [e.playerId, e.delta]),
      [['b', -50], ['b', 350]]);
    assert.deepEqual(dispatch(result.state, { type: 'AUCTION_PASS', auctionId: 1, revision: 4 }),
      { state: result.state, events: [] });
  });

  for (const tileId of [3, 4, 10]) {
    it('opens a bank auction on an unaffordable ' + BOARD_TILES[tileId].type, () => {
      const game = createGame('short-of-list', players);
      game.activePlayerIndex = 2;
      game.players[2].balance = BOARD_TILES[tileId].price! - 1;
      const start = land(game, tileId);
      assert.equal(start.state.phase, 'AWAITING_AUCTION');
      assert.equal(start.state.activePlayerIndex, 2);
      assert.equal(start.state.auction?.bidderId, 'a');
      assert.ok(start.events.some(e => e.type === 'AUCTION_STARTED' && e.tileId === tileId));
      const first = answer(start.state);
      const second = answer(first.state);
      assert.equal(second.state.auction?.bidderId, 'c');
      const result = answer(second.state, 10);
      assert.equal(result.state.properties[tileId].ownerId, 'c');
      assert.equal(result.state.players[2].balance, game.players[2].balance - 10);
    });
  }

  it('skips bankrupt seats and seats unable to cover the next bid', () => {
    const game = createGame('eligible', players);
    game.players[0].balance = 80;
    game.players[1].isBankrupt = true;
    game.players[2].balance = 80;
    const start = dispatch(land(game).state, { type: 'SKIP_BUY' });
    assert.equal(start.state.auction?.bidderId, 'c');
    const result = answer(start.state, 80);
    assert.equal(result.state.auction, null);
    assert.equal(result.state.properties[3].ownerId, 'c');
    assert.deepEqual(result.state.players.map(player => player.balance), [80, 1500, 0]);
  });

  it('starts collecting normal rent on the next visit to the purchased port', () => {
    const start = dispatch(land().state, { type: 'SKIP_BUY' });
    const bPasses = answer(start.state);
    const cBids = answer(bPasses.state, 10);
    const sold = answer(cBids.state);
    assert.equal(sold.state.properties[3].ownerId, 'c');
    assert.equal(sold.state.players[0].balance, 1500);
    const nextTurn = dispatch(sold.state, { type: 'END_TURN' });
    const visit = dispatch(nextTurn.state, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    assert.deepEqual(visit.state.players.map(player => player.balance), [1500, 1496, 1494]);
    assert.deepEqual(visit.events.filter(event => event.type === 'DEMURRAGE_PAID'), [
      { type: 'DEMURRAGE_PAID', debtorId: 'b', creditorId: 'c', tileId: 3, amount: 4 },
    ]);
  });

  it('leaves the property with the bank when even the sole eligible bidder passes', () => {
    const game = createGame('solo', players);
    game.players[0].balance = 9;
    game.players[1].balance = 10;
    game.players[2].balance = 9;
    const start = land(game);
    assert.equal(start.state.auction?.bidderId, 'b');
    const result = answer(start.state);
    assert.equal(result.state.properties[3].ownerId, null);
    assert.equal(result.state.phase, 'END_OF_TURN');
    assert.deepEqual(result.events, [{ type: 'AUCTION_ENDED', tileId: 3, winnerId: null, price: 0 }]);
    assert.deepEqual(result.state.players.map(player => player.balance), [9, 10, 9]);
  });

  it('closes immediately if nobody can afford the opening bid, retaining doubles and unique IDs', () => {
    const game = createGame('legacy', players);
    delete game.auction;
    delete game.auctionSequence;
    game.players.forEach(player => { player.balance = 9; });
    game.players[0].position = 1;
    const closed = dispatch(game, { type: 'ROLL_DICE', forcedDice: [1, 1] });
    assert.equal(closed.state.phase, 'WAIT_FOR_ROLL');
    assert.equal(closed.state.hasRolled, false);
    assert.equal(closed.state.auctionSequence, 1);
    assert.equal(closed.state.properties[3].ownerId, null);
    assert.deepEqual(closed.events.slice(-2), [
      { type: 'AUCTION_STARTED', tileId: 3 },
      { type: 'AUCTION_ENDED', tileId: 3, winnerId: null, price: 0 },
    ]);
    closed.state.players[1].balance = 20;
    const second = dispatch(closed.state, { type: 'ROLL_DICE', forcedDice: [1, 1] });
    assert.equal(second.state.auction?.id, 2);
    assert.deepEqual(dispatch(second.state, { type: 'AUCTION_BID', auctionId: 1, revision: 0, amount: 10 }),
      { state: second.state, events: [] });
    const won = answer(second.state, 10);
    assert.equal(won.state.activePlayerIndex, 0);
    assert.equal(won.state.phase, 'WAIT_FOR_ROLL');
    assert.equal(won.state.hasRolled, false);
  });

  it('rejects unrelated actions, invalid bids and duplicate responses without advancing the auction', () => {
    const start = dispatch(land().state, { type: 'SKIP_BUY' });
    const base = { auctionId: 1, revision: 0 };
    const invalid = [
      { type: 'END_TURN' }, { type: 'BUY_PROPERTY' }, { type: 'SKIP_BUY' }, { type: 'ROLL_DICE' },
      { type: 'DECLARE_BANKRUPTCY' }, { type: 'MORTGAGE_TILE', tileId: 3 },
      { type: 'AUCTION_PASS', ...base, auctionId: 2 }, { type: 'AUCTION_PASS', ...base, revision: 1 },
      { type: 'AUCTION_PASS' }, { type: 'AUCTION_BID', ...base },
      ...[-10, 0, 5, 11.5, '20', Infinity, NaN, 1510].map(amount => ({ type: 'AUCTION_BID', ...base, amount })),
    ];
    for (const action of invalid) {
      const result = dispatch(start.state, action as GameAction);
      assert.strictEqual(result.state, start.state);
      assert.deepEqual(result.events, []);
    }
    const bid = { type: 'AUCTION_BID' as const, ...base, amount: 10 };
    const opening = dispatch(start.state, bid);
    for (const rejected of [bid, { ...bid, revision: 1 }]) {
      assert.deepEqual(dispatch(opening.state, rejected), { state: opening.state, events: [] });
    }
    const anotherPass = { type: 'AUCTION_PASS' as const, auctionId: 1, revision: 1 };
    const passed = dispatch(opening.state, anotherPass);
    assert.deepEqual(dispatch(passed.state, anotherPass), { state: passed.state, events: [] });
  });
});
