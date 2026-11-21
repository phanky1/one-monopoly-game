import { ChevronDown, Truck } from 'lucide-react';
import {
  getEarlyTruckCalls, getPortTruckSchedule,
  type GameAction, type GameState, type Player, type TruckOperation,
} from '@one-monopoly/shared';
import './early-truck-desk.css';

interface Props {
  state: GameState;
  player: Player;
  canAct: boolean;
  busy: boolean;
  submit: (action: GameAction) => void;
}

const names: Record<TruckOperation, string> = {
  export: 'Nhà máy đóng hàng xuất',
  import: 'Xe nhận hàng nhập',
};

export function EarlyTruckDesk({ state, player, canAct, busy, submit }: Props) {
  const schedule = getPortTruckSchedule(state, player.position);
  if (!schedule?.operations.length) return null;

  const available = state.logistics?.earlyTruckAvailable?.[player.id];
  const choices = canAct ? getEarlyTruckCalls(state, player.id) : [];
  const { before, operations, scheduledRound } = schedule;

  return <details className="early-truck-desk" data-port-trucks={player.position}>
    <summary data-truck-desk>
      <Truck aria-hidden="true" />
      <span className="early-truck-heading"><strong>Lịch xe vòng {scheduledRound}</strong>
        <small>{operations.map(entry => names[entry.operation]).join(' · ')}</small></span>
      {choices.length > 0 && <span className="early-truck-invite">Gọi sớm</span>}
      <ChevronDown className="early-truck-chevron" aria-hidden="true" />
    </summary>
    <div className="early-truck-body">
      {choices.length > 0 && <p>Bạn được gọi sớm một xe trong cả ván. Mọi tàu đều có thể sử dụng hàng hoặc chỗ nhận mà xe này bổ sung.</p>}
      {canAct && available === false && <p>Bạn đã dùng lượt gọi xe sớm của ván này.</p>}
      {operations.map(({ operation, consumed, available: ready, after }) => {
        const choice = choices.find(item => item.operation === operation);
        return <div key={operation} className="early-truck-entry" data-truck-operation={operation}
          data-truck-status={consumed ? 'called' : ready ? 'scheduled' : 'blocked'}>
          <strong>{names[operation]}</strong>
          {consumed ? <span role="status">Đã gọi sớm · Xe đã đến bến.</span>
            : ready ? <span>{operation === 'import'
              ? `Chỗ nhận hàng nhập ${before.demand} → ${after.demand}`
              : `Vỏ rỗng ${before.empties} → ${after.empties} · Hàng xuất ${before.supply} → ${after.supply}`}</span>
              : <span>{operation === 'import' ? 'Bến đã đủ xe nhận hàng nhập.'
                : before.empties === 0 ? 'Bến cần một vỏ rỗng để đóng hàng xuất.' : 'Bến đã đầy hàng xuất.'}</span>}
          {choice && <button type="button" data-truck-call={operation} disabled={busy} onClick={() => submit(choice.action)}>
            {operation === 'export' ? 'Gọi sớm xe chở hàng xuất' : 'Gọi sớm xe nhận hàng nhập'}
          </button>}
        </div>;
      })}
    </div>
  </details>;
}
