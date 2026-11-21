import { BOARD_TILES } from './boardData.js';
import { closeImportTruckRound, getImportTruckReservation, releaseImportTruck } from './importTruck.js';
import { closeBackhaulTurn, getAcceptBackhaulAction, offerBackhaul, settleBackhaul } from './backhaul.js';
import { getVoyagePayment, recordVoyage } from './voyageLog.js';
import { getReeferBonus, hasReeferSlot, isReeferPort } from './reefer.js';
import {
  closeTenderRound, createFreightMarket, FREIGHT_TENDER_MAX_BID, FREIGHT_TENDER_MIN_BID, fulfillFreightContract, getTenderBonus,
} from './freightTender.js';
import type {
  CargoAction, CargoKind, DestinationChange, EngineResult, FreightQuote, GameAction, GameEvent,
  DeliveryReceipt, EarlyTruckChoice, FeederSailAction, FreightTenderBid, FreightTenderWithdrawal, GameState, LogisticsState,
  Player, PortStock, PortTruckSchedule, ReserveImportTruckAction, ReturnCargoToYardAction, SailAction, StreetTurnAction, TruckOperation,
} from './types.js';

export const LOGISTICS_DELIVERY_TARGET = 3;
export const LOGISTICS_ROUND_LIMIT = 8;
export const LOGISTICS_PORT_CAPACITY = 4;
export const FEEDER_RANGE_NM = 1000;

export const PORT_COORDINATES: Readonly<Record<string, { latitude: number; longitude: number }>> = {
  SGSIN: { latitude: 1.263, longitude: 103.85 },
  VNSGN: { latitude: 10.757, longitude: 106.79 },
  VNVUT: { latitude: 10.51, longitude: 107.019 },
  THLCH: { latitude: 13.083, longitude: 100.884 },
  AEJEA: { latitude: 24.991, longitude: 55.055 },
  GRPIR: { latitude: 37.943, longitude: 23.632 },
  ITGOA: { latitude: 44.411, longitude: 8.914 },
  ESVLC: { latitude: 39.448, longitude: -.32 },
  DEHAM: { latitude: 53.532, longitude: 9.955 },
  NLRTM: { latitude: 51.949, longitude: 4.138 },
  KRPUS: { latitude: 35.104, longitude: 129.044 },
  CNYTN: { latitude: 22.573, longitude: 114.269 },
  USOAK: { latitude: 37.797, longitude: -122.315 },
  USLAX: { latitude: 33.738, longitude: -118.273 },
  USSAV: { latitude: 32.126, longitude: -81.154 },
  BRSSZ: { latitude: -23.96, longitude: -46.3 },
  HKHKG: { latitude: 22.342, longitude: 114.128 },
  JPTYO: { latitude: 35.617, longitude: 139.787 },
};

const ports = BOARD_TILES.filter(tile => tile.type === 'PORT' || tile.type === 'GO');
const radians = Math.PI / 180;

