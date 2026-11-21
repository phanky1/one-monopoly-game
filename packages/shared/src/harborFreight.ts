import { BOARD_TILES, ownsPortGroup } from './boardData.js';
import { getFreightQuote } from './cargo.js';
import type {
  EngineResult, GameEvent, GameState, HarborDischargeAction, HarborFreightOpportunity, HarborFreightQuote,
  HarborFreightReceipt, HarborFreightState, HarborLoadAction, Player,
} from './types.js';

export function createHarborFreight(players: Player[]): HarborFreightState {
  return {
    revision: 0,
    manifests: Object.fromEntries(players.map(player => [player.id, null])),
    visits: Object.fromEntries(players.map(player => [player.id, { tileId: player.position, handled: false }])),
    lastDelivery: null,
  };
}

/** Called on the mutable board transition, only when a new landing is resolved. */
export function recordHarborVisit(state: GameState, playerId: string, tileId: number | null): void {
  if (!state.harborFreight) return;
  const tile = tileId === null ? undefined : BOARD_TILES[tileId];
  state.harborFreight.visits[playerId] = tile && (tile.type === 'PORT' || tile.type === 'GO')
    ? { tileId: tile.id, handled: false } : null;
}

function isOpenBerth(state: GameState, tileId: number): boolean {
  if (!Number.isInteger(tileId)) return false;
  const tile = BOARD_TILES[tileId];
  if (tile?.type === 'GO') return true;
  const property = state.properties[tileId];
  return tile?.type === 'PORT' && !!property && !property.isMortgaged;
}

/** Fraction (percent) of a visiting carrier's gross freight payable to this terminal owner. */
export function getHarborTerminalShare(state: GameState, tileId: number): 0 | 25 | 50 {
  if (state.mode !== 'harbor' || !isOpenBerth(state, tileId)) return 0;
  const ownerId = state.properties[tileId]?.ownerId;
  const group = BOARD_TILES[tileId].group;
  if (!ownerId || !group || !state.players.some(player => player.id === ownerId && !player.isBankrupt)) return 0;
  return ownsPortGroup(state, group, ownerId) ? 50 : 25;
}

/** A hypothetical discharge at an open berth, independent of this captain's location and turn. */
export function getHarborFreightQuote(
  state: GameState, playerId: string, originTileId: number, tileId: number,
): HarborFreightQuote | null {
  if (state.mode !== 'harbor' || !isOpenBerth(state, tileId) ||
      !state.players.some(player => player.id === playerId && !player.isBankrupt)) return null;
  const rate = getFreightQuote(originTileId, tileId, 'laden');
  if (!rate) return null;
  const ownerId = state.properties[tileId]?.ownerId;
  const feePercent = ownerId === playerId ? 0 : getHarborTerminalShare(state, tileId);
  const operator = feePercent ? state.players.find(player => player.id === ownerId) : undefined;
  const handlingFee = Math.floor(rate.reward * feePercent / 100);
  return {
    playerId, originTileId, tileId, distanceNm: rate.distanceNm, gross: rate.reward,
    carrierNet: rate.reward - handlingFee, handlingFee, feePercent,
    operatorId: operator?.id ?? null, operatorName: operator?.name ?? null,
  };
}

export function getHarborFreightOpportunity(state: GameState, playerId: string): HarborFreightOpportunity | null {
  const harbor = state.harborFreight;
  const captain = state.players[state.activePlayerIndex];
  if (state.mode !== 'harbor' || !harbor || !state.gameStarted || state.winnerId !== null ||
      !captain || captain.id !== playerId || captain.inHold || captain.isBankrupt ||
      state.pendingDebt || state.pendingSlotCharter || state.auction ||
      (state.phase !== 'WAIT_FOR_ROLL' && state.phase !== 'END_OF_TURN')) return null;
  const tileId = captain.position;
  const visit = harbor.visits[playerId];
  if (!visit || visit.handled || visit.tileId !== tileId || !isOpenBerth(state, tileId)) return null;
  const revision = harbor.revision;
  const box = harbor.manifests[playerId];
  if (!box) {
    if (BOARD_TILES[tileId].type !== 'GO' && state.properties[tileId].ownerId !== playerId) return null;
    return { kind: 'load', action: { type: 'HARBOR_LOAD', tileId, revision } };
  }
  const quote = getHarborFreightQuote(state, playerId, box.originTileId, tileId);
  return quote ? { kind: 'discharge', action: { type: 'HARBOR_DISCHARGE', tileId, revision }, quote } : null;
}

export function dispatchHarborFreight(
  state: GameState, action: HarborLoadAction | HarborDischargeAction, actorId?: string,
): EngineResult {
  const harbor = state.harborFreight;
  const opportunity = actorId ? getHarborFreightOpportunity(state, actorId) : null;
  if (!harbor || !actorId || !opportunity || action.type !== opportunity.action.type ||
      action.tileId !== opportunity.action.tileId || action.revision !== opportunity.action.revision) {
    return { state, events: [] };
  }
  const tileId = action.tileId;
  const nextHarbor: HarborFreightState = {
    ...harbor, revision: harbor.revision + 1,
    visits: { ...harbor.visits, [actorId]: { tileId, handled: true } },
    manifests: { ...harbor.manifests, [actorId]: opportunity.kind === 'load' ? { originTileId: tileId } : null },
  };
  if (opportunity.kind === 'load') {
    return {
      state: { ...state, harborFreight: nextHarbor },
      events: [{ type: 'HARBOR_LOADED', playerId: actorId, tileId }],
    };
  }
  const receipt: HarborFreightReceipt = { ...opportunity.quote, round: state.turnCount, revision: nextHarbor.revision };
  nextHarbor.lastDelivery = receipt;
  const events: GameEvent[] = [{ type: 'HARBOR_DISCHARGED', receipt }];
  const players = state.players.map(player => {
    const isCarrier = player.id === actorId;
    if (!isCarrier && player.id !== receipt.operatorId) return player;
    const delta = isCarrier ? receipt.carrierNet : receipt.handlingFee;
    const balance = player.balance + delta;
    events.push({ type: 'BALANCE_CHANGED', playerId: player.id, newBalance: balance, delta,
      reason: isCarrier ? 'Cước vận chuyển hàng khô' : 'Phí khai thác bến cảng' });
    return { ...player, balance };
  });
  return { state: { ...state, players, harborFreight: nextHarbor }, events };
}
