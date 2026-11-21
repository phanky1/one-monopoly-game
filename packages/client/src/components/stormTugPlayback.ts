import { useCallback, useLayoutEffect, useState } from 'react';
import type { GameEvent, GameState } from '@one-monopoly/shared';
import type { SubscribeBoard } from '../hooks/useSocket.js';

export interface StormRescue {
  playerId: string;
  tileId: number;
  sequence: number;
}

export function nextStormRescue(
  current: StormRescue | null,
  state: GameState,
  events: GameEvent[] | null,
): StormRescue | null {
  if (!events) return null;
  const resolution = events.find(event => event.type === 'STORM_RESOLVED');
  if (resolution) {
    const player = state.players.find(p => p.id === resolution.playerId);
    return resolution.choice === 'TUG' && player && !player.isBankrupt
      ? { playerId: player.id, tileId: player.position, sequence: (current?.sequence ?? 0) + 1 }
      : null;
  }
  if (!current) return null;
  const player = state.players.find(p => p.id === current.playerId);
  if (!player || player.isBankrupt || player.position !== current.tileId ||
      events.some(event => event.type === 'DICE_ROLLED' && event.playerId === player.id)) return null;
  return current;
}

export function useStormTugRescue(subscribe: SubscribeBoard) {
  const [rescue, setRescue] = useState<StormRescue | null>(null);
  useLayoutEffect(() => {
    const unsubscribe = subscribe((state, events) => {
      const liveEvents = document.hidden ? null : events;
      setRescue(current => nextStormRescue(current, state, liveEvents));
    });
    const hide = () => { if (document.hidden) setRescue(null); };
    document.addEventListener('visibilitychange', hide);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [subscribe]);

  const finishRescue = useCallback((played: StormRescue) => {
    setRescue(current => current === played ? null : current);
  }, []);
  return { rescue, finishRescue };
}
