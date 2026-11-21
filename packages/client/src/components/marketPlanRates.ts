import { getCargoBookings, getCargoRedirections, type CargoKind, type GameState } from '@one-monopoly/shared';
import { freightMarketRows, type MarketFilter } from './freightMarketRows.js';

export type MarketPlanService = CargoKind | 'reefer' | 'redirect';

export function marketPlanRates(state: GameState, playerId: string, service: MarketPlanService): Map<number, number> {
  const choices = service === 'redirect'
    ? getCargoRedirections(state, playerId)
    : getCargoBookings(state, playerId, service === 'reefer' ? 'laden' : service, service === 'reefer');
  return new Map(choices.map(choice => [choice.tileId, choice.quote.reward]));
}

export function marketRowsByRate(state: GameState, playerId: string | null, filter: MarketFilter, rates: ReadonlyMap<number, number>) {
  const nearestFirst = freightMarketRows(state, playerId, filter, 'distance');
  // Stable sorting keeps equally priced ports, and all ineligible ports, in distance order.
  return nearestFirst.sort((a, b) => (rates.get(b.tileId) ?? -1) - (rates.get(a.tileId) ?? -1));
}
