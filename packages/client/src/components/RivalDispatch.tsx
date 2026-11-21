import { useLayoutEffect, useState } from 'react';
import {
  BOARD_TILES, FREIGHT_RIVALS, getFreightQuote, getVoyagePayment, isFreightRivalStyle,
  type CargoBooking, type DeliveryReceipt, type FreightRivalStyle, type GameEvent, type GameState, type Player,
} from '@one-monopoly/shared';
import type { SubscribeBoard } from '../hooks/useSocket.js';
import { portGuide } from './ports/portGuide.js';
import './rival-dispatch.css';

type Service = 'laden' | 'empty' | 'reefer';
type Operation = 'berthed' | 'aboard' | 'loaded' | 'sail' | 'feeder' | 'redirected' | 'delivered' | 'returned';
interface Report {
  operation: Operation;
  action: string;
  from?: number;
  to: number;
  service?: Service;
  payment?: number;
}
const serviceNames = { laden: 'hàng xuất', empty: 'vỏ rỗng', reefer: 'hàng lạnh' };
const miles = new Intl.NumberFormat('vi-VN');
const serviceOf = (booking: Pick<CargoBooking, 'kind' | 'reeferDueRound'>): Service => booking.reeferDueRound !== undefined ? 'reefer' : booking.kind;
const port = (id: number) => portGuide[BOARD_TILES[id].code].name;

function bookingReport(booking: CargoBooking, berth?: number): Report {
  const service = serviceOf(booking);
  const deadline = booking.reeferDueRound === undefined ? '' : ` · hạn vòng ${booking.reeferDueRound}`;
  return {
    operation: berth === undefined ? 'loaded' : 'aboard', service,
    action: berth === undefined ? `Đã xếp ${serviceNames[service]}${deadline}`
      : `Đang chở ${serviceNames[service]} tại ${port(berth)}${deadline}`,
    from: booking.originTileId, to: booking.destinationTileId,
  };
}

function deliveryReport(delivery: DeliveryReceipt, historical: boolean): Report {
  const service = serviceOf(delivery);
  const label = historical ? 'Lô đã giao gần nhất ·' : 'Đã giao';
  return { operation: 'delivered', service, payment: getVoyagePayment(delivery),
    action: `${label} ${serviceNames[service]}${delivery.streetTurn ? ' · thêm 1 lô xuất tại bến' : ''}`,
    from: delivery.originTileId, to: delivery.tileId };
}

function reportFor(event: GameEvent, rival: Player): Report | null {
  if (!('playerId' in event) || event.playerId !== rival.id) return null;
  switch (event.type) {
    case 'CARGO_LOADED': return bookingReport(event);
    case 'CARGO_UNLOADED': return deliveryReport(event, false);
    case 'CARGO_RETURNED_TO_YARD': return { operation: 'returned', to: event.tileId,
      action: `Đã trả ${serviceNames[serviceOf(event)]} về bãi` };
    case 'CARGO_DESTINATION_CHANGED': return { operation: 'redirected', service: serviceOf(event),
      action: 'Đã đổi cảng đích của vận đơn', from: event.previousDestinationTileId, to: event.destinationTileId };
    case 'SHIP_STEPPED': {
      const distance = getFreightQuote(event.from, event.to)?.distanceNm;
      const leg = distance === undefined ? '' : ` · ${miles.format(distance)} hải lý`;
      return { operation: event.feeder ? 'feeder' : 'sail', service: rival.cargo && serviceOf(rival.cargo),
        action: (event.feeder ? 'Đã dùng chuyến nối cảng' : 'Đã cập cảng') + leg, from: event.from, to: event.to };
    }
    default: return null;
  }
}

