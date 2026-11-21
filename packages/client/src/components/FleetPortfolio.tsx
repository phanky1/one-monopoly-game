import { useId } from 'react';
import { Handshake, X } from 'lucide-react';
import { BOARD_TILES, getTradeRestriction, INFRA_TILES, LOOP_GROUPS_CONFIG, OneMonopolyEngine, SERVICE_LINES } from '@one-monopoly/shared';
import type { GameState, Player } from '@one-monopoly/shared';
import { BoardDialog } from './BoardDialog.js';
import './fleet-portfolio.css';

const groups = [
  ...Object.values(LOOP_GROUPS_CONFIG),
  { name: 'Tuyến dịch vụ', color: '#346765', tileIds: SERVICE_LINES },
  { name: 'Hạ tầng số', color: '#6f7888', tileIds: INFRA_TILES },
];

interface Props {
  gameState: GameState;
  captain: Player;
  myPlayerId: string | null;
  onClose: () => void;
  onOfferForTile: (tileId: number) => void;
}

export function FleetPortfolio({ gameState, captain, myPlayerId, onClose, onOfferForTile }: Props) {
  const titleId = useId();
  const holdings = groups.map(group => ({
    ...group,
    owned: group.tileIds.filter(id => gameState.properties[id]?.ownerId === captain.id),
  })).filter(group => group.owned.length > 0);
  const count = holdings.reduce((total, group) => total + group.owned.length, 0);
  const hasOutgoingOffer = gameState.tradeOffers?.some(offer => offer.buyerId === myPlayerId);

  return (
    <BoardDialog labelledBy={titleId} onClose={onClose}>
      <div className="chart-dialog-sheet fleet-portfolio">
        <button type="button" className="chart-dialog-close" aria-label="Đóng danh mục tài sản" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        <header className="chart-manifest-heading">
          <p className="chart-dialog-kicker">Danh mục tài sản</p>
          <h2 className="chart-dialog-title" id={titleId}>{captain.name}</h2>
        </header>
        <dl className="fleet-portfolio-summary">
          <div><dt>Số dư</dt><dd>${captain.balance.toLocaleString('en-US')}M</dd></div>
          <div><dt>Tài sản</dt><dd>{count}</dd></div>
        </dl>
        {count === 0 && <p className="chart-dialog-copy">Chưa sở hữu cảng, tuyến dịch vụ hoặc hạ tầng.</p>}
        {holdings.map(group => (
          <section key={group.name} className="fleet-portfolio-group">
            <div className="fleet-group-heading">
              <h3><i aria-hidden="true" style={{ backgroundColor: group.color }} />{group.name}</h3>
              <span aria-label={`Sở hữu ${group.owned.length} trên ${group.tileIds.length}`}>
                {group.owned.length === group.tileIds.length && BOARD_TILES[group.owned[0]].type === 'PORT' ? 'Trọn tuyến · ' : ''}
                {group.owned.length}/{group.tileIds.length}
              </span>
            </div>
            <ul>
              {group.owned.map(id => {
                const tile = BOARD_TILES[id];
                const mortgaged = gameState.properties[id].isMortgaged;
                const rent = OneMonopolyEngine.calculateRent(gameState, id, gameState.dice);
                const [d1, d2] = gameState.dice;
                const awaitingDice = tile.type === 'INFRA' && !mortgaged && !gameState.hasRolled;
                return (
                  <li key={id} className="fleet-property" data-tile-id={id}>
                    <span>{tile.name}{mortgaged && <small>Đã thế chấp</small>}</span>
                    <span className="fleet-rent">
                      <span>Cước </span>
                      {awaitingDice ? `${rent / (d1 + d2)} × tổng xúc xắc` : `$${rent}M`}
                    </span>
                    {myPlayerId && !hasOutgoingOffer && !getTradeRestriction(gameState, myPlayerId, id) && (
                      <button type="button" className="fleet-offer-button" aria-haspopup="dialog"
                        aria-label={`Đề nghị mua ${tile.name}`} onClick={() => {
                          onClose();
                          onOfferForTile(id);
                        }}>
                        <Handshake size={15} aria-hidden="true" /> Đề nghị mua
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </BoardDialog>
  );
}
