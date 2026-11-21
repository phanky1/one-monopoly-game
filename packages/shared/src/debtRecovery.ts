import { BOARD_TILES, LOOP_GROUPS_CONFIG } from './boardData.js';
import type { BoardTile, GameAction, GameState } from './types.js';

export interface DebtRecoveryOption {
  action: Extract<GameAction, { type: 'SELL_CONTAINER' | 'MORTGAGE_TILE' }>;
  proceeds: number;
}

export interface DebtRecovery {
  shortfall: number;
  maxProceeds: number;
  options: DebtRecoveryOption[];
  recommended: DebtRecoveryOption | null;
}

export function getMortgageValue(tile: BoardTile): number {
  return tile.mortgageValue || Math.floor((tile.price || 0) / 2);
}

export function getRedemptionCost(tile: BoardTile): number {
  const principal = getMortgageValue(tile);
  return principal + Math.ceil(principal / 10);
}

// Each property has at most one way to raise cash immediately.
export function getPropertyCashOption(state: GameState, playerId: string, tileId: number): DebtRecoveryOption | null {
  const tile = BOARD_TILES[tileId];
  const property = state.properties[tileId];
  if (!tile || !property || property.ownerId !== playerId) return null;
  if (tile.type === 'PORT' && property.containerLevel > 0) {
    const group = tile.group && LOOP_GROUPS_CONFIG[tile.group];
    if (!group) return null;
    return {
      action: { type: 'SELL_CONTAINER', tileId, expectedLevel: property.containerLevel },
      proceeds: Math.floor((tile.buildCost || group.buildCost) / 2),
    };
  }
  if (property.isMortgaged) return null;
  return { action: { type: 'MORTGAGE_TILE', tileId }, proceeds: getMortgageValue(tile) };
}

export function getDebtRecovery(state: GameState): DebtRecovery | null {
  const debtor = state.players[state.activePlayerIndex];
  if (!state.gameStarted || state.winnerId !== null || state.phase !== 'AWAITING_DEBT_RESOLUTION' ||
      !state.pendingDebt || !debtor || debtor.isBankrupt) return null;

  const shortfall = Math.max(0, state.pendingDebt.amount - debtor.balance);
  const options: DebtRecoveryOption[] = [];
  let maxProceeds = 0;
  for (const tile of BOARD_TILES) {
    const option = getPropertyCashOption(state, debtor.id, tile.id);
    if (!option) continue;
    options.push(option);
    if (option.action.type === 'SELL_CONTAINER') {
      const property = state.properties[tile.id];
      maxProceeds += option.proceeds * property.containerLevel;
      if (!property.isMortgaged) maxProceeds += getMortgageValue(tile);
    } else {
      maxProceeds += option.proceeds;
    }
  }

  // Keep developed ports when possible, especially a Green Fleet upgrade.
  function priority(option: DebtRecoveryOption): number {
    if (option.action.type === 'MORTGAGE_TILE') return 0;
    return state.properties[option.action.tileId].hasGreenFleet ? 2 : 1;
  }
  let recommended: DebtRecoveryOption | null = null;
  if (shortfall > 0 && maxProceeds >= shortfall) {
    recommended = [...options].sort((a, b) => {
      const byAsset = priority(a) - priority(b);
      if (byAsset) return byAsset;
      if (a.proceeds >= shortfall && b.proceeds >= shortfall) return a.proceeds - b.proceeds;
      return b.proceeds - a.proceeds;
    })[0] ?? null;
  }
  return { shortfall, maxProceeds, options, recommended };
}
