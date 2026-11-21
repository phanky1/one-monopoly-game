import { BOARD_TILES, getEmptyNeed, getFreightQuote, getImportTruckReservation, isReeferPort, type CargoKind, type GameState } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';

export type MarketFilter = 'all' | 'export' | 'surplus' | 'shortage' | 'import';
export type MarketSort = 'opportunity' | 'distance';

interface Incoming {
  captain: string;
  kind: CargoKind;
  refrigerated: boolean;
  heldThrough?: number;
}

export function freightMarketRows(state: GameState, viewerId: string | null, filter: MarketFilter, sort: MarketSort) {
  const logistics = state.logistics;
  const captain = state.players.find(p => p.id === viewerId) ?? state.players[state.activePlayerIndex];
  if (!logistics || !captain) return [];
  const cargo = captain.cargo;
  const currentAward = logistics.market?.contract;
  const ownTruck = getImportTruckReservation(state, captain.id);
  const inbound = new Map<number, Incoming[]>();
  for (const rival of state.players) {
    if (rival.id === captain.id || rival.isBankrupt || !rival.cargo) continue;
    const { destinationTileId, kind, reeferDueRound } = rival.cargo;
    const arrivals = inbound.get(destinationTileId) ?? [];
    const truck = getImportTruckReservation(state, rival.id);
    arrivals.push({ captain: rival.name, kind, refrigerated: reeferDueRound !== undefined,
      ...(truck && { heldThrough: truck.throughRound }) });
    inbound.set(destinationTileId, arrivals);
  }

  const rows = BOARD_TILES.flatMap(tile => {
    const guide = portGuide[tile.code], stock = logistics.ports[tile.id];
    if (!guide || !stock) return [];
    const supply = stock.supply, demand = stock.demand;
    const surplus = Math.max(0, stock.empties - stock.emptyTarget), shortage = getEmptyNeed(stock);
    const counts = { export: supply, surplus, shortage, import: demand };
    if (filter !== 'all' && !counts[filter]) return [];
    const current = captain.position === tile.id;
    const distanceNm = current ? 0 : getFreightQuote(captain.position, tile.id)?.distanceNm ?? null;
    const incoming = inbound.get(tile.id) ?? [];
    const award = currentAward?.status === 'active' && currentAward.deliveryRound === state.turnCount &&
      currentAward.destinationTileId === tile.id ? currentAward : undefined;
    const ownAward = !!award && award.playerId === captain.id;
    const booked = cargo?.destinationTileId === tile.id;
    const cargoCompatible = !!cargo && cargo.originTileId !== tile.id &&
      (cargo.reeferDueRound === undefined || isReeferPort(tile.id));
    const capacity = cargo?.kind === 'empty' ? shortage : demand;
    const ownTruckThrough = ownTruck?.destinationTileId === tile.id ? ownTruck.throughRound : undefined;
    const canReceive = cargoCompatible && (capacity > 0 || ownTruckThrough !== undefined || (ownAward && cargo.kind === award?.kind));
    // Trucks already reserved have been removed from public stock.
    const matchingInbound = incoming.filter(box => box.kind === cargo?.kind && box.heldThrough === undefined).length;
    const quantity = filter !== 'all' ? counts[filter] : cargo ? Number(canReceive) * Math.max(1, capacity) : Math.max(supply, surplus);
    let priority = 0;
    if (filter === 'all') {
      if (booked && canReceive) priority = 3;
      else if (ownAward && (!cargo || (canReceive && cargo.kind === award?.kind))) priority = 2;
      else if (canReceive) priority = 1;
    }
    const competition = filter === 'shortage' ? incoming.filter(b => b.kind === 'empty').length
      : filter === 'import' ? incoming.filter(b => b.kind === 'laden' && b.heldThrough === undefined).length
      : filter === 'all' && cargo ? matchingInbound : 0;
    const awardHolder = award && state.players.find(p => p.id === award.playerId);
    return [{
      tileId: tile.id, code: tile.code, name: guide.name, country: guide.country,
      supply, surplus, shortage, demand, current, distanceNm, booked, canReceive,
      incoming, ownTruckThrough, award: award && { name: awardHolder?.name ?? 'Hãng tàu', own: award.playerId === viewerId, kind: award.kind, amount: award.amount },
      quantity, priority, competition,
    }];
  });
  return rows.sort((a, b) => {
    if (sort === 'opportunity') {
      const byOpportunity = b.priority - a.priority || b.quantity - a.quantity || a.competition - b.competition;
      if (byOpportunity) return byOpportunity;
    }
    return (a.distanceNm ?? Infinity) - (b.distanceNm ?? Infinity) || a.tileId - b.tileId;
  });
}
