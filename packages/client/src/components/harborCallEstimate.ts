import {
  BOARD_TILES, getHarborExportBooking, getHarborFreightOpportunity, getHarborFreightQuote, OneMonopolyEngine,
  type GameState, type HarborFreightQuote,
} from '@one-monopoly/shared';

interface HarborLoadTerms {
  originTileId: number;
  fee: number;
}

interface CallRoute {
  originTileId: number;
  tileId: number;
  loadTerms: HarborLoadTerms | null;
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

/** What this captain would pay to load here. A quote can be inspected even with a cash shortfall. */
export function getHarborLoadTerms(state: GameState, viewerId: string | null): HarborLoadTerms | null {
  if (!viewerId || !state.harborFreight || state.harborFreight.manifests[viewerId]) return null;
  const free = getHarborFreightOpportunity(state, viewerId);
  if (free?.kind === 'load') return { originTileId: free.action.tileId, fee: 0 };
  if (state.supportsHarborExportBooking !== true) return null;
  const booking = getHarborExportBooking(state, viewerId);
  return booking ? { originTileId: booking.action.tileId, fee: booking.action.fee } : null;
}

/** Estimate a call for this captain's cargo or for the box currently offered at their berth. */
export function getHarborCallEstimate(state: GameState, tileId: number, viewerId: string | null): HarborCallEstimate | null {
  if (state.mode !== 'harbor' || !state.gameStarted || state.winnerId !== null || !viewerId || !Number.isInteger(tileId)) return null;
  const viewer = state.players.find(player => player.id === viewerId);
  const box = state.harborFreight?.manifests[viewerId];
  const tile = BOARD_TILES[tileId];
  if (!viewer || viewer.isBankrupt || viewer.position === tileId ||
      (tile?.type !== 'PORT' && tile?.type !== 'GO')) return null;
  const loadTerms = box ? null : getHarborLoadTerms(state, viewerId);
  const originTileId = box?.originTileId ?? loadTerms?.originTileId;
  if (originTileId === undefined || !Number.isInteger(originTileId)) return null;
  const origin = BOARD_TILES[originTileId];
  if (origin?.type !== 'PORT' && origin?.type !== 'GO') return null;

  const route = { originTileId, tileId, loadTerms };
  if (tileId === originTileId) return { ...route, kind: 'origin' };
  const deed = state.properties[tileId];
  if (deed?.isMortgaged) return { ...route, kind: 'mortgaged' };
  const quote = getHarborFreightQuote(state, viewerId, originTileId, tileId);
  if (!quote) return null;
  let ownership: 'go' | 'unowned' | 'own' | 'rival' = 'unowned';
  if (tile.type === 'GO') ownership = 'go';
  else if (deed.ownerId === viewerId) ownership = 'own';
  else if (quote.operatorId) ownership = 'rival';
  else if (deed.ownerId !== null) return null;
  const rent = ownership === 'rival' ? OneMonopolyEngine.calculateRent(state, tileId, state.dice) : 0;
  const charter = ownership === 'rival' ? OneMonopolyEngine.getSlotCharterOffer(state, tileId, viewerId, rent) : null;
  const current = box ? getHarborFreightOpportunity(state, viewerId) : null;
  return {
    ...route, kind: 'open', ownership, quote, rent, portIncome: quote.carrierNet - rent,
    charterRent: charter?.discountedRent ?? null, currentDischarge: current?.kind === 'discharge' ? current.quote : null,
  };
}
