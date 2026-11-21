import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Anchor, ArrowRight, CircleAlert, Compass, Container, Navigation, X } from 'lucide-react';
import { BOARD_TILES, type GameAction, type GameState } from '@one-monopoly/shared';
import { BoardDialog } from './BoardDialog.js';
import { FeederRouteMap } from './FeederRouteMap.js';
import { getFeederChart, type FeederChartOption } from './ports/feederChart.js';
import { portGuide } from './ports/portGuide.js';
import './feeder-chart-dialog.css';

interface Props {
  state: GameState;
  captainId: string;
  originTileId: number;
  myPlayerId: string | null;
  is3D: boolean;
  initialTileId?: number;
  onClose: () => void;
  onSailed?: (tileId: number, keyboard: boolean) => void;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
}

const number = new Intl.NumberFormat('vi-VN');
const money = (amount: number) => `$${number.format(amount)}M`;

function review(option: FeederChartOption, departure: number | null) {
  return { tileId: option.tileId, status: option.cargoStatus, payment: option.payment, departure };
}

function CargoAtPort({ option, bookedPort, emptyContainer }: {
  option: FeederChartOption; bookedPort: string; emptyContainer: boolean;
}) {
  switch (option.cargoStatus) {
    case 'deliver':
      return <div className="feeder-chart-cargo can-deliver">
        <Container aria-hidden="true" /><p>Vận đơn đến <strong>{bookedPort}</strong>. Có thể dỡ khi cập bến.</p>
        {option.payment !== null && <div className="feeder-chart-payment" data-feeder-payment={option.payment}>
          <span>Thu khi dỡ</span><strong>{money(option.payment)}</strong>
        </div>}
      </div>;
    case 'blocked':
      return <div className="feeder-chart-cargo"><CircleAlert aria-hidden="true" />
        <p>Vận đơn đến <strong>{bookedPort}</strong>. {emptyContainer ? 'Bến chưa cần thêm vỏ rỗng.' : 'Bến chưa có xe nhận lô hàng này.'} Container sẽ ở trên tàu.</p>
      </div>;
    case 'aboard':
      return <div className="feeder-chart-cargo"><Container aria-hidden="true" />
        <p>Vận đơn đến <strong>{bookedPort}</strong>. Container vẫn ở trên tàu khi ghé {option.port.name}.</p>
      </div>;
    case 'empty-hold':
      return <div className="feeder-chart-cargo"><Container aria-hidden="true" /><p>Tàu ghé {option.port.name} với khoang trống.</p></div>;
  }
}

