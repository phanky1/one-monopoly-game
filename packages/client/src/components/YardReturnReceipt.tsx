import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { BOARD_TILES, type GameEvent, type PortStock } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import { paintPort, studioLight } from './ports/projection.js';
import { buildYardShunter } from './yardShunterModel.js';
import './yard-return-receipt.css';

export type YardReturnEvent = Extract<GameEvent, { type: 'CARGO_RETURNED_TO_YARD' }>;
export type YardReturnRecord = { event: YardReturnEvent; captain: string; stock: PortStock; revision: number };
type Service = 'dry' | 'reefer' | 'empty';
let bareChassis: ReturnType<typeof buildYardShunter> | undefined;

function ExportChassis({ tilted }: { tilted: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paintPort(ctx, bareChassis ??= buildYardShunter(false), tilted ? 2.76 : Math.PI, tilted ? .28 : 0, studioLight);
  }, [tilted]);
  return <foreignObject x="152" y="45" width="86" height="34" data-yard-return-endpoint="truck">
    <canvas ref={canvas} width="258" height="102" />
  </foreignObject>;
}

const paint = {
  dry: ['#a53c67', '#d27993', '#79304f', '#d27691'],
  reefer: ['#e5ebe1', '#fff7e7', '#9baea5', '#acbcb4'],
  empty: ['#498780', '#89b6a5', '#315f61', '#77a699'],
} as const;

function Container({ service, tilted }: { service: Service; tilted: boolean }) {
  const [side, roof, doors, ribs] = paint[service];
  return <g transform={tilted ? 'skewY(5)' : undefined} strokeLinejoin="round">
    <rect x="-24" y="-16" width="48" height="16" rx=".7" fill={side} stroke={doors} strokeWidth=".9" />
    {tilted && <><path d="m-24 -16 6 -4h48l-6 4Z" fill={roof} stroke={doors} strokeWidth=".6" />
      <path d="m24 -16 6 -4v16l-6 4Z" fill={doors} />
      <path d="m26 -16 .1 13m2-15 .1 13" fill="none" stroke={roof} strokeWidth=".8" /></>}
    <path d="M-20 -13v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10"
      fill="none" stroke={ribs} strokeWidth="1.6" />
    <path d="M-23 -14h46m-46 12h46" stroke={doors} strokeWidth=".8" />
    {service === 'reefer' && <g fill="#496973">
      <rect x="-22" y="-14" width="12" height="12" rx=".6" />
      <circle cx="-16" cy="-8" r="4.2" fill="#a9c5bd" />
      <path d="m-16 -12 2 3-2 1Zm4 4-3 2-1-2Zm-4 4-2-3 2-1Zm-4-4 3-2 1 2Z" />
    </g>}
    {service === 'empty' && <path d="M15 -12v8m5-8v8" stroke="#d3d9bf" strokeWidth="1.3" />}
  </g>;
}

function Vessel({ tilted }: { tilted: boolean }) {
  return <g>
    <path d="M2 59h83l9-6-10 17-13 5H16l-11-6Z" fill="#224754" />
    <path d="m6 68 11 4h54l14-4-5 6-9 3H18L9 73Z" fill="#9e475d" />
    {tilted && <path d="m2 59 8-5h69l15-1-9 7H4Z" fill="#a9b8a9" />}
    <path d="M4 59h79l7-4" fill="none" stroke="#ede3bb" strokeWidth="1.6" />
    <path d="M11 58V43h13v5h7v10Z" fill="#f6eacc" stroke="#557478" strokeWidth=".9" />
    {tilted && <path d="m24 43 5-3v5l7 1v8l-5 4V48h-7Z" fill="#b3c4b3" />}
    <path d="M10 42h15v3H10Zm1 9h18v2H11Z" fill="#4c7375" />
    <path d="M13 46h3v3h-3Zm5 0h4v3h-4Z" fill="#28545e" />
    <path d="M15 41v-8h5v8Z" fill="#ae5360" /><path d="M15 33h5v3h-5Z" fill="#34474d" />
    <path d="M26 46V33m-2 5h7" stroke="#557475" />
    <circle cx="14" cy="55.7" r="2.2" fill="#df793f" /><circle cx="14" cy="55.7" r=".85" fill="#f8eaca" />
    <path d="M11 65h5m53 1h4m4-3h3" stroke="#dbe7d1" strokeWidth="1.3" />
  </g>;
}

