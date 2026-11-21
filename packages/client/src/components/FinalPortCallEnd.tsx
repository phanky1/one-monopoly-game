import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Flag, Navigation, Route, Ship, Truck } from 'lucide-react';
import { isFinalLogisticsRound, type GameAction, type GameState } from '@one-monopoly/shared';
import { BoardDialog } from './BoardDialog.js';
import { port, type Submit } from './CargoBookingForm.js';
import { getFinalPortCallOptions } from './finalPortCall.js';
import './final-port-call.css';

interface Props {
  state: GameState;
  playerId: string;
  busy: boolean;
  submit: Submit;
  remainingSeconds?: number;
}

type Option = ReturnType<typeof getFinalPortCallOptions>[number];
const operations = {
  unload: { icon: Truck, label: 'Dỡ hàng', detail: 'Giao lô hàng tại bến hiện tại.' },
  sail: { icon: Ship, label: 'Khởi hành', detail: 'Khi tàu cập bến, chọn dỡ hàng để nhận cước.' },
  feeder: { icon: Navigation, label: 'Dùng chuyến nối cảng', detail: 'Dùng chuyến nối duy nhất, rồi dỡ hàng khi cập bến.' },
  redirect: { icon: Route, label: 'Đổi cảng dỡ', detail: 'Đổi vận đơn sang bến hiện tại, rồi chọn dỡ hàng.' },
} as const;

function DeliveryOption({ option, busy, choose }: { option: Option; busy: boolean; choose: (action: GameAction) => void }) {
  const name = port(option.tileId).name;
  const { icon: Icon, label, detail } = operations[option.kind];
  return <section className="final-call-option" data-final-call-option={option.kind} aria-label={`${label} · ${name}`}>
    <div className="final-call-port"><h3>{name}</h3><strong data-final-call-total={option.total}>+${option.total}M</strong></div>
    <div className="final-call-projection"><span>+1 lô đã giao</span>
      <span data-final-call-rank={option.projectedRank} data-current-rank={option.currentRank}>
        Hạng {option.currentRank} → {option.projectedRank}
      </span>
    </div>
    <p>{detail}</p>
    <button type="button" className="final-call-act" data-final-call-action={option.kind} data-final-call-tile={option.tileId}
      disabled={busy} onClick={() => choose(option.action)} aria-label={`${label} · ${name}`}>
      <Icon aria-hidden="true" />{label}
    </button>
  </section>;
}

function EndTurnControl({ state, options, busy, submit, remainingSeconds }: Omit<Props, 'playerId'> & { options: readonly Option[] }) {
  const [reviewing, setReviewing] = useState(false);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const cargo = state.players[state.activePlayerIndex].cargo;
  const final = isFinalLogisticsRound(state);
  const pass = state.phase === 'AWAITING_SAIL';
  const open = reviewing && options.length > 0 && !!cargo;

  useLayoutEffect(() => {
    if (open) heading.current?.focus({ preventScroll: true });
  }, [open]);

  function choose(action: GameAction) {
    if (!busy) submit(action, () => setReviewing(false));
  }
  return <>
    <button type="button" className={`chart-button freight-end${pass ? ' freight-pass' : ''}`}
      data-cargo-action="END_TURN" data-final-call-open={options.length > 0 || undefined}
      aria-haspopup={options.length ? 'dialog' : undefined} disabled={busy}
      onClick={() => options.length ? setReviewing(true) : submit({ type: 'END_TURN' })}>
      <Flag aria-hidden="true" />{pass ? 'Không đi chuyến này · Kết thúc lượt' : 'Kết thúc lượt'}
    </button>
    {open && <BoardDialog labelledBy={headingId} onClose={() => setReviewing(false)}>
      <div className="final-port-call" data-final-call-dialog={final ? 'final' : 'reefer'}>
        <header className="final-call-heading">
          <div className="final-call-line"><span><Flag aria-hidden="true" />Vòng {state.turnCount}</span>
            {remainingSeconds !== undefined && <time dateTime={`PT${remainingSeconds}S`} aria-live="off"
              aria-label={`Lượt của bạn còn ${remainingSeconds} giây`} data-final-call-time={remainingSeconds}>Còn {remainingSeconds} giây</time>}
          </div>
          <h2 ref={heading} tabIndex={-1} id={headingId}>{final ? 'Lượt cuối của bạn' : 'Lô lạnh đến hạn giao'}</h2>
          <div className="final-call-booking"><span>Vận đơn</span> {port(cargo.originTileId).name}
            <ArrowRight aria-label="đến" />{port(cargo.destinationTileId).name}</div>
        </header>
        <div className="final-call-body">
          <p className="final-call-advice">{final ? 'Bạn còn có thể giao lô này trong lượt cuối. Nếu kết thúc lượt bây giờ, lô trên tàu sẽ không được tính vào kết quả ván.'
            : <>Kết thúc lượt với lô lạnh trên tàu sẽ mất <strong>${options[0].expiringReeferBonus}M</strong> phụ phí giao đúng vòng.</>}</p>
          <p className="final-call-condition">Cước và thứ hạng dự kiến sau khi dỡ hàng, nếu kết quả của các đội khác giữ nguyên.</p>
          <div className="final-call-options">
            {options.map(option => <DeliveryOption key={`${option.kind}/${option.tileId}`} option={option} busy={busy} choose={choose} />)}
          </div>
        </div>
        <footer className="final-call-footer">
          <button type="button" data-final-call-cancel onClick={() => setReviewing(false)}>Quay lại</button>
          <button type="button" data-final-call-end disabled={busy} onClick={() => choose({ type: 'END_TURN' })}>
            Kết thúc lượt, giữ hàng trên tàu
          </button>
        </footer>
      </div>
    </BoardDialog>}
  </>;
}

export function FinalPortCallEnd({ state, playerId, busy, submit, remainingSeconds }: Props) {
  const options = useMemo(() => getFinalPortCallOptions(state, playerId), [state, playerId]);
  const player = state.players[state.activePlayerIndex];
  if (!state.gameStarted || state.mode !== 'logistics' || state.winnerId || !player || player.id !== playerId ||
    player.isBankrupt || (state.phase !== 'END_OF_TURN' && state.phase !== 'AWAITING_SAIL')) return null;
  // A new turn or command invalidates the open review, including after a timer ends the turn.
  const scope = [state.roomId, playerId, state.turnCount, state.phase, player.position, player.cargo?.bookingId,
    player.cargo?.destinationTileId, state.cargoRevision ?? 0, options.length].join('/');
  return <EndTurnControl key={scope} state={state} options={options} busy={busy} submit={submit} remainingSeconds={remainingSeconds} />;
}
