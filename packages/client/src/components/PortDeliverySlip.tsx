import type { CSSProperties } from 'react';
import { BOARD_TILES, getVoyagePayment, type DeliveryReceipt, type GameEvent } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import { StreetTurnScene } from './StreetTurnScene.js';
import { WaybillAmendment } from './WaybillAmendment.js';
import './port-delivery-slip.css';

type Loading = Extract<GameEvent, { type: 'CARGO_LOADED' }>;
type Service = 'laden' | 'empty' | 'reefer';
const serviceNames: Record<Service, string> = { laden: 'Hàng xuất', empty: 'Vỏ rỗng', reefer: 'Hàng lạnh' };

function FreightBox({ service, depth }: { service: Service; depth: number }) {
  // The world-space depth projects to the right and upwards in the tilted view.
  return <g className="quay-freight-box" data-service={service}>
    {depth > 0 && <>
      <path className="quay-box-roof" d={`M0 0l${depth} ${-depth / 2}h29L29 0Z`} />
      <path className="quay-box-end" d={`M29 0l${depth} ${-depth / 2}v13L29 13Z`} />
    </>}
    <rect className="quay-box-front" width="29" height="13" rx=".5" />
    <path className="quay-box-ribs" d="M3 1v11m4-11v11m4-11v11m4-11v11m4-11v11m4-11v11m4-11v11" />
    {service === 'reefer' && <g stroke="#25586a" strokeWidth="1.2" strokeLinecap="round">
      <rect width="10" height="11" x="1" y="1" rx="1" fill="#fffdf1" stroke="#749a9d" />
      <path d="M6 2.7v7.5M2.8 4.5l6.4 3.8m0-3.8L2.8 8.3" />
    </g>}
  </g>;
}

function HandoffScene({ service, is3D, loading = false }: { service: Service; is3D: boolean; loading?: boolean }) {
  const yard = service === 'empty';
  const depth = is3D ? 6 : 0;
  // The lower box in the yard sits three units higher than the receiving truck's chassis.
  const restY = yard ? 24 : 27;
  const style = { '--quay-rest-y': `${restY}px`, '--quay-contract-cable': restY - 11 } as CSSProperties;
  return <figure className="quay-handoff" data-handoff={loading ? 'load' : 'unload'} style={style}>
    <svg viewBox="0 0 300 59" aria-hidden="true" focusable="false">
      <path fill="#e3ebe0" d="M0 0h300v59H0z" />
      <path fill="#a5c9c1" d="M0 38h122v21H0z" />
      <path fill="#c4ccba" d={is3D ? 'm115 37 15-8 170 1v29H115z' : 'M115 38h185v21H115z'} />
      <path fill="#9aaea2" d="M115 38h185v3H115z" />
      <path d="m3 53 24 .5m21 2 25-.4m14-3 15 .2m29-.2 159-1" fill="none" stroke="#f6f4df" strokeWidth="1.2" />

      <g fill="none" strokeLinejoin="round">
        {is3D && <path d="m136 41 5-37h8l9 37m-4 0-7-36" stroke="#6d8e82" strokeWidth="2.5" />}
        <path d="M125 46 136 6h7l15 40m-27-19h19m-17-1 18 13m-19 0 16-13" stroke="#536e67" strokeWidth="2.7" />
        <path d="M43 7h208v4H43z M58 10 68 5l13 5 13-5 13 5 13-5 13 5 13-5 13 5 13-5 13 5 13-5 13 5 13-5 13 5" stroke="#40655d" strokeWidth="1.5" />
        <path d="M47 6h198" stroke="#ddad5f" strokeWidth="2" />
      </g>

      <g data-quay-receiver={loading ? 'ship' : undefined}>
        {is3D && <path d="m9 39 8-4h89l-8 5z" fill="#c0aa84" />}
        <path d="M8 38h96l-7 9-7 3H23l-8-4z" fill="#315761" />
        <path d="m15 45 10 3h66l8-4-5 6-5 2H25z" fill="#9e5360" />
        <path d="M16 36h16v-9H17zm4-10h11v-3H20z" fill="#f4e5bb" />
        <path d="M19 29h10m-12 9h84" stroke="#48636a" strokeWidth="2" />
        <path d="M35 36h16l3 2H34z" fill="#b29d78" />
        <path d="M37 35h14m-12-1v3m5-3v3m5-3v3" fill="none" stroke="#72857b" strokeWidth=".8" />
      </g>
      {yard ? <g data-quay-source={loading ? 'yard' : undefined} data-quay-receiver={loading ? undefined : 'yard'}>
        <path d="M214 51h61" fill="none" stroke="#8e9e87" strokeWidth="2" />
        <g transform="translate(248 37) scale(.86 1)"><FreightBox service="empty" depth={depth} /></g>
        <g transform="translate(218 37)"><FreightBox service="empty" depth={depth} /></g>
      </g> : <g data-quay-source={loading ? 'truck' : undefined} data-quay-receiver={loading ? undefined : 'truck'}>
        <path d="M212 40h47l2-4h10l3 7v3h-62z" fill="#34555e" />
        <path d="M255 40V29h10l7 7v6h-17z" fill="#e5b849" />
        {is3D && <path d="m255 29 4-3h10l7 8-4 3-7-8z" fill="#f7d274" />}
        <path d="M258 31h6l4 5h-10z" fill="#37626c" />
        <path d="M216 41h36" stroke="#e4ad58" strokeWidth="2" />
        {[220, 228, 252, 265].map(x => <g key={x}>
          <circle cx={x} cy="46" r="3.6" fill="#2e4144" /><circle cx={x} cy="46" r="1.5" fill="#b5c0b0" />
        </g>)}
      </g>}
      <g className="quay-trolley">
        <rect x="-1" y="7" width="31" height="4" rx="1" fill="#c59245" stroke="#47645b" strokeWidth=".7" />
        <g transform="translate(0 11)"><g className="quay-hoist-cables">
          <path d="M2 0v1m25-1v1" stroke="#485c56" fill="none" strokeWidth=".8" vectorEffect="non-scaling-stroke" />
        </g></g>
      </g>
      <g className={loading ? 'quay-loaded-box' : 'quay-discharged-box'} data-quay-load><FreightBox service={service} depth={depth} /></g>
    </svg>
    <figcaption aria-hidden={loading || undefined}>
      <span>Trên tàu</span><span>Cẩu bờ</span><span>{yard ? 'Bãi vỏ rỗng' : loading ? 'Xe chở hàng xuất' : 'Xe nhận hàng'}</span>
    </figcaption>
    {loading && <span className="sr-only">{yard ? 'Cẩu bờ đã xếp vỏ rỗng từ bãi lên tàu.' : 'Cẩu bờ đã xếp container từ xe chở hàng xuất lên tàu.'}</span>}
  </figure>;
}

