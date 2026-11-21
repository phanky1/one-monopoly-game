import { AUCTION_INCREMENT, BOARD_TILES, type GameState, type HarborFreightQuote, type Player } from '@one-monopoly/shared';
import { getPortArrivalFreight, projectPortOwnership } from './portInvestment.js';

export interface AuctionCashOutcome {
  buyerId: string | null;
  buyerName: string | null;
  price: number;
  cashOnAward: number;
  freightIfDischarged: number;
  cashAfterDischarge: number;
}

export interface HarborAuctionChoices {
  minimumBid: number;
  maximumBid: number;
  canBid: boolean;
  freightCarrierName: string | null;
  standing: AuctionCashOutcome;
  bid: AuctionCashOutcome | null;
}

function cashOutcome(viewer: Player, buyer: Player | null, price: number, quote?: HarborFreightQuote): AuctionCashOutcome {
  const cashOnAward = viewer.balance - (buyer?.id === viewer.id ? price : 0);
  let freightIfDischarged = 0;
  if (quote?.playerId === viewer.id) freightIfDischarged = quote.carrierNet;
  else if (quote?.operatorId === viewer.id) freightIfDischarged = quote.handlingFee;
  return {
    buyerId: buyer?.id ?? null, buyerName: buyer?.name ?? null, price,
    cashOnAward, freightIfDischarged, cashAfterDischarge: cashOnAward + freightIfDischarged,
  };
}

/** Compare this viewer's cash if the standing result holds or their proposed bid wins. */
export function getHarborAuctionChoices(state: GameState, viewerId: string | null, amount: number | null): HarborAuctionChoices | null {
  const auction = state.auction;
  if (state.mode !== 'harbor' || !state.gameStarted || state.winnerId !== null || state.phase !== 'AWAITING_AUCTION' || !auction) return null;
  const { tileId, highestBid, leaderId } = auction;
  const deed = state.properties[tileId];
  if (BOARD_TILES[tileId]?.type !== 'PORT' || !deed || deed.ownerId !== null || deed.isMortgaged) return null;
  const viewer = state.players.find(player => player.id === viewerId);
  if (!viewer || viewer.isBankrupt) return null;
  const leader = state.players.find(player => player.id === leaderId) ?? null;
  if (leaderId !== null && (!leader || leader.isBankrupt)) return null;

  const minimumBid = highestBid + AUCTION_INCREMENT;
  const maximumBid = Math.floor(viewer.balance / AUCTION_INCREMENT) * AUCTION_INCREMENT;
  const canBid = auction.bidderId === viewer.id && leaderId !== viewer.id &&
    !auction.passedIds.includes(viewer.id) && maximumBid >= minimumBid;
  const standingBoard = leader ? projectPortOwnership(state, tileId, leader.id) : state;
  const standingFreight = getPortArrivalFreight(standingBoard, tileId);
  const standing = cashOutcome(viewer, leader, leader ? highestBid : 0, standingFreight?.quote);
  let bid: AuctionCashOutcome | null = null;
  if (canBid && amount !== null && Number.isSafeInteger(amount) && amount >= minimumBid &&
      amount <= maximumBid && amount % AUCTION_INCREMENT === 0) {
    const freight = getPortArrivalFreight(projectPortOwnership(state, tileId, viewer.id), tileId);
    bid = cashOutcome(viewer, viewer, amount, freight?.quote);
  }
  return { minimumBid, maximumBid, canBid, freightCarrierName: standingFreight?.carrierName ?? null, standing, bid };
}
