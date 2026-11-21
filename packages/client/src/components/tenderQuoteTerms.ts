import {
  BOARD_TILES, FREIGHT_TENDER_MAX_BID, FREIGHT_TENDER_MIN_BID, getFreightQuote, isFinalLogisticsRound, isReeferPort,
  type FreightTender, type GameState,
} from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';

const portName = (id: number) => portGuide[BOARD_TILES[id]?.code]?.name;

export function tenderQuoteTerms(state: GameState, playerId: string, tender: FreightTender, amount: number | null) {
  const player = state.players[state.activePlayerIndex];
  const logistics = state.logistics;
  if (state.mode !== 'logistics' || !logistics || !player || player.id !== playerId || !state.gameStarted ||
      state.winnerId !== null || logistics.market?.tender?.id !== tender.id || tender.round !== state.turnCount ||
      isFinalLogisticsRound(state)) return null;

  const cargo = player.cargo;
  const originId = cargo?.originTileId ?? player.position;
  const origin = portName(originId), destination = portName(tender.destinationTileId);
  if (!origin || !destination) return null;

  const empty = tender.kind === 'empty';
  if (cargo && cargo.kind !== tender.kind) {
    const carried = cargo.kind === 'empty' ? 'vỏ rỗng' : cargo.reeferDueRound !== undefined ? 'hàng lạnh' : 'hàng khô';
    return { reason: `Tàu đang chở ${carried}. Cần dỡ lô này rồi xếp ${empty ? 'vỏ rỗng' : 'hàng xuất'} cho gói thầu.` };
  }
  if (originId === tender.destinationTileId) {
    return { reason: `${destination} là cảng dỡ của gói thầu. Cần xếp ${empty ? 'vỏ rỗng' : 'hàng xuất'} ở một cảng khác để giao về đây.` };
  }
  if (cargo?.reeferDueRound !== undefined && !isReeferPort(tender.destinationTileId)) {
    return { reason: `${destination} không tiếp nhận hàng lạnh. Cần một lô hàng khô cho gói thầu này.` };
  }
  if (!cargo) {
    const stock = logistics.ports[originId];
    if (!stock) return null;
    if (empty && stock.empties <= stock.emptyTarget) {
      return { reason: `Bãi ${origin} còn ${stock.empties} vỏ, mục tiêu ${stock.emptyTarget}. Chọn bến có vỏ dư để xếp.` };
    }
    if (!empty && stock.supply <= 0) {
      return { reason: `${origin} chưa có hàng xuất để xếp. Chọn bến khác có hàng.` };
    }
  }

  // A winning contract provides its own receiver next round. Today's public
  // capacity cannot establish or rule out this conditional freight.
  const quote = getFreightQuote(originId, tender.destinationTileId, tender.kind);
  if (!quote) return null;
  const proposed = amount !== null && Number.isInteger(amount) &&
    amount >= FREIGHT_TENDER_MIN_BID && amount <= FREIGHT_TENDER_MAX_BID ? amount : null;
  return {
    origin, destination, aboard: !!cargo,
    service: empty ? 'Vỏ rỗng' : cargo?.reeferDueRound !== undefined ? 'Hàng lạnh' : 'Hàng khô',
    bookedElsewhere: cargo && cargo.destinationTileId !== tender.destinationTileId ? portName(cargo.destinationTileId) : undefined,
    distanceNm: quote.distanceNm, base: quote.reward, proposed, subtotal: proposed === null ? null : quote.reward + proposed,
  };
}