export function PortLoadingSlip({ event, captainName, is3D, animate = true }: {
  event: Loading; captainName: string; is3D: boolean; animate?: boolean;
}) {
  const origin = portGuide[BOARD_TILES[event.originTileId].code];
  const destination = portGuide[BOARD_TILES[event.destinationTileId].code];
  const service: Service = event.reeferDueRound !== undefined ? 'reefer' : event.kind;
  return <section className="port-delivery-slip port-loading-slip" data-terminal-load-slip data-booking-id={event.bookingId} tabIndex={-1}
    data-origin-port={origin.code} data-booked-port={destination.code} data-cargo-service={service}
    data-view={is3D ? 'tilted' : 'flat'} data-animate={animate} aria-label="Phiếu xếp hàng" role="status">
    <div className="quay-receipt-heading"><h4>Phiếu xếp hàng <small>#{event.bookingId}</small></h4>
      <b className="quay-aboard">Đã lên tàu</b>
    </div>
    <p className="quay-receipt-route">{origin.name} <span aria-hidden="true">→</span><span className="sr-only">đến</span> {destination.name}
      <small>{serviceNames[service]} · {captainName}</small>
    </p>
    <HandoffScene service={service} is3D={is3D} loading />
  </section>;
}

export function PortDeliverySlip({ event, captainName, is3D, animate = true }: {
  event: DeliveryReceipt; captainName: string; is3D: boolean; animate?: boolean;
}) {
  const origin = portGuide[BOARD_TILES[event.originTileId].code];
  const port = portGuide[BOARD_TILES[event.tileId].code];
  const service: Service = event.reeferDueRound !== undefined ? 'reefer' : event.kind;
  const payment = getVoyagePayment(event);
  return <section className="port-delivery-slip" data-terminal-receipt data-booking-id={event.bookingId} tabIndex={-1}
    data-origin-port={origin.code} data-discharge-port={port.code} data-cargo-service={service}
    data-payout={payment} data-view={is3D ? 'tilted' : 'flat'} data-animate={animate} data-street-turn={event.streetTurn}
    aria-label="Phiếu giao nhận" role="status">
    <div className="quay-receipt-heading"><h4>Phiếu giao nhận <small>#{event.bookingId}</small></h4>
      <b className="quay-payment" aria-label={`Đã nhận ${payment} triệu đô la`}>+${payment}M</b>
    </div>
    <p className="quay-receipt-route">{origin.name} <span aria-hidden="true">→</span><span className="sr-only">đến</span> {port.name}
      <small>{serviceNames[service]} · {captainName}</small>
    </p>
    {event.streetTurn ? <>
      <StreetTurnScene is3D={is3D} animate={animate} />
      <p className="quay-receipt-route" data-street-turn-result>Thêm 1 lô hàng xuất tại {port.name}. Mọi tàu đều có thể đặt lô này.</p>
    </> : <HandoffScene service={service} is3D={is3D} />}
    <WaybillAmendment booking={event} />
    <p className="quay-fares"><span>Cước ${event.reward}M</span>
      {event.reeferBonus !== undefined && <span>Hàng lạnh +${event.reeferBonus}M</span>}
      {!!event.tenderBonus && <span>Hợp đồng +${event.tenderBonus}M</span>}
      {!!event.backhaulBonus && <span>Chuyến về +${event.backhaulBonus}M</span>}
    </p>
  </section>;
}
