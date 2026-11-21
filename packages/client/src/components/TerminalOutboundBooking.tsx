import { useRef, useState } from 'react';
import {
  BACKHAUL_BONUS, getAcceptBackhaulAction, getCargoBookings, isFinalLogisticsRound,
  type GameAction, type GameState, type Player,
} from '@one-monopoly/shared';
import { CargoBooking, getDefaultBookingService, port, type DestinationDraft } from './CargoBookingForm.js';
import { getPortCallCargo } from './ports/portCallCargo.js';
import './terminal-outbound-booking.css';

interface Props {
  state: GameState;
  playerId: string;
  myPlayerId: string | null;
  tileId: number;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
}

function OutboundForm({ state, player, onAction }: Pick<Props, 'state' | 'onAction'> & { player: Player }) {
  const [draft, editDraft] = useState<DestinationDraft>(() => {
    const preferred = getDefaultBookingService(state, player.id);
    const alternative = preferred === 'laden' ? 'empty' : 'laden';
    const service = getCargoBookings(state, player.id, preferred).length || !getCargoBookings(state, player.id, alternative).length
      ? preferred : alternative;
    return { service };
  });
  const inFlight = useRef<number | null>(null);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const revision = state.cargoRevision ?? 0;
  const busy = submitted === revision;
  const job = player.backhaul?.originTileId === player.position ? player.backhaul : undefined;
  const accept = job && getAcceptBackhaulAction(state, player.id);
  const deadline = isFinalLogisticsRound(state) ? state.turnCount : job?.deadlineRound;
  const returnHere = job && (accept || job.status === 'active');
  if (player.cargo && (!returnHere || player.cargo.originTileId !== player.position)) return null;

  function submit(action: GameAction) {
    if ((action.type !== 'LOAD_CARGO' && action.type !== 'ACCEPT_BACKHAUL') ||
      action.revision !== revision || inFlight.current === revision) return;
    inFlight.current = revision;
    setSubmitted(revision);
    // Keep both operations locked until the accepted revision is visible.
    onAction(action, () => {
      if (inFlight.current === revision) {
        inFlight.current = null;
        setSubmitted(null);
      }
    });
  }

  return <section className="terminal-outbound-booking" data-terminal-booking={!player.cargo ? player.position : undefined}
    aria-label={player.cargo ? 'Chuyến hàng chiều về' : 'Xếp hàng tại cầu cảng'}>
    {!player.cargo && <CargoBooking terminal state={state} player={player} busy={busy} submit={submit} draft={draft} editDraft={editDraft} />}
    {returnHere && <div className="terminal-return-offer" data-terminal-backhaul={job.status}>
      <strong>{job.status === 'active' ? 'Đã nhận chuyến về' : 'Đề nghị chuyến về'} · {port(job.originTileId).name} → {port(job.destinationTileId).name}</strong>
      <p>{player.lastBackhaulPaidRound !== state.turnCount
        ? `Giao lô kế tiếp đúng tuyến trước khi hết vòng ${deadline} để nhận thêm $${BACKHAUL_BONUS}M.`
        : deadline === state.turnCount ? 'Vòng này đã nhận thưởng chiều về. Tuyến này không còn thưởng.'
          : `Vòng này đã nhận thưởng chiều về. Giao đúng tuyến ở vòng ${state.turnCount + 1} để nhận thêm $${BACKHAUL_BONUS}M.`}</p>
      {player.cargo && player.cargo.destinationTileId !== job.destinationTileId && <p>Lô trên tàu đang đi {port(player.cargo.destinationTileId).name}.
        {' '}Đổi cảng dỡ sang {port(job.destinationTileId).name} để giao theo chuyến về.</p>}
      {accept && <button type="button" className="terminal-accept-return" data-terminal-backhaul-accept disabled={busy}
        onClick={() => submit(accept)}>Nhận chuyến về {port(job.destinationTileId).name}</button>}
    </div>}
  </section>;
}

export function TerminalOutboundBooking({ state, playerId, myPlayerId, tileId, onAction }: Props) {
  if (myPlayerId !== playerId) return null;
  const call = getPortCallCargo(state, tileId, playerId);
  if (!call?.active) return null;
  const player = state.players[state.activePlayerIndex];
  const visit = [state.roomId, state.turnCount, playerId, tileId, player.lastDelivery?.bookingId].join('/');
  return <OutboundForm key={visit} state={state} player={player} onAction={onAction} />;
}
