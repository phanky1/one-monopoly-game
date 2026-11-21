import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { SubscribeBoard } from '../hooks/useSocket.js';
import './cargo-transfer.css';

interface Transfer {
  playerId: string;
  tileId: number;
  revision: number;
  operation: 'load' | 'unload';
  turnaround: boolean;
  kind: 'laden' | 'empty' | 'reefer';
}

export function useCargoTransfer(subscribe: SubscribeBoard) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const lastRevision = useRef(-1);
  useLayoutEffect(() => {
    const hide = () => { if (document.hidden) setTransfer(null); };
    const stop = subscribe((state, events) => {
      const revision = state.harborFreight?.revision ?? state.cargoRevision ?? 0;
      if (!events || document.hidden) {
        lastRevision.current = revision;
        setTransfer(null);
        return;
      }
      // The return has its own ship-to-yard scene. End any earlier loading animation.
      if (events.some(event => event.type === 'CARGO_RETURNED_TO_YARD')) {
        setTransfer(null);
        return;
      }
      const handling = events.find(event => event.type === 'CARGO_LOADED' || event.type === 'CARGO_UNLOADED' ||
        event.type === 'HARBOR_LOADED' || event.type === 'HARBOR_DISCHARGED');
      if (handling && lastRevision.current !== revision) {
        lastRevision.current = revision;
        const cargo = handling.type === 'HARBOR_DISCHARGED' ? handling.receipt : handling;
        setTransfer({
          playerId: cargo.playerId, tileId: cargo.tileId, revision,
          kind: 'kind' in cargo ? cargo.reeferDueRound !== undefined ? 'reefer' : cargo.kind : 'laden',
          operation: handling.type === 'CARGO_LOADED' || handling.type === 'HARBOR_LOADED' ? 'load' : 'unload',
          turnaround: handling.type === 'HARBOR_DISCHARGED' && !!handling.receipt.turnaround,
        });
      } else {
        setTransfer(current => {
          if (!current) return null;
          const captain = state.players.find(player => player.id === current.playerId);
          return captain && !captain.isBankrupt && captain.position === current.tileId ? current : null;
        });
      }
    });
    document.addEventListener('visibilitychange', hide);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [subscribe]);
  const finishTransfer = useCallback((played: Transfer) => {
    setTransfer(current => current === played ? null : current);
  }, []);
  return { transfer, finishTransfer };
}

interface Props {
  transfer: Transfer;
  is3D: boolean;
  motion: boolean;
  faceLeft: boolean;
  finish: (played: Transfer) => void;
}

export function CargoTransfer({ transfer, is3D, motion, faceLeft, finish }: Props) {
  const duration = motion ? 3400 : 1500;
  const [loadingExport, setLoadingExport] = useState(false);
  useLayoutEffect(() => {
    const timer = window.setTimeout(() => finish(transfer), duration);
    const handoff = transfer.turnaround && motion
      ? window.setTimeout(() => setLoadingExport(true), duration / 2) : undefined;
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(handoff);
    };
  }, [duration, finish, motion, transfer]);

  const operation = transfer.turnaround && (loadingExport || !motion) ? 'load' : transfer.operation;
  return (
    <span className="cargo-transfer" aria-hidden="true" data-player-id={transfer.playerId}
      data-tile-id={transfer.tileId} data-operation={operation} data-turnaround={transfer.turnaround || undefined}
      data-cargo-kind={transfer.kind} data-view={is3D ? 'tilted' : 'flat'}
      data-motion={motion ? 'move' : 'still'} data-face={faceLeft ? 'left' : 'right'}>
      <span key={operation} className="cargo-berth">
        <span className="cargo-gantry"><i className="cargo-mast" /><i className="cargo-jib" /><i className="cargo-machinery" /></span>
        <span className="cargo-box cargo-ship-box" />
        <span className="cargo-truck">
          <i className="cargo-chassis" /><i className="cargo-cab" />
          <i className="cargo-wheel cargo-wheel-back" /><i className="cargo-wheel cargo-wheel-front" />
          <i className="cargo-box cargo-truck-box" />
        </span>
        <span className="cargo-trolley">
          <span className="cargo-cables"><i className="cargo-spreader" /><i className="cargo-box cargo-suspended-box" /></span>
        </span>
      </span>
    </span>
  );
}
