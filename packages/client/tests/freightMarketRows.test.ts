import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCargoBookings, getFreightQuote, getReserveImportTruckAction, OneMonopolyEngine } from '@one-monopoly/shared';
import { freightMarketRows } from '../src/components/freightMarketRows.js';

function game() {
  return OneMonopolyEngine.createGame('market', [
    { id: 'a', name: 'Linh', token: 'ONE_APUS' }, { id: 'b', name: 'Minh', token: 'PILOT_BOAT' },
  ], 'logistics');
}

describe('live freight market', () => {
  it('shows the same held receiver to rivals and the holder while keeping the public queue empty', () => {
    const opening = game();
    const load = getCargoBookings(opening, 'a', 'laden').find(choice => choice.tileId === 1)!.action;
    const loaded = OneMonopolyEngine.dispatch(opening, load, 'a').state;
    const held = OneMonopolyEngine.dispatch(loaded, getReserveImportTruckAction(loaded, 'a')!, 'a').state;
    const preferred = freightMarketRows(held, 'a', 'all', 'opportunity')[0];
    assert.equal(preferred.tileId, 1);
    assert.equal(preferred.canReceive, true);
    assert.equal(preferred.demand, 0);
    assert.equal(preferred.ownTruckThrough, held.turnCount + 1);
    const rivals = freightMarketRows(held, 'b', 'all', 'distance').find(port => port.tileId === 1)!;
    assert.equal(rivals.ownTruckThrough, undefined);
    assert.equal(rivals.incoming[0].heldThrough, held.turnCount + 1);
    assert.ok(!freightMarketRows(held, 'b', 'import', 'distance').some(port => port.tileId === 1));
  });
  it('lists every terminal, including Singapore, and measures from the viewer even on another turn', () => {
    const state = game();
    state.players[1].position = 15;
    const rows = freightMarketRows(state, 'b', 'all', 'distance');
    assert.equal(rows.length, 18);
    assert.equal(rows[0].tileId, 15);
    assert.equal(rows[0].distanceNm, 0);
    assert.equal(rows.find(r => r.code === 'SGSIN')?.distanceNm, getFreightQuote(15, 0)?.distanceNm);
    assert.deepEqual(rows.map(r => r.distanceNm), [...rows.map(r => r.distanceNm)].sort((a,b) => a! - b!));
    assert.equal(freightMarketRows(state, null, 'all', 'distance')[0].tileId, 0);
  });

  it('filters actual live truck and empty-container counts, and ranks the selected resource', () => {
    const state = game();
    const stocks = state.logistics!.ports;
    Object.assign(stocks[1], {supply: 0, demand: 0, empties: 0, emptyTarget: 4});
    Object.assign(stocks[3], {supply: 4, demand: 4, empties: 6, emptyTarget: 1});
    assert.equal(freightMarketRows(state, 'a', 'shortage', 'opportunity')[0].tileId, 1);
    assert.equal(freightMarketRows(state, 'a', 'surplus', 'opportunity')[0].tileId, 3);
    for (const [filter, field] of [['export', 'supply'], ['surplus', 'surplus'], ['shortage','shortage'],['import','demand']] as const) {
      const rows = freightMarketRows(state, 'a', filter, 'opportunity');
      assert.ok(rows.length);
      assert.ok(rows.every(row => row[field] > 0));
      assert.deepEqual(rows.map(row => row[field]), [...rows.map(row => row[field])].sort((a,b) => b-a));
    }
  });

  it('prefers the booked stop and honors a current award with a reserved receiving slot', () => {
    const state = game();
    const l = state.logistics!;
    state.players[0].cargo = { bookingId: 1, kind: 'laden', originTileId: 0, destinationTileId: 15 };
    l.ports[15].demand = 0;
    assert.equal(freightMarketRows(state, 'a', 'all', 'opportunity').find(r=>r.tileId===15)?.canReceive, false);
    l.market!.contract = {tenderId: 1, deliveryRound: state.turnCount, playerId:'a', status:'active', destinationTileId:15,kind:'laden',amount:7};
    let rows = freightMarketRows(state, 'a', 'all', 'opportunity');
    assert.equal(rows[0].tileId,15); assert.equal(rows[0].canReceive,true);
    assert.deepEqual(rows[0].award,{name:'Linh',own:true,kind:'laden',amount:7});
    assert.equal(freightMarketRows(state, null, 'all', 'opportunity')[0].award?.own, false);
    l.market!.contract!.status = 'expired';
    rows = freightMarketRows(state, 'a', 'all', 'opportunity');
    assert.equal(rows.some(r=>r.award), false);
    assert.notEqual(rows[0].tileId,15);
  });

  it('ranks the less contested port first when two destinations have the same truck capacity', () => {
    const state = game();
    for (const stock of Object.values(state.logistics!.ports)) stock.demand = 0;
    state.logistics!.ports[1].demand = 2;
    state.logistics!.ports[3].demand = 2;
    assert.equal(freightMarketRows(state, 'a', 'import', 'opportunity')[0].tileId, 3);
    state.players[1].cargo = { bookingId: 2, kind: 'laden', originTileId: 0, destinationTileId: 3 };
    const rows = freightMarketRows(state, 'a', 'import', 'opportunity');
    assert.deepEqual(rows.map(row => [row.tileId, row.demand]), [[1, 2], [3, 2]]);
    assert.equal(freightMarketRows(state, 'a', 'import', 'distance')[0].tileId, 3);
  });

  it('shows rivals’ public booked loads without decrementing stock or exposing sealed quotes', () => {
    const state = game();
    state.players[0].cargo = {bookingId: 1,kind:'laden',originTileId:0,destinationTileId:1};
    state.players[1].cargo = {bookingId: 2,kind:'laden',originTileId:0,destinationTileId:1,reeferDueRound:2};
    const before = structuredClone(state);
    const snapshot=freightMarketRows(state, 'a', 'all', 'opportunity');
    const stop = snapshot.find(row=>row.tileId===1)!;
    assert.equal(stop.demand, state.logistics!.ports[1].demand);
    assert.deepEqual(stop.incoming,[{captain:'Minh',kind:'laden',refrigerated:true}]);
    assert.deepEqual(state,before);
    state.logistics!.market!.tender!.bids.b=16;
    assert.deepEqual(freightMarketRows(state,'a','all','opportunity'),snapshot);
  });
});
