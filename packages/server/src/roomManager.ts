import {
  AUCTION_BID_SECONDS,
  AUCTION_INCREMENT,
  BOARD_TILES,
  FREIGHT_RIVALS,
  type FreightRivalStyle,
  type GameMode,
  GameAction,
  GameEvent,
  GameState,
  getDebtRecovery,
  getHarborExportBooking,
  getHarborFreightOpportunity,
  getHarborPurchase,
  getHarborRedemption,
  getHarborRentRelief,
  getHarborTurnaround,
  isFreightRivalStyle,
  isTradeAction,
  LOOP_GROUPS_CONFIG,
  OneMonopolyEngine,
  VesselToken,
  VESSEL_TOKENS,
} from '@one-monopoly/shared';
import crypto from 'node:crypto';
import { TurnTimer } from './turnTimer.js';
import { getBotTradeResponse } from './botTrade.js';
import { getFreightBotAction } from './freightBot.js';

const TURN_SECONDS = 45;
const BOT_PURCHASE_RESERVE = 80;
const CARGO_HANDLING_DELAY_MS = 3600;
const rivalTokens: Record<FreightRivalStyle, readonly [VesselToken, VesselToken]> = {
  standard: ['ONE_APUS', 'PILOT_BOAT'],
  equipment: ['GANTRY_CRANE', 'CONTAINER_TRUCK'],
  coastal: ['BUNKER_BARGE', 'PILOT_BOAT'],
};

function getBotHarborAction(state: GameState, captainId: string): GameAction | null {
  const captain = state.players[state.activePlayerIndex];
  const freight = getHarborFreightOpportunity(state, captainId);
  if (freight?.kind === 'discharge') {
    const turnaround = getHarborTurnaround(state, captainId);
    if (turnaround && !turnaround.shortfall &&
        (turnaround.action.fee === 0 || captain.balance + turnaround.cashChange >= BOT_PURCHASE_RESERVE)) {
      return turnaround.action;
    }
  }
  if (freight) return freight.action;
  const reopening = getHarborRedemption(state, captainId);
  if (reopening && !reopening.shortfall && captain.balance + reopening.cashChange >= BOT_PURCHASE_RESERVE) {
    return reopening.action;
  }
  const booking = getHarborExportBooking(state, captainId);
  if (booking && captain.balance - booking.action.fee >= BOT_PURCHASE_RESERVE) return booking.action;
  return null;
}

export function gameStateForPlayer(state: GameState, viewerId: string | undefined): GameState {
  const logistics = state.logistics;
  const market = logistics?.market;
  const tender = market?.tender;
  const view: GameState = {
    ...state,
    players: state.players.map(player => {
      if (player.id === viewerId || !player.secretMission || player.secretMission.isCompleted) return player;
      const { secretMission, ...publicPlayer } = player;
      return publicPlayer;
    }),
  };
  if (state.mode === 'harbor' && state.gameStarted && state.winnerId === null) {
    view.supportsPortSwaps = true;
    view.supportsHarborExportBooking = true;
    view.supportsHarborPurchase = true;
    view.supportsHarborTurnaround = true;
  } else {
    delete view.supportsPortSwaps;
    delete view.supportsHarborExportBooking;
    delete view.supportsHarborPurchase;
    delete view.supportsHarborTurnaround;
  }
  if (logistics && market && tender) {
    const bidderIds = tender.bidderIds ?? Object.keys(tender.bids);
    const bidCount = tender.bidCount ?? bidderIds.length;
    const bids = viewerId !== undefined && Object.hasOwn(tender.bids, viewerId)
      ? { [viewerId]: tender.bids[viewerId] }
      : {};
    const { id, round, kind, destinationTileId, priorityPlayerId } = tender;
    view.logistics = {
      ...logistics,
      market: { ...market, tender: { id, round, kind, destinationTileId, priorityPlayerId, bidderIds, bidCount, bids } },
    };
  }
  return view;
}

