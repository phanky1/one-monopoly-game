import { BOARD_TILES } from './boardData.js';
import type { CargoBooking, GameState } from './types.js';

export const REEFER_ON_TIME_BONUS = 8;

// These ports offer a refrigerated export loading slot in this scenario.
const coldChain = new Set(['SGSIN', 'VNSGN', 'ESVLC', 'NLRTM', 'KRPUS', 'USLAX', 'BRSSZ', 'JPTYO']);

export function isReeferPort(tileId: number): boolean {
  return coldChain.has(BOARD_TILES[tileId]?.code);
}

export function hasReeferSlot(state: GameState, tileId: number): boolean {
  const slots = state.logistics?.reeferSlots;
  return state.mode === 'logistics' && !!slots && isReeferPort(tileId) && slots[tileId] !== state.turnCount;
}

export function getReeferBonus(booking: CargoBooking, currentRound: number): number | undefined {
  if (booking.reeferDueRound === undefined) return undefined;
  return currentRound === booking.reeferDueRound ? REEFER_ON_TIME_BONUS : 0;
}
