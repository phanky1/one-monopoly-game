import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Truck } from 'lucide-react';
import {
  BOARD_TILES, getImportTruckReservation, getImportTruckThroughRound, getReserveImportTruckAction,
  type GameAction, type GameState, type ReserveImportTruckAction,
} from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './import-truck-desk.css';

interface Props {
  state: GameState;
  playerId: string;
  myPlayerId: string | null;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  surface?: 'desk' | 'quay';
}

export function ImportTruckDesk({ state, playerId, myPlayerId, onAction, surface = 'desk' }: Props) {
  const focusOnAcceptance = useRef<string | null>(null);
  const receipt = useRef<HTMLElement>(null);
  const player = state.players.find(p => p.id === playerId);
  const booking = player?.cargo;
  const appointment = getImportTruckReservation(state, playerId);
  const action = playerId === myPlayerId ? getReserveImportTruckAction(state, playerId) : null;
  const manifest = [state.roomId, playerId, booking?.bookingId, booking?.destinationTileId].join('/');
  const held = !!appointment;
  useEffect(() => {
    if (held && playerId === myPlayerId && focusOnAcceptance.current === manifest) {
      focusOnAcceptance.current = null;
      receipt.current?.focus({ preventScroll: true });
    }
  }, [held, manifest, playerId, myPlayerId]);

  if (!player || booking?.kind !== 'laden' || (!appointment && !action)) return null;
  const tile = BOARD_TILES[booking.destinationTileId];
  const port = portGuide[tile.code]?.name ?? tile.name;
  const demand = state.logistics!.ports[tile.id].demand;
  if (appointment) return <section ref={receipt} tabIndex={-1} className="import-appointment import-appointment-held"
    data-truck-appointment="held" data-surface={surface} aria-label={`Xe nhận đã giữ tại ${port}`}>
    <Truck aria-hidden="true" />
    <div><strong>Xe nhận đã giữ tại {port}</strong>
      <p>{player.name} giữ 1 xe đến hết vòng <b>{appointment.throughRound}</b>. Bến còn {demand} xe nhận công cộng.</p>
    </div>
  </section>;
  if (!action) return null;
  return <ImportTruckProposal key={`${manifest}/${action.revision}`}
    action={action} port={port} demand={demand} throughRound={getImportTruckThroughRound(state)}
    reeferDueRound={booking.reeferDueRound} surface={surface} onAction={onAction}
    onKeyboardConfirm={() => { focusOnAcceptance.current = manifest; }} />;
}

interface ProposalProps {
  action: ReserveImportTruckAction;
  port: string;
  demand: number;
  throughRound: number;
  reeferDueRound?: number;
  surface: Props['surface'];
  onAction: Props['onAction'];
  onKeyboardConfirm: () => void;
}

function ImportTruckProposal({ action, port, demand, throughRound, reeferDueRound, surface, onAction, onKeyboardConfirm }: ProposalProps) {
  const termsId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  function confirm(fromKeyboard: boolean) {
    if (!open || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    if (fromKeyboard) onKeyboardConfirm();
    // A new revision replaces this proposal. A refusal lets the captain retry it.
    onAction(action, () => {
      inFlight.current = false;
      setBusy(false);
    });
  }

  return <section className="import-appointment" data-truck-appointment="available" data-surface={surface}
    aria-label="Giữ xe nhận hàng nhập">
    <button type="button" className="appointment-toggle" data-appointment-preview aria-expanded={open}
      aria-controls={termsId} disabled={busy} onClick={() => setOpen(!open)}>
      <Truck aria-hidden="true" /><span>Giữ xe nhận tại <strong>{port}</strong></span><ChevronDown aria-hidden="true" />
    </button>
    <div hidden={!open} id={termsId}>{open && <div className="appointment-terms">
      <dl><div><dt>Xe nhận công cộng</dt><dd data-appointment-demand>{demand} → {demand - 1}</dd></div>
        <div><dt>Thời hạn giữ</dt><dd>Hết vòng {throughRound}</dd></div></dl>
      <p>Mỗi thuyền trưởng được giữ xe một lần trong ván. Đổi cảng dỡ hoặc hết hạn sẽ trả xe cho bến. Cước được trả khi dỡ hàng.</p>
      {reeferDueRound !== undefined && <p>Hạn giao lạnh của lô này vẫn là vòng {reeferDueRound}.</p>}
      <button type="button" className="appointment-confirm" data-appointment-confirm disabled={busy}
        onClick={event => confirm(event.detail === 0)}>Xác nhận giữ 1 xe tại {port}</button>
    </div>}</div>
  </section>;
}
