import { BOARD_TILES, type GameState } from '@one-monopoly/shared';
import { getHarborCallEstimate, getHarborLoadTerms } from './harborCallEstimate.js';

interface DirectCall {
  tileId: number;
  total: number;
  ways: number;
  freightMargin: number;
}

export interface HarborLoadingForecast {
  originTileId: number;
  fee: number;
  calls: DirectCall[];
  directWays: number;
  /** Immediate third doubles that send the captain straight to customs. */
  holdWays: number;
}

/** Direct landings on the next roll at today's rates; card draws and later moves are outside this forecast. */
export function getHarborLoadingForecast(state: GameState, viewerId: string | null): HarborLoadingForecast | null {
  const terms = getHarborLoadTerms(state, viewerId);
  if (!terms) return null;

  const thirdDouble = state.phase === 'WAIT_FOR_ROLL' && state.consecutiveDoubles === 2;
  const waysByTotal = Array<number>(13).fill(0);
  let holdWays = 0;
  for (let first = 1; first <= 6; first++) {
    for (let second = 1; second <= 6; second++) {
      if (thirdDouble && first === second) holdWays++;
      else waysByTotal[first + second]++;
    }
  }

  const calls: DirectCall[] = [];
  let directWays = 0;
  for (let total = 2; total <= 12; total++) {
    const ways = waysByTotal[total];
    if (ways === 0) continue;
    const tileId = (terms.originTileId + total) % BOARD_TILES.length;
    const estimate = getHarborCallEstimate(state, tileId, viewerId);
    if (estimate?.kind !== 'open') continue;
    // Arrival rent is due on the same roll even if the captain sails empty.
    calls.push({ tileId, total, ways, freightMargin: estimate.quote.carrierNet - terms.fee });
    directWays += ways;
  }
  return { ...terms, calls, directWays, holdWays };
}
