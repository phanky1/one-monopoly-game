import type { ReactNode } from 'react';
import {
  BOARD_TILES, getCargoDestinationEstimate, getImportTruckReservation, type CargoDestinationEstimate, type CargoKind, type GameState,
} from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import { EmptyYardImpact } from './EmptyYardImpact.js';
import './diversion-comparison.css';

interface Props {
  state: GameState;
  playerId: string;
  currentId: number;
  proposedId: number;
}

const number = new Intl.NumberFormat('vi-VN');
const money = (amount: number) => `$${number.format(amount)}M`;
const portName = (id: number) => portGuide[BOARD_TILES[id]?.code]?.name ?? BOARD_TILES[id]?.name ?? 'Chưa rõ cảng';
const unknown = <><span aria-hidden="true">—</span><span className="sr-only">Chưa thể ước tính</span></>;

function arrivalLabel(estimate: CargoDestinationEstimate | null) {
  if (!estimate) return unknown;
  if (estimate.arrival === 'unreachable' || estimate.arrivalRound === null) return 'Không kịp tới';
  const method = { here: 'Đang tại bến', sail: 'Chặng chính', feeder: 'Chặng gom', 'next-round': 'Lượt sau' }[estimate.arrival];
  return <>Vòng {estimate.arrivalRound}<small>{method}</small></>;
}

function receiverLabel(estimate: CargoDestinationEstimate | null, kind: CargoKind, throughRound?: number) {
  if (!estimate) return unknown;
  switch (estimate.receiver) {
    case 'appointment': return <>Xe đã giữ{throughRound !== undefined && <small>Đến hết vòng {throughRound}</small>}</>;
    case 'reserved': return 'Chỗ chủ hàng';
    case 'public': return kind === 'empty' ? `Cần ${estimate.publicSlots} vỏ` : `${estimate.publicSlots} xe chờ`;
    case 'conditional': return 'Chưa chốt';
    case 'unavailable': return 'Chưa thể giao';
  }
}

function RemainingLeg({ estimate, maxNm, proposed }: {
  estimate: CargoDestinationEstimate | null; maxNm: number; proposed?: boolean;
}) {
  if (!estimate) return unknown;
  const miles = estimate.legDistanceNm;
  const end = 6 + (maxNm ? miles / maxNm : 0) * 88;
  return <div className="diversion-leg">
    <svg viewBox="0 0 100 12" aria-hidden="true" focusable="false">
      <path className="diversion-ruler" d="M6 7H94M28 5v4m22-4v4m22-4v4m22-4v4" />
      <path key={estimate.tileId} className={proposed ? 'diversion-course diversion-course-new' : 'diversion-course'}
        d={`M6 7H${end}`} pathLength="1" />
      <circle cx="6" cy="7" r="2" fill="currentColor" />
      <path d={`M${end} 3.2 l3.8 3.8 -3.8 3.8 -3.8 -3.8 Z`} fill="currentColor" />
    </svg>
    <span>{number.format(miles)} hải lý</span>
  </div>;
}

