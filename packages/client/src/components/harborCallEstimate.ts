import {
  BOARD_TILES, getHarborFreightOpportunity, getHarborFreightQuote, OneMonopolyEngine,
  type GameState, type HarborFreightQuote,
} from '@one-monopoly/shared';

interface CallRoute {
  originTileId: number;
  tileId: number;
}

export type HarborCallEstimate = CallRoute & (
  | { kind: 'origin' | 'mortgaged' }
  | {
    kind: 'open';
    ownership: 'go' | 'unowned' | 'own' | 'rival';
    quote: HarborFreightQuote;
    rent: number;
    portIncome: number;
    charterRent: number | null;
    currentDischarge: HarborFreightQuote | null;
  }
);

/** Estimate a future call for the inspecting captain's own box at today's rates. */
export function getHarborCallEstimate(state: GameState, tileId: number, viewerId: string | null): HarborCallEstimate | null {
  if (state.mode !== 'harbor' || !state.gameStarted || state.winnerId !== null || !viewerId || !Number.isInteger(tileId)) return null;
  const viewer = state.players.find(player => player.id === viewerId);
  const box = state.harborFreight?.manifests[viewerId];
  const tile = BOARD_TILES[tileId];
  if (!viewer || viewer.isBankrupt || !box || viewer.position === tileId ||
      (tile?.type !== 'PORT' && tile?.type !== 'GO')) return null;
  const origin = BOARD_TILES[box.originTileId];
  if (!Number.isInteger(box.originTileId) || (origin?.type !== 'PORT' && origin?.type !== 'GO')) return null;

  const route = { originTileId: box.originTileId, tileId };
  if (tileId === box.originTileId) return { ...route, kind: 'origin' };
  const deed = state.properties[tileId];
  if (deed?.isMortgaged) return { ...route, kind: 'mortgaged' };
  const quote = getHarborFreightQuote(state, viewerId, box.originTileId, tileId);
  if (!quote) return null;
  let ownership: 'go' | 'unowned' | 'own' | 'rival' = 'unowned';
  if (tile.type === 'GO') ownership = 'go';
  else if (deed.ownerId === viewerId) ownership = 'own';
  else if (quote.operatorId) ownership = 'rival';
  else if (deed.ownerId !== null) return null;
  const rent = ownership === 'rival' ? OneMonopolyEngine.calculateRent(state, tileId, state.dice) : 0;
  const charter = ownership === 'rival' ? OneMonopolyEngine.getSlotCharterOffer(state, tileId, viewerId, rent) : null;
  const current = getHarborFreightOpportunity(state, viewerId);
  return {
    ...route, kind: 'open', ownership, quote, rent, portIncome: quote.carrierNet - rent,
    charterRent: charter?.discountedRent ?? null, currentDischarge: current?.kind === 'discharge' ? current.quote : null,
  };
}
