import { Repeat2 } from 'lucide-react';
import {
  BOARD_TILES, getCargoDestinationEstimate, getImportTruckReservation, getPortStockAfterDischarge, getStreetTurnAction,
  type GameState,
} from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './street-turn-option.css';

interface Props {
  state: GameState;
  playerId: string;
  busy: boolean;
  onChoose: (action: NonNullable<ReturnType<typeof getStreetTurnAction>>) => void;
  placement: 'desk' | 'quay';
}

export function StreetTurnOption({ state, playerId, busy, onChoose, placement }: Props) {
  const action = getStreetTurnAction(state, playerId);
  if (!action) return null;
  const total = getCargoDestinationEstimate(state, playerId, action.tileId)?.total;
  const stock = state.logistics?.ports[action.tileId];
  if (total == null || !stock) return null;

  const heldTruck = !!getImportTruckReservation(state, playerId);
  const direct = getPortStockAfterDischarge(stock, 'laden', heldTruck, true);
  const ordinary = getPortStockAfterDischarge(stock, 'laden', heldTruck);
  const tile = BOARD_TILES[action.tileId];
  const port = portGuide[tile.code]?.name ?? tile.name;

  return <section className="street-turn-option" data-street-turn-option={placement} aria-label={`Chuyển thẳng vỏ tại ${port}`}>
    <header><h4><Repeat2 aria-hidden="true" /><span><span lang="en">Street turn</span> tại {port}</span></h4>
      <small>Một lần mỗi ván</small></header>
    <p>Nhà nhập khẩu chuyển thẳng vỏ container khô vừa rút hàng đến nhà xuất khẩu gần cảng. Mọi tàu đều có thể đặt lô hàng mới.</p>
    <dl className="street-turn-figures">
      <div><dt>Hàng xuất tại bến</dt><dd data-street-turn-supply>{stock.supply} → {direct.supply}</dd></div>
      {direct.empties !== ordinary.empties && <div><dt>Vỏ rỗng tại bãi</dt><dd data-street-turn-empties>{direct.empties}
        <small> · dỡ thường {ordinary.empties}</small></dd></div>}
      <div><dt>Tổng thu chuyến này</dt><dd data-street-turn-total={total}>${total}M</dd></div>
    </dl>
    <button type="button" data-street-turn-unload={placement} disabled={busy} onClick={() => onChoose(action)}>
      Dỡ hàng và chuyển thẳng vỏ
    </button>
  </section>;
}
