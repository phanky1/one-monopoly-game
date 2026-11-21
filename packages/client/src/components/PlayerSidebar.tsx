import React, { useState } from 'react';
import { BOARD_TILES, isFinalLogisticsRound, LOGISTICS_DELIVERY_TARGET, type GameState } from '@one-monopoly/shared';
import { Anchor, BriefcaseBusiness, ChevronRight, Gavel, Timer } from 'lucide-react';
import { cabinReactions, type ReactionEvent } from '../hooks/useSocket.js';
import './fleet-reactions.css';
import { FleetPortfolio } from './FleetPortfolio.js';
import { portGuide } from './ports/portGuide.js';
import './freight-scoreboard.css';
import type { RentReceipt } from './useBoardPlayback.js';
import { TOKEN_CONFIG } from './TokenBadge.js';

interface Props {
  gameState: GameState;
  myPlayerId: string | null;
  turnTimer: { seconds: number; playerId: string } | null;
  reactions: ReactionEvent[];
  rentReceipts: Record<number, RentReceipt>;
  pendingRent: Record<number, RentReceipt>;
  onOfferForTile: (tileId: number) => void;
}

function harborName(tileId: number) {
  const tile = BOARD_TILES[tileId];
  return portGuide[tile.code]?.name ?? tile.name;
}

function playerRent(receipts: Record<number, RentReceipt>, playerId: string): number {
  let total = 0;
  for (const receipt of Object.values(receipts)) {
    for (const line of receipt.lines) {
      if (line.playerId === playerId) total += line.type === 'deduct' ? -line.amount : line.amount;
    }
  }
  return total;
}

export const PlayerSidebar: React.FC<Props> = ({ gameState, myPlayerId, turnTimer, onOfferForTile, rentReceipts, pendingRent, reactions }) => {
  const active = gameState.players[gameState.activePlayerIndex];
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const captain = gameState.players.find(player => player.id === portfolioId);
  const freight = gameState.mode === 'logistics' ? gameState.logistics : undefined;
  const finalRound = freight && isFinalLogisticsRound(gameState);
  const properties = Object.values(gameState.properties);
  const bidder = gameState.auction && gameState.players.find(player => player.id === gameState.auction?.bidderId);
  const acting = bidder ?? active;
  const isMyTurn = myPlayerId === acting.id;
  return (
    <section className="table-scoreboard" aria-label="Đội tàu">
      <div className="chart-turn">
        <div className="chart-turn-line">
          <span>{bidder ? <Gavel size={14} /> : <Anchor size={14} />}{bidder ? 'Lượt trả giá' : finalRound ? 'Vòng cuối' : 'Đang đến lượt'}</span>
          {turnTimer?.playerId === acting.id && (
            <time aria-label={`Còn ${turnTimer.seconds} giây`}><Timer size={14} />{turnTimer.seconds}s</time>
          )}
        </div>
        <h2>{isMyTurn ? 'Lượt của bạn' : acting.name}</h2>
      </div>
      <div className="chart-fleet">
        <div className="chart-fleet-title"><h2>Đội tàu</h2><span>{freight ? 'Chuyến giao · Tiền cước' : 'Số dư · Tài sản'}</span></div>
        <ul className="table-players">
          {gameState.players.map(player => {
            const token = TOKEN_CONFIG[player.token];
            const reaction = reactions.find(item => item.playerId === player.id);
            const captainLabel = (
              <span className="chart-player-name fleet-captain">
                <span className="fleet-captain-label">{player.name}{player.id === myPlayerId && <small>Bạn</small>}</span>
                {reaction && <span key={reaction.id} className="fleet-reaction-badge" data-player-id={player.id}
                  aria-hidden="true">{reaction.emoji}</span>}
              </span>
            );
            if (freight) {
              const delivered = freight.deliveries[player.id] ?? 0;
              const earnings = freight.earnings[player.id] ?? 0;
              const cargo = player.cargo;
              return (
                <li key={player.id} className="table-player freight-captain" aria-current={player.id === acting.id ? 'step' : undefined}>
                  <details>
                    <summary>
                      <span className="chart-token" style={{ borderColor: token.color }} aria-hidden="true">{token.emoji}</span>
                      {captainLabel}
                      <strong className="freight-progress"><span className="sr-only">Đã giao </span>{delivered}/{LOGISTICS_DELIVERY_TARGET}<span className="sr-only"> chuyến</span></strong>
                      <span className="freight-location"><Anchor size={12} aria-hidden="true" />{harborName(player.position)}</span>
                      <span className="freight-earnings"><span className="sr-only">Tiền cước </span>${earnings.toLocaleString('en-US')}M</span>
                      <ChevronRight className="freight-disclose" aria-hidden="true" />
                    </summary>
                    <div className="freight-manifest">
                      {cargo ? (
                        <>
                          <strong>{cargo.reeferDueRound !== undefined ? '❄ Container lạnh' : cargo.kind === 'laden' ? 'Container hàng' : 'Điều chuyển vỏ rỗng'}</strong>
                          <p>{harborName(cargo.originTileId)} <span aria-hidden="true">→</span><span className="sr-only">đến </span> {harborName(cargo.destinationTileId)}</p>
                          <small>Mã đặt chỗ {cargo.bookingId}</small>
                        </>
                      ) : <p>Chưa nhận chuyến hàng.</p>}
                    </div>
                  </details>
                </li>
              );
            }
            const count = properties.filter(property => property.ownerId === player.id).length;
            const delta = playerRent(rentReceipts, player.id);
            const balance = player.balance - playerRent(pendingRent, player.id);
            const rentClass = delta > 0 ? ' table-player-credit' : delta < 0 ? ' table-player-deduct' : '';
            return (
              <li key={player.id} className={`table-player${rentClass}`} aria-current={player.id === acting.id ? 'step' : undefined}>
                <button type="button" className="fleet-portfolio-open" onClick={() => setPortfolioId(player.id)}
                  aria-haspopup="dialog" aria-label={`Xem tài sản của ${player.name}, ${count} tài sản, ${player.isBankrupt ? 'phá sản' : `số dư $${balance}M`}`}>
                  <span className="chart-token" style={{ borderColor: token.color }} title={token.label} aria-hidden="true">{token.emoji}</span>
                  {captainLabel}
                  <span className="fleet-balance">
                    <strong className="chart-balance">{player.isBankrupt ? 'Phá sản' : `$${balance.toLocaleString('en-US')}M`}</strong>
                    {delta !== 0 && <span key={delta} className={`chart-delta-tag ${delta > 0 ? 'chart-delta-positive' : 'chart-delta-negative'}`}>
                      {delta > 0 ? '+' : '−'}${Math.abs(delta)}M
                    </span>}
                  </span>
                  <span className="fleet-asset-count" title={`${count} tài sản`}><BriefcaseBusiness aria-hidden="true" />{count}</span>
                  <ChevronRight className="fleet-open-arrow" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="sr-only" role="log" aria-label="Biểu cảm của đội tàu" aria-relevant="additions">
          {reactions.map(reaction => {
            const sender = gameState.players.find(player => player.id === reaction.playerId);
            return sender && <p key={reaction.id}>{sender.name} gửi {cabinReactions.get(reaction.emoji)}.</p>;
          })}
        </div>
      </div>
      {!freight && captain && <FleetPortfolio gameState={gameState} captain={captain} myPlayerId={myPlayerId}
        onClose={() => setPortfolioId(null)} onOfferForTile={onOfferForTile} />}
    </section>
  );
};
