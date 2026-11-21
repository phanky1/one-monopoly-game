import { useId, useRef, useState } from 'react';
import { Gavel } from 'lucide-react';
import { AUCTION_BID_SECONDS, AUCTION_INCREMENT, BOARD_TILES, type GameAction, type GameState, type PropertyAuction } from '@one-monopoly/shared';
import { PortInvestmentPreview } from './PortInvestmentPreview.js';
import { HarborAuctionWallet } from './HarborAuctionWallet.js';
import { getHarborAuctionChoices } from './harborAuctionChoices.js';
import './property-auction.css';

interface Props {
  auction: PropertyAuction;
  gameState: GameState;
  myPlayerId: string | null;
  onAction: (action: GameAction, onFailure?: () => void) => void;
}

export function PropertyAuctionPanel({ auction, gameState, myPlayerId, onAction }: Props) {
  const titleId = useId();
  const amountId = useId();
  const hintId = useId();
  const tile = BOARD_TILES[auction.tileId];
  const players = gameState.players;
  const bidder = players.find((player) => player.id === auction.bidderId);
  const leader = players.find((player) => player.id === auction.leaderId);
  const canAct = bidder?.id === myPlayerId && !bidder.isBankrupt && !auction.passedIds.includes(bidder.id);
  const nextBid = auction.highestBid + AUCTION_INCREMENT;
  const viewer = players.find(player => player.id === myPlayerId);
  const canWin = viewer && !viewer.isBankrupt && !auction.passedIds.includes(viewer.id)
    && (viewer.id === auction.leaderId || viewer.balance >= nextBid);
  const balance = bidder?.balance ?? 0;
  const [amount, setAmount] = useState(String(nextBid));
  const [pending, setPending] = useState(false);
  const submitted = useRef(false);
  const validBid = (value: number) => Number.isSafeInteger(value)
    && value >= nextBid && value <= balance && value % AUCTION_INCREMENT === 0;
  const customBid = Number(amount);
  const choices = getHarborAuctionChoices(gameState, myPlayerId, amount === '' ? null : customBid);
  const draftInvalid = !!choices?.canBid && !choices.bid;

  function submit(bid?: number) {
    if (!canAct || submitted.current || (bid !== undefined && !validBid(bid))) return;
    submitted.current = true;
    setPending(true);
    const offer = { auctionId: auction.id, revision: auction.revision };
    onAction(bid === undefined ? { type: 'AUCTION_PASS', ...offer } : { type: 'AUCTION_BID', ...offer, amount: bid }, () => {
      submitted.current = false;
      setPending(false);
    });
  }

  return (
    <section className="chart-action-panel chart-auction-panel" aria-labelledby={titleId}>
      <header className="chart-auction-header">
        <div className="chart-auction-label"><Gavel size={16} aria-hidden="true" /> Đấu giá</div>
        <h3 id={titleId}>{tile.name}</h3>
        <p>Giá niêm yết <strong>${tile.price}M</strong></p>
      </header>
      <div className="chart-auction-state" role="status">
        {leader ? (
          <p><strong>${auction.highestBid}M</strong> <span>· {leader.name} dẫn đầu</span></p>
        ) : <p>Chưa có người trả giá.</p>}
        <p>{canAct ? 'Đến lượt bạn trả giá.' : <>Đến lượt <b>{bidder?.name}</b> trả giá.</>}</p>
      </div>
      {canAct && choices && <form className="chart-auction-bid" onSubmit={event => {
        event.preventDefault();
        if (choices.bid) submit(choices.bid.price);
      }}>
        {choices.canBid && <>
          <label htmlFor={amountId}>Giá trả của bạn <small>(triệu USD)</small></label>
          <div className="chart-auction-bid-line">
            <input id={amountId} data-auction-cash-input type="number" inputMode="numeric" required
              min={choices.minimumBid} max={choices.maximumBid} step={AUCTION_INCREMENT} value={amount}
              onChange={event => setAmount(event.target.value)} aria-invalid={draftInvalid} aria-describedby={hintId} disabled={pending} />
            <button type="submit" data-auction-cash-submit className="chart-button chart-button-primary"
              disabled={pending || draftInvalid}>{choices.bid ? `Trả $${choices.bid.price}M` : 'Gửi giá'}</button>
            <button type="button" className="chart-button" disabled={pending} onClick={() => submit()}>Rút khỏi phiên</button>
          </div>
          <p id={hintId} data-auction-cash-error={draftInvalid || undefined}>
            {draftInvalid ? `Nhập từ $${choices.minimumBid}M đến $${choices.maximumBid}M theo bước $${AUCTION_INCREMENT}M.`
              : `Tối thiểu $${choices.minimumBid}M · Tiền mặt $${balance}M`}
          </p>
        </>}
        {!choices.canBid && <button type="button" className="chart-button" disabled={pending}
          onClick={() => submit()}>Rút khỏi phiên</button>}
      </form>}
      {canAct && !choices && (
        <>
          <div className="chart-action-row">
            <button type="button" className="chart-button chart-button-primary" disabled={pending || !validBid(nextBid)}
              onClick={() => submit(nextBid)}>Trả ${nextBid}M</button>
            <button type="button" className="chart-button" disabled={pending}
              onClick={() => submit()}>Rút khỏi phiên</button>
          </div>
          {balance >= nextBid ? (
            <details className="chart-auction-custom">
              <summary>Nhập giá khác</summary>
              <form onSubmit={(event) => { event.preventDefault(); submit(customBid); }}>
                <label htmlFor={amountId}>Giá của bạn (triệu USD)</label>
                <div className="chart-auction-entry">
                  <input id={amountId} type="number" inputMode="numeric" required min={nextBid} max={balance}
                    step={AUCTION_INCREMENT} value={amount} onChange={(event) => setAmount(event.target.value)}
                    aria-describedby={hintId} disabled={pending} />
                  <button type="submit" className="chart-button chart-button-navy" disabled={pending || !validBid(customBid)}>Gửi giá</button>
                </div>
                <small id={hintId}>Giá tối thiểu ${nextBid}M · Số dư ${balance}M</small>
              </form>
            </details>
          ) : <p className="chart-action-copy">Số dư ${balance}M chưa đủ để trả ${nextBid}M.</p>}
        </>
      )}
      {choices && <HarborAuctionWallet choices={choices} viewerId={myPlayerId} />}
      {canWin && (
        <PortInvestmentPreview state={gameState} tileId={tile.id} buyerId={myPlayerId} scenario="auction" />
      )}
      <p className="chart-auction-rules">Bước giá ${AUCTION_INCREMENT}M. Hết {AUCTION_BID_SECONDS} giây, người đến lượt tự động rút khỏi phiên.</p>
    </section>
  );
}
