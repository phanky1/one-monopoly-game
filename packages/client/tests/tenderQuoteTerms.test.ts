import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFreightQuote, OneMonopolyEngine } from '@one-monopoly/shared';
import { tenderQuoteTerms } from '../src/components/tenderQuoteTerms.js';

function fixture() {
  const state = OneMonopolyEngine.createGame('preview', [
    { id: 'a', name: 'Linh', token: 'ONE_APUS' }, { id: 'b', name: 'Minh', token: 'PILOT_BOAT' },
  ], 'logistics');
  const tender = state.logistics!.market!.tender!;
  return { state, tender, quote: (amount: number | null) => tenderQuoteTerms(state, 'a', tender, amount) };
}

test('private draft adds only a valid proposed surcharge to the canonical loading-port rate', () => {
  const { state, tender, quote } = fixture();
  const before = structuredClone(state);
  for (const n of [4, 10, 16]) {
    assert.equal(quote(n)?.base, 16);
    assert.equal(quote(n)?.subtotal, 16 + n);
  }
  for (const invalid of [null, 3, 11.5, 17, NaN]) {
    assert.equal(quote(invalid)?.base, 16);
    assert.equal(quote(invalid)?.subtotal, null);
  }
  assert.equal(tenderQuoteTerms(state, 'b', tender, 10), null);
  assert.deepEqual(state, before);
  delete state.logistics!.market;
  assert.equal(quote(10), null);
});

test('empty bookings require surplus stock at the origin and use the half-rate tariff', () => {
  const { state, tender, quote } = fixture();
  tender.kind = 'empty';
  const yard = state.logistics!.ports[0];
  assert.equal(quote(10)?.base, 8);
  yard.empties = yard.emptyTarget;
  assert.equal(quote(10)?.subtotal, undefined);
  assert.match(quote(10)?.reason ?? '', /vỏ dư/);
  tender.kind = 'laden';
  yard.supply = 0;
  assert.match(quote(10)?.reason ?? '', /chưa có hàng xuất/);
  state.players[0].position = tender.destinationTileId;
  assert.match(quote(10)?.reason ?? '', /cảng khác/);
});

test('cargo on board retains its loading port and checks kind, cold-chain destination and COD', () => {
  const { state, tender, quote } = fixture();
  const player = state.players[0];
  player.cargo = { bookingId: 3, originTileId: 0, destinationTileId: 1, kind: 'laden', reeferDueRound: 1 };
  player.position = 15;
  state.logistics!.ports[0].supply = 0;
  state.logistics!.ports[tender.destinationTileId].demand = 0;
  assert.equal(quote(7)?.base, getFreightQuote(0, tender.destinationTileId)!.reward);
  assert.equal(quote(7)?.distanceNm, getFreightQuote(0, tender.destinationTileId)!.distanceNm);
  assert.notEqual(quote(7)?.base, getFreightQuote(15, tender.destinationTileId)!.reward);
  assert.equal(quote(7)?.bookedElsewhere, 'Cát Lái');
  assert.equal(quote(7)?.subtotal, 23);
  player.cargo.destinationTileId = tender.destinationTileId;
  assert.equal(quote(7)?.bookedElsewhere, undefined);
  tender.kind = 'empty';
  assert.match(quote(7)?.reason ?? '', /Tàu đang chở hàng lạnh/);
  tender.kind = 'laden';
  tender.destinationTileId = 3;
  assert.match(quote(7)?.reason ?? '', /không tiếp nhận hàng lạnh/);
  player.cargo.originTileId = tender.destinationTileId;
  assert.match(quote(7)?.reason ?? '', /cảng khác/);
});
