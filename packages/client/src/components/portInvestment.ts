import {
  BOARD_TILES, LOOP_GROUPS_CONFIG, OneMonopolyEngine, getHarborFreightQuote, getHarborTerminalShare, projectTradeProperties,
  type GameState, type HarborFreightQuote,
} from '@one-monopoly/shared';

export interface PortInvestment {
  groupName: string;
  ownedAfter: number;
  groupSize: number;
  rent: number;
  feePercent: HarborFreightQuote['feePercent'];
  arrival: { quote: HarborFreightQuote; carrierName: string } | null;
}

export function projectPortOwnership(state: GameState, tileId: number, buyerId: string): GameState {
  return { ...state, properties: { ...state.properties,
    [tileId]: { ...state.properties[tileId], ownerId: buyerId, slotCharter: null },
  } };
}

/** Project the final deeds together, before calculating group rents or handling fees. */
export function projectPortTrade(
  state: GameState, tileId: number, buyerId: string, sellerId: string, offeredTileId?: number,
): GameState {
  return { ...state, properties: projectTradeProperties(state, { tileId, buyerId, sellerId, offeredTileId }) };
}

/** Freight the arriving captain could choose to discharge under the supplied deed ownership. */
export function getPortArrivalFreight(state: GameState, tileId: number): PortInvestment['arrival'] {
  const carrier = state.players[state.activePlayerIndex];
  if (carrier?.position !== tileId || carrier.inHold) return null;
  const visit = state.harborFreight?.visits[carrier.id];
  const box = state.harborFreight?.manifests[carrier.id];
  if (visit?.tileId !== tileId || visit.handled || !box) return null;
  const quote = getHarborFreightQuote(state, carrier.id, box.originTileId, tileId);
  return quote ? { quote, carrierName: carrier.name } : null;
}

export function getPortInvestment(state: GameState, tileId: number, buyerId: string | null): PortInvestment | null {
  if (state.mode !== 'harbor' || !buyerId || !Number.isInteger(tileId)) return null;
  const tile = BOARD_TILES[tileId];
  const deed = state.properties[tileId];
  if (tile?.type !== 'PORT' || !tile.group || !deed || deed.ownerId !== null || deed.isMortgaged ||
      !state.players.some(player => player.id === buyerId && !player.isBankrupt)) return null;

  const afterPurchase = projectPortOwnership(state, tileId, buyerId);
  const group = LOOP_GROUPS_CONFIG[tile.group];
  return {
    groupName: group.name,
    ownedAfter: group.tileIds.filter(id => afterPurchase.properties[id]?.ownerId === buyerId).length,
    groupSize: group.tileIds.length,
    rent: OneMonopolyEngine.calculateRent(afterPurchase, tileId, state.dice),
    feePercent: getHarborTerminalShare(afterPurchase, tileId),
    arrival: getPortArrivalFreight(afterPurchase, tileId),
  };
}