export function publicGameEvents(events: GameEvent[]): GameEvent[] {
  // The offer amount belongs only in the bidder's snapshot, including on their own acknowledgement.
  return events.map(event => event.type === 'FREIGHT_TENDER_BID' || event.type === 'FREIGHT_TENDER_BID_WITHDRAWN'
    ? { type: event.type, tenderId: event.tenderId, playerId: event.playerId }
    : event);
}

export function getTimerPlayerId(state: GameState): string {
  if (state.phase === 'AWAITING_AUCTION' && state.auction) return state.auction.bidderId;
  return state.players[state.activePlayerIndex].id;
}

export interface RoomPlayer {
  freightRivalStyle?: FreightRivalStyle;
  id: string;
  name: string;
  token: VesselToken;
  isReady: boolean;
  isOnline: boolean;
  sessionToken?: string;
}

export interface Room {
  id: string;
  hostId: string;
  players: RoomPlayer[];
  gameState: GameState | null;
  isGameStarted: boolean;
  timer: TurnTimer | null;
  botTimer: NodeJS.Timeout | null;
  botTradeTimer: NodeJS.Timeout | null;
  socketToPlayer: Map<string, string>; // socketId -> playerId
  playerToSocket: Map<string, string>; // playerId -> socketId
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private onBroadcastUpdate?: (roomId: string, state: GameState, events: GameEvent[]) => void;
  private onTimerTick?: (roomId: string, seconds: number, playerId: string) => void;
  private onLobbyUpdate?: (roomId: string) => void;

  constructor(callbacks?: {
    onBroadcastUpdate?: (roomId: string, state: GameState, events: GameEvent[]) => void;
    onTimerTick?: (roomId: string, seconds: number, playerId: string) => void;
    onLobbyUpdate?: (roomId: string) => void;
  }) {
    if (callbacks) {
      this.onBroadcastUpdate = callbacks.onBroadcastUpdate;
      this.onTimerTick = callbacks.onTimerTick;
      this.onLobbyUpdate = callbacks.onLobbyUpdate;
    }
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  public createRoom(
    hostName: string,
    token: VesselToken,
    socketId: string
  ): { room: Room; sessionToken: string; playerId: string } {
    const roomId = `ONE-${Math.floor(1000 + Math.random() * 9000)}`;
    const playerId = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const sessionToken = crypto.randomUUID();

    const host: RoomPlayer = {
      id: playerId,
      name: hostName.trim() || 'Captain ONE',
      token,
      isReady: true,
      isOnline: true,
      sessionToken,
    };

    const room: Room = {
      id: roomId,
      hostId: playerId,
      players: [host],
      gameState: null,
      isGameStarted: false,
      timer: null,
      botTimer: null,
      botTradeTimer: null,
      socketToPlayer: new Map([[socketId, playerId]]),
      playerToSocket: new Map([[playerId, socketId]]),
    };

    this.rooms.set(roomId, room);
    return { room, sessionToken, playerId };
  }

  public joinRoom(
    roomId: string,
    playerName: string,
    token: VesselToken,
    socketId: string,
    sessionToken?: string
  ): { success: boolean; error?: string; room?: Room; sessionToken?: string; playerId?: string; isReconnect?: boolean } {
    const room = this.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Phòng không tồn tại!' };
    }

    // 1. Reconnect check via sessionToken
    if (sessionToken) {
      const existingPlayer = room.players.find((p) => p.sessionToken === sessionToken);
      if (existingPlayer) {
        const previousSocket = room.playerToSocket.get(existingPlayer.id);
        if (previousSocket) room.socketToPlayer.delete(previousSocket);
        existingPlayer.isOnline = true;
        room.socketToPlayer.set(socketId, existingPlayer.id);
        room.playerToSocket.set(existingPlayer.id, socketId);

        if (room.gameState) {
          const gp = room.gameState.players.find((p) => p.id === existingPlayer.id);
          if (gp) gp.isOnline = true;
          this.scheduleBotTradeReply(room);
        }

        return {
          success: true,
          room,
          sessionToken,
          playerId: existingPlayer.id,
          isReconnect: true,
        };
      }
    }

    // 2. Joining as a new player
    if (room.isGameStarted) {
      return { success: false, error: 'Ván chơi đã bắt đầu, không thể tham gia mới!' };
    }

    if (room.players.length >= 4) {
      return { success: false, error: 'Phòng đã đầy (tối đa 4 người chơi)!' };
    }

    // Check if token already taken
    const tokenTaken = room.players.some((p) => p.token === token);
    if (tokenTaken) {
      // Pick available token
      const available = VESSEL_TOKENS.find((t) => !room.players.some((p) => p.token === t));
      if (available) token = available;
    }

    const playerId = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const newSessionToken = crypto.randomUUID();

    const newPlayer: RoomPlayer = {
      id: playerId,
      name: playerName.trim() || `Player ${room.players.length + 1}`,
      token,
      isReady: false,
      isOnline: true,
      sessionToken: newSessionToken,
    };

    room.players.push(newPlayer);
    room.socketToPlayer.set(socketId, playerId);
    room.playerToSocket.set(playerId, socketId);

    if (this.onLobbyUpdate) {
      this.onLobbyUpdate(room.id);
    }

    return {
      success: true,
      room,
      sessionToken: newSessionToken,
      playerId,
      isReconnect: false,
    };
  }

