import { BOARD_TILES, getHarborFreightOpportunity, getHarborFreightQuote, OneMonopolyEngine, type GameState } from '@one-monopoly/shared';
import { projectPortTrade } from './portInvestment.js';
import './trade-cargo-impact.css';

interface Props { state: GameState; tileId: number; buyerId: string; sellerId: string; offeredTileId?: number }
const money = (amount: number) => `$${amount.toLocaleString('vi-VN')}M`;

export function TradeCargoImpact({ state, tileId, buyerId, sellerId, offeredTileId }: Props) {
  const carrier = state.players[state.activePlayerIndex];
  const berth = carrier?.position;
  if (state.mode !== 'harbor' || berth === undefined || state.properties[tileId]?.ownerId !== sellerId ||
      (offeredTileId !== undefined && state.properties[offeredTileId]?.ownerId !== buyerId)) return null;
  const offer = getHarborFreightOpportunity(state, carrier.id);
  if (offer?.kind !== 'discharge') return null;
  const before = offer.quote;
  const sold = projectPortTrade(state, tileId, buyerId, sellerId, offeredTileId);
  const after = getHarborFreightQuote(sold, carrier.id, before.originTileId, berth);
  if (!after) return null;
  const oldOwner = state.players.find(player => player.id === state.properties[berth]?.ownerId);
  const newOwner = state.players.find(player => player.id === sold.properties[berth]?.ownerId);
  if (!oldOwner || !newOwner) return null;
  const rentBefore = OneMonopolyEngine.calculateRent(state, berth, state.dice);
  const rentAfter = OneMonopolyEngine.calculateRent(sold, berth, state.dice);
  if (oldOwner.id === newOwner.id && before.handlingFee === after.handlingFee && rentBefore === rentAfter) return null;
  return <aside className="trade-cargo-impact" data-trade-cargo-impact={berth}>
    <table>
      <caption>Tàu {carrier.name} đang chở hàng tại {BOARD_TILES[berth].name}</caption>
      <thead><tr><td /><th scope="col">Chủ hiện tại<span>{oldOwner.name}</span></th><th scope="col">Chủ sau giao dịch<span>{newOwner.name}</span></th></tr></thead>
      <tbody>
        <tr><th scope="row">Cước tàu nhận nếu dỡ</th><td>{money(before.carrierNet)}</td><td>{money(after.carrierNet)}</td></tr>
        <tr><th scope="row">Phí chủ cảng nhận nếu dỡ</th><td>{money(before.handlingFee)}</td><td>{money(after.handlingFee)}</td></tr>
        <tr><th scope="row">Tiền thuê khi đối thủ ghé sau</th><td>{money(rentBefore)}</td>
          <td>{money(rentAfter)}</td></tr>
      </tbody>
    </table>
  </aside>;
}
