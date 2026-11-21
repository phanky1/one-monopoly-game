import { BOARD_TILES, LOOP_GROUPS_CONFIG } from './boardData.js';
import type { EngineResult, GameAction, GameEvent, GameState, Player, TradeOffer } from './types.js';

type TradeAction = Extract<GameAction, { type: 'OFFER_TRADE' | 'OFFER_PORT_SWAP' | 'COUNTER_TRADE' | 'RESPOND_TRADE' | 'CANCEL_TRADE' }>;

export function isTradeAction(action: GameAction): action is TradeAction {
  return action.type === 'OFFER_TRADE' || action.type === 'OFFER_PORT_SWAP' || action.type === 'COUNTER_TRADE' ||
    action.type === 'RESPOND_TRADE' || action.type === 'CANCEL_TRADE';
}

export function canSettleTrade(state: GameState): boolean {
  return state.gameStarted && state.winnerId === null && (
    state.phase === 'WAIT_FOR_ROLL' || state.phase === 'END_OF_TURN' || state.phase === 'AWAITING_BUY_DECISION'
  );
}

function getTradeAssetRestriction(state: GameState, buyerId: string, tileId: number): string | null {
  if (!state.gameStarted || state.winnerId !== null) return 'Ván chơi không còn nhận giao dịch.';
  const buyer = state.players.find(player => player.id === buyerId);
  if (!buyer || buyer.isBankrupt) return 'Bạn không thể giao dịch trong ván này.';

  if (!Number.isSafeInteger(tileId)) return 'Tài sản không hợp lệ.';
  const tile = BOARD_TILES[tileId];
  const property = state.properties[tileId];
  if (!property || !tile || !property.ownerId ||
      (tile.type !== 'PORT' && tile.type !== 'SERVICE_LINE' && tile.type !== 'INFRA')) {
    return 'Chỉ có thể đề nghị mua tài sản thuộc sở hữu của thuyền trưởng khác.';
  }
  if (property.ownerId === buyerId) return 'Bạn đang sở hữu tài sản này.';
  const seller = state.players.find(player => player.id === property.ownerId);
  if (!seller || seller.isBankrupt) return 'Chủ sở hữu không thể giao dịch.';
  if (property.isMortgaged) return 'Tài sản đang được thế chấp.';
  if (property.slotCharter?.active) return 'Tài sản đang có thỏa thuận chia sẻ chỗ.';
  if (tile.type === 'PORT' && tile.group) {
    const developed = LOOP_GROUPS_CONFIG[tile.group].tileIds.some(id => {
      const port = state.properties[id];
      return port && (port.containerLevel > 0 || port.hasGreenFleet);
    });
    if (developed) return 'Cần bán hết công trình trong nhóm cảng trước khi giao dịch.';
  }
  return null;
}

/** Deeds the buyer can give the seller in the same transaction. */
export function getPortSwapOptions(state: GameState, buyerId: string, targetTileId: number): number[] {
  if (state.mode !== 'harbor' || BOARD_TILES[targetTileId]?.type !== 'PORT' ||
      getTradeAssetRestriction(state, buyerId, targetTileId)) return [];
  const sellerId = state.properties[targetTileId].ownerId!;
  return BOARD_TILES.filter(tile => tile.type === 'PORT' && state.properties[tile.id]?.ownerId === buyerId &&
    !getTradeAssetRestriction(state, sellerId, tile.id)).map(tile => tile.id);
}

export function getTradeRestriction(state: GameState, buyerId: string, tileId: number): string | null {
  const restriction = getTradeAssetRestriction(state, buyerId, tileId);
  if (restriction) return restriction;
  const buyer = state.players.find(player => player.id === buyerId)!;
  if (buyer.balance < 1 && (buyer.balance < 0 || !getPortSwapOptions(state, buyerId, tileId).length)) {
    return 'Bạn cần ít nhất $1M để đề nghị mua.';
  }
  return null;
}

export function isValidTradeOffer(state: GameState, offer: TradeOffer): boolean {
  const { buyerId, sellerId, tileId, offeredTileId, price } = offer;
  if (getTradeAssetRestriction(state, buyerId, tileId) || state.properties[tileId].ownerId !== sellerId) return false;
  const buyer = state.players.find(player => player.id === buyerId)!;
  if (!Number.isSafeInteger(price) || price < 0 || price > buyer.balance) return false;
  if (offeredTileId === undefined) return price > 0;
  return getPortSwapOptions(state, buyerId, tileId).includes(offeredTileId);
}

/** Ownership and charter terms once both parties agree to the transfer. */
export function projectTradeProperties(
  state: GameState,
  { tileId, offeredTileId, buyerId, sellerId }: Pick<TradeOffer, 'tileId' | 'offeredTileId' | 'buyerId' | 'sellerId'>,
): GameState['properties'] {
  const properties = { ...state.properties,
    [tileId]: { ...state.properties[tileId], ownerId: buyerId, slotCharter: null },
  };
  if (offeredTileId !== undefined) {
    properties[offeredTileId] = { ...state.properties[offeredTileId], ownerId: sellerId, slotCharter: null };
  }
  return properties;
}

function nextTradeId(state: GameState): number {
  return (state.tradeOffers ?? []).reduce((lastId, offer) => Math.max(lastId, offer.id), state.tradeSequence ?? 0) + 1;
}

function makeCounterOffer(state: GameState, sellerId: string, offer: TradeOffer | undefined, price: number): TradeOffer | null {
  if (state.mode !== 'harbor' || !offer || offer.sellerId !== sellerId || offer.originalPrice !== undefined ||
      BOARD_TILES[offer.tileId]?.type !== 'PORT' || price <= offer.price) return null;
  const counter = { ...offer, id: nextTradeId(state), originalPrice: offer.price, price };
  return Number.isSafeInteger(counter.id) && isValidTradeOffer(state, counter) ? counter : null;
}

