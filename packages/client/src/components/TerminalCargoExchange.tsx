import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Container, Snowflake } from 'lucide-react';
import { BOARD_TILES, getEmptyNeed, isReeferPort, type GameAction, type GameState } from '@one-monopoly/shared';
import { DiversionComparison } from './DiversionComparison.js';
import { StreetTurnOption } from './StreetTurnOption.js';
import { WaybillAmendment } from './WaybillAmendment.js';
import { getPortCallCargo } from './ports/portCallCargo.js';
import { portGuide } from './ports/portGuide.js';
import './terminal-cargo-exchange.css';

interface Props {
  state: GameState;
  tileId: number;
  playerId: string;
  myPlayerId: string | null;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
}

const cargoNames = { empty: 'Container rỗng', laden: 'Hàng xuất', reefer: 'Hàng lạnh' };
const portName = (id: number) => portGuide[BOARD_TILES[id].code]?.name ?? BOARD_TILES[id].name;

export function TerminalCargoExchange({ state, tileId, playerId, myPlayerId, onAction }: Props) {
  const model = getPortCallCargo(state, tileId, playerId);
  const comparisonId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const inFlight = useRef<string | null>(null);
  const unloadButton = useRef<HTMLButtonElement>(null);
  const pendingHandoff = useRef<string | null>(null);
  const callId = [state.roomId, state.turnCount, playerId, tileId, model?.booking?.bookingId].join('/');
  const canUnload = !!model?.unloadAction && myPlayerId === playerId;
  useEffect(() => {
    if (canUnload && pendingHandoff.current === callId) {
      pendingHandoff.current = null;
      unloadButton.current?.focus();
    }
  }, [callId, canUnload]);
  if (!model?.booking || !model.cargoType) return null;

  const { booking, cargoType, estimate, stock, stockAfterUnload, unloadAction, redirectAction } = model;
  if (!model.active) return <p className="terminal-cargo-wait" data-terminal-cargo={tileId} data-terminal-status="waiting">
    <strong>{model.playerName}</strong> đang chờ lượt · {cargoNames[cargoType]} đi {portName(booking.destinationTileId)}.
  </p>;
  const mine = playerId === myPlayerId;
  const scope = `${callId}/${state.cargoRevision ?? 0}`;
  const comparing = !!redirectAction && mine && preview === scope;
  const busy = submitted === scope;
  const empty = booking.kind === 'empty';
  const status = unloadAction ? 'unload' : redirectAction ? 'redirect' : 'blocked';
  const CargoIcon = cargoType === 'reefer' ? Snowflake : Container;
  const port = portName(tileId);

  function send(action: NonNullable<typeof unloadAction | typeof redirectAction>) {
    if (!mine || inFlight.current === scope) return;
    inFlight.current = scope;
    setSubmitted(scope);
    if (action.type === 'CHANGE_DESTINATION') pendingHandoff.current = callId;
    // A successful command advances the cargo revision. Only a refusal reopens this exact draft.
    onAction(action, () => {
      if (inFlight.current === scope) {
        inFlight.current = null;
        pendingHandoff.current = null;
        setSubmitted(null);
      }
    });
  }

  return <section className="terminal-cargo-exchange" data-terminal-cargo={tileId} data-terminal-status={status}
    aria-label="Giao container tại cầu cảng">
    <header><h4>Giao container tại cầu cảng</h4>
      <span className="quay-cargo-kind"><CargoIcon aria-hidden="true" />{cargoNames[cargoType]}</span></header>
    <div className="quay-booked-route"><span>Vận đơn</span>
      <strong>{portName(booking.originTileId)}</strong><ArrowRight aria-label="đến" /><strong>{portName(booking.destinationTileId)}</strong>
    </div>
    <WaybillAmendment booking={booking} />
    {estimate?.total != null && <p className="quay-total"><span>{redirectAction ? 'Dự thu nếu đổi cảng' : 'Dự thu khi dỡ'}</span>
      <strong data-quay-total={estimate.total}>${estimate.total}M</strong></p>}
    {unloadAction && stockAfterUnload && <div className="quay-discharge">
      {model.receiver === 'reserved' && <p>Chủ hàng đã dành chỗ nhận tại bến.</p>}
      <dl aria-label="Tồn bến trước và sau khi dỡ">
        {model.receiver === 'appointment' ? <div><dt>Xe đã giữ cho lô này</dt>
          <dd data-quay-stock="receiver">1 → 0</dd></div> : <div><dt>{empty ? 'Chỗ nhận vỏ rỗng' : 'Xe nhận hàng nhập'}</dt>
          <dd data-quay-stock="receiver">{empty ? getEmptyNeed(stock) : stock.demand} → {empty ? getEmptyNeed(stockAfterUnload) : stockAfterUnload.demand}</dd></div>}
        <div><dt>Vỏ rỗng tại bãi</dt><dd data-quay-stock="empties">{stock.empties} → {stockAfterUnload.empties}</dd></div>
      </dl>
      {mine && <button ref={unloadButton} type="button" className="quay-primary" data-terminal-unload disabled={busy} onClick={() => send(unloadAction)}>
        Dỡ {empty ? 'container rỗng' : cargoType === 'reefer' ? 'hàng lạnh' : 'hàng xuất'} tại {port}
      </button>}
      {mine && <StreetTurnOption state={state} playerId={playerId} placement="quay" busy={busy} onChoose={send} />}
    </div>}
    {redirectAction && (mine ? <>
      <button type="button" className="quay-preview" data-terminal-cod-preview aria-expanded={comparing} aria-controls={comparisonId}
        disabled={busy} onClick={() => setPreview(comparing ? null : scope)}>
        {comparing ? 'Thu gọn so sánh' : `So sánh đổi cảng dỡ sang ${port}`}
      </button>
      <div id={comparisonId} hidden={!comparing}>{comparing && <div className="quay-diversion">
        <DiversionComparison state={state} playerId={playerId} currentId={booking.destinationTileId} proposedId={tileId} />
        <button type="button" className="quay-primary" data-terminal-cod-confirm disabled={busy} onClick={() => send(redirectAction)}>
          Xác nhận đổi cảng dỡ sang {port}
        </button>
      </div>}</div>
    </> : <p>{model.playerName} có thể đổi cảng dỡ sang {port}.</p>)}
    {status === 'blocked' && <p>{tileId === booking.originTileId ? 'Tàu đang ở cảng xếp hàng.'
      : cargoType === 'reefer' && !isReeferPort(tileId) ? 'Bến này không có kho lạnh để nhận lô hàng.'
        : empty ? 'Bến đã đủ vỏ rỗng.' : 'Bến chưa có xe trống để nhận hàng nhập.'}</p>}
  </section>;
}
