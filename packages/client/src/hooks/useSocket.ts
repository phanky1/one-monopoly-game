import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameAction, GameEvent, GameState, VesselToken, type FreightRivalStyle, type GameMode } from '@one-monopoly/shared';

import { DICE_ROLL_MS } from '../components/boardTravel.js';

// A null event list is an authoritative snapshot, including after a reconnect.
export type BoardUpdateListener = (state: GameState, events: GameEvent[] | null) => void;
export type SubscribeBoard = (listener: BoardUpdateListener) => () => void;

export interface RoomState {
  id: string;
  hostId: string;
  players: Array<{
    id: string;
    name: string;
    token: VesselToken;
    freightRivalStyle?: FreightRivalStyle;
    isReady: boolean;
    isOnline: boolean;
  }>;
  isGameStarted: boolean;
  hasActiveGame: boolean;
}

export const cabinReactions = new Map([
  ['🚢', 'tàu biển'], ['📦', 'kiện hàng'], ['💸', 'tiền bay'],
  ['👏', 'tràng pháo tay'], ['🔥', 'ngọn lửa'], ['🛟', 'phao cứu sinh'],
]);

const REACTION_LIFETIME_MS = 2400;

export interface ReactionEvent {
  id: number;
  expiresAt: number;
  playerId: string;
  emoji: string;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const pendingStart = useRef<symbol | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [turnTimer, setTurnTimer] = useState<{ seconds: number; playerId: string } | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const boardListeners = useRef(new Set<BoardUpdateListener>());
  const subscribeBoard: SubscribeBoard = useCallback((listener: BoardUpdateListener) => {
    boardListeners.current.add(listener);
    return () => { boardListeners.current.delete(listener); };
  }, []);

  // Replacing the sender's badge never extends another captain's reaction.
  useEffect(() => {
    if (!reactions.length) return;
    const expiry = window.setTimeout(() => {
      const now = performance.now();
      setReactions(current => current.filter(reaction => reaction.expiresAt > now));
    }, Math.max(0, Math.ceil(reactions[0].expiresAt - performance.now())));
    return () => window.clearTimeout(expiry);
  }, [reactions]);

