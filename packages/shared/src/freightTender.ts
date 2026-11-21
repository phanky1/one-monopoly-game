import { BOARD_TILES } from './boardData.js';
import type {
  CargoKind, DeliveryReceipt, FreightAward, FreightContract, FreightMarket, FreightTender, GameEvent, GameState, Player, PortStock,
} from './types.js';

export const FREIGHT_TENDER_MIN_BID = 4;
export const FREIGHT_TENDER_MAX_BID = 16;

const harborIds = BOARD_TILES.filter(tile => tile.type === 'PORT' || tile.type === 'GO').map(tile => tile.id);
// The geographic starting point rotates independently of bids, players' money and seat priority.
const destinationStops = [17, 3, 15, 23, 9, 1, 27];

function issueTender(stocks: Record<number, PortStock>, players: Player[], round: number, previous?: number): FreightTender | null {
  if (!players.length) return null;
  const preferred = destinationStops[(round - 1) % destinationStops.length];
  const start = harborIds.indexOf(preferred);
  const ordered = [...harborIds.slice(start), ...harborIds.slice(0, start)];
  // Reuse last round's berth only if no other berth fits the call.
  const candidates = [...ordered.filter(id => id !== previous), ...ordered.filter(id => id === previous)];
  const kinds: CargoKind[] = round % 2 === 1 ? ['laden', 'empty'] : ['empty', 'laden'];
  for (const kind of kinds) {
    const origins = harborIds.filter(id => kind === 'laden' ? stocks[id].supply > 0 : stocks[id].empties > stocks[id].emptyTarget);
    const destinationTileId = candidates.find(id =>
      (kind === 'laden' ? stocks[id].demand > 0 : stocks[id].empties < stocks[id].emptyTarget) &&
      (origins.some(origin => origin !== id) || players.some(player => player.cargo?.kind === kind && player.cargo.originTileId !== id)));
    if (destinationTileId !== undefined) return {
      id: round, round, kind, destinationTileId, priorityPlayerId: players[(round - 1) % players.length].id,
      bids: {}, bidderIds: [], bidCount: 0,
    };
  }
  return null;
}

export function createFreightMarket(stocks: Record<number, PortStock>, players: Player[]): FreightMarket {
  return { tender: issueTender(stocks, players, 1), contract: null, history: [],
    bonusEarnings: Object.fromEntries(players.map(player => [player.id, 0])) };
}

function activeContract(state: GameState, playerId: string, tileId: number, kind: CargoKind) {
  const contract = state.logistics?.market?.contract;
  return state.mode === 'logistics' && state.winnerId === null && contract?.status === 'active' &&
    contract.deliveryRound === state.turnCount && contract.playerId === playerId &&
    contract.destinationTileId === tileId && contract.kind === kind ? contract : null;
}

export function getTenderBonus(state: GameState, playerId: string, tileId: number, kind: CargoKind): number {
  return activeContract(state, playerId, tileId, kind)?.amount ?? 0;
}

function awardTerms(contract: FreightContract): FreightAward {
  const { status, ...terms } = contract;
  return terms;
}

export function fulfillFreightContract(state: GameState, playerId: string, receipt: DeliveryReceipt): GameEvent | null {
  const contract = activeContract(state, playerId, receipt.tileId, receipt.kind);
  if (!contract) return null;
  contract.status = 'fulfilled';
  receipt.tenderId = contract.tenderId;
  receipt.tenderBonus = contract.amount;
  state.logistics!.market!.bonusEarnings[playerId] += contract.amount;
  return { type: 'FREIGHT_CONTRACT_FULFILLED', ...awardTerms(contract), bookingId: receipt.bookingId };
}

// Called on the next, private state. The public award contains only the winning quote.
export function closeTenderRound(state: GameState, events: GameEvent[], nextRound: 'normal' | 'final' | 'finished'): void {
  const market = state.logistics?.market;
  if (!market) return;
  const { tender, contract } = market;
  const missedCarrier = contract?.status === 'active' ? contract.playerId : undefined;
  if (contract) {
    if (contract.status === 'active') {
      contract.status = 'expired';
      events.push({ type: 'FREIGHT_CONTRACT_EXPIRED', ...awardTerms(contract) });
    }
    market.history.push(contract);
  }
  market.contract = null;
  market.tender = null;
  if (nextRound === 'finished') return;

  if (tender) {
    const first = state.players.findIndex(player => player.id === tender.priorityPlayerId);
    const ordered = [...state.players.slice(first), ...state.players.slice(0, first)];
    let winner: FreightAward | undefined;
    for (const player of ordered) {
      if (player.id === missedCarrier) continue;
      const amount = tender.bids[player.id];
      if (Number.isInteger(amount) && (!winner || amount < winner.amount)) winner = {
        tenderId: tender.id, deliveryRound: state.turnCount, playerId: player.id, kind: tender.kind,
        destinationTileId: tender.destinationTileId, amount,
      };
    }
    if (winner) {
      market.contract = { ...winner, status: 'active' };
      events.push({ type: 'FREIGHT_TENDER_AWARDED', ...winner });
    }
  }
  if (nextRound === 'normal') market.tender = issueTender(state.logistics!.ports, state.players, state.turnCount, tender?.destinationTileId);
}
