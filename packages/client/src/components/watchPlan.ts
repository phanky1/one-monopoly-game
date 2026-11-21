import {
  BOARD_TILES, getCargoBookings, getCargoRedirections, getFreightQuote, isFinalLogisticsRound, isReeferPort,
  LOGISTICS_ROUND_LIMIT, type GameAction, type GameState, type Player,
} from '@one-monopoly/shared';

export type WatchService = 'laden' | 'empty' | 'reefer' | 'redirect';

export interface WatchPlan {
  roomId: string;
  playerId: string;
  turnRound: number;
  berthId: number;
  bookingId: number | null;
  bookedDestinationId: number | null;
  service: WatchService;
  tileId: number;
}

export type WatchPlanResolution =
  | { status: 'waiting' | 'blocked'; action: null }
  | { status: 'ready'; action: GameAction };

const ports = BOARD_TILES.filter(tile => tile.type === 'PORT' || tile.type === 'GO');
const portIds = new Set(ports.map(tile => tile.id));
const isPortId = (value: unknown): value is number => typeof value === 'number' && portIds.has(value);
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isService = (value: unknown): value is WatchService =>
  value === 'laden' || value === 'empty' || value === 'reefer' || value === 'redirect';

export function isWatchPlan(value: unknown): value is WatchPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  if (typeof plan.roomId !== 'string' || !plan.roomId.trim() || typeof plan.playerId !== 'string' || !plan.playerId.trim() ||
      !isPositiveInteger(plan.turnRound) || plan.turnRound > LOGISTICS_ROUND_LIMIT || !isPortId(plan.berthId) ||
      !isPortId(plan.tileId) || !isService(plan.service)) return false;
  return plan.service === 'redirect'
    ? isPositiveInteger(plan.bookingId) && isPortId(plan.bookedDestinationId) && plan.tileId !== plan.bookedDestinationId
    : plan.bookingId === null && plan.bookedDestinationId === null && plan.tileId !== plan.berthId;
}

function watchSeat(state: GameState, playerId: string) {
  const logistics = state.logistics;
  if (state.mode !== 'logistics' || !logistics || !state.gameStarted || state.winnerId !== null ||
      !state.players[state.activePlayerIndex] || (state.phase !== 'AWAITING_SAIL' && state.phase !== 'END_OF_TURN') ||
      state.pendingDebt || state.pendingSlotCharter || state.auction) return null;
  const index = state.players.findIndex(player => player.id === playerId);
  const captain = state.players[index];
  if (!captain || captain.isBankrupt || captain.inHold || captain.balance < 0 ||
      !isPortId(captain.position) || !logistics.ports[captain.position]) return null;
  const nextRound = index < state.activePlayerIndex;
  if (nextRound && isFinalLogisticsRound(state)) return null;
  return { captain, active: index === state.activePlayerIndex, round: state.turnCount + Number(nextRound) };
}

export function getWatchTurn(state: GameState, playerId: string): number | null {
  const seat = watchSeat(state, playerId);
  return seat && !seat.active ? seat.round : null;
}

/** Base freight is fixed by the route. Yard inventory and the current round's handling slots can still change. */
function baseRates(state: GameState, captain: Player, service: WatchService): Map<number, number> {
  const rates = new Map<number, number>();
  const cargo = captain.cargo;
  if (!isService(service) || (service === 'redirect') !== Boolean(cargo)) return rates;
  const cold = service === 'reefer' || cargo?.reeferDueRound !== undefined;
  const origin = cargo?.originTileId ?? captain.position;
  if (!state.logistics?.ports[origin] || (cold && !isReeferPort(origin)) ||
      (service === 'reefer' && !state.logistics.reeferSlots)) return rates;
  const kind = cargo?.kind ?? (service === 'empty' ? 'empty' : 'laden');
  for (const { id } of ports) {
    if (!state.logistics.ports[id] || id === cargo?.destinationTileId || (cold && !isReeferPort(id))) continue;
    const quote = getFreightQuote(origin, id, kind);
    if (quote) rates.set(id, quote.reward);
  }
  return rates;
}

export function getWatchRates(state: GameState, playerId: string, service: WatchService): Map<number, number> {
  const seat = watchSeat(state, playerId);
  return seat ? baseRates(state, seat.captain, service) : new Map();
}

export function createWatchPlan(state: GameState, playerId: string, service: WatchService, tileId: number): WatchPlan | null {
  const seat = watchSeat(state, playerId);
  if (!seat || seat.active || !baseRates(state, seat.captain, service).has(tileId)) return null;
  const { cargo, position } = seat.captain;
  return { roomId: state.roomId, playerId, turnRound: seat.round, berthId: position,
    bookingId: cargo?.bookingId ?? null, bookedDestinationId: cargo?.destinationTileId ?? null, service, tileId };
}

export function resolveWatchPlan(state: GameState, playerId: string, value: unknown): WatchPlanResolution | null {
  if (!isWatchPlan(value) || value.roomId !== state.roomId || value.playerId !== playerId) return null;
  const seat = watchSeat(state, playerId);
  if (!seat || seat.round !== value.turnRound || seat.captain.position !== value.berthId) return null;
  const cargo = seat.captain.cargo;
  if ((cargo?.bookingId ?? null) !== value.bookingId || (cargo?.destinationTileId ?? null) !== value.bookedDestinationId ||
      !baseRates(state, seat.captain, value.service).has(value.tileId)) return null;
  if (!seat.active) return { status: 'waiting', action: null };

  const choices = value.service === 'redirect' ? getCargoRedirections(state, playerId) :
    getCargoBookings(state, playerId, value.service === 'empty' ? 'empty' : 'laden', value.service === 'reefer');
  const choice = choices.find(option => option.tileId === value.tileId);
  return choice ? { status: 'ready', action: choice.action } : { status: 'blocked', action: null };
}
