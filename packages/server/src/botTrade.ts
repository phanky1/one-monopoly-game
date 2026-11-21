import { canSettleTrade, getBotAskingPrice, getBotPortSwapTerms, getTradeCounterAction, isValidTradeOffer } from '@one-monopoly/shared';
import type { GameAction, GameState } from '@one-monopoly/shared';

export function getBotTradeResponse(
  state: GameState, botId: string
): Extract<GameAction, { type: 'RESPOND_TRADE' | 'COUNTER_TRADE' }> | null {
  if (!canSettleTrade(state)) return null;
  const eligible = (state.tradeOffers ?? []).flatMap(offer => {
    if (offer.sellerId !== botId || offer.originalPrice !== undefined || !isValidTradeOffer(state, offer)) return [];
    if (offer.offeredTileId !== undefined) {
      const terms = getBotPortSwapTerms(state, botId, offer.tileId, offer.offeredTileId);
      return terms ? [{ offer, value: offer.price + terms.credit, minimumCash: terms.minimumCash }] : [];
    }
    const minimumCash = getBotAskingPrice(state, botId, offer.tileId);
    return minimumCash === null ? [] : [{ offer, value: offer.price, minimumCash }];
  });
  eligible.sort((a, b) => b.value - a.value || a.offer.id - b.offer.id);
  if (!eligible.length) return null;
  const { offer, minimumCash } = eligible[0];
  if (offer.price < minimumCash) {
    const counter = getTradeCounterAction(state, botId, offer.id, minimumCash);
    if (counter) return counter;
  }
  return { type: 'RESPOND_TRADE', offerId: offer.id, accept: offer.price >= minimumCash,
    ...(offer.offeredTileId !== undefined && { offeredTileId: offer.offeredTileId }) };
}