  // Initialize socket
  useEffect(() => {
    const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || undefined;
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;
    let reactionSequence = 0;
    const finishStart = () => {
      if (pendingStart.current === null) return;
      pendingStart.current = null;
      setIsStarting(false);
    };
    const clearHiddenReactions = () => {
      if (document.hidden) setReactions([]);
    };
    document.addEventListener('visibilitychange', clearHiddenReactions);

    socket.on('connect', () => {
      setIsConnected(true);
      // Check auto-reconnect from localStorage
      const savedRoomId = localStorage.getItem('one_monopoly_room_id');
      const savedSessionToken = localStorage.getItem('one_monopoly_session_token');
      const savedPlayerName = localStorage.getItem('one_monopoly_player_name') || 'Captain ONE';
      const savedToken = (localStorage.getItem('one_monopoly_token') as VesselToken) || 'ONE_APUS';

      if (savedRoomId && savedSessionToken) {
        socket.emit(
          'room:join',
          {
            roomId: savedRoomId,
            playerName: savedPlayerName,
            token: savedToken,
            sessionToken: savedSessionToken,
          },
          (res: any) => {
            if (res?.success) {
              setRoom(res.room);
              setMyPlayerId(res.playerId);
              if (res.gameState) {
                setGameState(res.gameState);
              }
            }
          }
        );
      }
    });

    socket.on('disconnect', () => {
      finishStart();
      setReactions([]);
      setIsConnected(false);
    });

    socket.on('room:state', (roomData: RoomState) => {
      setRoom(roomData);
    });

    socket.on('game:init', (data: { state: GameState }) => {
      finishStart();
      setReactions([]);
      clearTimeout(rollTimerRef.current);
      rollTimerRef.current = undefined;
      setIsRolling(false);
      setGameState(data.state);
      boardListeners.current.forEach((listener) => listener(data.state, null));
    });

    socket.on('game:update', (data: { state: GameState; events: GameEvent[] }) => {
      finishStart();
      const hasDiceRoll = data.events?.some((e) => e.type === 'DICE_ROLLED');
      if (hasDiceRoll) {
        setIsRolling(true);
        if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
        rollTimerRef.current = setTimeout(() => {
          rollTimerRef.current = undefined;
          setIsRolling(false);
        }, DICE_ROLL_MS);
      }
      setGameState(data.state);
      boardListeners.current.forEach((listener) => listener(data.state, data.events ?? []));
    });

    socket.on('game:timer', (data: { remainingSeconds: number; playerId: string }) => {
      setTurnTimer({ seconds: data.remainingSeconds, playerId: data.playerId });
    });

    socket.on('game:reaction', (data: { playerId: string; emoji: string }) => {
      if (document.hidden || !data?.playerId || !cabinReactions.has(data.emoji)) return;
      const now = performance.now();
      const reaction = { id: ++reactionSequence, playerId: data.playerId, emoji: data.emoji, expiresAt: now + REACTION_LIFETIME_MS };
      setReactions(current => [
        ...current.filter(item => item.playerId !== reaction.playerId && item.expiresAt > now).slice(-3),
        reaction,
      ]);
    });

    return () => {
      document.removeEventListener('visibilitychange', clearHiddenReactions);
      clearTimeout(rollTimerRef.current);
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback(
    (playerName: string, token: VesselToken) => {
      if (!socketRef.current) return;
      socketRef.current.emit(
        'room:create',
        { playerName, token },
        (res: any) => {
          if (res?.success) {
            setRoom(res.room);
            setMyPlayerId(res.playerId);
            localStorage.setItem('one_monopoly_room_id', res.roomId);
            localStorage.setItem('one_monopoly_session_token', res.sessionToken);
            localStorage.setItem('one_monopoly_player_name', playerName);
            localStorage.setItem('one_monopoly_token', token);
          } else {
            setErrorMsg(res?.error || 'Không thể tạo phòng!');
          }
        }
      );
    },
    []
  );

  const joinRoom = useCallback(
    (roomId: string, playerName: string, token: VesselToken) => {
      if (!socketRef.current) return;
      socketRef.current.emit(
        'room:join',
        { roomId, playerName, token },
        (res: any) => {
          if (res?.success) {
            setRoom(res.room);
            setMyPlayerId(res.playerId);
            localStorage.setItem('one_monopoly_room_id', res.roomId);
            localStorage.setItem('one_monopoly_session_token', res.sessionToken);
            localStorage.setItem('one_monopoly_player_name', playerName);
            localStorage.setItem('one_monopoly_token', token);
          } else {
            setErrorMsg(res?.error || 'Không thể tham gia phòng!');
          }
        }
      );
    },
    []
  );

  const toggleReady = useCallback(
    (isReady: boolean) => {
      if (!socketRef.current || !room || !myPlayerId) return;
      socketRef.current.emit('room:ready', {
        roomId: room.id,
        playerId: myPlayerId,
        isReady,
      });
    },
    [room, myPlayerId]
  );

  const startGame = useCallback((rivalStyle?: FreightRivalStyle, mode?: GameMode) => {
    if (!room || !myPlayerId || pendingStart.current !== null) return;
    if (!socketRef.current?.connected) {
      setErrorMsg('Chưa kết nối với phòng chơi.');
      return;
    }
    const request = Symbol();
    pendingStart.current = request;
    setIsStarting(true);
    socketRef.current.timeout(5000).emit('room:start', {
      roomId: room.id,
      playerId: myPlayerId,
      ...(mode !== undefined && { mode }),
      ...(rivalStyle !== undefined && { rivalStyle }),
    }, (timeout: Error | null, result?: { success: boolean; error?: string }) => {
      if (pendingStart.current !== request) return;
      pendingStart.current = null;
      setIsStarting(false);
      if (timeout || !result?.success) setErrorMsg(timeout ? 'Chưa nhận được xác nhận bắt đầu ván.' : result?.error || 'Không thể bắt đầu ván.');
    });
  }, [room, myPlayerId]);

  const sendAction = useCallback(
    (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => {
      if (!socketRef.current?.connected || !room || !myPlayerId) {
        onFailure?.();
        setErrorMsg('Chưa kết nối với phòng chơi.');
        return;
      }
      if (action.type === 'ROLL_DICE') setIsRolling(true);
      socketRef.current.timeout(5000).emit(
        'game:action',
        { roomId: room.id, playerId: myPlayerId, action },
        (timeout: Error | null, res?: { success: boolean; error?: string }) => {
          if (timeout || !res?.success) {
            if (action.type === 'ROLL_DICE' && !rollTimerRef.current) setIsRolling(false);
            onFailure?.();
            setErrorMsg(timeout ? 'Chưa nhận được xác nhận từ phòng chơi.' : res?.error || 'Thao tác không thành công');
          } else onSuccess?.();
        }
      );
    },
    [room, myPlayerId]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!socketRef.current?.connected || !room || !myPlayerId || !cabinReactions.has(emoji)) return;
      socketRef.current.volatile.emit('game:reaction', {
        roomId: room.id,
        playerId: myPlayerId,
        emoji,
      });
    },
    [room, myPlayerId]
  );

  const leaveRoom = useCallback(() => {
    localStorage.removeItem('one_monopoly_room_id');
    localStorage.removeItem('one_monopoly_session_token');
    setRoom(null);
    setGameState(null);
    setMyPlayerId(null);
    window.location.reload();
  }, []);

  return {
    isConnected,
    isStarting,
    subscribeBoard,
    room,
    gameState,
    myPlayerId,
    turnTimer,
    reactions,
    errorMsg,
    isRolling,
    clearError: () => setErrorMsg(null),
    createRoom,
    joinRoom,
    toggleReady,
    startGame,
    sendAction,
    sendReaction,
    leaveRoom,
  };
}
