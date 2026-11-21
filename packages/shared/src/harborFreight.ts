import { BOARD_TILES, ownsPortGroup } from './boardData.js';
import { getFreightQuote } from './cargo.js';
import { getRedemptionCost } from './debtRecovery.js';
import type {
  EngineResult, GameEvent, GameState, HarborBookExportAction, HarborDischargeAction, HarborExportBooking,
  HarborExportTerms, HarborFreightOpportunity, HarborFreightQuote,
  HarborFreightReceipt, HarborFreightState, HarborLoadAction, HarborPurchase, HarborPurchaseAction, HarborRedeemAction, HarborRedemption, HarborRentRelief,
  HarborRentReliefAction, Player,
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

/** Price of a visiting carrier's export booking at this port, independent of whose turn it is. */
export function getHarborExportFee(state: GameState, tileId: number): 0 | 3 | 6 {
  if (BOARD_TILES[tileId]?.type !== 'PORT' || !(state.properties[tileId]?.containerLevel >= 1)) return 0;
  const share = getHarborTerminalShare(state, tileId);
  if (share === 0) return 0;
  return share === 50 ? 6 : 3;
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

function getUnhandledBerth(state: GameState, playerId: string) {
  const harbor = state.harborFreight;
  const captain = state.players[state.activePlayerIndex];
  if (state.mode !== 'harbor' || !harbor || !state.gameStarted || state.winnerId !== null ||
      !captain || captain.id !== playerId || captain.inHold || captain.isBankrupt ||
      state.pendingSlotCharter || state.auction) return null;
  const tileId = captain.position;
  const visit = harbor.visits[playerId];
  if (!visit || visit.handled || visit.tileId !== tileId || !isOpenBerth(state, tileId)) return null;
  return { captain, harbor, tileId };
}

function getAvailableBerth(state: GameState, playerId: string) {
  if (state.pendingDebt || (state.phase !== 'WAIT_FOR_ROLL' && state.phase !== 'END_OF_TURN')) return null;
  return getUnhandledBerth(state, playerId);
}

export function getHarborExportBooking(state: GameState, playerId: string): HarborExportBooking | null {
  const berth = getAvailableBerth(state, playerId);
  if (!berth || berth.harbor.manifests[playerId]) return null;
  const { captain, harbor, tileId } = berth;
  const fee = getHarborExportFee(state, tileId);
  if (!fee) return null;
  const operator = state.players.find(player => player.id === state.properties[tileId].ownerId);
  if (!operator || operator.id === playerId) return null;
  return {
    action: { type: 'HARBOR_BOOK_EXPORT', tileId, revision: harbor.revision, operatorId: operator.id, fee },
    operatorName: operator.name,
    shortfall: Math.max(0, fee - captain.balance),
  };
}

export function getHarborFreightOpportunity(state: GameState, playerId: string): HarborFreightOpportunity | null {
  const berth = getAvailableBerth(state, playerId);
  if (!berth) return null;
  const { harbor, tileId } = berth;
  const revision = harbor.revision;
  const box = harbor.manifests[playerId];
  if (!box) {
    if (BOARD_TILES[tileId].type !== 'GO' && state.properties[tileId].ownerId !== playerId) return null;
    return { kind: 'load', action: { type: 'HARBOR_LOAD', tileId, revision } };
  }
  const quote = getHarborFreightQuote(state, playerId, box.originTileId, tileId);
  return quote ? { kind: 'discharge', action: { type: 'HARBOR_DISCHARGE', tileId, revision }, quote } : null;
}

export function getHarborRentRelief(state: GameState, playerId: string): HarborRentRelief | null {
  const debt = state.pendingDebt;
  if (state.phase !== 'AWAITING_DEBT_RESOLUTION' || !debt || debt.creditorId === 'BANK' ||
      !Number.isSafeInteger(debt.amount)) return null;
  const berth = getUnhandledBerth(state, playerId);
  if (!berth) return null;
  const { captain, tileId, harbor } = berth;
  const box = harbor.manifests[playerId];
  if (!box || debt.tileId !== tileId || BOARD_TILES[tileId].type !== 'PORT' ||
      captain.balance < 0 || captain.balance >= debt.amount) return null;
  const quote = getHarborFreightQuote(state, playerId, box.originTileId, tileId);
  // Rent debts identify the deed and its creditor, including an already negotiated charter.
  if (!quote?.operatorId || quote.operatorId !== debt.creditorId) return null;
  return {
    action: { type: 'HARBOR_DISCHARGE_FOR_RENT', tileId, revision: harbor.revision },
    quote, rentDue: debt.amount, shortfallAfter: Math.max(0, debt.amount - captain.balance - quote.carrierNet),
  };
}

/** Cash and freight the arriving captain can put towards the bank's posted price. */
export function getHarborPurchase(state: GameState, playerId: string): HarborPurchase | null {
  if (state.phase !== 'AWAITING_BUY_DECISION' || state.pendingDebt) return null;
  const berth = getUnhandledBerth(state, playerId);
  if (!berth) return null;
  const { captain, harbor, tileId } = berth;
  const tile = BOARD_TILES[tileId];
  const box = harbor.manifests[playerId];
  if (tile.type !== 'PORT' || !tile.price || state.properties[tileId].ownerId !== null || !box || captain.balance < 0) return null;
  const quote = getHarborFreightQuote(state, playerId, box.originTileId, tileId);
  if (!quote) return null;
  const cashChange = quote.carrierNet - tile.price;
  return {
    action: { type: 'HARBOR_BUY_AND_DISCHARGE', tileId, revision: harbor.revision },
    quote, purchasePrice: tile.price, cashChange, shortfall: Math.max(0, -cashChange - captain.balance),
  };
}

function reopenPort(state: GameState, tileId: number): GameState {
  return { ...state, canUpgradeCurrentPort: false,
    properties: { ...state.properties, [tileId]: { ...state.properties[tileId], isMortgaged: false } } };
}

export function getHarborRedemption(state: GameState, playerId: string): HarborRedemption | null {
  const captain = state.players[state.activePlayerIndex];
  if (state.mode !== 'harbor' || !captain || captain.id !== playerId || captain.balance < 0) return null;
  const tileId = captain.position;
  const tile = BOARD_TILES[tileId];
  const property = state.properties[tileId];
  if (tile?.type !== 'PORT' || !property?.isMortgaged || property.ownerId !== playerId) return null;

  const discharge = getHarborFreightOpportunity(reopenPort(state, tileId), playerId);
  if (discharge?.kind !== 'discharge') return null;
  const redemptionCost = getRedemptionCost(tile);
  const cashChange = discharge.quote.carrierNet - redemptionCost;
  return {
    action: { type: 'HARBOR_REDEEM_AND_DISCHARGE', tileId, revision: discharge.action.revision },
    quote: discharge.quote, redemptionCost, cashChange, shortfall: Math.max(0, -cashChange - captain.balance),
  };
}

export function dispatchHarborFreight(
  state: GameState, action: HarborLoadAction | HarborBookExportAction | HarborDischargeAction | HarborPurchaseAction | HarborRedeemAction | HarborRentReliefAction,
  actorId?: string,
): EngineResult {
  const harbor = state.harborFreight;
  const unchanged = { state, events: [] };
  if (!harbor || !actorId) return unchanged;
  let opportunity: HarborRedemption | HarborRentRelief | HarborFreightOpportunity | HarborExportBooking | HarborPurchase | null;
  let exportBooking: HarborExportTerms | undefined;
  switch (action.type) {
    case 'HARBOR_BOOK_EXPORT': {
      opportunity = getHarborExportBooking(state, actorId);
      if (!opportunity || action.operatorId !== opportunity.action.operatorId || action.fee !== opportunity.action.fee) return unchanged;
      exportBooking = { operatorId: action.operatorId, operatorName: opportunity.operatorName, fee: action.fee };
      break;
    }
    case 'HARBOR_BUY_AND_DISCHARGE': opportunity = getHarborPurchase(state, actorId); break;
    case 'HARBOR_REDEEM_AND_DISCHARGE': opportunity = getHarborRedemption(state, actorId); break;
    case 'HARBOR_DISCHARGE_FOR_RENT': opportunity = getHarborRentRelief(state, actorId); break;
    default: opportunity = getHarborFreightOpportunity(state, actorId);
  }
  if (!opportunity || action.type !== opportunity.action.type || action.tileId !== opportunity.action.tileId ||
      action.revision !== opportunity.action.revision || ('shortfall' in opportunity && opportunity.shortfall > 0)) return unchanged;

  const tileId = action.tileId;
  const quote = 'quote' in opportunity ? opportunity.quote : null;
  const nextHarbor: HarborFreightState = {
    ...harbor, revision: harbor.revision + 1,
    visits: { ...harbor.visits, [actorId]: { tileId, handled: true } },
    manifests: { ...harbor.manifests, [actorId]: quote ? null : { originTileId: tileId, ...(exportBooking && { exportBooking }) } },
  };
  if (!quote) {
    const events: GameEvent[] = [{ type: 'HARBOR_LOADED', playerId: actorId, tileId, ...(exportBooking && { exportBooking }) }];
    const players = exportBooking ? state.players.map(player => {
      if (player.id !== actorId && player.id !== exportBooking.operatorId) return player;
      const delta = player.id === actorId ? -exportBooking.fee : exportBooking.fee;
      const balance = player.balance + delta;
      events.push({ type: 'BALANCE_CHANGED', playerId: player.id, newBalance: balance, delta, reason: 'Phí đặt lô hàng xuất khẩu' });
      return { ...player, balance };
    }) : state.players;
    return { state: { ...state, players, harborFreight: nextHarbor }, events };
  }
  const redemption = 'redemptionCost' in opportunity ? opportunity : null;
  const originBooking = harbor.manifests[actorId]?.exportBooking;
  const receipt: HarborFreightReceipt = { ...quote, round: state.turnCount, revision: nextHarbor.revision,
    ...(originBooking && { exportBooking: originBooking }),
    ...(redemption && { redemptionCost: redemption.redemptionCost }) };
  if ('purchasePrice' in opportunity) receipt.purchasePrice = opportunity.purchasePrice;
  if ('rentDue' in opportunity) receipt.rentRelief = { rentDue: opportunity.rentDue, shortfallAfter: opportunity.shortfallAfter };
  nextHarbor.lastDelivery = receipt;
  const events: GameEvent[] = [];
  if (redemption) events.push({ type: 'TILE_UNMORTGAGED', playerId: actorId, tileId, cost: redemption.redemptionCost });
  events.push({ type: 'HARBOR_DISCHARGED', receipt });
  const carrierCashChange = redemption?.cashChange ?? receipt.carrierNet;
  const carrierReason = redemption ? 'Cước hàng khô sau khi chuộc cảng' : 'Cước vận chuyển hàng khô';
  const players = state.players.map(player => {
    const isCarrier = player.id === actorId;
    if (!isCarrier && player.id !== receipt.operatorId) return player;
    const delta = isCarrier ? carrierCashChange : receipt.handlingFee;
    const balance = player.balance + delta;
    events.push({ type: 'BALANCE_CHANGED', playerId: player.id, newBalance: balance, delta,
      reason: isCarrier ? carrierReason : 'Phí khai thác bến cảng' });
    return { ...player, balance };
  });
  const settled = redemption ? reopenPort(state, tileId) : state;
  return { state: { ...settled, players, harborFreight: nextHarbor }, events };
}
