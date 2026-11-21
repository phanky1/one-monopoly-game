import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOARD_TILES, getCargoBookings, getCargoOpportunity, getCargoRedirections, getEmptyNeed, getFreightQuote,
  getLogisticsRoutes, getLogisticsStandings, isFinalLogisticsRound, LOGISTICS_DELIVERY_TARGET, LOGISTICS_PORT_CAPACITY, LOGISTICS_ROUND_LIMIT,
  OneMonopolyEngine, PORT_COORDINATES,
  type CargoKind, type GameAction, type GameState,
} from '../src/index.js';

const { createGame, dispatch } = OneMonopolyEngine;
const seats = [{ id: 'a', name: 'An', token: 'ONE_APUS' as const }, { id: 'b', name: 'Bình', token: 'PILOT_BOAT' as const }];
const fresh = () => createGame('freight', seats, 'logistics');
const active = (state: GameState) => state.players[state.activePlayerIndex].id;

function book(state: GameState, kind: CargoKind, destination: number) {
  const choice = getCargoBookings(state, active(state), kind).find(item => item.tileId === destination);
  assert.ok(choice, `No ${kind} booking to tile ${destination}`);
  return choice.action;
}

function sail(state: GameState, destination: number) {
  const route = getLogisticsRoutes(state, active(state)).find(item => item.tileId === destination);
  assert.ok(route);
  return route.action;
}

function unload(state: GameState) {
  const choice = getCargoOpportunity(state, active(state));
  assert.ok(choice?.action.type === 'UNLOAD_CARGO');
  return choice.action;
}

function accepted(state: GameState, action: GameAction) {
  const result = dispatch(state, action, active(state));
  assert.notEqual(result.state, state);
  assert.ok(result.events.length);
  return result.state;
}

function rejected(state: GameState, action: GameAction, actor = active(state)) {
  const result = dispatch(state, action, actor);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
}