  public setReady(roomId: string, playerId: string, isReady: boolean): boolean {
    const room = this.getRoom(roomId);
    if (!room || room.isGameStarted) return false;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;

    player.isReady = isReady;
    if (this.onLobbyUpdate) {
      this.onLobbyUpdate(room.id);
    }
    return true;
  }

  public startGame(
    roomId: string, callerId: string, mode: GameMode = 'logistics', rivalStyle?: FreightRivalStyle
  ): { success: boolean; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Phòng không tồn tại!' };
    if (room.hostId !== callerId) return { success: false, error: 'Chỉ phòng trưởng (Host) mới có quyền bắt đầu!' };
    if (room.isGameStarted) return { success: false, error: 'Trò chơi đã bắt đầu!' };
    if (mode !== 'harbor' && mode !== 'logistics' && mode !== 'classic') {
      return { success: false, error: 'Chế độ chơi không hợp lệ.' };
    }

    const solo = room.players.length === 1;
    if (rivalStyle !== undefined) {
      if (!isFreightRivalStyle(rivalStyle)) return { success: false, error: 'Hồ sơ đối thủ vận tải không hợp lệ.' };
      if (!solo || mode !== 'logistics') return { success: false, error: 'Chỉ có thể chọn đối thủ cho ván vận tải một người.' };
    }

    const style = solo && mode === 'logistics' ? rivalStyle ?? 'standard' : undefined;
    let seats = room.players;
    if (solo) {
      const [preferred, alternate] = rivalTokens[style ?? 'standard'];
      seats = [...seats, {
        id: 'ai-mate-1',
        name: style ? FREIGHT_RIVALS[style].name : 'AI Thuyền Phó (Bot)',
        token: seats[0].token === preferred ? alternate : preferred,
        isReady: true,
        isOnline: true,
        ...(style && { freightRivalStyle: style }),
      }];
    }

    const playersData = seats.map(({ id, name, token }) => ({ id, name, token }));
    const gameState = OneMonopolyEngine.createGame(room.id, playersData, mode);
    if (style) gameState.players[1].freightRivalStyle = style;
    room.players = seats;
    room.gameState = gameState;
    room.isGameStarted = true;

    // Start 45s turn timer
    this.setupRoomTimer(room);

    if (this.onBroadcastUpdate) {
      this.onBroadcastUpdate(room.id, room.gameState, []);
    }

    this.triggerBotIfNeeded(room);

    return { success: true };
  }

