import { BOARD_TILES, LOOP_GROUPS_CONFIG, type GameState, type TradeOffer } from '@one-monopoly/shared';
import { PortMiniature } from './ports/PortMiniature.js';
import { portGuide } from './ports/portGuide.js';
import './port-swap-receipt.css';

export function PortSwapReceipt({ offer, state, animate }: { offer: TradeOffer; state: GameState; animate: boolean }) {
  if (offer.offeredTileId === undefined) return null;
  const buyer = state.players.find(player => player.id === offer.buyerId);
  const seller = state.players.find(player => player.id === offer.sellerId);
  if (!buyer || !seller) return null;
  const deeds = [
    { tile: BOARD_TILES[offer.tileId], captain: buyer },
    { tile: BOARD_TILES[offer.offeredTileId], captain: seller },
  ];
  return <section className="port-swap-receipt" aria-label="Biên nhận đổi cảng" data-port-swap-receipt={offer.id}
    data-animate={animate || undefined}>
    <h3><span aria-hidden="true">🤝</span> Đã đổi cảng</h3>
    <div className="port-swap-deeds">
      {deeds.map(({ tile, captain }) => (
        <div key={tile.id} className="port-swap-party">
          <p>{captain.name} nhận</p>
          <div className="port-swap-deed" style={{ borderTopColor: LOOP_GROUPS_CONFIG[tile.group!].color }}>
            <PortMiniature code={tile.code} variant="tile" is3D />
            <span><strong>{portGuide[tile.code].name}</strong><small>{tile.code}</small></span>
          </div>
        </div>
      ))}
    </div>
    <p className="port-swap-paid">{offer.price
      ? <>{buyer.name} trả {seller.name} <strong>${offer.price.toLocaleString('vi-VN')}M</strong> tiền bù.</>
      : 'Hai bên đổi ngang, không bù tiền.'}</p>
  </section>;
}
