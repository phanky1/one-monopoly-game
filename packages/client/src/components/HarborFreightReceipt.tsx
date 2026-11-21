import { useId } from 'react';
import { ArrowRight, ReceiptText } from 'lucide-react';
import { BOARD_TILES, LOOP_GROUPS_CONFIG, type GameState, type HarborFreightReceipt as FreightRecord } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './harbor-freight-receipt.css';

const number = new Intl.NumberFormat('vi-VN');
const money = (amount: number) => `$${number.format(amount)}M`;

export function HarborFreightReceipt({ state, receipt }: { state: GameState; receipt: FreightRecord | null }) {
  const title = useId();
  if (!receipt || state.mode !== 'harbor') return null;
  const originTile = BOARD_TILES[receipt.originTileId], destinationTile = BOARD_TILES[receipt.tileId];
  const origin = portGuide[originTile.code]?.name ?? originTile.name;
  const destination = portGuide[destinationTile.code]?.name ?? destinationTile.name;
  const carrier = state.players.find(player => player.id === receipt.playerId)?.name ?? 'Hãng vận chuyển';
  const group = receipt.feePercent === 50 && destinationTile.group ? LOOP_GROUPS_CONFIG[destinationTile.group] : null;
  return <section className="harbor-freight-receipt" data-harbor-receipt={receipt.revision} aria-labelledby={title}>
    <header>
      <h4 id={title}><ReceiptText size={15} aria-hidden="true" />Biên lai dỡ hàng</h4>
      <small>Vòng {receipt.round}</small>
    </header>
    <p className="harbor-receipt-route" data-harbor-receipt-route>
      <b>{origin}</b><ArrowRight size={14} aria-hidden="true" /><span className="sr-only">đến</span><b>{destination}</b>
      <small>{number.format(receipt.distanceNm)} hải lý</small>
    </p>
    <dl>
      <div><dt>Cước vận chuyển</dt><dd data-harbor-receipt-gross={receipt.gross}>{money(receipt.gross)}</dd></div>
      <div className="harbor-receipt-fee">
        <dt>Phí khai thác bến{receipt.feePercent > 0 && ` (${receipt.feePercent}%)`}
          {receipt.operatorName && <small>Đã chuyển cho <b>{receipt.operatorName}</b></small>}
          {group && <small className="harbor-receipt-group" data-harbor-receipt-group>
            <i aria-hidden="true" style={{ backgroundColor: group.color }} />Sở hữu trọn tuyến {group.name}
          </small>}
        </dt>
        <dd data-harbor-receipt-fee={receipt.handlingFee}>{receipt.handlingFee > 0 && '−'}{money(receipt.handlingFee)}</dd>
      </div>
      <div className="harbor-receipt-net"><dt>{carrier} thực nhận</dt>
        <dd data-harbor-receipt-net={receipt.carrierNet}>+{money(receipt.carrierNet)}</dd></div>
    </dl>
    {receipt.handlingFee > 0 && <p className="harbor-receipt-rent-note">Tiền thuê khi tàu cập bến được tính riêng.</p>}
  </section>;
}
