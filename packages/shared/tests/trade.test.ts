import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SECRET_MISSIONS } from '../src/boardData.js';
import { OneMonopolyEngine } from '../src/gameEngine.js';
import type { EngineResult, GameAction, GameState, TurnPhase } from '../src/types.js';

const { createGame, dispatch } = OneMonopolyEngine;
const players = [
  { id: 'roller', name: 'Linh', token: 'ONE_APUS' as const },
  { id: 'buyer', name: 'An', token: 'REEFER_TRUCK' as const },
  { id: 'seller', name: 'Minh', token: 'GANTRY_CRANE' as const },
];

function game() {
  const state = createGame('trade', players);
  for (const player of state.players) delete player.secretMission;
  state.properties[3].ownerId = 'seller';
  return state;
}

function offer(state: GameState, price = 101, buyer = 'buyer', tileId = 3) {
  return dispatch(state, { type: 'OFFER_TRADE', tileId, sellerId: 'seller', price }, buyer);
}

function closed(result: EngineResult) {
  return result.events.filter(event => event.type === 'TRADE_CLOSED')
    .map(event => [event.offer.id, event.result]);
}

function reject(state: GameState, action: GameAction, actor?: string) {
  const result = dispatch(state, action, actor);
  assert.deepEqual(result, { state, events: [] });
}

