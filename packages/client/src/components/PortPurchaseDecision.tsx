import { useRef, useState } from 'react';
import { Check, Container, Gavel } from 'lucide-react';
import { BOARD_TILES, getHarborPurchase, type GameAction, type GameState } from '@one-monopoly/shared';
import { PortInvestmentPreview } from './PortInvestmentPreview.js';
import { portGuide } from './ports/portGuide.js';

interface Props {
  state: GameState;
  buyerId: string;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  onPurchaseAccepted: (revision: number, source: HTMLButtonElement) => void;
}

const money = (amount: number) => `$${amount.toLocaleString('vi-VN')}M`;

export function PortPurchaseDecision({ state, buyerId, onAction, onPurchaseAccepted }: Props) {
  const buyer = state.players[state.activePlayerIndex];
  const tile = BOARD_TILES[buyer.position];
  const price = tile.price ?? 0;
  const purchase = state.supportsHarborPurchase === true ? getHarborPurchase(state, buyerId) : null;
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  function submit(action: GameAction, keyboardSource?: HTMLButtonElement) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    onAction(action, () => {
      inFlight.current = false;
      setPending(false);
      setFailed(true);
    }, () => {
      if (action.type === 'HARBOR_BUY_AND_DISCHARGE' && keyboardSource) {
        onPurchaseAccepted(action.revision, keyboardSource);
      }
      inFlight.current = false;
      setPending(false);
    });
  }

  return <section className="chart-action-panel" data-harbor-purchase-terms={purchase ? true : undefined}>
    <div className="chart-action-offer">
      <div>
        <p className="chart-action-copy">CƠ HỘI ĐẦU TƯ</p>
        <h3 className="chart-action-title">{tile.name} ({tile.code})</h3>
      </div>
      <div className="chart-action-price" data-harbor-purchase-price={purchase?.purchasePrice}>{money(price)}</div>
    </div>
    {!purchase && <p className="chart-action-copy">Nếu bạn không mua, tài sản sẽ được đưa ra đấu giá.</p>}
    <PortInvestmentPreview state={state} tileId={tile.id} buyerId={buyerId} scenario="purchase" />
    {purchase && <div className="port-purchase-freight">
      <h4><Container size={15} aria-hidden="true" />Dùng cước hàng từ {portGuide[BOARD_TILES[purchase.quote.originTileId].code].name}</h4>
      <dl>
        <div><dt>Cước dỡ 1 container</dt><dd data-harbor-purchase-credit={purchase.quote.carrierNet}>+{money(purchase.quote.carrierNet)}</dd></div>
        <div><dt>Tiền mặt cần trả</dt><dd data-harbor-purchase-cash={Math.max(0, -purchase.cashChange)}>{money(Math.max(0, -purchase.cashChange))}</dd></div>
        {purchase.shortfall === 0 && <div><dt>Số dư sau mua, trước thưởng nhiệm vụ</dt><dd data-harbor-purchase-wallet={buyer.balance + purchase.cashChange}>{money(buyer.balance + purchase.cashChange)}</dd></div>}
      </dl>
      {purchase.shortfall > 0 && <p className="chart-action-copy">Còn thiếu {money(purchase.shortfall)} sau khi tính cước.</p>}
      <button type="button" className="chart-button chart-button-navy" data-harbor-buy-and-discharge
        disabled={pending || purchase.shortfall > 0}
        onClick={event => submit(purchase.action, event.detail === 0 ? event.currentTarget : undefined)}>
        Mua cảng và dỡ hàng
      </button>
    </div>}
    {purchase && <p className="chart-action-copy">{buyer.balance < price
      ? `Mua bằng tiền mặt còn thiếu ${money(price - buyer.balance)}. Bạn có thể giữ hàng trên tàu và mở đấu giá.`
      : 'Để giữ hàng trên tàu, mua ngay bằng tiền mặt hoặc mở đấu giá.'}</p>}
    <div className="chart-action-row">
      <button type="button" onClick={() => submit({ type: 'BUY_PROPERTY' })} disabled={pending || buyer.balance < price}
        className="chart-button chart-button-primary"><Check size={18} aria-hidden="true" /> Mua ngay</button>
      <button type="button" onClick={() => submit({ type: 'SKIP_BUY' })} disabled={pending}
        className="chart-button"><Gavel size={18} aria-hidden="true" /> Mở đấu giá</button>
    </div>
    {failed && <p className="chart-action-copy" role="alert">Lựa chọn chưa được xác nhận. Kiểm tra lại giá và số dư trước khi thử lại.</p>}
  </section>;
}