export function getTradeCounterAction(state: GameState, sellerId: string, offerId: number, price: number):
  Extract<GameAction, { type: 'COUNTER_TRADE' }> | null {
  const offer = state.tradeOffers?.find(candidate => candidate.id === offerId);
  const counter = makeCounterOffer(state, sellerId, offer, price);
  return counter ? { type: 'COUNTER_TRADE', offerId, price,
    ...(counter.offeredTileId !== undefined && { offeredTileId: counter.offeredTileId }) } : null;
}

export function expireTradeOffers(state: GameState, events: GameEvent[]): void {
  if (!state.tradeOffers?.length) return;
  state.tradeOffers = state.tradeOffers.filter(offer => {
    if (isValidTradeOffer(state, offer)) return true;
    events.push({ type: 'TRADE_CLOSED', offer, result: 'EXPIRED' });
    return false;
  });
}

export function dispatchTrade(
  state: GameState, action: TradeAction, actorId: string | undefined,
  checkMission: (state: GameState, events: GameEvent[], player: Player) => void
): EngineResult {
  const unchanged: EngineResult = { state, events: [] };
  if (!actorId || !state.gameStarted || state.winnerId !== null) return unchanged;
  const offers = state.tradeOffers ?? [];
  if (action.type === 'OFFER_TRADE' || action.type === 'OFFER_PORT_SWAP') {
    if (action.type === 'OFFER_TRADE' ? 'offeredTileId' in action : !Number.isSafeInteger(action.offeredTileId)) return unchanged;
    if (offers.some(offer => offer.buyerId === actorId)) return unchanged;
    const id = nextTradeId(state);
    const offer: TradeOffer = { id, buyerId: actorId, sellerId: action.sellerId, tileId: action.tileId, price: action.price,
      ...(action.type === 'OFFER_PORT_SWAP' && { offeredTileId: action.offeredTileId }) };
    if (!Number.isSafeInteger(id) || !isValidTradeOffer(state, offer)) return unchanged;
    return {
      state: { ...state, tradeOffers: [...offers, offer], tradeSequence: id },
      events: [{ type: 'TRADE_OFFERED', offer }],
    };
  }

  const offer = offers.find(candidate => candidate.id === action.offerId);
  if (!offer) return unchanged;
  // A client must acknowledge both deeds before committing to an exchange.
  if ((action.type === 'COUNTER_TRADE' || (action.type === 'RESPOND_TRADE' && action.accept)) &&
      action.offeredTileId !== offer.offeredTileId) return unchanged;
  if (action.type === 'COUNTER_TRADE') {
    const counter = makeCounterOffer(state, actorId, offer, action.price);
    if (!counter) return unchanged;
    return {
      state: { ...state, tradeSequence: counter.id, tradeOffers: offers.map(candidate => candidate.id === offer.id ? counter : candidate) },
      events: [{ type: 'TRADE_COUNTERED', offer: counter }],
    };
  }

  const isCounter = offer.originalPrice !== undefined;
  if (action.type === 'CANCEL_TRADE') {
    if (actorId !== offer.buyerId && !(isCounter && actorId === offer.sellerId)) return unchanged;
  } else if (actorId !== (isCounter ? offer.buyerId : offer.sellerId) ||
      typeof action.accept !== 'boolean' || (action.accept && !canSettleTrade(state))) {
    return unchanged;
  }

  const next: GameState = { ...state, tradeOffers: offers.filter(candidate => candidate.id !== offer.id) };
  if (action.type === 'CANCEL_TRADE') {
    // Earlier clients cancel from the buyer's outgoing list, including when a seller has countered.
    const result = isCounter && actorId === offer.buyerId ? 'DECLINED' : 'WITHDRAWN';
    return { state: next, events: [{ type: 'TRADE_CLOSED', offer, result }] };
  }
  if (!action.accept) return { state: next, events: [{ type: 'TRADE_CLOSED', offer, result: 'DECLINED' }] };
  if (!isValidTradeOffer(state, offer)) return { state: next, events: [{ type: 'TRADE_CLOSED', offer, result: 'EXPIRED' }] };

  // Either captain can receive a mission reward when acquiring a new deed.
  next.players = structuredClone(state.players);
  const buyer = next.players.find(player => player.id === offer.buyerId)!;
  const seller = next.players.find(player => player.id === offer.sellerId)!;
  buyer.balance -= offer.price;
  seller.balance += offer.price;
  next.properties = projectTradeProperties(state, offer);
  const events: GameEvent[] = [{ type: 'TRADE_CLOSED', offer, result: 'ACCEPTED' }];
  if (offer.price > 0) {
    const tileName = BOARD_TILES[offer.tileId].name;
    const exchange = offer.offeredTileId !== undefined;
    events.push(
      { type: 'BALANCE_CHANGED', playerId: buyer.id, delta: -offer.price, newBalance: buyer.balance,
        reason: exchange ? `Trả tiền bù để đổi lấy ${tileName}` : `Mua ${tileName} từ ${seller.name}` },
      { type: 'BALANCE_CHANGED', playerId: seller.id, delta: offer.price, newBalance: seller.balance,
        reason: exchange ? `Nhận tiền bù khi đổi ${tileName}` : `Bán ${tileName} cho ${buyer.name}` },
    );
  }
  checkMission(next, events, buyer);
  if (offer.offeredTileId !== undefined) checkMission(next, events, seller);
  return { state: next, events };
}