describe('freight rates and the logistics game', () => {
  it('uses waterfront coordinates and a great-circle distance, including trips across the date line', () => {
    const portCodes = BOARD_TILES.filter(tile => tile.type === 'PORT' || tile.type === 'GO').map(tile => tile.code);
    assert.deepEqual(Object.keys(PORT_COORDINATES).sort(), portCodes.sort());
    const pacific = getFreightQuote(21, 31)!; // Oakland to Tokyo
    assert.ok(pacific.distanceNm > 4400 && pacific.distanceNm < 4500);
    assert.equal(pacific.reward, 20);
    assert.deepEqual(getFreightQuote(31, 21), pacific);
    assert.deepEqual(getFreightQuote(21, 31, 'empty'), { distanceNm: pacific.distanceNm, reward: 10 });
    assert.equal(getFreightQuote(1, 3)?.reward, 12);
    for (const id of [0, 2, 13, -1, 99, .5, NaN]) assert.equal(getFreightQuote(0, id), null);
  });

  it('starts with one berth per port, zero freight income and one voyage per captain per turn', () => {
    const start = fresh();
    assert.equal(start.phase, 'AWAITING_SAIL');
    assert.equal(start.players[0].balance, 0);
    assert.equal(start.players[0].secretMission, undefined);
    assert.equal(Object.keys(start.logistics!.ports).length, 18);
    assert.equal(start.logistics!.ports[0].supply, seats.length);
    assert.equal(getLogisticsRoutes(start, 'a').length, 17);
    assert.deepEqual(getLogisticsRoutes(start, 'b'), []);
    rejected(start, { type: 'SAIL_TO_PORT', tileId: 2, revision: 0 });
    const action = sail(start, 3);
    rejected(start, action, 'b');
    const result = dispatch(start, action, 'a');
    assert.deepEqual(result.events, [{ type: 'SHIP_STEPPED', playerId: 'a', from: 0, to: 3 }]);
    assert.equal(result.state.phase, 'END_OF_TURN');
    assert.deepEqual(getLogisticsRoutes(result.state, 'a'), []);
    rejected(result.state, { ...action, revision: result.state.cargoRevision! });
    const next = accepted(result.state, { type: 'END_TURN' });
    assert.equal(active(next), 'b');
    assert.equal(next.logistics!.hasSailed, false);
    assert.equal(next.phase, 'AWAITING_SAIL');
  });

  it('does not run classic property, rent, dice or bankruptcy rules during a logistics voyage', () => {
    const start = fresh();
    Object.assign(start.properties[3], { ownerId: 'b', isMortgaged: false, containerLevel: 4 });
    start.properties[1].isMortgaged = true;
    for (const action of [
      { type: 'ROLL_DICE' }, { type: 'BUY_PROPERTY' }, { type: 'MORTGAGE_TILE', tileId: 3 },
      { type: 'DECLARE_BANKRUPTCY' }, { type: 'OFFER_TRADE', sellerId: 'b', tileId: 3, price: 20 },
    ] as const) rejected(start, action);
    const loaded = accepted(start, book(start, 'laden', 3));
    const atPort = accepted(loaded, sail(loaded, 3));
    const delivery = dispatch(atPort, unload(atPort), 'a');
    assert.deepEqual(delivery.events.map(event => event.type), ['CARGO_UNLOADED', 'BALANCE_CHANGED']);
    assert.equal(delivery.state.players[0].balance, 12);
    assert.equal(delivery.state.players[1].balance, 0);
    assert.deepEqual(delivery.state.properties, start.properties);
    const classic = createGame('legacy', seats);
    delete classic.mode; // A pre-logistics snapshot.
    assert.deepEqual(getCargoBookings(classic, 'a', 'laden'), []);
    rejected(classic, book(start, 'laden', 1));
    assert.ok(dispatch(classic, { type: 'ROLL_DICE', forcedDice: [1, 2] }).events.some(e => e.type === 'DICE_ROLLED'));
  });

  it('keeps a booking through reconnect, supports a competing receiver and pays exactly once after COD', () => {
    let state = fresh();
    const original = book(state, 'laden', 1);
    state = accepted(state, original);
    rejected(state, original);
    const booking = { ...state.players[0].cargo! };
    assert.equal(state.logistics!.ports[1].demand, 1); // Booking does not reserve the recipient's truck.
    state = JSON.parse(JSON.stringify(state));
    assert.deepEqual(state.players[0].cargo, booking);
    state = accepted(state, { type: 'END_TURN' }); // Wait at Singapore.
    state = accepted(state, book(state, 'laden', 1));
    const rival = state.players[1].cargo!;
    assert.notEqual(booking.bookingId, rival.bookingId);
    rejected(state, { type: 'CHANGE_DESTINATION', bookingId: booking.bookingId, destinationTileId: 3, revision: state.cargoRevision! }, 'b');
    state = accepted(state, sail(state, 1));
    state = accepted(state, unload(state));
    state = accepted(state, { type: 'END_TURN' });
    assert.equal(state.logistics!.ports[1].demand, 0);
    assert.equal(getLogisticsRoutes(state, 'a').find(route => route.tileId === 1)?.quote, null);
    state = accepted(state, sail(state, 3));
    assert.equal(getCargoOpportunity(state, 'a'), null); // Destination on the booking is still Cát Lái.
    const alternatives = getCargoRedirections(state, 'a');
    assert.ok(alternatives.every(option => option.tileId !== 0 && option.tileId !== 1));
    const change = alternatives.find(option => option.tileId === 3)!.action;
    const changed = dispatch(state, change, 'a');
    assert.deepEqual(changed.events, [{ type: 'CARGO_DESTINATION_CHANGED', playerId: 'a', tileId: 3,
      ...booking, previousDestinationTileId: 1, destinationTileId: 3,
      destinationAmendment: { firstDestinationTileId: 1, count: 1, originalQuote: { distanceNm: 596, reward: 12 } } }]);
    state = changed.state;
    rejected(state, change);
    const action = unload(state);
    rejected(state, { ...action, bookingId: rival.bookingId });
    rejected(state, { ...action, originTileId: 17 });
    const before = state.logistics!.ports[3].demand;
    state = accepted(state, action);
    const receipt = state.players[0].lastDelivery!;
    assert.equal(receipt.bookingId, booking.bookingId);
    assert.deepEqual([receipt.originTileId, receipt.destinationTileId, receipt.tileId], [0, 3, 3]);
    assert.equal(state.players[0].cargo, undefined);
    assert.equal(state.logistics!.ports[3].demand, before - 1);
    assert.equal(state.logistics!.earnings.a, receipt.reward);
    assert.equal(state.logistics!.deliveries.a, 1);
    rejected(state, action);
    state = accepted(state, book(state, 'laden', 0));
    rejected(state, { ...action, revision: state.cargoRevision! });
    assert.notEqual(state.players[0].cargo!.bookingId, receipt.bookingId);
  });

  it('moves real empty equipment only from surplus to deficit and preserves kind and origin on diversion', () => {
    let state = fresh();
    const opening = state.logistics!.ports[0];
    const needs = state.logistics!.ports[3];
    const action = book(state, 'empty', 1);
    assert.ok(!getCargoBookings(state, 'a', 'empty').some(option => option.tileId === 7));
    state = accepted(state, action);
    assert.equal(state.logistics!.ports[0].empties, opening.empties - 1);
    assert.equal(state.logistics!.ports[0].supply, opening.supply);
    const change = getCargoRedirections(state, 'a').find(option => option.tileId === 3)!.action;
    state = accepted(state, change);
    assert.equal(state.players[0].cargo!.kind, 'empty');
    state = accepted(state, sail(state, 3));
    assert.equal(getCargoOpportunity(state, 'a')?.quote?.reward, 6);
    const delivery = unload(state);
    state = accepted(state, delivery);
    assert.equal(state.players[0].lastDelivery!.kind, 'empty');
    assert.equal(state.logistics!.ports[3].empties, needs.empties + 1);
    assert.equal(getEmptyNeed(state.logistics!.ports[3]), 0);
    assert.equal(state.logistics!.ports[3].demand, needs.demand);
    assert.equal(state.logistics!.emptyDeliveries.a, 1);
    assert.equal(state.logistics!.deliveries.a, 1);
    assert.equal(state.logistics!.earnings.a, 6);
    assert.deepEqual(getCargoBookings(state, 'a', 'empty'), []); // Balanced equipment cannot be sent straight back.
    rejected(state, delivery);
  });

  it('requires an empty booking to divert when a rival fills the last equipment shortage', () => {
    let state = fresh();
    state = accepted(state, book(state, 'empty', 3));
    const original = state.players[0].cargo!;
    state = accepted(state, sail(state, 3));
    state = accepted(state, { type: 'END_TURN' }); // Stay on board at the booked berth.
    state = accepted(state, book(state, 'empty', 3));
    state = accepted(state, sail(state, 3));
    state = accepted(state, unload(state));
    state = accepted(state, { type: 'END_TURN' });
    assert.equal(getEmptyNeed(state.logistics!.ports[3]), 0);
    assert.equal(getCargoOpportunity(state, 'a'), null);
    rejected(state, { type: 'UNLOAD_CARGO', tileId: 3, originTileId: 0,
      bookingId: original.bookingId, revision: state.cargoRevision! });
    const change = getCargoRedirections(state, 'a').find(choice => choice.tileId === 1)!.action;
    rejected(state, { ...change, destinationTileId: 0 });
    rejected(state, { ...change, destinationTileId: 3 });
    state = accepted(state, change);
    state = accepted(state, sail(state, 1));
    state = accepted(state, unload(state));
    assert.equal(state.players[0].lastDelivery!.bookingId, original.bookingId);
    assert.deepEqual(state.logistics!.emptyDeliveries, { a: 1, b: 1 });
  });

  it('can deliver a carried-over booking at departure and a second booking at arrival in one turn', () => {
    let state = fresh();
    state = accepted(state, book(state, 'laden', 1));
    state = accepted(state, sail(state, 1));
    state = accepted(state, { type: 'END_TURN' });
    state = accepted(state, { type: 'END_TURN' });
    state = accepted(state, unload(state));
    state = accepted(state, book(state, 'laden', 3));
    state = accepted(state, sail(state, 3));
    state = accepted(state, unload(state));
    assert.equal(state.logistics!.deliveries.a, 2);
    assert.equal(state.turnCount, 2);
    assert.equal(state.phase, 'END_OF_TURN');
  });

  it('replenishes partial truck orders on round boundaries and never fills beyond capacity', () => {
    let state = fresh();
    const stock = state.logistics!.ports;
    const first = accepted(state, { type: 'END_TURN' });
    assert.deepEqual(first.logistics!.ports, stock);
    state = accepted(first, { type: 'END_TURN' });
    assert.equal(state.turnCount, 2);
    assert.equal(state.logistics!.ports[3].demand, stock[3].demand + 1);
    assert.deepEqual(state.logistics!.ports[0], stock[0]);
    const supplier = state.logistics!.ports[7]; // Rotating pickup packs one empty into a laden export.
    assert.equal(supplier.supply, stock[7].supply + 1);
    assert.equal(supplier.empties, stock[7].empties - 1);
    while (!state.winnerId) state = accepted(state, { type: 'END_TURN' });
    for (const yard of Object.values(state.logistics!.ports)) {
      assert.ok([yard.supply, yard.demand, yard.empties].every(n => n >= 0 && n <= LOGISTICS_PORT_CAPACITY));
    }
  });

  it('completes the round after the third delivery and awards equal-turn ties on freight earnings', () => {
    let state = fresh();
    const deliverAt = (kind: CargoKind, port: number) => {
      state = accepted(state, book(state, kind, port));
      state = accepted(state, sail(state, port));
      state = accepted(state, unload(state));
    };
    for (const [index, port] of [1, 3, 5].entries()) {
      deliverAt(index === 0 ? 'empty' : 'laden', port);
      const finalRound = index + 1 === LOGISTICS_DELIVERY_TARGET;
      assert.equal(isFinalLogisticsRound(state), finalRound);
      assert.equal(state.winnerId, null);
      state = accepted(state, { type: 'END_TURN' });
      assert.equal(active(state), 'b');
      deliverAt('laden', [31, 23, 27][index]);
      assert.equal(state.winnerId, null);
      const result = dispatch(state, { type: 'END_TURN' }, 'b');
      state = result.state;
      if (finalRound) assert.deepEqual(result.events.at(-1), { type: 'GAME_OVER', winnerId: 'b' });
      else assert.equal(state.winnerId, null);
    }
    assert.equal(state.winnerId, 'b');
    assert.deepEqual(state.logistics!.deliveries, { a: 3, b: 3 });
    assert.ok(state.logistics!.earnings.b > state.logistics!.earnings.a);
    assert.equal(state.logistics!.emptyDeliveries.a, 1);
    rejected(state, { type: 'END_TURN' });
  });

  it('stops after eight rounds and ranks delivery count ahead of earnings, then resolves exact ties by seat', () => {
    const cutoff = fresh();
    cutoff.turnCount = LOGISTICS_ROUND_LIMIT;
    cutoff.activePlayerIndex = 1;
    assert.ok(isFinalLogisticsRound(cutoff));
    Object.assign(cutoff.logistics!.deliveries, { a: 1, b: 2 });
    Object.assign(cutoff.logistics!.earnings, { a: 28, b: 24 });
    assert.equal(getLogisticsStandings(cutoff)[0].playerId, 'b');
    cutoff.logistics!.deliveries.a = 2;
    const result = dispatch(cutoff, { type: 'END_TURN' }, 'b');
    assert.equal(result.state.winnerId, 'a');
    assert.deepEqual(result.events.at(-1), { type: 'GAME_OVER', winnerId: 'a' });
    cutoff.logistics!.earnings.b = cutoff.logistics!.earnings.a;
    assert.equal(getLogisticsStandings(cutoff)[0].playerId, 'a');
  });
});