export function FeederChartDialog({ state, captainId, originTileId, myPlayerId, is3D, initialTileId, onAction, onClose, onSailed }: Props) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  const captain = state.players[state.activePlayerIndex];
  const cargo = captain?.cargo;
  const turn = [state.roomId, state.turnCount, captainId, originTileId, myPlayerId].join('/');
  const manifest = [cargo?.bookingId, cargo?.originTileId, cargo?.destinationTileId, cargo?.kind, cargo?.reeferDueRound,
    cargo?.destinationAmendment?.count, captain?.lastDelivery?.bookingId].join('/');
  const [opened] = useState(() => ({ turn, manifest }));
  const changedManifest = manifest !== opened.manifest;
  const chart = turn === opened.turn && !changedManifest ? getFeederChart(state, captainId, originTileId) : null;
  const [selection, setSelection] = useState(() => {
    const initial = chart?.options.find(option => option.tileId === initialTileId)
      ?? chart?.options.find(option => option.tileId === chart.preferredTileId);
    return initial && chart ? review(initial, chart.departureDelivery) : null;
  });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const option = chart?.options.find(entry => entry.tileId === selection?.tileId);
  const owner = myPlayerId === captainId && captain?.id === captainId;
  const bookedPort = cargo && BOARD_TILES[cargo.destinationTileId];
  const bookingName = bookedPort && (portGuide[bookedPort.code]?.name ?? bookedPort.name);
  const termsChanged = !!option && !!chart && !!selection && (option.cargoStatus !== selection.status ||
    option.payment !== selection.payment || chart.departureDelivery !== selection.departure);

  useLayoutEffect(() => {
    mounted.current = true;
    heading.current?.focus({ preventScroll: true });
    return () => { mounted.current = false; };
  }, []);

  useLayoutEffect(() => {
    const button = returnButton.current;
    if (button && !button.closest('dialog')?.contains(document.activeElement)) button.focus({ preventScroll: true });
  }, [!!chart]);

  function sail(keyboard: boolean) {
    if (!owner || !chart || !option || termsChanged || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setFailed(false);
    onAction(option.action, () => {
      if (!mounted.current) return;
      submitting.current = false;
      setPending(false);
      setFailed(true);
    }, () => {
      if (!mounted.current) return;
      if (onSailed) onSailed(option.tileId, keyboard);
      else onClose();
    });
  }

  return <BoardDialog labelledBy={titleId} onClose={onClose}>
    <section className="feeder-chart-dialog" data-feeder-chart>
      <header className="feeder-chart-heading">
        <div><span className="feeder-chart-context"><Compass size={14} aria-hidden="true" />
          {chart ? `${chart.captainName} · Vòng ${state.turnCount}` : 'Chuyến nối cảng'}</span>
          <h2 id={titleId} ref={heading} tabIndex={-1}>Hải đồ nối cảng</h2></div>
        <button type="button" className="feeder-chart-close" aria-label="Đóng hải đồ nối cảng" onClick={onClose}><X size={19} aria-hidden="true" /></button>
      </header>
      {chart ? <>
        <div className="feeder-chart-body">
          <div className="feeder-chart-choices">
            <h3><Anchor size={16} aria-hidden="true" />Từ {chart.origin.name}</h3>
            <div role="group" aria-label="Chọn cảng để xem tuyến" className="feeder-chart-options">
              {chart.options.map(entry => <button key={entry.tileId} type="button" data-feeder-option={entry.tileId}
                aria-pressed={entry.tileId === selection?.tileId} disabled={pending} onClick={() => {
                  setSelection(review(entry, chart.departureDelivery));
                  setFailed(false);
                }}>
                <span>{entry.port.name}</span><small>{number.format(entry.distanceNm)} hải lý</small>
              </button>)}
            </div>
          </div>
          {option ? <article className="feeder-chart-detail" data-feeder-detail={option.tileId}>
            <div className="feeder-chart-port"><h3>{option.port.name}</h3>
              <span>{option.port.country}</span></div>
            <FeederRouteMap origin={chart.origin} destination={option.port} distanceNm={option.distanceNm} is3D={is3D} />
            <p className="feeder-chart-fact">{option.port.fact}</p>
            <dl className="feeder-chart-yard">
              <div><dt>Lô hàng xuất</dt><dd>{option.supply}</dd></div>
              <div><dt>Xe nhận hàng</dt><dd>{option.demand}</dd></div>
              <div><dt>Vỏ rỗng tại bãi</dt><dd>{option.empties}<small>mục tiêu {option.emptyTarget}</small></dd></div>
            </dl>
            <CargoAtPort option={option} bookedPort={bookingName ?? ''} emptyContainer={cargo?.kind === 'empty'} />
          </article> : <p role="status" className="feeder-chart-notice">Tuyến đã thay đổi. Chọn một cảng để xem lại chuyến nối.</p>}
        </div>
        {chart.departureDelivery !== null && <p className="feeder-chart-departure" data-feeder-departure={chart.departureDelivery}>
          <CircleAlert size={17} aria-hidden="true" /><span>Tại <strong>{chart.origin.name}</strong>, lô này có thể dỡ để nhận <strong>{money(chart.departureDelivery)}</strong>. Nếu đi tiếp, container sẽ rời bến trên tàu.</span></p>}
        {termsChanged && <p className="feeder-chart-notice" role="status">Điều kiện giao hàng vừa thay đổi. Chọn lại cảng để xác nhận với thông tin mới.</p>}
        {failed && <p className="feeder-chart-notice" role="alert">Chuyến nối chưa được xác nhận. Kiểm tra lại tuyến rồi thử lại.</p>}
        <footer className="feeder-chart-footer">
          <p><Navigation size={15} aria-hidden="true" />Mỗi tàu có một chuyến nối trong cả ván.</p>
          {owner && option && <button type="button" className="feeder-chart-submit" data-feeder-chart-sail={option.tileId}
            disabled={pending || termsChanged} onClick={event => sail(event.detail === 0)}>
            {pending ? 'Đang xác nhận…' : `Nối chuyến đến ${option.port.name}`}<ArrowRight size={16} aria-hidden="true" />
          </button>}
        </footer>
      </> : <div className="feeder-chart-ended">
        <p role="status">{pending ? 'Đang xác nhận chuyến nối…' : changedManifest && turn === opened.turn && captain?.id === captainId
          ? 'Vận đơn đã thay đổi. Đóng hải đồ và mở lại để xem các tuyến hiện tại.' : 'Chuyến nối từ bến này đã kết thúc.'}</p>
        <button type="button" ref={returnButton} onClick={onClose}>Về bàn cờ</button>
      </div>}
    </section>
  </BoardDialog>;
}
