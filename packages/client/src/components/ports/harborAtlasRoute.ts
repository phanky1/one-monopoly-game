import {
  BOARD_TILES, getHarborFreightOpportunity, type GameState, type HarborFreightQuote, type HarborFreightReceipt,
} from '@one-monopoly/shared';
import { portGuide, type PortArrival, type PortGuide } from './portGuide.js';

export type HarborAtlasRoute = {
  origin: PortGuide;
  destination: PortGuide;
  quote: HarborFreightQuote;
  playerId: string;
  playerName: string;
} & ({ kind: 'available'; receipt: null } | { kind: 'delivered'; receipt: HarborFreightReceipt });

/** Follow the box carried into this live berth. Its origin may precede the ship's last dice move. */
export function getHarborAtlasRoute(state: GameState, arrival: PortArrival, tileId: number): HarborAtlasRoute | null {
  const harbor = state.harborFreight;
  const captain = state.players[state.activePlayerIndex];
  const destination = portGuide[BOARD_TILES[tileId]?.code];
  if (state.mode !== 'harbor' || !state.gameStarted || state.winnerId !== null || !harbor || !destination ||
      !arrival.playerName || arrival.port.code !== destination.code || !captain || arrival.playerId !== captain.id ||
      captain.position !== tileId || captain.inHold || captain.isBankrupt) return null;

  const visit = harbor.visits[captain.id];
  if (visit?.tileId !== tileId) return null;
  const call = { destination, playerId: captain.id, playerName: captain.name };
  if (visit.handled) {
    const receipt = harbor.lastDelivery;
    if (!receipt || receipt.tileId !== tileId || receipt.playerId !== captain.id ||
        receipt.round !== state.turnCount || receipt.revision !== harbor.revision) return null;
    const manifest = harbor.manifests[captain.id];
    if (manifest && (!receipt.turnaround || manifest.originTileId !== tileId)) return null;
    const origin = portGuide[BOARD_TILES[receipt.originTileId]?.code];
    return origin ? { ...call, origin, quote: receipt, kind: 'delivered', receipt } : null;
  }

  const offer = getHarborFreightOpportunity(state, captain.id);
  if (offer?.kind !== 'discharge') return null;
  const origin = portGuide[BOARD_TILES[offer.quote.originTileId]?.code];
  return origin ? { ...call, origin, quote: offer.quote, kind: 'available', receipt: null } : null;
}
