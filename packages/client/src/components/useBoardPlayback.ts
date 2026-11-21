import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { BOARD_TILES, type GameEvent, type GameState } from '@one-monopoly/shared';
import type { SubscribeBoard } from '../hooks/useSocket.js';
import { buildTravelFrames, restingPose, type Pose, type TravelFrame } from './boardTravel.js';
import { readPortLanding, updatePortDischarge, updatePortLoad, type PortDischarge, type PortLoad } from './ports/portArrival.js';
import type { PortArrival, PortGuide } from './ports/portGuide.js';

export interface RentLine {
  playerId: string;
  playerName: string;
  amount: number;
  type: 'deduct' | 'credit';
}

export interface RentReceipt {
  tileId: number;
  lines: RentLine[];
}

export function recordArrivalRent(arrival: PortArrival | null, receipt: RentReceipt): PortArrival | null {
  if (!arrival?.playerId || arrival.port.code !== BOARD_TILES[receipt.tileId]?.code) return arrival;
  const debit = receipt.lines.find(line => line.type === 'deduct' && line.playerId === arrival.playerId);
  return debit && arrival.paidRent !== debit.amount ? { ...arrival, paidRent: debit.amount } : arrival;
}

export function parseRentReceiptFromEvent(
  event: GameEvent,
  players: Array<{ id: string; name: string }>
): RentReceipt | null {
  if (event.type === 'DEMURRAGE_PAID') {
    const debtor = players.find((p) => p.id === event.debtorId);
    const creditor = players.find((p) => p.id === event.creditorId);
    return {
      tileId: event.tileId,
      lines: [
        {
          playerId: event.debtorId,
          playerName: debtor?.name ?? 'Khách',
          amount: event.amount,
          type: 'deduct',
        },
        {
          playerId: event.creditorId,
          playerName: creditor?.name ?? 'Chủ cảng',
          amount: event.amount,
          type: 'credit',
        },
      ],
    };
  }

  if (event.type === 'SLOT_CHARTER_RENT_SPLIT') {
    const visitor = players.find((p) => p.id === event.visitorId);
    const owner = players.find((p) => p.id === event.ownerId);
    const partner = players.find((p) => p.id === event.partnerId);
    return {
      tileId: event.tileId,
      lines: [
        {
          playerId: event.visitorId,
          playerName: visitor?.name ?? 'Khách',
          amount: event.ownerAmount + event.splitAmount,
          type: 'deduct',
        },
        {
          playerId: event.ownerId,
          playerName: owner?.name ?? 'Chủ cảng',
          amount: event.ownerAmount,
          type: 'credit',
        },
        {
          playerId: event.partnerId,
          playerName: partner?.name ?? 'Đối tác',
          amount: event.splitAmount,
          type: 'credit',
        },
      ],
    };
  }

  return null;
}

export interface TileClaim { tileId: number; playerId: string; swapId?: number }
interface Track {
  settled: Pose;
  frames: TravelFrame[];
}

function snapshot(state: GameState): Record<string, Track> {
  return Object.fromEntries(state.players.map((player) =>
    [player.id, { settled: restingPose(player.position), frames: [] }]));
}

