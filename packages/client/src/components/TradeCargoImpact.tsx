import { getHarborFreightOpportunity, getHarborFreightQuote, OneMonopolyEngine, type GameState } from '@one-monopoly/shared';
import { projectPortOwnership } from './portInvestment.js';
import './trade-cargo-impact.css';

interface Props { state: GameState; tileId: number; buyerId: string; sellerId: string }
const money = (amount: number) => `$${amount.toLocaleString('vi-VN')}M`;

export function TradeCargoImpact({ state, tileId, buyerId, sellerId }: Props) {
  const carrier = state.players[state.activePlayerIndex];
  if (state.mode !== 'harbor' || carrier?.position !== tileId || state.properties[tileId]?.ownerId !== sellerId) return null;
  const offer = getHarborFreightOpportunity(state, carrier.id);
  if (offer?.kind !== 'discharge') return null;
  const before = offer.quote;
  const sold = projectPortOwnership(state, tileId, buyerId);
  const after = getHarborFreightQuote(sold, carrier.id, before.originTileId, tileId);
  if (!after) return null;
  const seller = state.players.find(player => player.id === sellerId);
  const buyer = state.players.find(player => player.id === buyerId);
  if (!buyer || !seller) return null;

  return <aside className="trade-cargo-impact" data-trade-cargo-impact={tileId}>
    <table>
      <caption>Tàu {carrier.name} đang chở hàng tại bến</caption>
      <thead><tr><td /><th scope="col">Chủ hiện tại<span>{seller.name}</span></th><th scope="col">Chủ sau khi bán<span>{buyer.name}</span></th></tr></thead>
      <tbody>
        <tr><th scope="row">Cước tàu nhận nếu dỡ</th><td>{money(before.carrierNet)}</td><td>{money(after.carrierNet)}</td></tr>
        <tr><th scope="row">Phí chủ cảng nhận nếu dỡ</th><td>{money(before.handlingFee)}</td><td>{money(after.handlingFee)}</td></tr>
        <tr><th scope="row">Tiền thuê khi đối thủ ghé sau</th><td>{money(OneMonopolyEngine.calculateRent(state, tileId, state.dice))}</td>
          <td>{money(OneMonopolyEngine.calculateRent(sold, tileId, state.dice))}</td></tr>
      </tbody>
    </table>
  </aside>;
}
