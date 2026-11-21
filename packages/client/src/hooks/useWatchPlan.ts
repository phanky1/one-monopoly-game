import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameAction, GameState } from '@one-monopoly/shared';
import { createWatchPlan, isWatchPlan, resolveWatchPlan, type WatchPlan, type WatchService } from '../components/watchPlan.js';

function readPlan(key: string): WatchPlan | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isWatchPlan(value) ? value : null;
  } catch {
    return null;
  }
}

// The desk is keyed by room and viewer. Only the intent goes into this tab's storage.
export function useWatchPlan(state: GameState, playerId: string) {
  const key = `one-monopoly:watch-plan:${state.roomId}:${playerId}`;
  const [plan, setPlan] = useState(() => readPlan(key));
  const [drawing, setDrawing] = useState(0);
  const resolution = useMemo(() => plan ? resolveWatchPlan(state, playerId, plan) : null, [state, playerId, plan]);
  const submitting = useRef<WatchPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const store = useCallback((next: WatchPlan | null) => {
    setPlan(next);
    try {
      if (next) sessionStorage.setItem(key, JSON.stringify(next));
      else sessionStorage.removeItem(key);
    } catch {
      // A tab with storage disabled can still plan for the current session.
    }
  }, [key]);

  useEffect(() => {
    if (plan && !resolution) store(null);
  }, [plan, resolution, store]);

  function save(service: WatchService, tileId: number) {
    const next = createWatchPlan(state, playerId, service, tileId);
    if (!next) return false;
    store(next);
    setDrawing(previous => previous + 1);
    return true;
  }

  function confirm(send: (action: GameAction, failed: () => void, accepted: () => void) => void, accepted: () => void) {
    if (!plan || submitting.current) return;
    const current = resolveWatchPlan(state, playerId, plan);
    if (current?.status !== 'ready' || !current.action) return;
    submitting.current = plan;
    setBusy(true);
    const release = () => {
      if (submitting.current !== plan) return;
      submitting.current = null;
      setBusy(false);
    };
    // The authoritative manifest change retires the plan, even if its acknowledgement is delayed.
    send(current.action, release, () => { release(); accepted(); });
  }

  return { plan: resolution ? plan : null, resolution, drawing, busy, save, confirm, clear: () => store(null) };
}
