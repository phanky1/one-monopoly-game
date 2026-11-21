import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { BOARD_TILES, type GameState } from '@one-monopoly/shared';
import { getHarborLoadingForecast } from './harborLoadingForecast.js';
import { portGuide } from './ports/portGuide.js';
import './harbor-loading-preview.css';

interface Props {
  state: GameState;
  viewerId: string;
  onInspectPort: (tileId: number) => void;
}

function signedMoney(amount: number) {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}$${Math.abs(amount)}M`;
}

export function HarborLoadingPreview({ state, viewerId, onInspectPort }: Props) {
  const forecast = useMemo(() => getHarborLoadingForecast(state, viewerId), [state, viewerId]);
  if (!forecast) return null;
  const { calls, directWays, fee, holdWays } = forecast;
  const unowned = calls.some(call => state.properties[call.tileId]?.ownerId === null);

  return <details className="harbor-loading-preview" data-harbor-loading-preview>
    <summary data-loading-forecast-toggle>
      <ChevronRight aria-hidden="true" size={15} />
      <span>Bến ở lần gieo tới</span>
      <small data-loading-direct-ways={directWays}>{directWays}/36 cập thẳng bến</small>
    </summary>
    <div className="harbor-loading-body">
      {calls.length > 0 ? <>
        <p>Cước ròng là phần bạn kiếm thêm nếu xếp hàng và dỡ tại bến, sau phí dỡ{fee > 0 && <> và ${fee}M phí xếp</>}.
          {' '}Tàu đi trống vẫn trả tiền thuê.</p>
        <table aria-label="Bến có thể cập trực tiếp bằng hai xúc xắc">
          <thead><tr><th scope="col">Tổng</th><th scope="col">Bến dỡ</th>
            <th scope="col">Cơ hội</th><th scope="col">Cước ròng</th></tr></thead>
          <tbody>{calls.map(call => {
            const tile = BOARD_TILES[call.tileId];
            const name = portGuide[tile.code]?.name ?? tile.name;
            return <tr key={call.tileId} data-loading-row={call.tileId}>
              <td data-loading-roll={call.total}>{call.total}</td>
              <td><button type="button" data-loading-port={call.tileId} aria-haspopup="dialog"
                onClick={event => {
                  event.currentTarget.focus({ preventScroll: true });
                  onInspectPort(call.tileId);
                }}>{name}</button></td>
              <td data-loading-ways={call.ways}>{call.ways}/36</td>
              <td data-loading-margin={call.freightMargin}>{signedMoney(call.freightMargin)}</td>
            </tr>;
          })}</tbody>
        </table>
      </> : <p>Lần gieo tới không có đường cập thẳng bến đang mở. Tàu có thể giữ hàng để dỡ ở lần ghé sau.</p>}
      <p>Chỉ tính ô đến trực tiếp theo xúc xắc trên bàn hiện tại, chưa tính di chuyển do rút thẻ.
        {unowned && ' Nếu đối thủ mua được bến vô chủ, họ sẽ thu một phần cước dỡ hàng.'}</p>
      {holdWays > 0 && <p data-loading-hold-ways={holdWays}>{holdWays}/36 kết quả là đôi lần thứ ba liên tiếp, tàu vào khu kiểm hóa.</p>}
    </div>
  </details>;
}