function RivalVoyage({ report }: { report: Report }) {
  const moored = report.operation === 'berthed' || report.operation === 'aboard' || report.operation === 'returned';
  const atOrigin = report.operation === 'loaded' || report.operation === 'redirected';
  return <svg className="rival-rule" viewBox="0 0 104 34" aria-hidden="true" focusable="false">
    <path d="M2 26.5h100M8 27v3m8-3v2m8-2v2m8-2v3m8-3v2m8-2v2m8-2v3m8-3v2m8-2v2m8-2v3m8-3v2m8-2v2"
      fill="none" stroke="#94aaa0" strokeWidth=".8" />
    {moored ? <path d="M24 21h13m-11-2v5m8-5v5m33-3h13m-10-2v5m8-5v5" stroke="#64867f" fill="none" /> : <>
      <path d="M13 22q20 0 37-4t36-4" fill="none" stroke="#65878a" strokeWidth="1.2" strokeDasharray="3 3" />
      <circle cx="13" cy="22" r="2.5" fill="#fff9dc" stroke="#47716f" />
      <g data-rival-endpoint="to"><path d="M86 18V5l8 2-8 3" fill="#b3536f" stroke="#74465c" strokeWidth="1" /></g>
    </>}
    <g data-rival-voyage data-position={moored ? 'berth' : atOrigin ? 'origin' : 'destination'} data-service={report.service}>
      <path d="M-11-2h22l-4 5H-7Z" fill="#254a54" /><path d="M-7 3H7L5 4H-5Z" fill="#a84568" />
      <path d="M-8-3v-5h4v5" fill="#f5d89c" stroke="#3d656a" strokeWidth=".9" />
      {report.service && <g className="rival-deck-load"><path d="M-2-7h8v4h-8Z" /><path d="M0-6v2m2-2v2m2-2v2" stroke="#fff7e3" strokeOpacity=".75" strokeWidth=".6" /></g>}
    </g>
  </svg>;
}

function DispatchCard({ rival, style, subscribeBoard, onInspectPort }: {
  rival: Player; style: FreightRivalStyle; subscribeBoard: SubscribeBoard; onInspectPort: (tileId: number) => void;
}) {
  const [live, setLive] = useState<{ report: Report; revision: number; animate: boolean } | null>(null);
  useLayoutEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const settle = () => {
      if (document.hidden) setLive(null);
      else if (preference.matches) setLive(current => current?.animate ? { ...current, animate: false } : current);
    };
    const stop = subscribeBoard((next, events) => {
      const actor = next.players.find(player => player.id === rival.id);
      if (!events || document.hidden || !actor) { setLive(null); return; }
      for (let i = events.length - 1; i >= 0; i--) {
        const report = reportFor(events[i], actor);
        if (!report) continue;
        const travel = report.operation === 'feeder' || report.operation === 'sail' || report.operation === 'delivered';
        setLive({ report, revision: next.cargoRevision ?? 0, animate: travel && !preference.matches });
        break;
      }
    });
    preference.addEventListener('change', settle);
    document.addEventListener('visibilitychange', settle);
    return () => { stop(); preference.removeEventListener('change', settle); document.removeEventListener('visibilitychange', settle); };
  }, [rival.id, subscribeBoard]);

  const profile = FREIGHT_RIVALS[style];
  const report: Report = live?.report ?? (rival.cargo ? bookingReport(rival.cargo, rival.position) : rival.lastDelivery
    ? deliveryReport(rival.lastDelivery, true)
    : { operation: 'berthed', action: profile.description, to: rival.position });
  const destination = <button type="button" className="rival-port" data-rival-port={report.to}
    aria-label={`Xem cảng ${port(report.to)}`} aria-haspopup="dialog" onClick={() => onInspectPort(report.to)}>{port(report.to)}</button>;
  return <section className="rival-dispatch" data-rival-dispatch data-style={style} data-operation={report.operation}
    data-animate={live?.animate ?? false} aria-label={`Điều vận của đối thủ ${rival.name}`}>
    <div className="rival-dispatch-info" aria-live="polite" aria-atomic="true">
      <h2 title={rival.name}><span aria-hidden="true">{profile.emoji}</span> Đối thủ · {profile.shortName}</h2>
      <p><strong>{report.action}</strong>{report.payment !== undefined && <b className="rival-payment">+${report.payment}M</b>}</p>
      <small>{report.from !== undefined ? <>{port(report.from)} <span aria-hidden="true">→</span><span className="sr-only"> đến </span></> : 'Đang neo tại'} {destination}</small>
    </div>
    <RivalVoyage key={live?.revision ?? 'snapshot'} report={report} />
  </section>;
}

export function RivalDispatch({ state, myPlayerId, subscribeBoard, onInspectPort }: {
  state: GameState; myPlayerId: string | null; subscribeBoard: SubscribeBoard; onInspectPort: (tileId: number) => void;
}) {
  if (state.mode !== 'logistics' || state.players.length !== 2) return null;
  const human = state.players.find(player => player.id === myPlayerId);
  const rival = state.players.find(player => player.id !== myPlayerId);
  if (!human || human.freightRivalStyle || !rival || !isFreightRivalStyle(rival.freightRivalStyle)) return null;
  return <DispatchCard key={`${state.roomId}/${rival.id}`} rival={rival} style={rival.freightRivalStyle}
    subscribeBoard={subscribeBoard} onInspectPort={onInspectPort} />;
}
