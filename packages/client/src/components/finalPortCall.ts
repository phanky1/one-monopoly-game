import {
  getCargoDestinationEstimate, getCargoOpportunity, getCargoRedirections, getFeederRoutes,
  getLogisticsRoutes, getLogisticsStandings, isFinalLogisticsRound, type GameAction, type GameState,
} from '@one-monopoly/shared';

export type FinalPortCallKind = 'unload' | 'sail' | 'feeder' | 'redirect';

export interface FinalPortCallOption {
  kind: FinalPortCallKind;
  tileId: number;
  action: GameAction;
  total: number;
  expiringReeferBonus: number;
  currentRank: number;
  projectedRank: number;
  bookingId: number;
}

function rankOf(state: GameState, playerId: string): number {
  return getLogisticsStandings(state).findIndex(entry => entry.playerId === playerId) + 1;
}

/** Offers a final delivery or an on-time reefer already at its berth. Rank assumes discharge this turn. */
export function getFinalPortCallOptions(state: GameState, playerId: string): FinalPortCallOption[] {
  const logistics = state.logistics;
  const captain = state.players[state.activePlayerIndex];
  if (!logistics || state.mode !== 'logistics' || !state.gameStarted || state.winnerId !== null ||
      captain?.id !== playerId || !captain.cargo) return [];

  const { bookingId, originTileId, destinationTileId, reeferDueRound } = captain.cargo;
  const finalRound = isFinalLogisticsRound(state);
  if (!finalRound && (captain.position !== destinationTileId || reeferDueRound !== state.turnCount)) return [];
  const candidates: Pick<FinalPortCallOption, 'kind' | 'tileId' | 'action'>[] = [];
  if (captain.position === destinationTileId) {
    const handling = getCargoOpportunity(state, playerId);
    if (handling?.action.type === 'UNLOAD_CARGO') {
      candidates.push({ kind: 'unload', tileId: destinationTileId, action: handling.action });
    }
  } else {
    const routes = logistics.hasSailed ? getFeederRoutes(state, playerId) : getLogisticsRoutes(state, playerId);
    const booked = routes.find(route => route.tileId === destinationTileId && route.quote);
    if (booked) {
      candidates.push({ kind: logistics.hasSailed ? 'feeder' : 'sail', tileId: destinationTileId, action: booked.action });
    }
    if (captain.position !== originTileId) {
      const local = getCargoRedirections(state, playerId).find(option => option.tileId === captain.position);
      if (local) candidates.push({ kind: 'redirect', tileId: local.tileId, action: local.action });
    }
  }
  if (!candidates.length) return [];
  const currentRank = rankOf(state, playerId);
  return candidates.flatMap(candidate => {
    const estimate = getCargoDestinationEstimate(state, playerId, candidate.tileId);
    if (!estimate || estimate.total === null || estimate.arrivalRound !== state.turnCount ||
        (!finalRound && estimate.reeferBonus <= 0)) return [];
    const total = estimate.total;
    const projectedRank = rankOf({ ...state, logistics: {
      ...logistics,
      deliveries: { ...logistics.deliveries, [playerId]: logistics.deliveries[playerId] + 1 },
      earnings: { ...logistics.earnings, [playerId]: logistics.earnings[playerId] + total },
    } }, playerId);
    return [{ ...candidate, bookingId, total, expiringReeferBonus: estimate.reeferBonus, currentRank, projectedRank }];
  });
}
