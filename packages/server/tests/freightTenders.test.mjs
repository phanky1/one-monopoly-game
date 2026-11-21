import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OneMonopolyEngine } from '@one-monopoly/shared';
import { getFreightBotAction } from '../dist/freightBot.js';

const bot = 'pilot';
const players = [
  { id: 'human', name: 'Linh', token: 'ONE_MAGENTA' },
  { id: bot, name: 'Hoa tiêu', token: 'PILOT_BOAT' },
];
const game = () => OneMonopolyEngine.createGame('tenders', players, 'logistics');

function duringAward(kind, destinationTileId) {
  const state = game();
  state.activePlayerIndex = 1;
  state.turnCount = 2;
  state.logistics.market = { history: [], bonusEarnings: { human: 0, [bot]: 0 }, tender: null, contract: {
    tenderId: 1, deliveryRound: 2, playerId: bot, kind, destinationTileId, amount: 9, status: 'active',
  } };
  return state;
}

function apply(state, action) {
  const actor = state.players[state.activePlayerIndex].id;
  const result = OneMonopolyEngine.dispatch(state, action, actor);
  assert.notEqual(result.state, state, `${actor}'s ${action.type} must be accepted`);
  return result.state;
}

test('the captain completes an awarded empty move before loading ordinary export freight', () => {
  let state = duringAward('empty', 1);
  const load = getFreightBotAction(state);
  assert.deepEqual([load.type, load.kind, load.destinationTileId], ['LOAD_CARGO', 'empty', 1]);
  state = apply(state, load);
  const sail = getFreightBotAction(state);
  assert.deepEqual([sail.type, sail.tileId], ['SAIL_TO_PORT', 1]);
  state = apply(state, sail);
  const unload = getFreightBotAction(state);
  assert.equal(unload.type, 'UNLOAD_CARGO');
  state = apply(state, unload);
  assert.equal(state.logistics.market.contract.status, 'fulfilled');
  assert.equal(state.logistics.deliveries[bot], 1);
  assert.equal(state.logistics.earnings[bot], 15); // $6M freight plus the $9M tender award.
});

test('a matching shipment changes destination for its award while honoring an exhausted public berth', () => {
  let state = duringAward('laden', 1);
  state.players[1].cargo = { kind: 'laden', originTileId: 0, destinationTileId: 3, bookingId: 7 };
  state.logistics.ports[1].demand = 0;
  const cod = getFreightBotAction(state);
  assert.deepEqual([cod.type, cod.destinationTileId, cod.bookingId], ['CHANGE_DESTINATION', 1, 7]);
  state = apply(state, cod);
  state = apply(state, getFreightBotAction(state));
  state = apply(state, getFreightBotAction(state));
  assert.equal(state.logistics.market.contract.status, 'fulfilled');
  assert.equal(state.logistics.earnings[bot], 21);
});

test('a captain already berthed for an ordinary discharge keeps that delivery if the award is unreachable this round', () => {
  let state = duringAward('laden', 1);
  Object.assign(state.players[1], {position: 3, cargo: {kind: 'laden', originTileId: 0, destinationTileId: 3, bookingId: 7}});
  state.phase = 'END_OF_TURN';
  state.logistics.hasSailed = true;
  const unload = getFreightBotAction(state);
  assert.equal(unload.type, 'UNLOAD_CARGO');
  state = apply(state, unload);
  assert.equal(state.players[1].lastDelivery.tileId, 3);
  assert.equal(state.logistics.market.contract.status, 'active');
});

function beforeClosing(cargo, rivalBid) {
  const state = game();
  state.activePlayerIndex = 1;
  state.players[1].position = 3;
  if (cargo) state.players[1].cargo = cargo;
  state.phase = 'END_OF_TURN';
  state.logistics.hasSailed = true;
  state.logistics.market = { history: [], bonusEarnings: { human: 0, [bot]: 0 }, contract: null, tender: {
    id: 1, round: 1, kind: 'laden', destinationTileId: 17, priorityPlayerId: 'human',
    bidderIds: ['human'], bids: {human: rivalBid}, bidCount: 1,
  } };
  return state;
}

test('the bot seals one quote based on its own ship, independent of the rival’s private price', () => {
  const cargo = {kind: 'laden', originTileId: 0, destinationTileId: 17, bookingId: 9};
  const state = beforeClosing(cargo, 4);
  const bid = getFreightBotAction(state);
  assert.equal(bid.type, 'BID_FREIGHT_TENDER');
  assert.deepEqual(getFreightBotAction(beforeClosing(cargo, 16)), bid);
  const divert = getFreightBotAction(beforeClosing({...cargo, destinationTileId: 1}, 4));
  assert.equal(divert.type, 'BID_FREIGHT_TENDER');
  assert.ok(bid.amount < divert.amount, 'a prepared voyage should quote a smaller premium than a diversion');
  const after = apply(state, bid);
  assert.equal(after.logistics.market.tender.bids[bot], bid.amount);
  assert.equal(getFreightBotAction(after).type, 'END_TURN');
});

test('a bot with the wrong cargo and no remaining voyage declines a tender it cannot serve', () => {
  const cargo = {kind: 'empty', originTileId: 0, destinationTileId: 1, bookingId: 9};
  const state = beforeClosing(cargo, 12);
  assert.equal(getFreightBotAction(state).type, 'END_TURN');
});

test('a normal solo game settles the bot’s winning bid and pays for its delivery exactly once', () => {
  let state = game();
  const playerBid = { type: 'BID_FREIGHT_TENDER', tenderId: state.logistics.market?.tender?.id, amount: 16, revision: state.cargoRevision };
  state = apply(state, playerBid);
  state = apply(state, {type: 'END_TURN'});
  const actions = [], events = [];
  for (let i = 0; i < 24 && !events.some(event => event.type === 'FREIGHT_CONTRACT_FULFILLED'); i++) {
    const actor = state.players[state.activePlayerIndex].id;
    const action = actor === bot ? getFreightBotAction(state) : {type: 'END_TURN'};
    const result = OneMonopolyEngine.dispatch(state, action, actor);
    assert.notEqual(result.state, state, `The solo game stalled on ${action.type}`);
    actions.push({ actor, round: state.turnCount, ...action });
    events.push(...result.events);
    state = result.state;
  }
  const firstRoundBids = actions.filter(action => action.actor === bot && action.round === 1 && action.type === 'BID_FREIGHT_TENDER');
  assert.equal(firstRoundBids.length, 1);
  const fulfilled = events.filter(event => event.type === 'FREIGHT_CONTRACT_FULFILLED');
  assert.equal(fulfilled.length, 1);
  assert.equal(state.logistics.market.contract.playerId, bot);
  assert.equal(state.logistics.market.bonusEarnings[bot], firstRoundBids[0].amount);
  assert.equal(state.players[1].lastDelivery.destinationTileId, 17);
});

test('a saved freight room without a tender market keeps its original export booking and can finish a turn', () => {
  let state = game();
  state.activePlayerIndex = 1;
  delete state.logistics.market;
  const first = getFreightBotAction(state);
  assert.equal(first.type, 'LOAD_CARGO');
  assert.equal(first.kind, 'laden');
  state = apply(state, first);
  for (let step = 0; step < 8 && state.activePlayerIndex === 1; step++) {
    const action = getFreightBotAction(state);
    assert.notEqual(action.type, 'BID_FREIGHT_TENDER');
    state = apply(state, action);
  }
  assert.equal(state.activePlayerIndex, 0);
  assert.equal(state.logistics.deliveries[bot], 1);
});
