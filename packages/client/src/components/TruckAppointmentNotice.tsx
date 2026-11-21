import { useLayoutEffect, useRef, useState } from 'react';
import { getImportTruckReservation, type GameState } from '@one-monopoly/shared';
import type { SubscribeBoard } from '../hooks/useSocket.js';
import { paintPort, studioLight } from './ports/projection.js';
import { buildYardShunter } from './yardShunterModel.js';
import './truck-appointments.css';

let pickupTractor: ReturnType<typeof buildYardShunter> | undefined;

function AppointmentLane({ is3D }: { is3D: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    pickupTractor ??= buildYardShunter(false);
    // Both views use the original empty chassis. The painted truck moves as one layer.
    paintPort(ctx, pickupTractor, is3D ? 2.59 : Math.PI, is3D ? .31 : .035, studioLight);
  }, [is3D]);
  return <div aria-hidden="true" className="appointment-lane">
    <svg className="appointment-bay" viewBox="0 0 144 49" preserveAspectRatio="none" focusable="false">
      <path d="M0 0h144v49H0z" fill="#e6eee3" />
      <path d={is3D ? 'M0 27 144 13v36H0Z' : 'M0 28h144v21H0Z'} fill="#bccbc0" />
      <path d={is3D ? 'm1 44 45-4' : 'M1 42h45'} fill="none" stroke="#ffffe9" strokeWidth="1.5" strokeDasharray="7 4" />
      <path d={is3D ? 'm42 40 8-6 10-1m67-6 7-1 5 8-10 1m-78 7-11 1 4-4' : 'M46 40v-7h12m69 0h11v9h-11m-81-3v3h12'}
        fill="none" stroke="#fff5c4" strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M12 29V12" stroke="#45675f" strokeWidth="2" />
      <rect x="5" y="5" width="15" height="13" rx="1" fill="#36615d" />
      <path d="M10 15V8.5h3a1.7 1.7 0 0 1 0 3.4h-3" fill="none" stroke="#fff9df" strokeWidth="1.5" />
    </svg>
    <div className="appointment-tractor"><canvas width={248} height={88} ref={canvas} /></div>
  </div>;
}

function heldTrucks(state: GameState, tileId: number) {
  return state.players.flatMap(player => {
    const hold = getImportTruckReservation(state, player.id);
    return hold?.destinationTileId === tileId
      ? [{ ...hold, player, key: `${player.id}/${hold.bookingId}` }] : [];
  });
}

export function TruckAppointmentNotice({ state, tileId, is3D, subscribeBoard }: {
  state: GameState; tileId: number; is3D: boolean; subscribeBoard?: SubscribeBoard;
}) {
  const [arrivals, setArrivals] = useState<ReadonlySet<string>>(() => new Set());
  const latestState = useRef(state);
  useLayoutEffect(() => { latestState.current = state; }, [state]);
  useLayoutEffect(() => {
    if (!subscribeBoard) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const parked = () => setArrivals(current => current.size ? new Set() : current);
    const onPreference = () => { if (preference.matches || document.hidden) parked(); };
    let previous = new Set(heldTrucks(latestState.current, tileId).map(hold => hold.key));
    const stop = subscribeBoard((next, events) => {
      const active = new Set(heldTrucks(next, tileId).map(hold => hold.key));
      if (!events || preference.matches || document.hidden) parked();
      else {
        const newBookings = events.flatMap(event => {
          if (event.type !== 'IMPORT_TRUCK_RESERVED' || event.destinationTileId !== tileId) return [];
          const key = `${event.playerId}/${event.bookingId}`;
          return active.has(key) && !previous.has(key) ? [key] : [];
        });
        if (newBookings.length) setArrivals(current => new Set([...current, ...newBookings]));
      }
      previous = active;
    });
    document.addEventListener('visibilitychange', onPreference);
    preference.addEventListener('change', onPreference);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onPreference);
      preference.removeEventListener('change', onPreference);
    };
  }, [tileId, subscribeBoard]);

  const holds = heldTrucks(state, tileId);
  if (!holds.length) return null;
  return <section className="truck-appointments" data-truck-appointments={tileId} aria-label="Xe nhận hàng đã giữ chỗ">
    <h4>Xe nhận hàng đã giữ chỗ</h4>
    <ul>{holds.map(hold => (
      <li key={hold.key} data-held-truck data-booking-id={hold.bookingId} data-player-id={hold.player.id}
        data-through-round={hold.throughRound} data-view={is3D ? 'tilted' : 'flat'} data-animate={arrivals.has(hold.key)}>
        <AppointmentLane is3D={is3D} />
        <div><strong>{hold.player.name}</strong><small>Vận đơn #{hold.bookingId} · Giữ đến hết vòng {hold.throughRound}</small></div>
      </li>
    ))}</ul>
  </section>;
}
