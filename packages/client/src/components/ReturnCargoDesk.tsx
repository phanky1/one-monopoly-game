import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Container, CornerDownLeft, Warehouse } from 'lucide-react';
import {
  BOARD_TILES, LOGISTICS_PORT_CAPACITY, getCargoRedirections, getImportTruckReservation,
  getReturnCargoToYardAction, getReturnCargoYardStatus, type GameAction, type GameState,
} from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './return-cargo-desk.css';

interface Props {
  state: GameState;
  playerId: string;
  myPlayerId: string | null;
  surface: 'desk' | 'quay';
  tileId?: number;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
}

function portName(tileId: number) {
  const tile = BOARD_TILES[tileId];
  return portGuide[tile.code]?.name ?? tile.name;
}

interface Submission {
  turn: string;
  bookingId: number;
  surfaceElement: HTMLElement | null;
  keyboard: boolean;
}

export function ReturnCargoDesk({ state, playerId, myPlayerId, surface, tileId, onAction }: Props) {
  const termsId = useId();
  const active = state.players[state.activePlayerIndex];
  const cargo = active?.cargo;
  const mine = playerId === myPlayerId && active?.id === playerId;
  const atSurface = mine && (surface === 'desk' || tileId === active.position);
  const status = atSurface ? getReturnCargoYardStatus(state, playerId) : null;
  const action = status === 'available' ? getReturnCargoToYardAction(state, playerId) : null;
  const turn = [state.roomId, state.turnCount, active?.id, myPlayerId, active?.position, surface, tileId].join('/');
  const scope = [turn, cargo?.bookingId, cargo?.destinationTileId, state.cargoRevision].join('/');
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState<Submission | null>(null);
  const inFlight = useRef<Submission | null>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const open = !!action && preview === scope;

  // Socket updates and acknowledgements may arrive in either order.
  useLayoutEffect(() => {
    if (!accepted || inFlight.current !== accepted) return;
    if (turn === accepted.turn && cargo?.bookingId === accepted.bookingId) return;
    inFlight.current = null;
    setPending(false);
    setAccepted(null);
    setPreview(null);
    const root = accepted.surfaceElement;
    if (!accepted.keyboard || turn !== accepted.turn || cargo || !root?.isConnected || document.hidden) return;
    const dialog = document.querySelector('dialog[open]');
    if (dialog && !dialog.contains(root)) return;
    const focus = document.activeElement;
    if (focus && focus !== document.body && focus !== dialog) return;
    const select = root.querySelector<HTMLElement>(surface === 'desk' ? '[data-cargo-booking]:enabled' : '[data-terminal-destination]:enabled');
    const radio = root.querySelector<HTMLElement>(surface === 'desk' ? 'input[data-cargo-kind]:checked:enabled' : 'input[data-terminal-service]:checked:enabled');
    const fallback = root.querySelector<HTMLElement>(surface === 'desk' ? '[data-cargo-action="LOAD_CARGO"]:enabled' : '[data-terminal-load]:enabled');
    (select ?? radio ?? fallback)?.focus();
  }, [accepted, cargo, turn, surface]);

  // Keep a cancelled quote's keyboard user in the same control when a rival or another tab updates the yard.
  useLayoutEffect(() => {
    if (preview && preview !== scope && !pending && document.activeElement === document.body) {
      expandButton.current?.focus({ preventScroll: true });
    }
  }, [scope, preview, pending]);

  if (!status || !cargo || !active || !state.logistics) return null;
  const origin = portName(cargo.originTileId), destination = portName(cargo.destinationTileId);
  const empty = cargo.kind === 'empty';
  const stock = state.logistics.ports[cargo.originTileId];
  const quantity = empty ? stock.empties : stock.supply;
  const pool = empty ? `Vỏ rỗng tại bãi ${origin}` : `Lô hàng xuất tại ${origin}`;
  const object = empty ? 'vỏ rỗng' : 'lô hàng';
  if (status === 'full') {
    const canRedirect = getCargoRedirections(state, playerId).length > 0;
    return <section className="return-cargo return-cargo-full" data-return-cargo={surface} data-return-full={surface}>
      <Warehouse aria-hidden="true" /><p><strong>{empty ? 'Bãi vỏ rỗng' : 'Bãi hàng xuất'} tại {origin} đã đầy ({quantity}/{LOGISTICS_PORT_CAPACITY}).</strong>{' '}
        {canRedirect ? 'Bạn có thể đổi cảng dỡ hoặc giữ container trên tàu.' : 'Giữ container trên tàu đến khi có bến nhận khác để đổi cảng dỡ.'}</p>
    </section>;
  }
  if (!action) return null;
  const held = getImportTruckReservation(state, playerId);
  const contract = state.logistics.market?.contract;
  const backhaul = active.backhaul;
  const subject = empty ? 'Vỏ rỗng' : cargo.reeferDueRound !== undefined ? 'Lô hàng lạnh' : 'Lô hàng xuất';

  function confirm(fromKeyboard: boolean, button: HTMLButtonElement) {
    if (!action || !cargo || !open || inFlight.current) return;
    const request: Submission = { turn, bookingId: cargo.bookingId, keyboard: fromKeyboard,
      surfaceElement: button.closest(surface === 'quay' ? 'dialog[open]' : '.freight-desk') };
    inFlight.current = request;
    setPending(true);
    setFailed(null);
    onAction(action, () => {
      if (inFlight.current !== request) return;
      inFlight.current = null;
      setPending(false);
      setFailed(scope);
    }, () => {
      if (inFlight.current === request) setAccepted(request);
    });
  }

  return <section className="return-cargo" data-return-cargo={surface} aria-label={`Trả ${object} về bãi tại ${origin}`}>
    <button ref={expandButton} type="button" className="return-cargo-toggle" aria-expanded={open} aria-controls={termsId}
      data-return-preview={surface} disabled={pending} onClick={() => { setPreview(open ? null : scope); setFailed(null); }}>
      <CornerDownLeft aria-hidden="true" /><span>Trả {object} về bãi tại <strong>{origin}</strong></span><ChevronDown aria-hidden="true" />
    </button>
    <div id={termsId} hidden={!open}>{open && <div className="return-cargo-terms">
      <p className="return-cargo-manifest"><Container aria-hidden="true" /><span>{subject} đang đặt đi <strong>{destination}</strong>.</span></p>
      <div className="return-cargo-stock" data-return-stock={empty ? 'empties' : 'supply'} aria-label={`${pool}, từ ${quantity} lên ${quantity + 1}`}>
        <span>{pool}</span><strong>{quantity} <ArrowRight aria-hidden="true" /> {quantity + 1}</strong>
      </div>
      <p>{empty ? 'Vỏ trở lại bãi vỏ dùng chung.' : 'Lô hàng trở lại kho xuất dùng chung cho các đội.'} Cước <strong>$0M</strong>. Số chuyến giao giữ nguyên.</p>
      {held && <p className="return-cargo-note" data-return-truck={held.destinationTileId}>
        Xe đã giữ tại <strong>{destination}</strong> sẽ về hàng chờ công cộng. Bạn đã dùng lượt giữ xe của ván này.</p>}
      {cargo.reeferDueRound !== undefined && <p className="return-cargo-note">Suất xếp lạnh tại {origin} ở vòng {cargo.reeferDueRound} vẫn được tính là đã dùng.</p>}
      {contract?.status === 'active' && contract.playerId === playerId && <p className="return-cargo-note">
        Hợp đồng giao {contract.kind === 'laden' ? 'hàng xuất' : 'vỏ rỗng'} tại <strong>{portName(contract.destinationTileId)}</strong> vẫn đến hạn cuối vòng {contract.deliveryRound}.</p>}
      {backhaul?.status === 'active' && <p className="return-cargo-note">Chuyến về {portName(backhaul.originTileId)} → {portName(backhaul.destinationTileId)} vẫn đến hạn cuối vòng {backhaul.deadlineRound}.</p>}
      {failed === scope && <p className="return-cargo-error" role="alert">Chưa thể trả về bãi. Kiểm tra lại vận đơn rồi thử lại.</p>}
      <button type="button" className="return-cargo-confirm" data-return-confirm={surface} disabled={pending}
        onClick={event => confirm(event.detail === 0, event.currentTarget)}>{pending ? 'Đang xác nhận…' : `Xác nhận trả ${object} về bãi`}</button>
    </div>}</div>
  </section>;
}