function YardReturnScene({ service, stock, is3D, animate }: { service: Service; stock: PortStock; is3D: boolean; animate: boolean }) {
  const empty = service === 'empty';
  const stacked = empty && stock.empties > 1;
  const start = 59;
  const rest = empty ? (stacked ? 52 : 68) : (is3D ? 62 : 65);
  const boxHeight = is3D ? 19 : 17;
  const head = rest - boxHeight;
  const variables = {
    '--return-end-x': empty ? '208px' : (is3D ? '179px' : '182px'),
    '--return-start-y': `${start}px`, '--return-end-y': `${rest}px`,
    '--return-hook-start': `${start - boxHeight}px`, '--return-hook-up': `${38 - boxHeight}px`,
    '--return-hook-down': `${head}px`, '--return-hook-final': `${head - 9}px`,
    '--return-wire-start': start - boxHeight - 13, '--return-wire-up': 38 - boxHeight - 13,
    '--return-wire-down': head - 13, '--return-wire-final': head - 9 - 13,
  } as CSSProperties;
  return <svg className="yard-return-scene" data-yard-return-scene data-animate={animate} aria-hidden="true"
    viewBox="0 0 248 86" style={variables}>
    <path d="M0 0h248v86H0Z" fill="#e7eee1" />
    <path d="M0 42h13v-4h13v4h14l5-4h12v4h17v-7h8v6h15v-4h20v4h31v-8h8v7h12v-5l8-5h16l10 5v5h13v-9h10v8h17v10H0Z" fill="#c5d6c6" />
    <path d="M0 49h248v37H0Z" fill="#a5cebe" /><path d="M3 80h14m5 2h18m11-2h25m2 3h7M2 54h9" stroke="#d6e9d7" />
    <path d={is3D ? 'M83 86l12-17 18-22h135v39Z' : 'M89 49h159v37H89Z'} fill="#d3d6bd" />
    <path d={is3D ? 'm83 86 12-17 18-22' : 'M89 49v37'} stroke="#768f83" strokeWidth="2" fill="none" />
    <path d="M111 72h133m-134 7h134" stroke="#a9b7a4" strokeWidth="1" />
    <path d="M151 77h88" stroke="#f6f0cd" strokeWidth="1.3" strokeDasharray="8 6" />
    <Vessel tilted={is3D} />
    <g className="yard-return-gantry">
      {is3D && <g transform="translate(6 -3)" stroke="#83a69a" strokeWidth="3.7" fill="none">
        <path d="m102 67 10-52h15l13 52M39 12h188" /></g>}
      <path d="m98 70 13-55h4l-11 55Zm42 0-15-55h-4l13 55Z" fill="#417470" />
      <path d="m108 43 20-12m-22 24 24-13m-24 13 22-24" fill="none" stroke="#69978b" strokeWidth="1.5" />
      <path d="M36 8h190v6H36Z" fill="#437974" />
      <path d="M38 9h185M99 68h8m25 0h10" stroke="#b5b899" strokeWidth="2" />
      <path d="M38 6h187M39 7V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3m13 4V3" stroke="#71958a" strokeWidth=".85" />
      <path d="M110 18h16v12h-16Z" fill="#d3a05f" /><path d="M112 19h11v6h-11Z" fill="#557779" />
      <path d="M111 26h15" stroke="#f0dcab" />
      <path d="M96 71h12m24 0h12" stroke="#3f5759" strokeWidth="2.6" />
    </g>
    {empty ? <g data-yard-return-endpoint="depot">
      <path d="M178 68h58m-58 3h60" stroke="#809185" strokeWidth="2" />
      {stacked && <g transform="translate(208 68)"><Container service="empty" tilted={is3D} /></g>}
      {stock.empties > 2 && <g transform="translate(158 66) scale(.74)"><Container service="empty" tilted={is3D} /></g>}
      {stock.empties > 3 && <g transform="translate(158 54) scale(.74)"><Container service="empty" tilted={is3D} /></g>}
    </g> : <ExportChassis tilted={is3D} />}
    <g className="yard-return-traverse">
      <g className="yard-return-load" data-yard-return-container><Container service={service} tilted={is3D} /></g>
      <g transform="translate(0 13)"><g className="yard-return-wires" fill="none" stroke="#435d60" strokeWidth="1.1">
        <path d="M-14 0v1m28-1v1" vectorEffect="non-scaling-stroke" /></g></g>
      <g className="yard-return-hook" data-yard-return-spreader>
        <path d="M-20 -1h40v3h-40Z" fill="#d99d43" stroke="#7a693e" strokeWidth=".6" />
        <path d="m-18 1 2-2m27 2 2-2m2 2 2-2" stroke="#795940" strokeWidth="1.4" />
      </g>
      <rect x="-17" y="9" width="34" height="5" rx="1" fill="#b47542" />
      <path d="M-17 10h34" stroke="#efc078" strokeWidth="1.4" />
    </g>
  </svg>;
}

export function YardReturnReceipt({ event, captain, stock, is3D, animate = true }: {
  event: YardReturnEvent; captain: string; stock: PortStock; is3D: boolean; animate?: boolean;
}) {
  const port = portGuide[BOARD_TILES[event.tileId].code];
  const service: Service = event.kind === 'empty' ? 'empty' : event.reeferDueRound !== undefined ? 'reefer' : 'dry';
  const cargo = service === 'empty' ? 'vỏ rỗng' : service === 'reefer' ? 'hàng lạnh' : 'hàng khô';
  const count = service === 'empty' ? stock.empties : stock.supply;
  return <div className="yard-return-receipt" data-yard-return-receipt data-return-kind={service}
    data-view={is3D ? 'tilted' : 'flat'} data-port-code={port.code}>
    <YardReturnScene service={service} stock={stock} is3D={is3D} animate={animate} />
    <div className="yard-return-copy">
      <p><b>{captain}</b> đã trả {cargo} tại <b>{port.name}</b>.</p>
      <p data-yard-return-stock={count}>Bãi chung có <b>{count} {service === 'empty' ? 'vỏ rỗng' : 'lô hàng xuất'}</b>. Cước $0M.</p>
    </div>
  </div>;
}