export function DiversionComparison({ state, playerId, currentId, proposedId }: Props) {
  const player = state.players.find(person => person.id === playerId);
  if (!player?.cargo || currentId === proposedId) return null;
  const current = getCargoDestinationEstimate(state, playerId, currentId);
  const proposed = getCargoDestinationEstimate(state, playerId, proposedId);
  const appointment = getImportTruckReservation(state, playerId);
  const maxNm = Math.max(current?.legDistanceNm ?? 0, proposed?.legDistanceNm ?? 0);
  const conditional = current?.receiver === 'conditional' || proposed?.receiver === 'conditional';
  const difference = current?.total != null && proposed?.total != null ? proposed.total - current.total : null;

  function row(id: string, label: ReactNode, left: ReactNode, right: ReactNode, trend?: number) {
    return <tr key={id} data-diversion-row={id}>
      <th scope="row">{label}</th><td>{left}</td>
      <td data-change={trend ? (trend > 0 ? 'gain' : 'loss') : undefined}>{right}</td>
    </tr>;
  }
  function fareLine(field: 'baseFreight' | 'reeferBonus' | 'tenderBonus' | 'backhaulBonus', label: string) {
    const a = current?.[field], b = proposed?.[field];
    return row(field, label, a === undefined ? unknown : money(a), b === undefined ? unknown : money(b),
      a !== undefined && b !== undefined ? b - a : 0);
  }
  function yardImpact(estimate: CargoDestinationEstimate | null) {
    if (!estimate) return unknown;
    if (estimate.receiver === 'unavailable') return 'Chưa thể giao';
    const stock = state.logistics?.ports[estimate.tileId];
    return stock ? <EmptyYardImpact stock={stock} portId={estimate.tileId} /> : unknown;
  }

  return <section className="diversion-comparison" data-diversion-comparison aria-label="So sánh cảng dỡ">
    <table>
      <caption>So sánh cảng dỡ</caption>
      <thead><tr>
        <th scope="col"><span className="sr-only">Chỉ tiêu</span></th>
        <th scope="col" data-diversion-current={currentId}><span>Hiện tại</span>{portName(currentId)}</th>
        <th scope="col" data-diversion-proposed={proposedId}><span>Đề xuất</span>{portName(proposedId)}</th>
      </tr></thead>
      <tbody>
        {row('leg', `Từ ${portName(player.position)}`, <RemainingLeg estimate={current} maxNm={maxNm} />,
          <RemainingLeg estimate={proposed} maxNm={maxNm} proposed />)}
        {row('arrival', 'Đến sớm nhất', arrivalLabel(current), arrivalLabel(proposed))}
        {row('receiver', 'Chỗ nhận', receiverLabel(current, player.cargo.kind, appointment?.throughRound), receiverLabel(proposed, player.cargo.kind))}
        {player.cargo.kind === 'empty' && row('empty-yard', <>Nếu giao 1 vỏ <small className="empty-yard-caption">Theo tồn bãi hiện tại</small></>,
          yardImpact(current), yardImpact(proposed))}
        {row('distance', 'Cự ly tính cước',
          current ? `${number.format(current.freightDistanceNm)} hải lý` : unknown,
          proposed ? `${number.format(proposed.freightDistanceNm)} hải lý` : unknown)}
        {fareLine('baseFreight', 'Cước cơ bản')}
        {(player.cargo.reeferDueRound !== undefined || !!current?.reeferBonus || !!proposed?.reeferBonus) && fareLine('reeferBonus', 'Phụ phí lạnh')}
        {(!!current?.tenderBonus || !!proposed?.tenderBonus) && fareLine('tenderBonus', 'Hợp đồng')}
        {(!!current?.backhaulBonus || !!proposed?.backhaulBonus) && fareLine('backhaulBonus', 'Chiều về')}
        {row('total', 'Tổng dự kiến', current?.total != null ? money(current.total) : unknown,
          proposed?.total != null ? money(proposed.total) : unknown, difference ?? 0)}
      </tbody>
    </table>
    {difference !== null && <p className="diversion-delta" role="status" data-diversion-delta={difference}>
      Đổi cảng <strong>{difference === 0 ? 'giữ nguyên mức thu' :
        `${difference > 0 ? 'tăng' : 'giảm'} ${money(Math.abs(difference))}`}</strong> theo dự kiến.
    </p>}
    {conditional && <p className="diversion-condition">Mức thu ở vòng sau phụ thuộc vào chỗ nhận khi tàu đến.</p>}
    {appointment?.destinationTileId === currentId && <p className="diversion-condition" data-appointment-release>
      Đổi sang {portName(proposedId)} sẽ trả xe đã giữ tại {portName(currentId)} cho bến. Lượt giữ xe trong ván đã dùng.
    </p>}
  </section>;
}
