import { useId, useMemo } from 'react';
import { ArrowRight, ArrowUpRight, Bookmark, ClipboardCheck, Snowflake, X } from 'lucide-react';
import {
  BOARD_TILES, canReceiveCargo, getFreightQuote, hasReeferSlot,
  type CargoKind, type GameAction, type GameState,
} from '@one-monopoly/shared';
import { portGuide, type PortGuide } from './ports/portGuide.js';
import { voyageRoute } from './ports/voyageRoute.js';
import { getWatchTurn, type WatchPlan, type WatchPlanResolution } from './watchPlan.js';
import './watch-plan-card.css';

interface Props {
  state: GameState;
  playerId: string;
  plan: WatchPlan | null;
  resolution: WatchPlanResolution | null;
  animate: boolean;
  onOpenMarket: () => void;
  onClear: () => void;
  onConfirm: (action: GameAction) => void;
  busy: boolean;
}

const number = new Intl.NumberFormat('vi-VN');
const port = (id: number) => portGuide[BOARD_TILES[id]?.code];

function RouteChart({ from, to, animate }: { from: PortGuide; to: PortGuide; animate: boolean }) {
  const titleId = useId();
  const route = useMemo(() => voyageRoute(from, to), [from, to]);
  const first = route.points[0], last = route.points[route.points.length - 1];
  return <figure className="watch-route-figure">
    <svg className="watch-route-chart" viewBox="0 0 480 224" role="img" aria-labelledby={titleId} focusable="false"
      data-watch-route="" data-origin-port={from.code} data-destination-port={to.code}>
      <title id={titleId}>Đường nối cảng xếp {from.name} với cảng đích {to.name} chỉ để minh họa. Hải trình thực tế có thể khác.</title>
      <g transform={`translate(${route.left} ${route.top}) scale(${route.scale})`}>
        {route.mapOffsets.map(x => <image key={x} href="/images/world-atlas.svg" x={x} width="360" height="180" />)}
      </g>
      <path d={route.path} fill="none" stroke="#fff7dc" strokeWidth="13" />
      <path d={route.path} fill="none" stroke="#982953" strokeWidth="6.5" strokeLinecap="round" pathLength="1"
        strokeDasharray="1 1" data-watch-path="" data-animate={animate} />
      <circle cx={first.x} cy={first.y} r="11" fill="#1e5056" stroke="#fff8e6" strokeWidth="4" />
      <circle cx={last.x} cy={last.y} r="13" fill="#fff8e6" stroke="#8e2751" strokeWidth="5" />
      <circle cx={last.x} cy={last.y} r="5" fill="#8e2751" />
    </svg>
    <figcaption>Tuyến minh họa</figcaption>
  </figure>;
}

function blockedReason(state: GameState, plan: WatchPlan, kind: CargoKind, from: PortGuide, to: PortGuide) {
  const source = state.logistics?.ports[plan.berthId];
  if (source && plan.service !== 'redirect') {
    if (kind === 'empty' && source.empties <= source.emptyTarget) return `${from.name} không còn vỏ rỗng dư để xếp.`;
    if (kind === 'laden' && source.supply === 0) return `${from.name} đã hết xe chở hàng xuất.`;
    if (plan.service === 'reefer' && !hasReeferSlot(state, plan.berthId)) return `${from.name} không còn suất xếp hàng lạnh trong vòng này.`;
  }
  if (!canReceiveCargo(state, plan.playerId, plan.tileId, kind)) {
    return kind === 'empty' ? `${to.name} đã đủ vỏ rỗng.` : `${to.name} đã hết xe nhận lô hàng này.`;
  }
  return `Chưa thể ${plan.service === 'redirect' ? 'đổi vận đơn sang' : 'xếp lô hàng đi'} ${to.name}. Hãy kiểm tra lại thị trường.`;
}