function portDistanceNm(originTileId: number, destinationTileId: number): number | null {
  if (originTileId === destinationTileId || !Number.isInteger(originTileId) || !Number.isInteger(destinationTileId)) return null;
  const a = PORT_COORDINATES[BOARD_TILES[originTileId]?.code], b = PORT_COORDINATES[BOARD_TILES[destinationTileId]?.code];
  if (!a || !b) return null;
  const haversine = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

export function getFreightQuote(originTileId: number, destinationTileId: number, kind: CargoKind = 'laden'): FreightQuote | null {
  const miles = portDistanceNm(originTileId, destinationTileId);
  if (miles === null || (kind !== 'laden' && kind !== 'empty')) return null;
  const fullRate = Math.min(40, 12 + 2 * Math.floor(miles / 1000));
  return { distanceNm: Math.round(miles), reward: kind === 'empty' ? fullRate / 2 : fullRate };
}

export function getEmptyNeed(stock: PortStock): number {
  return Math.max(0, stock.emptyTarget - stock.empties);
}

export function createLogisticsState(players: Player[]): LogisticsState {
  const score = () => Object.fromEntries(players.map(player => [player.id, 0]));
  const stocks: Record<number, PortStock> = {};
  ports.forEach((port, i) => {
    stocks[port.id] = i === 0
      ? { supply: Math.min(players.length, LOGISTICS_PORT_CAPACITY), demand: 2, empties: 4, emptyTarget: 1 }
      : { supply: [1, 2, 0, 2][(i - 1) % 4], demand: [1, 2, 1, 0][(i - 1) % 4],
          empties: [0, 1, 3, 4][(i - 1) % 4], emptyTarget: 2 };
  });
  return {
    voyageLog: [],
    streetTurnAvailable: Object.fromEntries(players.map(player => [player.id, true])),
    importTruckAvailable: Object.fromEntries(players.map(player => [player.id, true])),
    importTruckReservations: {},
    earlyTruckAvailable: Object.fromEntries(players.map(player => [player.id, true])),
    calledTrucks: {},
    ports: stocks, backhaulEnabled: true, reeferSlots: {}, market: createFreightMarket(stocks, players),
    feederAvailable: Object.fromEntries(players.map(player => [player.id, true])),
    deliveries: score(), emptyDeliveries: score(), earnings: score(), hasSailed: false,
  };
}

export function isFinalLogisticsRound(state: GameState): boolean {
  return state.mode === 'logistics' && !!state.logistics && (state.turnCount >= LOGISTICS_ROUND_LIMIT ||
    Object.values(state.logistics.deliveries).some(count => count >= LOGISTICS_DELIVERY_TARGET));
}

export function getLogisticsStandings(state: GameState) {
  const logistics = state.logistics;
  if (!logistics) return [];
  // Stable sorting retains starting seat order in an exact tie.
  return state.players.map(player => ({ playerId: player.id, deliveries: logistics.deliveries[player.id],
    emptyDeliveries: logistics.emptyDeliveries[player.id], earnings: logistics.earnings[player.id] }))
    .sort((a, b) => b.deliveries - a.deliveries || b.earnings - a.earnings);
}

export function activeCaptain(state: GameState, playerId: string) {
  const player = state.players[state.activePlayerIndex];
  if (state.mode !== 'logistics' || !state.logistics || !state.gameStarted || state.winnerId !== null ||
      (state.phase !== 'AWAITING_SAIL' && state.phase !== 'END_OF_TURN') || state.pendingDebt || state.pendingSlotCharter ||
      state.auction || !player || player.id !== playerId || player.isBankrupt || player.inHold || player.balance < 0) return null;
  return player;
}

export function getPublicReceivingSlots(stock: PortStock, kind: CargoKind): number {
  return kind === 'laden' ? stock.demand : getEmptyNeed(stock);
}

export function getPortStockAfterDischarge(stock: PortStock, kind: CargoKind, heldTruck = false, streetTurn = false): PortStock {
  const directExport = streetTurn && kind === 'laden';
  return {
    ...stock,
    demand: kind === 'laden' && !heldTruck ? Math.max(0, stock.demand - 1) : stock.demand,
    supply: directExport ? Math.min(LOGISTICS_PORT_CAPACITY, stock.supply + 1) : stock.supply,
    empties: directExport ? stock.empties : Math.min(LOGISTICS_PORT_CAPACITY, stock.empties + 1),
  };
}

export function canReceiveCargo(state: GameState, playerId: string, tileId: number, kind: CargoKind): boolean {
  const stock = state.logistics?.ports[tileId];
  if (state.mode !== 'logistics' || !stock) return false;
  return getPublicReceivingSlots(stock, kind) > 0 || getTenderBonus(state, playerId, tileId, kind) > 0 ||
    (kind === 'laden' && getImportTruckReservation(state, playerId)?.destinationTileId === tileId);
}

export function getImportTruckThroughRound(state: GameState): number {
  return isFinalLogisticsRound(state) ? state.turnCount : Math.min(state.turnCount + 1, LOGISTICS_ROUND_LIMIT);
}

export function getReserveImportTruckAction(state: GameState, playerId: string): ReserveImportTruckAction | null {
  const captain = activeCaptain(state, playerId);
  const booking = captain?.cargo;
  if (!captain || booking?.kind !== 'laden' || state.logistics?.importTruckAvailable?.[playerId] !== true) return null;
  const { bookingId, destinationTileId } = booking;
  if (destinationTileId === captain.position || (state.logistics.ports[destinationTileId]?.demand ?? 0) < 1 ||
      getTenderBonus(state, playerId, destinationTileId, 'laden') > 0) return null;
  if (isFinalLogisticsRound(state) && state.logistics.hasSailed &&
      !getFeederRoutes(state, playerId).some(route => route.tileId === destinationTileId)) return null;
  return { type: 'RESERVE_IMPORT_TRUCK', bookingId, destinationTileId, revision: state.cargoRevision ?? 0 };
}

function openTenderFor(state: GameState, playerId: string) {
  const tender = state.logistics?.market?.tender;
  return tender && activeCaptain(state, playerId) && tender.round === state.turnCount && !isFinalLogisticsRound(state) ? tender : null;
}

export function getTenderBidAction(state: GameState, playerId: string, amount: number): FreightTenderBid | null {
  const tender = openTenderFor(state, playerId);
  if (!tender || !Number.isInteger(amount) || amount < FREIGHT_TENDER_MIN_BID || amount > FREIGHT_TENDER_MAX_BID ||
      tender.bids[playerId] === amount) return null;
  return { type: 'BID_FREIGHT_TENDER', tenderId: tender.id, amount, revision: state.cargoRevision ?? 0 };
}

export function getWithdrawTenderBidAction(state: GameState, playerId: string): FreightTenderWithdrawal | null {
  const tender = openTenderFor(state, playerId);
  if (!tender || !Object.hasOwn(tender.bids, playerId) || !Number.isInteger(tender.bids[playerId])) return null;
  return { type: 'WITHDRAW_FREIGHT_TENDER_BID', tenderId: tender.id, revision: state.cargoRevision ?? 0 };
}

type Load = Extract<CargoAction, { type: 'LOAD_CARGO' }>;
interface BookingChoice<Action> { tileId: number; quote: FreightQuote; action: Action }

export function getCargoBookings(state: GameState, playerId: string, kind: CargoKind, reefer = false): BookingChoice<Load>[] {
  const player = activeCaptain(state, playerId);
  if (!player || player.cargo || (kind !== 'laden' && kind !== 'empty')) return [];
  if (reefer && (kind !== 'laden' || !hasReeferSlot(state, player.position))) return [];
  const stocks = state.logistics!.ports;
  const from = stocks[player.position];
  if (!from || (kind === 'laden' ? from.supply <= 0 : from.empties <= from.emptyTarget)) return [];
  return ports.flatMap(({ id }) => {
    if (reefer && !isReeferPort(id)) return [];
    const quote = getFreightQuote(player.position, id, kind);
    return quote && canReceiveCargo(state, playerId, id, kind) ? [{ tileId: id, quote, action: {
      ...(reefer ? { reefer: true as const } : {}),
      type: 'LOAD_CARGO' as const, tileId: player.position, kind, destinationTileId: id, revision: state.cargoRevision ?? 0,
    } }] : [];
  });
}

export function getCargoRedirections(state: GameState, playerId: string): BookingChoice<DestinationChange>[] {
  const booking = activeCaptain(state, playerId)?.cargo;
  if (!booking) return [];
  return ports.flatMap(({ id }) => {
    if (booking.reeferDueRound !== undefined && !isReeferPort(id)) return [];
    const quote = getFreightQuote(booking.originTileId, id, booking.kind);
    return id !== booking.destinationTileId && quote && canReceiveCargo(state, playerId, id, booking.kind)
      ? [{ tileId: id, quote, action: { type: 'CHANGE_DESTINATION' as const,
          bookingId: booking.bookingId, destinationTileId: id, revision: state.cargoRevision ?? 0 } }]
      : [];
  });
}

export function getReturnCargoYardStatus(state: GameState, playerId: string): 'available' | 'full' | null {
  const captain = activeCaptain(state, playerId);
  const booking = captain?.cargo;
  if (!captain || !booking || booking.originTileId !== captain.position ||
      !Number.isSafeInteger(booking.bookingId) || booking.bookingId < 1) return null;
  const yard = state.logistics!.ports[captain.position];
  if (!yard || (booking.kind !== 'laden' && booking.kind !== 'empty')) return null;
  const stock = booking.kind === 'laden' ? yard.supply : yard.empties;
  return stock < LOGISTICS_PORT_CAPACITY ? 'available' : 'full';
}

export function getReturnCargoToYardAction(state: GameState, playerId: string): ReturnCargoToYardAction | null {
  if (getReturnCargoYardStatus(state, playerId) !== 'available') return null;
  const captain = state.players[state.activePlayerIndex];
  return { type: 'RETURN_CARGO_TO_YARD', tileId: captain.position, bookingId: captain.cargo!.bookingId, revision: state.cargoRevision ?? 0 };
}

export interface CargoOpportunity { action: CargoAction; quote: FreightQuote | null }

export function getCargoOpportunity(state: GameState, playerId: string): CargoOpportunity | null {
  const player = activeCaptain(state, playerId);
  if (!player) return null;
  const booking = player.cargo;
  if (!booking) {
    const suggested = getCargoBookings(state, playerId, 'laden')[0] ?? getCargoBookings(state, playerId, 'empty')[0];
    return suggested ? { action: suggested.action, quote: null } : null;
  }
  const stock = state.logistics!.ports[player.position];
  if (!stock || player.position !== booking.destinationTileId || !canReceiveCargo(state, playerId, player.position, booking.kind)) return null;
  const quote = getFreightQuote(booking.originTileId, player.position, booking.kind);
  return quote ? { action: { type: 'UNLOAD_CARGO', tileId: player.position, originTileId: booking.originTileId,
    bookingId: booking.bookingId, revision: state.cargoRevision ?? 0 }, quote } : null;
}

function canStreetTurn(logistics: LogisticsState, player: Player): boolean {
  return logistics.streetTurnAvailable?.[player.id] === true && player.cargo?.kind === 'laden' &&
    player.cargo.reeferDueRound === undefined && logistics.ports[player.position]?.supply < LOGISTICS_PORT_CAPACITY;
}

export function getStreetTurnAction(state: GameState, playerId: string): StreetTurnAction | null {
  const player = activeCaptain(state, playerId);
  if (!player || !canStreetTurn(state.logistics!, player)) return null;
  const unload = getCargoOpportunity(state, playerId)?.action;
  return unload?.type === 'UNLOAD_CARGO' ? { ...unload, streetTurn: true } : null;
}

export interface LogisticsRoute {
  tileId: number; supply: number; demand: number; distanceNm: number; quote: FreightQuote | null; action: SailAction;
}

function dischargeQuote(state: GameState, player: Player, destination: number): FreightQuote | null {
  const cargo = player.cargo;
  return cargo?.destinationTileId === destination && canReceiveCargo(state, player.id, destination, cargo.kind)
    ? getFreightQuote(cargo.originTileId, destination, cargo.kind) : null;
}

export function getLogisticsRoutes(state: GameState, playerId: string): LogisticsRoute[] {
  const player = activeCaptain(state, playerId);
  if (!player || state.phase !== 'AWAITING_SAIL' || state.logistics!.hasSailed) return [];
  return ports.flatMap(({ id }) => {
    const leg = getFreightQuote(player.position, id);
    if (!leg) return [];
    const stock = state.logistics!.ports[id];
    const quote = dischargeQuote(state, player, id);
    return [{ tileId: id, supply: stock.supply, demand: stock.demand, distanceNm: leg.distanceNm, quote,
      action: { type: 'SAIL_TO_PORT' as const, tileId: id, revision: state.cargoRevision ?? 0 } }];
  });
}

/** Navigable direct feeder distance, bounded before rounding for display. */
export function getFeederDistanceNm(originTileId: number, destinationTileId: number): number | null {
  const miles = portDistanceNm(originTileId, destinationTileId);
  return miles !== null && miles <= FEEDER_RANGE_NM ? Math.round(miles) : null;
}

export interface FeederRoute {
  tileId: number;
  distanceNm: number;
  quote: FreightQuote | null;
  action: FeederSailAction;
}

export function getFeederRoutes(state: GameState, playerId: string): FeederRoute[] {
  const player = activeCaptain(state, playerId);
  if (!player || state.phase !== 'END_OF_TURN' || !state.logistics?.hasSailed ||
      state.logistics.feederAvailable?.[playerId] !== true) return [];
  const routes: FeederRoute[] = [];
  for (const { id } of ports) {
    const distanceNm = getFeederDistanceNm(player.position, id);
    if (distanceNm !== null) {
      routes.push({ tileId: id, distanceNm, quote: dischargeQuote(state, player, id),
        action: { type: 'SAIL_FEEDER', tileId: id, revision: state.cargoRevision ?? 0 } });
    }
  }
  return routes.sort((a, b) => a.distanceNm - b.distanceNm || a.tileId - b.tileId);
}

// The rotating truck schedule adds individual import orders and packs available empty
// equipment into new export loads. Existing cargo and unfilled orders stay in the yard.
function runTruck(stock: PortStock, operation: TruckOperation, heldTrucks: number): boolean {
  if (operation === 'import') {
    if (stock.demand + heldTrucks >= LOGISTICS_PORT_CAPACITY) return false;
    stock.demand++;
  } else {
    if (stock.supply >= LOGISTICS_PORT_CAPACITY || stock.empties < 1) return false;
    stock.supply++;
    stock.empties--;
  }
  return true;
}

function scheduledTrucks(logistics: LogisticsState, tileId: number, index: number, round: number): PortTruckSchedule {
  const before = { ...logistics.ports[tileId] }, projected = { ...before };
  const held = Object.values(logistics.importTruckReservations ?? {}).filter(appointment => appointment.destinationTileId === tileId);
  const returning = held.filter(appointment => appointment.throughRound < round).length;
  projected.demand += returning;
  const scheduled: TruckOperation[] = [];
  if ((index + round) % 3 === 0) scheduled.push('export');
  if (index % 3 === round % 3) scheduled.push('import');
  const operations = scheduled.map(operation => {
    const consumed = logistics.calledTrucks?.[tileId]?.includes(operation) === true;
    const after = { ...before };
    const available = !consumed && runTruck(after, operation, held.length);
    if (!consumed) runTruck(projected, operation, held.length - returning);
    return { operation, consumed, available, after };
  });
  return { tileId, scheduledRound: round, ...(returning > 0 && { returningImportTrucks: returning }), before, projected, operations };
}

export function getPortTruckSchedule(state: GameState, tileId: number): PortTruckSchedule | null {
  const logistics = state.logistics;
  if (!logistics?.earlyTruckAvailable || state.mode !== 'logistics' || !state.gameStarted ||
      state.winnerId !== null || isFinalLogisticsRound(state)) return null;
  const index = ports.findIndex(port => port.id === tileId);
  if (index < 0 || !logistics.ports[tileId]) return null;
  return scheduledTrucks(logistics, tileId, index, state.turnCount + 1);
}

export function getEarlyTruckCalls(state: GameState, playerId: string): EarlyTruckChoice[] {
  const captain = activeCaptain(state, playerId);
  if (!captain || state.logistics?.earlyTruckAvailable?.[playerId] !== true) return [];
  const schedule = getPortTruckSchedule(state, captain.position);
  if (!schedule) return [];
  return schedule.operations.filter(entry => entry.available).map(({ operation, after }) => ({
    operation, after, action: { type: 'CALL_PORT_TRUCK', tileId: schedule.tileId, operation, revision: state.cargoRevision ?? 0 },
  }));
}

export function getNextRoundReceivingSlots(state: GameState, tileId: number, kind: CargoKind): number {
  const index = ports.findIndex(port => port.id === tileId);
  if (index < 0 || !state.logistics?.ports[tileId]) return 0;
  return getPublicReceivingSlots(scheduledTrucks(state.logistics, tileId, index, state.turnCount + 1).projected, kind);
}

function replenish(logistics: LogisticsState, round: number) {
  ports.forEach((port, index) => {
    logistics.ports[port.id] = scheduledTrucks(logistics, port.id, index, round).projected;
  });
  if (logistics.calledTrucks) logistics.calledTrucks = {};
}

export function dispatchLogistics(state: GameState, action: GameAction, playerId: string): EngineResult {
  const unchanged = { state, events: [] };
  const player = activeCaptain(state, playerId);
  if (!player) return unchanged;
  const revision = state.cargoRevision ?? 0;
  if (action.type !== 'END_TURN' && (!('revision' in action) || action.revision !== revision)) return unchanged;
  // Clone only after the operation is validated. A declined request always returns the original snapshot.
  const next = () => {
    const stateCopy = structuredClone(state);
    stateCopy.cargoRevision = revision + 1;
    return stateCopy;
  };
  const at = player.position;
  switch (action.type) {
    case 'RESERVE_IMPORT_TRUCK': {
      const eligible = getReserveImportTruckAction(state, playerId);
      if (!eligible || action.bookingId !== eligible.bookingId || action.destinationTileId !== eligible.destinationTileId) return unchanged;
      const result = next();
      const logistics = result.logistics!;
      const held = { bookingId: eligible.bookingId, destinationTileId: eligible.destinationTileId, throughRound: getImportTruckThroughRound(state) };
      logistics.importTruckAvailable![playerId] = false;
      (logistics.importTruckReservations ??= {})[playerId] = held;
      logistics.ports[held.destinationTileId].demand--;
      return { state: result, events: [{ type: 'IMPORT_TRUCK_RESERVED', playerId, ...held }] };
    }
    case 'CALL_PORT_TRUCK': {
      if (action.tileId !== at) return unchanged;
      const choice = getEarlyTruckCalls(state, playerId).find(option => option.operation === action.operation);
      if (!choice) return unchanged;
      const result = next();
      const logistics = result.logistics!;
      logistics.earlyTruckAvailable![playerId] = false;
      const called = logistics.calledTrucks ??= {};
      (called[at] ??= []).push(choice.operation);
      logistics.ports[at] = choice.after;
      return { state: result, events: [{ type: 'PORT_TRUCK_CALLED', tileId: at, operation: choice.operation,
        playerId, scheduledRound: state.turnCount + 1 }] };
    }
    case 'ACCEPT_BACKHAUL': {
      const expected = getAcceptBackhaulAction(state, playerId);
      if (!expected || expected.bookingId !== action.bookingId) return unchanged;
      const result = next();
      const job = result.players[state.activePlayerIndex].backhaul!;
      job.status = 'active';
      return { state: result, events: [{ type: 'BACKHAUL_ACCEPTED', playerId, job: { ...job } }] };
    }
    case 'BID_FREIGHT_TENDER': {
      const bid = getTenderBidAction(state, playerId, action.amount);
      if (!bid || bid.tenderId !== action.tenderId) return unchanged;
      const result = next();
      const tender = result.logistics!.market!.tender!;
      tender.bidderIds ??= Object.keys(tender.bids);
      if (!tender.bidderIds.includes(playerId)) tender.bidderIds.push(playerId);
      tender.bidCount = tender.bidderIds.length;
      tender.bids[playerId] = bid.amount;
      return { state: result, events: [{ type: 'FREIGHT_TENDER_BID', playerId, tenderId: tender.id }] };
    }
    case 'WITHDRAW_FREIGHT_TENDER_BID': {
      const withdrawal = getWithdrawTenderBidAction(state, playerId);
      if (!withdrawal || withdrawal.tenderId !== action.tenderId) return unchanged;
      const result = next();
      const tender = result.logistics!.market!.tender!;
      delete tender.bids[playerId];
      tender.bidderIds = (tender.bidderIds ?? Object.keys(tender.bids)).filter(id => id !== playerId);
      tender.bidCount = tender.bidderIds.length;
      return { state: result, events: [{ type: 'FREIGHT_TENDER_BID_WITHDRAWN', playerId, tenderId: tender.id }] };
    }
    case 'LOAD_CARGO': {
      if ((action.reefer !== undefined && action.reefer !== true) || at !== action.tileId ||
          !getCargoBookings(state, playerId, action.kind, action.reefer).some(item => item.tileId === action.destinationTileId)) return unchanged;
      const result = next();
      const booking = { bookingId: revision + 1, originTileId: at, destinationTileId: action.destinationTileId, kind: action.kind,
        ...(action.reefer ? { reeferDueRound: state.turnCount } : {}) };
      if (action.reefer) result.logistics!.reeferSlots![at] = state.turnCount;
      result.players[state.activePlayerIndex].cargo = booking;
      const stock = result.logistics!.ports[at];
      if (booking.kind === 'laden') stock.supply--; else stock.empties--;
      return { state: result, events: [{ type: 'CARGO_LOADED', playerId, tileId: at, ...booking }] };
    }
    case 'RETURN_CARGO_TO_YARD': {
      const expected = getReturnCargoToYardAction(state, playerId);
      if (!expected || Object.keys(action).length !== 4 || expected.tileId !== action.tileId || expected.bookingId !== action.bookingId) {
        return unchanged;
      }
      const result = next();
      const logistics = result.logistics!;
      const captain = result.players[state.activePlayerIndex];
      const booking = captain.cargo!;
      const yard = logistics.ports[at];
      if (booking.kind === 'laden') yard.supply++;
      else yard.empties++;
      releaseImportTruck(logistics, playerId);
      delete captain.cargo;
      return { state: result, events: [{ type: 'CARGO_RETURNED_TO_YARD', playerId, tileId: at, bookingId: booking.bookingId,
        kind: booking.kind, destinationTileId: booking.destinationTileId,
        ...(booking.reeferDueRound !== undefined && { reeferDueRound: booking.reeferDueRound }) }] };
    }
    case 'CHANGE_DESTINATION': {
      const booking = player.cargo;
      if (!booking || booking.bookingId !== action.bookingId ||
          !getCargoRedirections(state, playerId).some(item => item.tileId === action.destinationTileId)) return unchanged;
      const result = next();
      const updated = result.players[state.activePlayerIndex].cargo!;
      if (updated.destinationAmendment) {
        updated.destinationAmendment.count++;
      } else {
        const originalQuote = getFreightQuote(booking.originTileId, booking.destinationTileId, booking.kind);
        if (originalQuote) {
          updated.destinationAmendment = { firstDestinationTileId: booking.destinationTileId, count: 1, originalQuote };
        }
      }
      updated.destinationTileId = action.destinationTileId;
      releaseImportTruck(result.logistics!, playerId);
      return { state: result, events: [{ type: 'CARGO_DESTINATION_CHANGED', playerId, tileId: at,
        previousDestinationTileId: booking.destinationTileId, ...structuredClone(updated) }] };
    }
    case 'SAIL_TO_PORT':
    case 'SAIL_FEEDER': {
      const feeder = action.type === 'SAIL_FEEDER';
      const routes = feeder ? getFeederRoutes(state, playerId) : getLogisticsRoutes(state, playerId);
      if (!routes.some(route => route.tileId === action.tileId)) return unchanged;
      const result = next();
      result.players[state.activePlayerIndex].position = action.tileId;
      if (feeder) result.logistics!.feederAvailable![playerId] = false;
      result.logistics!.hasSailed = true;
      result.phase = 'END_OF_TURN';
      return { state: result, events: [{ type: 'SHIP_STEPPED', playerId, from: at, to: action.tileId, ...(feeder && { feeder: true }) }] };
    }
    case 'UNLOAD_CARGO': {
      const offer = getCargoOpportunity(state, playerId);
      const booking = player.cargo;
      if (!booking || !offer?.quote || action.tileId !== at || booking.bookingId !== action.bookingId ||
          booking.originTileId !== action.originTileId) return unchanged;
      if (action.streetTurn !== undefined && (action.streetTurn !== true || !canStreetTurn(state.logistics!, player))) return unchanged;
      const result = next();
      const captain = result.players[state.activePlayerIndex];
      const logistics = result.logistics!;
      const stock = logistics.ports[at];
      const receipt: DeliveryReceipt = { ...captain.cargo!, tileId: at, ...offer.quote };
      if (action.streetTurn) {
        logistics.streetTurnAvailable![playerId] = false;
        receipt.streetTurn = true;
      }
      const reeferBonus = getReeferBonus(booking, state.turnCount);
      if (reeferBonus !== undefined) receipt.reeferBonus = reeferBonus;
      const contractEvent = fulfillFreightContract(result, playerId, receipt);
      const backhaulEvent = settleBackhaul(result, captain, receipt);
      const payment = getVoyagePayment(receipt);
      const heldTruck = getImportTruckReservation(state, playerId) !== null;
      if (heldTruck) delete logistics.importTruckReservations![playerId];
      delete captain.cargo;
      captain.lastDelivery = receipt;
      captain.balance += payment;
      logistics.deliveries[playerId]++;
      logistics.earnings[playerId] += payment;
      if (booking.kind === 'empty') logistics.emptyDeliveries[playerId]++;
      logistics.ports[at] = getPortStockAfterDischarge(stock, booking.kind, heldTruck, action.streetTurn);
      recordVoyage(logistics, playerId, result.turnCount, receipt);
      const events: GameEvent[] = [{ type: 'CARGO_UNLOADED', playerId, ...structuredClone(receipt) }];
      if (contractEvent) events.push(contractEvent);
      if (backhaulEvent) events.push(backhaulEvent);
      events.push({ type: 'BALANCE_CHANGED', playerId, newBalance: captain.balance, delta: payment,
        reason: contractEvent ? 'Cước giao container và thưởng hợp đồng' : 'Cước giao container' });
      if (isFinalLogisticsRound(result)) {
        if (logistics.market) logistics.market.tender = null;
        for (const held of Object.values(logistics.importTruckReservations ?? {})) {
          held.throughRound = Math.min(held.throughRound, result.turnCount);
        }
        for (const player of result.players) {
          if (player.backhaul) player.backhaul.deadlineRound = Math.min(player.backhaul.deadlineRound, result.turnCount);
        }
        if (captain.backhaul?.status === 'offered') delete captain.backhaul;
        const canReturn = !logistics.hasSailed || getFeederRoutes(result, playerId).some(route => route.tileId === receipt.originTileId);
        if (canReturn && captain.lastBackhaulPaidRound !== result.turnCount) offerBackhaul(result, captain, receipt, result.turnCount);
      } else {
        offerBackhaul(result, captain, receipt, result.turnCount + 1);
      }
      return { state: result, events };
    }
    case 'END_TURN': {
      const result = next();
      const events: GameEvent[] = [{ type: 'LOGISTICS_TURN_ENDED', playerId, sailed: state.logistics!.hasSailed }];
      closeBackhaulTurn(result, events, isFinalLogisticsRound(state));
      if (state.activePlayerIndex === state.players.length - 1) closeImportTruckRound(result, isFinalLogisticsRound(state));
      if (state.activePlayerIndex === state.players.length - 1 && isFinalLogisticsRound(state)) {
        closeTenderRound(result, events, 'finished');
        result.winnerId = getLogisticsStandings(result)[0].playerId;
        events.push({ type: 'GAME_OVER', winnerId: result.winnerId });
        return { state: result, events };
      }
      result.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
      if (result.activePlayerIndex === 0) {
        replenish(result.logistics!, ++result.turnCount);
        closeTenderRound(result, events, isFinalLogisticsRound(result) ? 'final' : 'normal');
      }
      result.phase = 'AWAITING_SAIL';
      result.logistics!.hasSailed = false;
      return { state: result, events };
    }
    default: return unchanged;
  }
}