  private setupRoomTimer(room: Room): void {
    if (room.timer) {
      room.timer.stop();
    }
    this.clearBotTimer(room);

    room.timer = new TurnTimer(
      TURN_SECONDS,
      (seconds) => {
        if (!room.gameState || room.gameState.winnerId) return;
        this.onTimerTick?.(room.id, seconds, getTimerPlayerId(room.gameState));
      },
      () => {
        this.handleAFKTimeout(room.id);
      }
    );

    room.timer.start();
  }

  public dispatchSocketAction(
    socketId: string,
    data: { roomId: string; playerId: string; action: GameAction }
  ) {
    const room = typeof data?.roomId === 'string' ? this.getRoom(data.roomId) : undefined;
    const actorId = room?.socketToPlayer.get(socketId);
    if (!actorId || actorId !== data.playerId) {
      return { success: false, error: 'Kết nối này không đại diện cho người chơi trong phòng.' };
    }
    const result = this.dispatchAction(data.roomId, actorId, data.action);
    if (!result.state) return result;
    return { ...result, state: gameStateForPlayer(result.state, actorId), events: publicGameEvents(result.events ?? []) };
  }

  public dispatchAction(
    roomId: string,
    playerId: string,
    action: GameAction
  ): { success: boolean; error?: string; state?: GameState; events?: GameEvent[] } {
    const room = this.getRoom(roomId);
    if (!room || !room.gameState) return { success: false, error: 'Phòng hoặc ván chơi không tồn tại' };
    if (!action || typeof action.type !== 'string') return { success: false, error: 'Hành động không hợp lệ.' };
    if (action.type === 'WITHDRAW_FREIGHT_TENDER_BID' && (
      Object.keys(action).length !== 3 ||
      !Number.isSafeInteger(action.tenderId) || action.tenderId < 1 ||
      !Number.isSafeInteger(action.revision) || action.revision < 0
    )) return { success: false, error: 'Yêu cầu rút báo giá không hợp lệ.' };
    if (action.type === 'RESERVE_IMPORT_TRUCK' && (
      Object.keys(action).length !== 4 ||
      !Number.isSafeInteger(action.bookingId) || action.bookingId < 1 ||
      !Number.isSafeInteger(action.destinationTileId) || action.destinationTileId < 0 ||
      !Number.isSafeInteger(action.revision) || action.revision < 0
    )) return { success: false, error: 'Yêu cầu giữ xe nhận hàng không hợp lệ.' };

    const activePlayer = room.gameState.players[room.gameState.activePlayerIndex];
    const harborAction = action.type === 'HARBOR_LOAD' || action.type === 'HARBOR_BOOK_EXPORT' || action.type === 'HARBOR_DISCHARGE' ||
      action.type === 'HARBOR_REDEEM_AND_DISCHARGE' || action.type === 'HARBOR_DISCHARGE_FOR_RENT' ||
      action.type === 'HARBOR_BUY_AND_DISCHARGE' || action.type === 'HARBOR_TURNAROUND';
    if ((room.gameState.mode === 'logistics' || harborAction) && activePlayer.id !== playerId) {
      return { success: false, error: 'Chưa đến lượt điều độ của bạn.' };
    }
    const isAuctionAction = action.type === 'AUCTION_BID' || action.type === 'AUCTION_PASS';
    const tradeAction = isTradeAction(action);
    const inAuction = room.gameState.phase === 'AWAITING_AUCTION';
    if (isAuctionAction && (!inAuction || room.gameState.auction?.bidderId !== playerId)) {
      return { success: false, error: 'Chưa đến lượt đấu giá của bạn.' };
    }
    if (inAuction && !isAuctionAction && !tradeAction) return { success: false, error: 'Hãy hoàn tất phiên đấu giá trước.' };

    // Some actions can only be triggered by the active player
    // Slot Charter response can only be answered by the property owner
    if (action.type === 'RESPOND_SLOT_CHARTER') {
      if (room.gameState.pendingSlotCharter?.ownerId !== playerId) {
        return { success: false, error: 'Chỉ chủ sở hữu cảng mới có quyền quyết định thỏa thuận chia sẻ chỗ!' };
      }
    } else if (
      action.type === 'ROLL_DICE' ||
      action.type === 'BUY_PROPERTY' ||
      action.type === 'SKIP_BUY' ||
      action.type === 'BUILD_CONTAINER' ||
      action.type === 'SELL_CONTAINER' ||
      action.type === 'MORTGAGE_TILE' ||
      action.type === 'UNMORTGAGE_TILE' ||
      action.type === 'UPGRADE_GREEN_FLEET' ||
      action.type === 'PAY_HOLD_FINE' ||
      action.type === 'USE_CLEARANCE_PASS' ||
      action.type === 'RESOLVE_STORM' ||
      action.type === 'PROPOSE_SLOT_CHARTER' ||
      action.type === 'END_TURN'
    ) {
      if (activePlayer.id !== playerId) {
        return { success: false, error: 'Chưa đến lượt của bạn!' };
      }
    }

    // Debt resolution actions can only be by the debtor
    if (action.type === 'SETTLE_DEBT' || action.type === 'DECLARE_BANKRUPTCY') {
      if (activePlayer.id !== playerId || room.gameState.phase !== 'AWAITING_DEBT_RESOLUTION' || !room.gameState.pendingDebt) {
        return { success: false, error: 'Chỉ người đang nợ mới được xử lý nợ!' };
      }
    }

    const prevPhase = room.gameState.phase;
    const prevActiveIndex = room.gameState.activePlayerIndex;

    const { state: nextState, events } = OneMonopolyEngine.dispatch(room.gameState, action, playerId);
    const freightCommand = action.type === 'LOAD_CARGO' || action.type === 'UNLOAD_CARGO' || action.type === 'RETURN_CARGO_TO_YARD' ||
      action.type === 'CHANGE_DESTINATION' || action.type === 'SAIL_TO_PORT' || action.type === 'SAIL_FEEDER' ||
      action.type === 'ACCEPT_BACKHAUL' || action.type === 'BID_FREIGHT_TENDER' || action.type === 'CALL_PORT_TRUCK' ||
      action.type === 'WITHDRAW_FREIGHT_TENDER_BID' || action.type === 'RESERVE_IMPORT_TRUCK';
    if (nextState === room.gameState && (room.gameState.mode === 'logistics' || freightCommand || harborAction)) {
      return { success: false, error: 'Lệnh điều độ không còn hợp lệ. Hãy kiểm tra lại vận đơn và tình trạng bến.' };
    }
    if ((action.type === 'BUY_PROPERTY' && !events.some(e => e.type === 'TILE_PURCHASED')) ||
        (action.type === 'SELL_CONTAINER' && !events.some(e => e.type === 'CONTAINER_SOLD')) ||
        (action.type === 'MORTGAGE_TILE' && !events.some(e => e.type === 'TILE_MORTGAGED')) ||
        (action.type === 'UNMORTGAGE_TILE' && !events.some(e => e.type === 'TILE_UNMORTGAGED')) ||
        (action.type === 'SETTLE_DEBT' && !events.some(e => e.type === 'DEBT_SETTLED'))) {
      return { success: false, error: 'Không thể thực hiện thao tác này với số dư và tài sản hiện tại.' };
    }
    if (tradeAction && nextState === room.gameState) {
      return { success: false, error: 'Đề nghị giao dịch đã thay đổi hoặc thao tác không hợp lệ.' };
    }
    if (isAuctionAction && nextState.phase === prevPhase && nextState.auction?.revision === room.gameState.auction?.revision) {
      return { success: false, error: 'Lượt đấu giá đã thay đổi hoặc giá đặt không hợp lệ.' };
    }
    if (!tradeAction && (prevPhase === 'AWAITING_STORM_DECISION' || action.type === 'RESOLVE_STORM') &&
        !events.some((event) => event.type === 'STORM_RESOLVED')) {
      return { success: false, error: 'Không thể thực hiện lựa chọn ứng phó bão này.' };
    }
    room.gameState = nextState;

    // A doubles roll can open and close an auction in one dispatch when nobody can bid.
    const auctionEnded = events.some((event) => event.type === 'AUCTION_ENDED');
    if (nextState.winnerId) {
      room.timer?.stop();
      this.clearBotTimer(room);
    } else if (isAuctionAction || auctionEnded || nextState.phase !== prevPhase || nextState.activePlayerIndex !== prevActiveIndex) {
      room.timer?.reset(nextState.phase === 'AWAITING_AUCTION' ? AUCTION_BID_SECONDS : TURN_SECONDS);
    }

    if (this.onBroadcastUpdate) {
      this.onBroadcastUpdate(room.id, nextState, events);
    }

    if (!tradeAction) this.triggerBotIfNeeded(room, action.type);
    this.scheduleBotTradeReply(room);

    return { success: true, state: nextState, events };
  }