export function useBoardPlayback(initialState: GameState, subscribe: SubscribeBoard) {
  const [tracks, setTracks] = useState(() => snapshot(initialState));
  const [atlas, setAtlas] = useState<PortArrival | null>(null);
  const [portDischarge, setPortDischarge] = useState<PortDischarge | null>(null);
  const [portLoad, setPortLoad] = useState<PortLoad | null>(null);
  const atlasSequence = useRef(0);
  const showPort = (port: PortGuide) => setAtlas({ id: ++atlasSequence.current, port });
  const closeAtlas = () => setAtlas(null);
  const [claims, setClaims] = useState<Record<number, TileClaim>>({});
  const [rentReceipts, setRentReceipts] = useState<Record<number, RentReceipt>>({});
  const [pendingRentReceipts, setPendingRentReceipts] = useState<Record<number, RentReceipt>>({});
  const rentExpiry = useRef(new Map<number, ReturnType<typeof setTimeout>>()).current;

  useLayoutEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const skipTravel = () => preference.matches || document.hidden;
    const settlePending = () => {
      if (document.hidden) { setAtlas(null); setPortDischarge(null); setPortLoad(null); }
      if (!skipTravel()) return;
      setTracks((tracks) => Object.fromEntries(Object.entries(tracks).map(([id, track]) => [
        id, { settled: track.frames.at(-1) ?? track.settled, frames: [] },
      ])));
    };
    preference.addEventListener('change', settlePending);
    document.addEventListener('visibilitychange', settlePending);
    const claimExpiry = new Map<number, ReturnType<typeof setTimeout>>();

    const resetTimers = () => {
      claimExpiry.forEach(clearTimeout);
      claimExpiry.clear();
      rentExpiry.forEach(clearTimeout);
      rentExpiry.clear();
    };

    const unsubscribe = subscribe((state, events) => {
      const freightEvents = state.mode === 'logistics' && !document.hidden ? events : null;
      setPortDischarge(previous => updatePortDischarge(previous, freightEvents));
      setPortLoad(previous => updatePortLoad(previous, freightEvents));
      if (events === null) {
        resetTimers();
        setAtlas(null);
        setClaims({});
        setRentReceipts({});
        setPendingRentReceipts({});
        setTracks(snapshot(state));
        return;
      }

      const landing = document.hidden ? null : readPortLanding(state, events);
      if (landing !== undefined) setAtlas(landing ? { id: ++atlasSequence.current, ...landing } : null);

      setTracks((prev) => {
        const next = { ...prev };
        for (const player of state.players) {
          const existing = prev[player.id];
          if (!existing) {
            next[player.id] = { settled: restingPose(player.position), frames: [] };
            continue;
          }
          const projected = existing.frames.at(-1) ?? existing.settled;
          const additions = buildTravelFrames(projected, player.id, events, state.mode === 'logistics');
          const arrival = additions.at(-1) ?? projected;
          if (arrival.tile !== player.position) {
            next[player.id] = { settled: restingPose(player.position), frames: [] };
          } else if (skipTravel()) {
            next[player.id] = { settled: arrival, frames: [] };
          } else if (additions.length) {
            next[player.id] = { settled: existing.settled, frames: [...existing.frames, ...additions] };
          }
        }
        return next;
      });

      function markClaim(entry: TileClaim) {
        const { tileId } = entry;
        clearTimeout(claimExpiry.get(tileId));
        setClaims((prev) => ({ ...prev, [tileId]: entry }));
        claimExpiry.set(tileId, setTimeout(() => {
          setClaims((prev) => {
            const next = { ...prev };
            delete next[tileId];
            return next;
          });
          claimExpiry.delete(tileId);
        }, 1800));
      }

      for (const event of events) {
        if (event.type === 'TILE_PURCHASED') markClaim(event);
        else if (event.type === 'TRADE_CLOSED' && event.result === 'ACCEPTED') {
          const { id, tileId, buyerId, sellerId, offeredTileId } = event.offer;
          markClaim({ tileId, playerId: buyerId, swapId: offeredTileId !== undefined ? id : undefined });
          if (offeredTileId !== undefined) markClaim({ tileId: offeredTileId, playerId: sellerId, swapId: id });
        }
        const receipt = parseRentReceiptFromEvent(event, state.players);
        if (receipt) {
          setPendingRentReceipts((prev) => ({ ...prev, [receipt.tileId]: receipt }));
          if (state.mode === 'harbor') setAtlas(prev => recordArrivalRent(prev, receipt));
        }
      }
    });
    return () => {
      unsubscribe();
      resetTimers();
      preference.removeEventListener('change', settlePending);
      document.removeEventListener('visibilitychange', settlePending);
    };
  }, [subscribe, rentExpiry]);

  // Wait for the actual dice and pawn queue, including travel already in progress
  // when a follow-up event (such as a charter decision) collects the rent.
  useLayoutEffect(() => {
    const arrived = Object.values(pendingRentReceipts).filter(receipt =>
      !tracks[receipt.lines[0].playerId]?.frames.length);
    if (arrived.length === 0) return;

    setPendingRentReceipts((prev) => {
      const next = { ...prev };
      for (const receipt of arrived) {
        if (next[receipt.tileId] === receipt) delete next[receipt.tileId];
      }
      return next;
    });
    setRentReceipts((prev) => {
      const next = { ...prev };
      for (const receipt of arrived) next[receipt.tileId] = receipt;
      return next;
    });
    for (const { tileId } of arrived) {
      clearTimeout(rentExpiry.get(tileId));
      rentExpiry.set(tileId, setTimeout(() => {
        setRentReceipts((prev) => {
          const next = { ...prev };
          delete next[tileId];
          return next;
        });
        rentExpiry.delete(tileId);
      }, 2500));
    }
  }, [pendingRentReceipts, tracks, rentExpiry]);

  const advance = useCallback((id: string, frame: TravelFrame) => {
    setTracks((prev) => {
      const track = prev[id];
      if (track?.frames[0] !== frame) return prev;
      return { ...prev, [id]: { settled: frame, frames: track.frames.slice(1) } };
    });
  }, []);

  return { tracks, claims, rentReceipts, pendingRentReceipts, advance, atlas, showPort, closeAtlas, portDischarge, portLoad };
}
