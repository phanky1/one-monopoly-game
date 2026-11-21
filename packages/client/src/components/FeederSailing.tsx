import { useState } from 'react';
import { ChevronDown, Map, Navigation } from 'lucide-react';
import { BOARD_TILES, FEEDER_RANGE_NM, getFeederRoutes, type GameAction, type GameState, type Player } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './feeder-sailing.css';

const nm = new Intl.NumberFormat('vi-VN');

function portName(tileId: number) {
  const tile = BOARD_TILES[tileId];
  return portGuide[tile.code]?.name ?? tile.name;
}

interface Props {
  state: GameState;
  captain: Player;
  busy: boolean;
  onOpenChart: () => void;
  submit: (action: GameAction) => void;
}

export function FeederSailing({ state, captain, busy, submit, onOpenChart }: Props) {
  const [selected, setSelected] = useState<number>();
  const available = state.logistics?.feederAvailable?.[captain.id];
  if (available === undefined || !state.logistics?.hasSailed || state.phase !== 'END_OF_TURN') return null;
  if (!available) {
    return <p className="freight-feeder-status" data-feeder-state="spent"><Navigation aria-hidden="true" />Đã dùng chuyến nối cảng của ván này.</p>;
  }
  const routes = getFeederRoutes(state, captain.id);
  if (!routes.length) {
    return <p className="freight-feeder-status" data-feeder-state="out-of-range"><Navigation aria-hidden="true" />
      Không có cảng trong phạm vi {nm.format(FEEDER_RANGE_NM)} hải lý. Bạn vẫn còn chuyến nối cảng.</p>;
  }
  const route = routes.find(r => r.tileId === selected) ?? routes.find(r => r.tileId === captain.cargo?.destinationTileId) ?? routes[0];
  return (
    <details className="freight-feeder" data-feeder-state="available">
      <summary><Navigation aria-hidden="true" />Chuyến nối cảng <small>Còn 1 lần</small><ChevronDown aria-hidden="true" /></summary>
      <div className="freight-feeder-body">
        <p>Từ {portName(captain.position)}, tàu có thể đi thêm tối đa {nm.format(FEEDER_RANGE_NM)} hải lý trong lượt này.</p>
        <button type="button" className="freight-feeder-chart-link" data-desk-feeder-chart aria-haspopup="dialog" disabled={busy} onClick={onOpenChart}>
          <Map aria-hidden="true" />So sánh cảng trên hải đồ
        </button>
        <label className="freight-field"><span>Cảng nối chuyến</span>
          <select data-feeder-destination value={route.tileId} onChange={e => setSelected(Number(e.target.value))} disabled={busy}>
            {routes.map(r => <option key={r.tileId} value={r.tileId}>{portName(r.tileId)} · {nm.format(r.distanceNm)} hải lý</option>)}
          </select>
        </label>
        {captain.cargo && <p>{route.quote
          ? 'Có chỗ nhận container tại cảng này. Bạn có thể dỡ hàng sau khi cập bến.'
          : route.tileId === captain.cargo.destinationTileId ? 'Cảng giao đang hết chỗ nhận container.'
            : `Container tiếp tục ở trên tàu để giao tại ${portName(captain.cargo.destinationTileId)}.`}</p>}
        <button type="button" className="chart-button freight-feeder-submit" data-cargo-action="SAIL_FEEDER" disabled={busy}
          onClick={() => submit(route.action)}>
          <Navigation aria-hidden="true" />Dùng chuyến duy nhất đến {portName(route.tileId)}
        </button>
      </div>
    </details>
  );
}
