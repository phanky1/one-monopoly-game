import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OneMonopolyEngine } from '../src/gameEngine.js';

const { createGame, dispatch } = OneMonopolyEngine;
const players = [
  { id: 'a', name: 'An', token: 'ONE_APUS' as const },
  { id: 'b', name: 'Bao', token: 'ONE_MAGENTA' as const },
];

describe('construction during auctions, trades and storms', () => {
  it('does not grant a construction visit when the docked captain wins an auction', () => {
    const game = createGame('auction-visit', players);
    const landed = dispatch(game, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    const opened = dispatch(landed.state, { type: 'SKIP_BUY' });
    const auctionId = opened.state.auction!.id;
    assert.equal(opened.state.auction!.bidderId, 'b');
    const passed = dispatch(opened.state, { type: 'AUCTION_PASS', auctionId, revision: 0 });
    const won = dispatch(passed.state, { type: 'AUCTION_BID', auctionId, revision: 1, amount: 10 });
    assert.equal(won.state.properties[3].ownerId, 'a');
    assert.equal(won.state.phase, 'END_OF_TURN');
    assert.equal(won.state.canUpgradeCurrentPort, false);
    const attempted = dispatch(won.state, { type: 'BUILD_CONTAINER', tileId: 3 });
    assert.deepEqual(attempted.events, []);
    assert.equal(attempted.state.properties[3].containerLevel, 0);
  });

  it('closes a construction visit when the docked captain sells, even after buying the port back', () => {
    const game = createGame('traded-visit', players);
    game.properties[3].ownerId = 'a';
    const landed = dispatch(game, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    assert.equal(landed.state.canUpgradeCurrentPort, true);
    const offered = dispatch(landed.state, { type: 'OFFER_TRADE', tileId: 3, sellerId: 'a', price: 90 }, 'b');
    const sold = dispatch(offered.state, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, 'a');
    assert.equal(sold.state.properties[3].ownerId, 'b');
    assert.equal(sold.state.canUpgradeCurrentPort, false);
    const returnOffer = dispatch(sold.state, { type: 'OFFER_TRADE', tileId: 3, sellerId: 'b', price: 90 }, 'a');
    const repurchased = dispatch(returnOffer.state, { type: 'RESPOND_TRADE', offerId: 2, accept: true }, 'b');
    assert.equal(repurchased.state.properties[3].ownerId, 'a');
    const attempted = dispatch(repurchased.state, { type: 'BUILD_CONTAINER', tileId: 3 });
    assert.deepEqual(attempted.events, []);
    assert.equal(attempted.state.properties[3].containerLevel, 0);
  });

  it('lets a captain build on drifting home, closes sibling port offers, and keeps the doubles roll', () => {
    const game = createGame('storm-visit', players);
    game.opsDeck = ['OPS-02'];
    game.properties[1].ownerId = 'a';
    game.properties[3].ownerId = 'a';
    const draw = dispatch(game, { type: 'ROLL_DICE', forcedDice: [3, 3] });
    assert.equal(draw.state.phase, 'AWAITING_STORM_DECISION');
    const offer = dispatch(draw.state, { type: 'OFFER_TRADE', tileId: 1, sellerId: 'a', price: 60 }, 'b');
    const drift = dispatch(offer.state, { type: 'RESOLVE_STORM', choice: 'DRIFT' });
    assert.equal(drift.state.players[0].position, 3);
    assert.equal(drift.state.canUpgradeCurrentPort, true);
    assert.equal(drift.state.phase, 'WAIT_FOR_ROLL');
    const built = dispatch(drift.state, { type: 'BUILD_CONTAINER', tileId: 3 });
    assert.equal(built.state.properties[3].containerLevel, 1);
    assert.equal(built.state.canUpgradeCurrentPort, false);
    assert.deepEqual(built.state.tradeOffers, []);
    assert.ok(built.events.some(e => e.type === 'TRADE_CLOSED' && e.offer.id === 1 && e.result === 'EXPIRED'));
    const rollAgain = dispatch(built.state, { type: 'ROLL_DICE', forcedDice: [2, 3] });
    assert.ok(rollAgain.events.some(e => e.type === 'DICE_ROLLED' && e.playerId === 'a'));
    assert.equal(rollAgain.state.players[0].position, 8);
  });
});
