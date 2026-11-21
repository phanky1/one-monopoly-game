import { BOARD_TILES, INFRA_TILES, LOOP_GROUPS_CONFIG, SERVICE_LINES } from './boardData.js';
import { getPortSwapOptions, projectTradeProperties } from './trade.js';
import type { GameState } from './types.js';

export function getBotAskingPrice(state: GameState, sellerId: string, tileId: number): number | null {
  if (!Number.isSafeInteger(tileId) || state.properties[tileId]?.ownerId !== sellerId) return null;
  const tile = BOARD_TILES[tileId];
  if (!tile?.price) return null;

  let group: number[];
  if (tile.type === 'PORT' && tile.group) group = LOOP_GROUPS_CONFIG[tile.group].tileIds;
  else if (tile.type === 'SERVICE_LINE') group = SERVICE_LINES;
  else if (tile.type === 'INFRA') group = INFRA_TILES;
  else return null;

  const held = group.filter(id => state.properties[id]?.ownerId === sellerId).length;
  if (held === group.length) return Math.ceil(tile.price * 1.5);
  if (held > 1) return Math.ceil(tile.price * 1.25);
  return tile.price;
}

/** Cash the bot will accept in addition to the offered deed at current ownership. */
export function getBotPortSwapTerms(state: GameState, sellerId: string, tileId: number, offeredTileId: number) {
  const buyerId = state.properties[offeredTileId]?.ownerId;
  const askingPrice = getBotAskingPrice(state, sellerId, tileId);
  if (askingPrice === null || !buyerId || !getPortSwapOptions(state, buyerId, tileId).includes(offeredTileId)) return null;

  const properties = projectTradeProperties(state, { tileId, buyerId, sellerId, offeredTileId });
  const credit = getBotAskingPrice({ ...state, properties }, sellerId, offeredTileId);
  return credit === null ? null : { credit, minimumCash: Math.max(0, askingPrice - credit) };
}
