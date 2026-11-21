import { getBackhaulBonus } from './backhaul.js';
import {
  activeCaptain, getFeederRoutes, getFreightQuote, getLogisticsRoutes,
  getNextRoundReceivingSlots, getPublicReceivingSlots, isFinalLogisticsRound,
} from './cargo.js';
import { getTenderBonus } from './freightTender.js';
import { getImportTruckReservation } from './importTruck.js';
import { getReeferBonus, isReeferPort } from './reefer.js';
import type { GameState, Player } from './types.js';
import { getVoyagePayment } from './voyageLog.js';

export interface CargoDestinationEstimate {
  tileId: number;
  legDistanceNm: number;
  freightDistanceNm: number;
  arrival: 'here' | 'sail' | 'feeder' | 'next-round' | 'unreachable';
  arrivalRound: number | null;
  receiver: 'public' | 'reserved' | 'appointment' | 'conditional' | 'unavailable';
  publicSlots: number;
  baseFreight: number;
  reeferBonus: number;
  tenderBonus: number;
  backhaulBonus: number;
  total: number | null;
}

function earliestArrival(state: GameState, captain: Player, tileId: number): CargoDestinationEstimate['arrival'] {
  if (captain.position === tileId) return 'here';
  if (getLogisticsRoutes(state, captain.id).some(route => route.tileId === tileId)) return 'sail';
  if (getFeederRoutes(state, captain.id).some(route => route.tileId === tileId)) return 'feeder';
  return isFinalLogisticsRound(state) ? 'unreachable' : 'next-round';
}

/** Preview the current booking or a prospective COD without committing a sailing or reserving capacity. */
export function getCargoDestinationEstimate(state: GameState, playerId: string, tileId: number): CargoDestinationEstimate | null {
  const captain = activeCaptain(state, playerId);
  const booking = captain?.cargo;
  const stock = state.logistics?.ports[tileId];
  if (!captain || !booking || !stock || (booking.reeferDueRound !== undefined && !isReeferPort(tileId))) return null;
  const freight = getFreightQuote(booking.originTileId, tileId, booking.kind);
  const legDistanceNm = captain.position === tileId ? 0 : getFreightQuote(captain.position, tileId)?.distanceNm;
  if (!freight || legDistanceNm === undefined) return null;

  const arrival = earliestArrival(state, captain, tileId);
  const travelRound = arrival === 'next-round' ? state.turnCount + 1 : state.turnCount;
  const arrivalRound = arrival === 'unreachable' ? null : travelRound;
  const publicSlots = getPublicReceivingSlots(stock, booking.kind);
  const tenderBonus = arrivalRound === state.turnCount ? getTenderBonus(state, playerId, tileId, booking.kind) : 0;
  const appointment = getImportTruckReservation(state, playerId);
  let receiver: CargoDestinationEstimate['receiver'] = 'unavailable';
  if (appointment?.destinationTileId === tileId && arrivalRound !== null && arrivalRound <= appointment.throughRound) receiver = 'appointment';
  else if (tenderBonus) receiver = 'reserved';
  else if (arrival === 'next-round') {
    if (getNextRoundReceivingSlots(state, tileId, booking.kind) > 0) receiver = 'conditional';
  } else if (arrivalRound !== null && publicSlots > 0) receiver = 'public';

  const receipt = { ...booking, ...freight, destinationTileId: tileId, tileId };
  const payable = receiver !== 'unavailable' && arrivalRound !== null;
  const reeferBonus = payable ? getReeferBonus(booking, arrivalRound) ?? 0 : 0;
  const backhaulBonus = payable ? getBackhaulBonus(state, captain, receipt, arrivalRound) : 0;
  return {
    tileId, legDistanceNm, freightDistanceNm: freight.distanceNm, arrival, arrivalRound, receiver, publicSlots,
    baseFreight: freight.reward, reeferBonus, tenderBonus, backhaulBonus,
    total: payable ? getVoyagePayment({ ...receipt, reeferBonus, tenderBonus, backhaulBonus }) : null,
  };
}
