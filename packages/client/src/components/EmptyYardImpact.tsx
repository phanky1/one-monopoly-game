import { getEmptyNeed, getPortStockAfterDischarge, type PortStock } from '@one-monopoly/shared';
import './empty-yard-impact.css';

export function EmptyYardImpact({ stock, portId }: { stock: PortStock; portId: number }) {
  const after = getPortStockAfterDischarge(stock, 'empty');
  const shortfall = getEmptyNeed(after);
  const surplus = after.empties - after.emptyTarget;
  const balance = shortfall ? `Còn thiếu ${shortfall} vỏ` : surplus > 0 ? `Dư ${surplus} vỏ` : 'Đủ vỏ dự trữ';
  return <span className="empty-yard-impact" data-empty-impact="" data-port-id={portId}>
    <span className="empty-yard-quantity">
      <strong><span className="sr-only">Trước </span>{stock.empties}<span aria-hidden="true"> → </span>
        <span className="sr-only">, sau </span>{after.empties}</strong> vỏ
    </span>
    <span>Mục tiêu {stock.emptyTarget}</span>
    <span className="empty-yard-balance">{balance}{after.empties === stock.empties && ' · bãi đầy'}</span>
  </span>;
}
