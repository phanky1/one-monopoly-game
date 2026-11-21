import { BOARD_TILES, type GameEvent } from '@one-monopoly/shared';
import { Anchor } from 'lucide-react';
import { portGuide } from './ports/portGuide.js';
import './diversion-receipt.css';

export type DiversionEvent = Extract<GameEvent, { type: 'CARGO_DESTINATION_CHANGED' }>;

export function DiversionReceipt({ change, captain }: { change: DiversionEvent; captain: string }) {
  const from = portGuide[BOARD_TILES[change.previousDestinationTileId].code];
  const to = portGuide[BOARD_TILES[change.destinationTileId].code];
  const service = change.reeferDueRound !== undefined ? 'reefer' : change.kind;
  const cargo = { laden: 'Hàng xuất', empty: 'Vỏ rỗng', reefer: 'Hàng lạnh' }[service];
  const description = `${captain} đã sửa vận đơn ${change.bookingId} cho ${cargo.toLocaleLowerCase('vi')}. Cảng đích đổi từ ${from.name} (${from.code}) sang ${to.name} (${to.code}).`;

  return <div className="diversion-receipt" data-diversion-receipt={change.bookingId}
    data-from-port={from.code} data-to-port={to.code} data-cargo-service={service} title={description}>
    <span className="sr-only">{description}</span>
    <div className="diversion-slip" aria-hidden="true">
      <b className="diversion-stamp"><Anchor size={12} strokeWidth={2} />COD</b>
      <b className="diversion-label">Đã sửa <i>vận đơn</i></b>
      <span className="diversion-captain">{captain}</span>
      <span>{cargo}</span>
      <b className="diversion-port"><code>{from.code}</code><small>{from.name}</small></b>
      <span className="diversion-arrow">→</span>
      <b className="diversion-port"><code>{to.code}</code><small>{to.name}</small></b>
    </div>
  </div>;
}