export function WatchPlanCard({ state, playerId, plan, resolution, animate, onOpenMarket, onClear, onConfirm, busy }: Props) {
  const titleId = useId();
  const viewer = state.players.find(player => player.id === playerId);
  if (!viewer || !state.logistics || state.winnerId) return null;
  if (!plan || !resolution || plan.playerId !== playerId || plan.roomId !== state.roomId) {
    if (!getWatchTurn(state, playerId)) return null;
    return <section className="watch-plan-card watch-plan-invite" data-watch-card="invite" data-status="invite" aria-labelledby={titleId}>
      <Bookmark aria-hidden="true" size={17} />
      <h2 id={titleId}>Kế hoạch cho lượt tới</h2>
      <button type="button" data-watch-market="" onClick={onOpenMarket}>So sánh cảng <ArrowUpRight aria-hidden="true" size={14} /></button>
    </section>;
  }

  const redirect = plan.service === 'redirect';
  const cargo = redirect ? viewer.cargo : undefined;
  if (redirect && (!cargo || cargo.bookingId !== plan.bookingId)) return null;
  const fromId = cargo?.originTileId ?? plan.berthId;
  const from = port(fromId), to = port(plan.tileId);
  if (!from || !to) return null;
  const kind = cargo?.kind ?? (plan.service === 'empty' ? 'empty' : 'laden');
  const reefer = plan.service === 'reefer' || cargo?.reeferDueRound !== undefined;
  const cargoLabel = reefer ? 'Hàng lạnh' : kind === 'empty' ? 'Vỏ rỗng' : 'Hàng xuất';
  const rate = getFreightQuote(fromId, plan.tileId, kind)?.reward;
  const previous = cargo ? port(cargo.destinationTileId) : undefined;
  const { status, action } = resolution;
  const ready = status === 'ready' && (action?.type === 'LOAD_CARGO' || action?.type === 'CHANGE_DESTINATION');
  const confirmLabel = redirect ? 'Xác nhận đổi cảng dỡ' : reefer ? 'Xếp container lạnh'
    : kind === 'empty' ? 'Xếp container rỗng' : 'Xếp container hàng xuất';
  const statusText = status === 'blocked' ? blockedReason(state, plan, kind, from, to)
    : status === 'waiting' ? 'Đã lưu riêng. Đến lượt bạn sẽ kiểm tra lại chỗ.' : 'Đến lượt bạn. Có thể xác nhận kế hoạch này.';

  return <section className="watch-plan-card" data-watch-card={status} data-status={status} tabIndex={-1} aria-labelledby={titleId}>
    <header className="watch-plan-head"><h2 id={titleId}><Bookmark aria-hidden="true" size={15} /> Kế hoạch riêng</h2>
      <span>Vòng {plan.turnRound}</span></header>
    <div className="watch-plan-itinerary">
      <div>
        <p className="watch-route-title"><span>{from.name}</span><ArrowRight size={14} aria-label="đến" /><span>{to.name}</span></p>
        <p className="watch-port-codes"><span>{from.code}</span><span aria-hidden="true"> → </span><span>{to.code}</span></p>
        <p className="watch-plan-terms">{reefer && <Snowflake aria-hidden="true" size={13} />}{cargoLabel}
          {rate !== undefined && <span> · Cước cơ bản <strong>${number.format(rate)}M</strong></span>}</p>
      </div>
      <RouteChart key={[plan.turnRound, plan.service, from.code, to.code].join('/')} from={from} to={to} animate={animate} />
    </div>
    {redirect && previous && <p className="watch-plan-diversion">Đổi đích vận đơn #{plan.bookingId} từ {previous.name} sang {to.name}.</p>}
    <p className="watch-plan-status" role="status" data-watch-reason="">{statusText}</p>
    <div className="watch-plan-actions">
      {ready && <button type="button" className="watch-plan-confirm" disabled={busy} data-watch-confirm={action.type}
        aria-label={redirect ? `${confirmLabel} cho vận đơn #${plan.bookingId} sang ${to.name}` : `${confirmLabel} từ ${from.name} đi ${to.name}`}
        onClick={() => onConfirm(action)}><ClipboardCheck aria-hidden="true" size={15} />
        {confirmLabel}
      </button>}
      {!ready && <button type="button" disabled={busy} data-watch-market="" onClick={onOpenMarket}>
        {status === 'waiting' ? 'Sửa kế hoạch' : 'So sánh cảng'} <ArrowUpRight aria-hidden="true" size={13} /></button>}
      <button type="button" className="watch-plan-clear" disabled={busy} data-watch-clear="" onClick={onClear}>
        <X aria-hidden="true" size={13} />Bỏ kế hoạch</button>
    </div>
  </section>;
}
