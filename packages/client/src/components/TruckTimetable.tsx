import { useState } from 'react';
import { ArrowUpRight, Container, Truck } from 'lucide-react';
import { getPortTruckSchedule, type GameState, type PortTruckSchedule, type TruckOperation } from '@one-monopoly/shared';
import { freightMarketRows } from './freightMarketRows.js';
import './truck-timetable.css';

const operationNames = { export: 'Đóng hàng xuất', import: 'Xe nhận hàng nhập' };
const number = new Intl.NumberFormat('vi-VN');

export function ScheduledOperations({ schedule }: { schedule: PortTruckSchedule }) {
  return <ul className="scheduled-operations">
    {!!schedule.returningImportTrucks && <li data-released-appointments={schedule.returningImportTrucks}>
      <Truck size={15} aria-hidden="true" /><span>{schedule.returningImportTrucks} xe hết hạn giữ chỗ
        <small>Trở lại hàng xe công cộng nếu chưa giao hàng</small></span>
    </li>}
    {schedule.operations.map(entry => {
      const exporting = entry.operation === 'export';
      const status = entry.consumed ? 'Đã gọi sớm' : entry.available ? undefined
        : exporting ? (schedule.before.empties ? 'Bãi hàng xuất đầy' : 'Chờ vỏ rỗng') : 'Đã đủ xe chờ';
      const Icon = exporting ? Container : Truck;
      return <li key={entry.operation} data-scheduled-operation={entry.operation} data-consumed={entry.consumed || undefined}>
        <Icon size={15} aria-hidden="true" />
        <span>{operationNames[entry.operation]}{status && <small>{status}</small>}</span>
      </li>;
    })}
  </ul>;
}

function StockChange({ before, after }: { before: number; after: number }) {
  return before === after ? <span>{after}</span> : <span className="truck-stock-change">
    <span>{before}</span><span aria-label="thành">→</span><strong>{after}</strong>
  </span>;
}

interface TimetableProps {
  state: GameState;
  viewerId: string | null;
  inspect: (tileId: number) => void;
}

export function TruckTimetable({ state, viewerId, inspect }: TimetableProps) {
  const [filter, setFilter] = useState<TruckOperation | 'all'>('all');
  const round = state.turnCount + 1;
  const scheduled = freightMarketRows(state, viewerId, 'all', 'distance').flatMap(port => {
    const schedule = getPortTruckSchedule(state, port.tileId);
    return schedule && (schedule.operations.some(entry => filter === 'all' || entry.operation === filter) ||
      (filter !== 'export' && !!schedule.returningImportTrucks))
      ? [{ port, schedule }] : [];
  });
  return <>
    <div className="market-board-toolbar">
      <div className="market-board-filters" role="group" aria-label="Lọc lịch xe">
        {(['all', 'export', 'import'] as const).map(type => <button type="button" key={type}
          data-truck-schedule-filter={type} aria-pressed={filter === type} onClick={() => setFilter(type)}>
          {type === 'all' ? 'Tất cả' : operationNames[type]}
        </button>)}
      </div>
      <span className="truck-schedule-count" role="status">{scheduled.length} cảng · gần tàu trước</span>
    </div>
    <p className="truck-schedule-note">Mỗi thuyền trưởng được gọi sớm một chuyến xe tại bến đang neo trong cả ván.
      Số liệu cho biết tồn bến hiện tại và dự kiến đầu vòng {round}, nếu chưa ai xếp hay dỡ thêm hàng.</p>
    {scheduled.length ? <div className="truck-timetable-scroll" role="region" aria-label={`Lịch xe vòng ${round}`} tabIndex={0}>
      <table className="truck-timetable">
        <thead><tr><th scope="col">Cảng</th><th scope="col">Lịch xe</th><th scope="col">Hàng xuất</th>
          <th scope="col">Xe nhận</th><th scope="col">Vỏ tại bãi</th></tr></thead>
        <tbody>{scheduled.map(({ port, schedule }) => <tr key={port.tileId} data-truck-schedule-port={port.tileId}>
          <th scope="row"><button type="button" className="truck-timetable-port" onClick={() => inspect(port.tileId)}
            aria-label={`Xem cảng ${port.name}`}>
            <strong>{port.name}<ArrowUpRight size={13} aria-hidden="true" /></strong>
            <small>{port.code} · {port.current ? 'Đang neo' : port.distanceNm === null ? '—' : `${number.format(port.distanceNm)} hải lý`}</small>
          </button></th>
          <td><ScheduledOperations schedule={schedule} /></td>
          {(['supply', 'demand', 'empties'] as const).map(key => <td key={key} data-truck-stock={key}>
            <StockChange before={schedule.before[key]} after={schedule.projected[key]} />
          </td>)}
        </tr>)}</tbody>
      </table>
    </div> : <p className="market-board-empty">Chưa có xe theo bộ lọc này ở vòng {round}.</p>}
  </>;
}
