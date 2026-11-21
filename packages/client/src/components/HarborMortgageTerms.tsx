import { Landmark } from 'lucide-react';
import {
  BOARD_TILES, getHarborFreightOpportunity, getHarborRedemption, getHarborTerminalShare,
  getRedemptionCost, OneMonopolyEngine, type GameState,
} from '@one-monopoly/shared';

interface Props { state: GameState; tileId: number; ownerId: string; onClose: () => void }

export function HarborMortgageTerms({ state, tileId, ownerId, onClose }: Props) {
  const property = state.properties[tileId];
  const tile = BOARD_TILES[tileId];
  if (state.mode !== 'harbor' || tile.type !== 'PORT' || !property || property.containerLevel > 0) return null;
  const cost = getRedemptionCost(tile);
  const closed = property.isMortgaged;
  const operating = closed ? { ...state, properties: { ...state.properties, [tileId]: { ...property, isMortgaged: false } } } : state;
  const rent = OneMonopolyEngine.calculateRent(operating, tileId, state.dice);
  const share = getHarborTerminalShare(operating, tileId);
  const cargo = getHarborFreightOpportunity(operating, ownerId);
  const freight = cargo?.kind === 'discharge' && cargo.quote.tileId === tileId ? cargo.quote.carrierNet : null;
  const redemption = closed && freight !== null ? getHarborRedemption(state, ownerId) : null;

  function goToFreight() {
    onClose();
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[data-harbor-redeem]:enabled')
        ?? document.querySelector<HTMLElement>('[data-harbor-redemption-quote]');
      target?.focus();
    });
  }

  return <aside className="chart-manifest-note harbor-mortgage-terms" data-harbor-mortgage-terms={closed ? 'closed' : 'open'}>
    <Landmark aria-hidden="true" /><div>
      <strong>{closed ? 'Khi mở lại bến' : 'Nếu thế chấp bến'}</strong>
      {closed
        ? <p>Bến sẽ thu ${rent}M tiền thuê khi đối thủ ghé và {share}% cước khi họ dỡ hàng.</p>
        : <p>Bến sẽ dừng xếp dỡ. Bạn sẽ ngừng thu ${rent}M tiền thuê và {share}% cước khi đối thủ dỡ hàng. Chuộc lại tốn ${cost}M, đã gồm lãi.</p>}
      {freight !== null && <p>Lô hàng trên tàu có ${freight}M cước. Nếu dùng cước để chuộc bến, bạn cần thêm ${Math.max(0, cost - freight)}M tiền mặt.</p>}
      {redemption && <button type="button" className="chart-button" onClick={goToFreight}>Xem phương án chuộc bằng cước</button>}
    </div>
  </aside>;
}