describe('cash offers between captains', () => {
  it('transfers the negotiated price, ownership and mission reward once while a third captain keeps the turn', () => {
    const state = game();
    state.properties[1].ownerId = 'buyer';
    state.properties[4].ownerId = 'buyer';
    state.properties[3].slotCharter = { partnerId: 'roller', active: false };
    const mission = SECRET_MISSIONS.find(card => card.id === 'MISSION-5')!;
    state.players[1].secretMission = { ...mission };
    const proposed = offer(state);
    const pending = proposed.state.tradeOffers!;
    assert.deepEqual(pending, [{ id: 1, buyerId: 'buyer', sellerId: 'seller', tileId: 3, price: 101 }]);
    assert.deepEqual(proposed.events, [{ type: 'TRADE_OFFERED', offer: pending[0] }]);
    assert.deepEqual(proposed.state.players.map(p => p.balance), [1500, 1500, 1500]);
    assert.equal(proposed.state.properties[3].ownerId, 'seller');

    const accept: GameAction = { type: 'RESPOND_TRADE', offerId: 1, accept: true };
    const sold = dispatch(JSON.parse(JSON.stringify(proposed.state)), accept, 'seller');
    assert.deepEqual(closed(sold), [[1, 'ACCEPTED']]);
    assert.deepEqual(sold.state.tradeOffers, []);
    assert.equal(sold.state.properties[3].ownerId, 'buyer');
    assert.equal(sold.state.properties[3].slotCharter, null);
    assert.deepEqual(sold.state.players.map(p => p.balance), [1500, 1399 + mission.reward, 1601]);
    assert.equal(sold.state.players[1].secretMission?.isCompleted, true);
    assert.equal(sold.events.filter(e => e.type === 'MISSION_COMPLETED').length, 1);
    assert.equal(sold.state.phase, 'WAIT_FOR_ROLL');
    assert.equal(sold.state.activePlayerIndex, 0);
    assert.deepEqual(sold.state.players.map(p => p.position), [0, 0, 0]);
    reject(sold.state, accept, 'seller');

    const landed = dispatch(sold.state, { type: 'ROLL_DICE', forcedDice: [1, 2] });
    assert.ok(landed.events.some(e => e.type === 'DEMURRAGE_PAID' && e.debtorId === 'roller' &&
      e.creditorId === 'buyer' && e.tileId === 3 && e.amount === 8));
  });

  it('lets the seller decline and the buyer withdraw across turns and old snapshots', () => {
    const state = game();
    state.phase = 'END_OF_TURN';
    delete state.tradeOffers;
    delete state.tradeSequence;
    const first = offer(state, 1).state;
    const nextTurn = dispatch(first, { type: 'END_TURN' }).state;
    assert.equal(nextTurn.activePlayerIndex, 1);
    const declined = dispatch(nextTurn, { type: 'RESPOND_TRADE', offerId: 1, accept: false }, 'seller');
    assert.deepEqual(closed(declined), [[1, 'DECLINED']]);
    const second = offer(declined.state, 1500).state;
    assert.equal(second.tradeOffers![0].id, 2);
    reject(second, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, 'seller');
    const withdrawn = dispatch(second, { type: 'CANCEL_TRADE', offerId: 2 }, 'buyer');
    assert.deepEqual(closed(withdrawn), [[2, 'WITHDRAWN']]);
    assert.deepEqual(withdrawn.state.tradeOffers, []);
    assert.deepEqual(withdrawn.state.players.map(p => p.balance), [1500, 1500, 1500]);
    assert.equal(withdrawn.state.properties[3].ownerId, 'seller');
  });

  it('validates the price, sender, current owner and one outgoing offer per captain', () => {
    const state = game();
    const action: GameAction = { type: 'OFFER_TRADE', sellerId: 'seller', tileId: 3, price: 120 };
    for (const price of [0, -1, 1.25, 1501, NaN, Infinity, '120']) {
      reject(state, { ...action, price } as GameAction, 'buyer');
    }
    for (const actor of [undefined, 'unknown', 'seller']) reject(state, action, actor);
    reject(state, { ...action, sellerId: 'roller' }, 'buyer');
    for (const tileId of [0, 4, -1, 33]) reject(state, { ...action, tileId }, 'buyer');
    state.properties[4].ownerId = 'seller';
    const pending = dispatch(state, action, 'buyer').state;
    reject(pending, { ...action, tileId: 4 }, 'buyer');
    for (const actor of ['buyer', 'roller']) {
      reject(pending, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, actor);
      reject(pending, { type: 'RESPOND_TRADE', offerId: 1, accept: false }, actor);
    }
    reject(pending, { type: 'CANCEL_TRADE', offerId: 1 }, 'seller');
    reject(pending, { type: 'RESPOND_TRADE', offerId: 1, accept: 'yes' } as unknown as GameAction, 'seller');
  });

  it('protects mortgaged assets, active charter agreements, developed routes and bankrupt captains', () => {
    const setup: Array<(state: GameState) => void> = [
      state => { state.properties[3].isMortgaged = true; },
      state => { state.properties[3].slotCharter = { partnerId: 'roller', active: true }; },
      state => { state.properties[1].ownerId = 'seller'; state.properties[1].containerLevel = 1; },
      state => { state.properties[1].ownerId = 'seller'; state.properties[1].hasGreenFleet = true; },
      state => { state.players[1].isBankrupt = true; },
      state => { state.players[2].isBankrupt = true; },
    ];
    for (const arrange of setup) {
      const state = game();
      arrange(state);
      assert.deepEqual(offer(state), { state, events: [] });
    }
  });

  it('invalidates competing offers when one buyer wins, and rechecks ownership before settlement', () => {
    const first = offer(game()).state;
    const second = offer(first, 123, 'roller').state;
    const sold = dispatch(second, { type: 'RESPOND_TRADE', offerId: 2, accept: true }, 'seller');
    assert.deepEqual(closed(sold).sort(), [[1, 'EXPIRED'], [2, 'ACCEPTED']]);
    assert.deepEqual(sold.state.players.map(p => p.balance), [1377, 1500, 1623]);
    assert.deepEqual(sold.state.tradeOffers, []);
    reject(sold.state, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, 'seller');
    const stale = structuredClone(first);
    stale.properties[3].ownerId = 'roller';
    const response = dispatch(stale, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, 'seller');
    assert.equal(response.state.properties[3].ownerId, 'roller');
    assert.deepEqual(response.state.players.map(p => p.balance), [1500, 1500, 1500]);
    assert.ok(!closed(response).some(([, result]) => result === 'ACCEPTED'));
  });

  it('expires an offer when a purchase spends the buyer’s available cash', () => {
    const state = game();
    state.activePlayerIndex = 1;
    state.players[1].balance = 250;
    const pending = offer(state, 101).state;
    const landed = dispatch(pending, { type: 'ROLL_DICE', forcedDice: [1, 3] });
    const bought = dispatch(landed.state, { type: 'BUY_PROPERTY' });
    assert.equal(bought.state.properties[4].ownerId, 'buyer');
    assert.equal(bought.state.players[1].balance, 50);
    assert.equal(bought.state.properties[3].ownerId, 'seller');
    assert.deepEqual(closed(bought), [[1, 'EXPIRED']]);
    assert.deepEqual(bought.state.tradeOffers, []);
  });

  it('expires outstanding offers on a newly mortgaged property and on game over', () => {
    const state = game();
    state.activePlayerIndex = 2;
    const pending = offer(state).state;
    const mortgaged = dispatch(pending, { type: 'MORTGAGE_TILE', tileId: 3 });
    assert.equal(mortgaged.state.properties[3].isMortgaged, true);
    assert.deepEqual(closed(mortgaged), [[1, 'EXPIRED']]);
    assert.deepEqual(mortgaged.state.tradeOffers, []);

    pending.players[0].isBankrupt = true;
    pending.phase = 'AWAITING_DEBT_RESOLUTION';
    pending.pendingDebt = { creditorId: 'BANK', amount: 1600, reason: 'Phí vận hành' };
    const ended = dispatch(pending, { type: 'DECLARE_BANKRUPTCY' });
    assert.equal(ended.state.winnerId, 'buyer');
    assert.deepEqual(closed(ended), [[1, 'EXPIRED']]);
    assert.deepEqual(ended.state.tradeOffers, []);
  });

  it('preserves an offer while bidding and expires it if winning leaves too little cash to pay', () => {
    const state = game();
    state.players[1].balance = 160;
    const offered = offer(state).state;
    const landed = dispatch(offered, { type: 'ROLL_DICE', forcedDice: [1, 3] });
    const opened = dispatch(landed.state, { type: 'SKIP_BUY' });
    const auctionId = opened.state.auction!.id;
    assert.equal(opened.state.auction!.bidderId, 'buyer');
    const bid = dispatch(opened.state, { type: 'AUCTION_BID', auctionId, revision: 0, amount: 100 });
    assert.deepEqual(bid.state.tradeOffers, offered.tradeOffers);
    const sellerPass = dispatch(bid.state, { type: 'AUCTION_PASS', auctionId, revision: 1 });
    const winner = dispatch(sellerPass.state, { type: 'AUCTION_PASS', auctionId, revision: 2 });
    assert.equal(winner.state.properties[4].ownerId, 'buyer');
    assert.equal(winner.state.players[1].balance, 60);
    assert.deepEqual(closed(winner), [[1, 'EXPIRED']]);
    assert.deepEqual(winner.state.tradeOffers, []);
  });

  it('allows messages during protected decisions and settles only after normal play resumes', () => {
    const phases: TurnPhase[] = ['AWAITING_AUCTION', 'AWAITING_STORM_DECISION',
      'AWAITING_SLOT_CHARTER_RESPONSE', 'AWAITING_DEBT_RESOLUTION'];
    for (const phase of phases) {
      const state = game();
      state.phase = phase;
      const proposed = offer(state);
      assert.equal(proposed.state.phase, phase);
      assert.equal(proposed.state.tradeOffers?.length, 1);
      const accept: GameAction = { type: 'RESPOND_TRADE', offerId: 1, accept: true };
      reject(proposed.state, accept, 'seller');
      const declined = dispatch(proposed.state, { ...accept, accept: false }, 'seller');
      assert.deepEqual(closed(declined), [[1, 'DECLINED']]);
      const withdrawn = dispatch(proposed.state, { type: 'CANCEL_TRADE', offerId: 1 }, 'buyer');
      assert.deepEqual(closed(withdrawn), [[1, 'WITHDRAWN']]);
    }
    const pending = offer(game()).state;
    for (const phase of ['END_OF_TURN', 'AWAITING_BUY_DECISION'] as const) {
      const sold = dispatch({ ...pending, phase }, { type: 'RESPOND_TRADE', offerId: 1, accept: true }, 'seller');
      assert.deepEqual(closed(sold), [[1, 'ACCEPTED']]);
      assert.equal(sold.state.phase, phase);
    }
  });
});
