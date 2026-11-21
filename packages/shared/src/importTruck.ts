import type { GameState, ImportTruckReservation, LogisticsState } from './types.js';

export function getImportTruckReservation(state: GameState, playerId: string): ImportTruckReservation | null {
  const logistics = state.logistics;
  const held = logistics?.importTruckReservations?.[playerId];
  if (state.mode !== 'logistics' || !state.gameStarted || state.winnerId !== null ||
      !logistics?.importTruckAvailable || !held || held.throughRound < state.turnCount) return null;
  const booking = state.players.find(player => player.id === playerId)?.cargo;
  return booking?.kind === 'laden' && booking.bookingId === held.bookingId && booking.destinationTileId === held.destinationTileId
    ? held : null;
}

export function releaseImportTruck(logistics: LogisticsState, playerId: string) {
  const held = logistics.importTruckReservations?.[playerId];
  if (!held) return;
  // Replenishment counts held trucks against port capacity, so this truck has space to return.
  logistics.ports[held.destinationTileId].demand++;
  delete logistics.importTruckReservations![playerId];
}

export function closeImportTruckRound(state: GameState, finished: boolean) {
  const logistics = state.logistics!;
  for (const [playerId, held] of Object.entries(logistics.importTruckReservations ?? {})) {
    if (finished || held.throughRound <= state.turnCount) releaseImportTruck(logistics, playerId);
  }
}
