import { useLayoutEffect, useRef } from 'react';
import { BOARD_TILES, type GameEvent, type PortStock } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import { paintPort, studioLight } from './ports/projection.js';
import { buildYardShunter } from './yardShunterModel.js';
import './truck-call-receipt.css';

export type TruckCallEvent = Extract<GameEvent, { type: 'PORT_TRUCK_CALLED' }>;

const models: Partial<Record<'export' | 'import', ReturnType<typeof buildYardShunter>>> = {};

function YardGate({ operation, is3D }: { operation: TruckCallEvent['operation']; is3D: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const loaded = operation === 'export';
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const model = models[operation] ??= buildYardShunter(loaded);
    // Paint once per camera or payload. CSS moves the resulting image through the gate.
    paintPort(ctx, model, is3D ? 2.59 : Math.PI, is3D ? .32 : .03, studioLight);
  }, [operation, loaded, is3D]);
  return <div className="yard-lane" aria-hidden="true">
    <svg className="yard-ground" viewBox="0 0 184 56" preserveAspectRatio="none">
      <path d="M0 31 184 18V56H0Z" fill="#d7e2d8" />
      <path d="m0 40 184-13M0 53l184-12" stroke="#b0c1b5" strokeWidth="1" />
      <path d="m0 48 184-13" stroke="#fbf9e5" strokeWidth="1.5" strokeDasharray="9 9" />
    </svg>
    <div className="yard-shunter" data-truck-box={loaded || undefined}>
      <canvas width={294} height={114} ref={canvas} />
    </div>
    <div className="yard-gate"><i className="yard-gate-arm" /></div>
  </div>;
}

export function TruckCallReceipt({ call, captain, stock, is3D }: {
  call: TruckCallEvent; captain: string; stock: PortStock; is3D: boolean;
}) {
  const port = portGuide[BOARD_TILES[call.tileId].code];
  const loaded = call.operation === 'export';
  return <div className="truck-call-receipt" data-truck-receipt data-truck-kind={call.operation}
    data-port-code={port.code} data-view={is3D ? 'tilted' : 'flat'}>
    <YardGate operation={call.operation} is3D={is3D} />
    <div className="yard-call-copy">
      <p><b>{captain} gọi sớm {loaded ? 'xe xuất' : 'xe nhận hàng'}</b> · {port.name}</p>
      <p className="yard-call-result">{loaded ? `Đã đóng 1 vỏ rỗng · ${stock.supply} xe xuất, còn ${stock.empties} vỏ`
        : `Đã thêm 1 chỗ nhận hàng · ${stock.demand} xe nhận tại bến`}</p>
    </div>
    <small className="yard-call-schedule">Lịch vòng {call.scheduledRound}</small>
  </div>;
}