  public isBot(room: Room, playerId: string): boolean {
    const player = room.players.find((p) => p.id === playerId);
    return Boolean(player?.sessionToken?.startsWith('bot-') || playerId.startsWith('ai-'));
  }

  private scheduleBotTradeReply(room: Room): void {
    const nextReply = () => {
      const state = room.gameState;
      if (!state?.tradeOffers?.length) return;
      for (const seller of room.players) {
        if (!this.isBot(room, seller.id)) continue;
        const action = getBotTradeResponse(state, seller.id);
        if (action) return { sellerId: seller.id, action };
      }
    };

    if (!nextReply()) {
      if (room.botTradeTimer) clearTimeout(room.botTradeTimer);
      room.botTradeTimer = null;
      return;
    }
    if (room.botTradeTimer) return;
    // Keep the trade reply independent of the captain's turn or bidder deadline.
    room.botTradeTimer = setTimeout(() => {
      room.botTradeTimer = null;
      const reply = nextReply();
      if (reply) this.dispatchAction(room.id, reply.sellerId, reply.action);
    }, 1000);
  }

  public clearBotTimer(room: Room): void {
    if (room.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
    }
  }

  public triggerBotIfNeeded(room: Room, lastActionType?: string): void {
    if (!room.isGameStarted || !room.gameState || room.gameState.winnerId) {
      this.clearBotTimer(room);
      return;
    }

    this.clearBotTimer(room);

    const state = room.gameState;

    if (state.mode === 'logistics') {
      const captain = state.players[state.activePlayerIndex];
      if (this.isBot(room, captain.id)) {
        // Leave time for the 3.4-second handoff before moving the ship or starting another job.
        const delay = lastActionType === 'LOAD_CARGO' || lastActionType === 'UNLOAD_CARGO' ? CARGO_HANDLING_DELAY_MS : 1800;
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          if (room.gameState !== state) return;
          this.dispatchAction(room.id, captain.id, getFreightBotAction(gameStateForPlayer(state, captain.id), captain.freightRivalStyle));
        }, delay);
      }
      return;
    }

    if (state.phase === 'AWAITING_AUCTION') {
      const auction = state.auction;
      if (auction && this.isBot(room, auction.bidderId)) {
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          const bidder = state.players.find((player) => player.id === auction.bidderId)!;
          const amount = auction.highestBid + AUCTION_INCREMENT;
          const price = BOARD_TILES[auction.tileId].price ?? 0;
          const turn = { auctionId: auction.id, revision: auction.revision };
          this.dispatchAction(room.id, bidder.id, amount <= price && amount + BOT_PURCHASE_RESERVE <= bidder.balance
            ? { type: 'AUCTION_BID', ...turn, amount }
            : { type: 'AUCTION_PASS', ...turn });
        }, 700);
      }
      return;
    }

    // Case 1: Slot charter proposal pending response from port owner
    if (state.phase === 'AWAITING_SLOT_CHARTER_RESPONSE' && state.pendingSlotCharter) {
      const ownerId = state.pendingSlotCharter.ownerId;
      if (this.isBot(room, ownerId)) {
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          this.dispatchAction(room.id, ownerId, {
            type: 'RESPOND_SLOT_CHARTER',
            accept: true,
          });
        }, 800);
        return;
      }
    }

    // Case 2: Active player turn
    const activePlayer = state.players[state.activePlayerIndex];
    if (!activePlayer || !this.isBot(room, activePlayer.id)) {
      return;
    }

    const docksideDelay = (defaultDelay: number) => {
      if (lastActionType === 'HARBOR_BOOK_EXPORT' || lastActionType === 'HARBOR_REDEEM_AND_DISCHARGE' ||
          lastActionType === 'HARBOR_DISCHARGE_FOR_RENT' || lastActionType === 'HARBOR_BUY_AND_DISCHARGE' ||
          lastActionType === 'HARBOR_TURNAROUND') {
        return CARGO_HANDLING_DELAY_MS;
      }
      if (lastActionType !== 'ROLL_DICE') return defaultDelay;
      const steps = (state.dice[0] || 1) + (state.dice[1] || 1);
      return Math.max(1600, 950 + steps * 240 + 600);
    };

    switch (state.phase) {
      case 'WAIT_FOR_ROLL': {
        const delay = docksideDelay(1000);
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          const current = room.gameState!;
          const captain = current.players[current.activePlayerIndex];
          const freight = getBotHarborAction(current, activePlayer.id);
          if (freight) {
            this.dispatchAction(room.id, activePlayer.id, freight);
            return;
          }
          if (captain.inHold && captain.balance >= 150) {
            this.dispatchAction(room.id, activePlayer.id, { type: 'PAY_HOLD_FINE' });
          } else {
            this.dispatchAction(room.id, activePlayer.id, { type: 'ROLL_DICE' });
          }
        }, delay);
        break;
      }

      case 'AWAITING_BUY_DECISION': {
        const delay = docksideDelay(700);
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          const current = room.gameState!;
          const captain = current.players[current.activePlayerIndex];
          const price = BOARD_TILES[captain.position].price ?? 0;
          if (captain.balance >= price + BOT_PURCHASE_RESERVE) {
            this.dispatchAction(room.id, activePlayer.id, { type: 'BUY_PROPERTY' });
            return;
          }
          const purchase = getHarborPurchase(current, activePlayer.id);
          this.dispatchAction(room.id, activePlayer.id, purchase && captain.balance + purchase.cashChange >= BOT_PURCHASE_RESERVE
            ? purchase.action : { type: 'SKIP_BUY' });
        }, delay);
        break;
      }

      case 'AWAITING_STORM_DECISION': {
        const delay = docksideDelay(700);
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          if (activePlayer.balance >= 100) {
            this.dispatchAction(room.id, activePlayer.id, {
              type: 'RESOLVE_STORM',
              choice: 'TUG',
            });
          } else {
            this.dispatchAction(room.id, activePlayer.id, {
              type: 'RESOLVE_STORM',
              choice: 'DRIFT',
            });
          }
        }, delay);
        break;
      }

      case 'AWAITING_DEBT_RESOLUTION': {
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          const current = room.gameState!;
          const recovery = getDebtRecovery(current);
          if (!recovery) return;
          const relief = getHarborRentRelief(current, activePlayer.id);
          if (relief && relief.shortfallAfter <= recovery.maxProceeds) {
            this.dispatchAction(room.id, activePlayer.id, relief.action);
            return;
          }
          const action: GameAction = recovery.shortfall === 0
            ? { type: 'SETTLE_DEBT' }
            : recovery.recommended?.action ?? { type: 'DECLARE_BANKRUPTCY' };
          this.dispatchAction(room.id, activePlayer.id, action);
        }, state.mode === 'harbor' ? docksideDelay(1000) : 1000);
        break;
      }

      case 'END_OF_TURN': {
        const delay = docksideDelay(700);
        room.botTimer = setTimeout(() => {
          room.botTimer = null;
          const current = room.gameState!;
          const captain = current.players[current.activePlayerIndex];
          const freight = getBotHarborAction(current, activePlayer.id);
          if (freight) {
            this.dispatchAction(room.id, activePlayer.id, freight);
            return;
          }
          const tile = BOARD_TILES[captain.position];
          const prop = current.properties[captain.position];
          if (
            current.canUpgradeCurrentPort &&
            tile?.type === 'PORT' &&
            prop?.ownerId === activePlayer.id &&
            !prop.isMortgaged &&
            prop.containerLevel < 5
          ) {
            const groupConfig = tile.group ? LOOP_GROUPS_CONFIG[tile.group] : null;
            const cost = tile.buildCost || groupConfig?.buildCost || 100;
            if (captain.balance >= cost + 150) {
              this.dispatchAction(room.id, activePlayer.id, {
                type: 'BUILD_CONTAINER',
                tileId: activePlayer.position,
              });
              return;
            }
          }
          this.dispatchAction(room.id, activePlayer.id, { type: 'END_TURN' });
        }, delay);
        break;
      }
    }
  }

  public handleAFKTimeout(roomId: string): void {
    const room = this.getRoom(roomId);
    if (!room || !room.gameState || room.gameState.winnerId) return;

    const activePlayer = room.gameState.players[room.gameState.activePlayerIndex];
    if (!activePlayer) return;

    if (room.gameState.mode === 'logistics') {
      this.dispatchAction(roomId, activePlayer.id, { type: 'END_TURN' });
      return;
    }

    switch (room.gameState.phase) {
      case 'WAIT_FOR_ROLL':
        this.dispatchAction(roomId, activePlayer.id, { type: 'ROLL_DICE' });
        break;
      case 'AWAITING_BUY_DECISION':
        this.dispatchAction(roomId, activePlayer.id, { type: 'SKIP_BUY' });
        break;
      case 'AWAITING_AUCTION': {
        const auction = room.gameState.auction;
        if (auction) {
          this.dispatchAction(roomId, auction.bidderId, {
            type: 'AUCTION_PASS', auctionId: auction.id, revision: auction.revision,
          });
        }
        break;
      }
      case 'AWAITING_STORM_DECISION':
        this.dispatchAction(roomId, activePlayer.id, { type: 'RESOLVE_STORM', choice: 'DRIFT' });
        break;
      case 'AWAITING_SLOT_CHARTER_RESPONSE': {
        const charter = room.gameState.pendingSlotCharter;
        if (charter) {
          this.dispatchAction(roomId, charter.ownerId, { type: 'RESPOND_SLOT_CHARTER', accept: false });
        }
        break;
      }
      case 'AWAITING_DEBT_RESOLUTION':
        if (room.gameState.pendingDebt && activePlayer.balance >= room.gameState.pendingDebt.amount) {
          this.dispatchAction(roomId, activePlayer.id, { type: 'SETTLE_DEBT' });
        } else {
          this.dispatchAction(roomId, activePlayer.id, { type: 'DECLARE_BANKRUPTCY' });
        }
        break;
      case 'END_OF_TURN':
        this.dispatchAction(roomId, activePlayer.id, { type: 'END_TURN' });
        break;
    }
  }

  public handleDisconnect(socketId: string): void {
    for (const room of this.rooms.values()) {
      const playerId = room.socketToPlayer.get(socketId);
      if (playerId) {
        room.socketToPlayer.delete(socketId);
        room.playerToSocket.delete(playerId);
        const player = room.players.find((p) => p.id === playerId);
        if (player) {
          player.isOnline = false;
        }

        if (room.gameState) {
          const gp = room.gameState.players.find((p) => p.id === playerId);
          if (gp) gp.isOnline = false;
        }

        if (this.onLobbyUpdate) {
          this.onLobbyUpdate(room.id);
        }
        break;
      }
    }
  }
}
