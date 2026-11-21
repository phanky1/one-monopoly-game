import {
  BOARD_TILES, LOOP_GROUPS_CONFIG, OneMonopolyEngine, getHarborFreightQuote, getHarborTerminalShare,
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

export function getPortInvestment(state: GameState, tileId: number, buyerId: string | null): PortInvestment | null {
  if (state.mode !== 'harbor' || !buyerId || !Number.isInteger(tileId)) return null;
  const tile = BOARD_TILES[tileId];
  const deed = state.properties[tileId];
  if (tile?.type !== 'PORT' || !tile.group || !deed || deed.ownerId !== null || deed.isMortgaged ||
      !state.players.some(player => player.id === buyerId && !player.isBankrupt)) return null;

  const afterPurchase = { ...state, properties: { ...state.properties, [tileId]: { ...deed, ownerId: buyerId } } };
  const group = LOOP_GROUPS_CONFIG[tile.group];
  const carrier = state.players[state.activePlayerIndex];
  let arrival: PortInvestment['arrival'] = null;
  if (carrier?.position === tileId && !carrier.inHold) {
    const visit = state.harborFreight?.visits[carrier.id];
    const box = state.harborFreight?.manifests[carrier.id];
    if (visit?.tileId === tileId && !visit.handled && box) {
      const quote = getHarborFreightQuote(afterPurchase, carrier.id, box.originTileId, tileId);
      if (quote) arrival = { quote, carrierName: carrier.name };
    }
  }
  return {
    groupName: group.name,
    ownedAfter: group.tileIds.filter(id => afterPurchase.properties[id]?.ownerId === buyerId).length,
    groupSize: group.tileIds.length,
    rent: OneMonopolyEngine.calculateRent(afterPurchase, tileId, state.dice),
    feePercent: getHarborTerminalShare(afterPurchase, tileId),
    arrival,
  };
}
