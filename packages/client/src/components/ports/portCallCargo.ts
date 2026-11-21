import {
  BOARD_TILES, getCargoDestinationEstimate, getCargoOpportunity, getCargoRedirections, getEmptyNeed,
  getImportTruckReservation, getPortStockAfterDischarge, getTenderBonus, isReeferPort,
  type CargoAction, type CargoBooking, type CargoDestinationEstimate, type CargoKind, type DeliveryReceipt,
  type DestinationChange, type GameState, type PortStock,
} from '@one-monopoly/shared';
import type { PortDischarge, PortLoad } from './portArrival.js';

export interface PortCallCargo {
  tileId: number;
  playerId: string;
  playerName: string;
  active: boolean;
  stock: PortStock;
  stockAfterUnload: PortStock | null;
  booking: CargoBooking | null;
  cargoType: CargoKind | 'reefer' | null;
  bookedHere: boolean;
  receiver: 'public' | 'reserved' | 'appointment' | 'unavailable' | null;
  publicSlots: number | null;
  estimate: CargoDestinationEstimate | null;
  unloadAction: Extract<CargoAction, { type: 'UNLOAD_CARGO' }> | null;
  redirectAction: DestinationChange | null;
  receipt: DeliveryReceipt | null;
}

/** Match a live loading event to the manifest at its physical pickup berth. */
export function getPortCallLoad(call: PortCallCargo | null, event: PortLoad | null): PortLoad | null {
  if (!call?.active || !call.booking || event?.type !== 'CARGO_LOADED' || event.playerId !== call.playerId ||
      event.tileId !== call.tileId || event.originTileId !== call.tileId) return null;
  const booking = call.booking;
  if (event.bookingId !== booking.bookingId || event.originTileId !== booking.originTileId ||
      event.destinationTileId !== booking.destinationTileId || event.kind !== booking.kind ||
      event.reeferDueRound !== booking.reeferDueRound) return null;
  return event;
}

/** The caller associates the accepted unload event with this visit and clears it on the next arrival. */
export function getPortCallCargo(
  state: GameState, tileId: number, playerId: string, arrivalUnload?: PortDischarge | null,
): PortCallCargo | null {
  if (!state.gameStarted || state.mode !== 'logistics' || !state.logistics || state.winnerId !== null || !Number.isInteger(tileId)) return null;
  const tile = BOARD_TILES[tileId];
  const stock = state.logistics.ports[tileId];
  const captain = state.players.find(player => player.id === playerId);
  if (!tile || (tile.type !== 'PORT' && tile.type !== 'GO') || !stock || !captain || captain.isBankrupt || captain.position !== tileId) return null;

  const active = state.players[state.activePlayerIndex]?.id === playerId;
  const booking = captain.cargo;
  const cargoType = booking?.reeferDueRound !== undefined ? 'reefer' : booking?.kind ?? null;
  const bookedHere = booking?.destinationTileId === tileId;
  const estimate = active && booking ? getCargoDestinationEstimate(state, playerId, tileId) : null;
  const publicSlots = booking ? (booking.kind === 'empty' ? getEmptyNeed(stock) : stock.demand) : null;
  let receiver: PortCallCargo['receiver'] = null;
  if (booking) {
    receiver = 'unavailable';
    if (booking.originTileId !== tileId && (cargoType !== 'reefer' || isReeferPort(tileId))) {
      if (getImportTruckReservation(state, playerId)?.destinationTileId === tileId) receiver = 'appointment';
      else if (getTenderBonus(state, playerId, tileId, booking.kind) > 0) receiver = 'reserved';
      else if ((publicSlots ?? 0) > 0) receiver = 'public';
    }
  }

  const handling = active && bookedHere ? getCargoOpportunity(state, playerId)?.action : null;
  const unloadAction = handling?.type === 'UNLOAD_CARGO' ? handling : null;
  const redirectAction = active && booking && !bookedHere
    ? getCargoRedirections(state, playerId).find(choice => choice.tileId === tileId)?.action ?? null : null;
  const latest = captain.lastDelivery;
  const receipt = !booking && latest && arrivalUnload?.type === 'CARGO_UNLOADED' && arrivalUnload.playerId === playerId &&
    arrivalUnload.tileId === tileId && latest.tileId === tileId && arrivalUnload.bookingId === latest.bookingId &&
    arrivalUnload.originTileId === latest.originTileId && arrivalUnload.kind === latest.kind ? { ...latest } : null;

  return {
    tileId, playerId, playerName: captain.name, active, stock: { ...stock }, booking: booking ? { ...booking } : null,
    stockAfterUnload: unloadAction && booking ? getPortStockAfterDischarge(stock, booking.kind, receiver === 'appointment') : null,
    cargoType, bookedHere, receiver, publicSlots, estimate, unloadAction, redirectAction, receipt,
  };
}
