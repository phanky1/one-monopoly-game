import React, { useState, useEffect } from 'react';
import { BOARD_TILES, GameCard, getMissionProgress, getVoyagePayment, STORM_DRIFT_STEPS, STORM_TUG_FEE, type GameMode, type PortStock } from '@one-monopoly/shared';
import { useSocket } from './hooks/useSocket.js';
import { Lobby } from './components/Lobby.js';
import { BeginnerGuide } from './components/BeginnerGuide.js';
import { Board } from './components/Board.js';
import { getBoardLighting } from './components/boardLighting.js';
import { PlayerSidebar } from './components/PlayerSidebar.js';
import { TradeDesk } from './components/TradeDesk.js';
import { ActionControls } from './components/ActionControls.js';
import { FreightDesk } from './components/CargoManifest.js';
import { HarborFreightDesk } from './components/HarborFreightDesk.js';
import { RivalDispatch } from './components/RivalDispatch.js';
import { DiversionReceipt, type DiversionEvent } from './components/DiversionReceipt.js';
import { TruckCallReceipt, type TruckCallEvent } from './components/TruckCallReceipt.js';
import { YardReturnReceipt, type YardReturnRecord } from './components/YardReturnReceipt.js';
import { VoyageLog } from './components/VoyageLog.js';
import { portGuide } from './components/ports/portGuide.js';
import { FeederChartDialog } from './components/FeederChartDialog.js';
import { SecretMissionCardView } from './components/SecretMissionCardView.js';
import { ReactionFloatingBar } from './components/ReactionFloatingBar.js';
import type { RentReceipt } from './components/useBoardPlayback.js';
import { GameOverModal } from './components/GameOverModal.js';
import { AlertCircle, BookOpen, BookOpenCheck, Box, CloudLightning, CloudRain, Compass, Gavel, Handshake, LifeBuoy, LogOut, Map, MapPin, Moon, Radio, Route, Store, Sun, Truck, X } from 'lucide-react';

const noticeIcons = { auction: Gavel, trade: Handshake, debt: LifeBuoy, freight: Truck };
type BoardNotice = { type: keyof typeof noticeIcons; text: string }
  | ({ type: 'yardReturn' } & YardReturnRecord)
  | { type: 'truckCall'; call: TruckCallEvent; captain: string; stock: PortStock; revision: number }
  | { type: 'diversion'; change: DiversionEvent; captain: string; revision: number };
const weatherReadouts = {
  sun: { Icon: Sun, label: 'Nắng' },
  moon: { Icon: Moon, label: 'Trời quang' },
  showers: { Icon: CloudRain, label: 'Mưa rào' },
  storm: { Icon: CloudLightning, label: 'Bão' },
};

export const App: React.FC = () => {
  const {
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
    clearError,
    createRoom,
    joinRoom,
    toggleReady,
    startGame,
    sendAction,
    sendReaction,
    leaveRoom,
  } = useSocket();

  const [activeCard, setActiveCard] = useState<GameCard | null>(null);
  const [guideMode, setGuideMode] = useState<GameMode | null>(null);
  useEffect(() => { setGuideMode(null); }, [room?.id, gameState?.gameStarted]);
  const [isPawnMoving, setIsPawnMoving] = useState(false);
  const [rent, setRent] = useState<{
    visible: Record<number, RentReceipt>;
    pending: Record<number, RentReceipt>;
  }>({ visible: {}, pending: {} });
  const updateRent = React.useCallback((visible: Record<number, RentReceipt>, pending: Record<number, RentReceipt>) => {
    setRent({ visible, pending });
  }, []);
  const pendingCardRef = React.useRef<GameCard | null>(null);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [boardNotice, setBoardNotice] = useState<BoardNotice | null>(null);
  const [tradeDesk, setTradeDesk] = useState<{ tileId: number | null } | null>(null);
  const [freightTool, setFreightTool] = useState<'market' | 'voyages' | { captainId: string; originTileId: number; initialTileId?: number } | null>(null);
  const [feederFocus, setFeederFocus] = useState<{ room: string; round: number; captainId: string; tileId: number } | null>(null);
  function openFeederChart(captainId: string, originTileId: number, initialTileId?: number) {
    setFeederFocus(null);
    setFreightTool({ captainId, originTileId, initialTileId });
  }
  useEffect(() => { setFreightTool(null); }, [room?.id]);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [showMissionTargets, setShowMissionTargets] = useState(false);
  const openTrades = (tileId: number | null = null) => setTradeDesk({ tileId });
  const [is3D, setIs3D] = useState(true);

  // Khi xúc xắc đã dừng và nhân vật đã lướt tới bến đích -> Mới hiển thị thẻ bài (Chance/Chest)
  useEffect(() => {
    if (!tradeDesk && selectedTileId === null && !isRolling && !isPawnMoving && pendingCardRef.current) {
      const card = pendingCardRef.current;
      const timer = setTimeout(() => {
        if (pendingCardRef.current !== card) return;
        pendingCardRef.current = null;
        setActiveCard(card);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRolling, isPawnMoving, tradeDesk, selectedTileId]);

  // Pair each event with the exact board snapshot that produced it.
  useEffect(() => subscribeBoard((state, events) => {
    if (!events) {
      pendingCardRef.current = null;
      setActiveCard(null);
      setBoardNotice(null);
      return;
    }
    const sale = events.find(event => event.type === 'AUCTION_ENDED');
    const tradeSettled = events.some(event => event.type === 'TRADE_CLOSED' && event.result === 'ACCEPTED');
    for (const evt of events) {
      if (evt.type === 'AUCTION_STARTED') {
        pendingCardRef.current = null;
        setActiveCard(null);
        setBoardNotice(null);
      }
      if (evt.type === 'CARD_DRAWN') {
        if (evt.card.effect.type === 'STORM_CHOICE') {
          // The action panel is the storm card. Keep its two routes directly accessible.
          pendingCardRef.current = null;
          setActiveCard(null);
        } else {
          pendingCardRef.current = evt.card;
        }
      }

      // Add to event logs
      let logMsg = '';
      if (evt.type === 'HARBOR_LOADED') {
        const who = state.players.find(player => player.id === evt.playerId)?.name ?? 'Thuyền trưởng';
        logMsg = `${who} xếp một lô hàng xuất tại ${portGuide[BOARD_TILES[evt.tileId].code].name}.`;
      } else if (evt.type === 'HARBOR_DISCHARGED') {
        const { playerId, tileId, carrierNet, operatorName, handlingFee } = evt.receipt;
        const who = state.players.find(player => player.id === playerId)?.name ?? 'Thuyền trưởng';
        logMsg = `${who} dỡ hàng tại ${portGuide[BOARD_TILES[tileId].code].name}, nhận $${carrierNet}M.`;
        if (handlingFee) logMsg += ` ${operatorName} nhận $${handlingFee}M phí dỡ hàng.`;
      } else if (evt.type === 'BACKHAUL_ACCEPTED' || evt.type === 'BACKHAUL_EXPIRED' || evt.type === 'BACKHAUL_FULFILLED') {
        const who = state.players.find(player => player.id === evt.playerId)?.name ?? 'Đội tàu';
        const port = portGuide[BOARD_TILES[evt.job.destinationTileId].code].name;
        if (evt.type === 'BACKHAUL_ACCEPTED') logMsg = `${who} nhận chuyến về ${port}, hạn vòng ${evt.job.deadlineRound}.`;
        else if (evt.type === 'BACKHAUL_FULFILLED') logMsg = `${who} hoàn thành chuyến về ${port}.`;
        else logMsg = `Chuyến về ${port} của ${who} đã hết hiệu lực.`;
        setBoardNotice({ type: 'freight', text: logMsg });
      } else if (evt.type === 'FREIGHT_TENDER_BID' || evt.type === 'FREIGHT_TENDER_BID_WITHDRAWN') {
        const who = state.players.find(player => player.id === evt.playerId)?.name ?? 'Một đội tàu';
        logMsg = evt.type === 'FREIGHT_TENDER_BID' ? `${who} đã gửi chào giá kín cho chủ hàng.` : `${who} đã rút báo giá kín.`;
      } else if (evt.type === 'FREIGHT_TENDER_AWARDED' || evt.type === 'FREIGHT_CONTRACT_FULFILLED' || evt.type === 'FREIGHT_CONTRACT_EXPIRED') {
        const who = state.players.find(player => player.id === evt.playerId)?.name ?? 'Đội tàu';
        const port = portGuide[BOARD_TILES[evt.destinationTileId].code].name;
        if (evt.type === 'FREIGHT_TENDER_AWARDED') logMsg = `${who} trúng thầu giao tại ${port} trong vòng ${evt.deliveryRound}, thưởng $${evt.amount}M nếu đúng hạn.`;
        else if (evt.type === 'FREIGHT_CONTRACT_FULFILLED') logMsg = `${who} đã giao đúng hạn tại ${port} và nhận thêm $${evt.amount}M tiền thưởng hợp đồng.`;
        else logMsg = `Hợp đồng giao tại ${port} của ${who} đã hết hạn.`;
        setBoardNotice({ type: 'freight', text: logMsg });
      } else if (evt.type === 'CARGO_RETURNED_TO_YARD') {
        const captain = state.players.find(player => player.id === evt.playerId)?.name ?? 'Thuyền trưởng';
        const port = portGuide[BOARD_TILES[evt.tileId].code].name;
        const box = evt.kind === 'empty' ? 'vỏ rỗng' : evt.reeferDueRound !== undefined ? 'lô hàng lạnh' : 'lô hàng xuất';
        const stock = state.logistics?.ports[evt.tileId];
        logMsg = `${captain} trả ${box} về bãi ${port}. Khoang tàu trống để nhận vận đơn mới.`;
        if (stock) setBoardNotice({ type: 'yardReturn', event: evt, captain, stock, revision: state.cargoRevision ?? 0 });
      } else if (evt.type === 'PORT_TRUCK_CALLED') {
        const who = state.players.find(player => player.id === evt.playerId)?.name ?? 'Thuyền trưởng';
        const port = portGuide[BOARD_TILES[evt.tileId].code].name;
        const stock = state.logistics?.ports[evt.tileId];
        logMsg = `${who} gọi sớm ${evt.operation === 'export' ? 'xe xuất' : 'xe nhận hàng'} của vòng ${evt.scheduledRound} tại ${port}.`;
        if (stock) setBoardNotice({ type: 'truckCall', call: evt, captain: who, stock, revision: state.cargoRevision ?? 0 });
      } else if (evt.type === 'CARGO_LOADED' || evt.type === 'CARGO_UNLOADED' || evt.type === 'CARGO_DESTINATION_CHANGED') {
        const who = state.players.find(p => p.id === evt.playerId)?.name ?? 'Thuyền trưởng';
        const to = portGuide[BOARD_TILES[evt.destinationTileId].code].name;
        const box = evt.reeferDueRound !== undefined ? 'container lạnh' : evt.kind === 'empty' ? 'container rỗng' : 'container hàng';
        if (evt.type === 'CARGO_LOADED') logMsg = `${who} đã xếp ${box} lên tàu đi ${to}.`;
        else if (evt.type === 'CARGO_UNLOADED') {
          logMsg = `${who} giao ${box} cho xe tại ${to}, nhận $${getVoyagePayment(evt)}M.`;
          if (evt.streetTurn) logMsg += ' Vỏ được chuyển thẳng để đóng thêm 1 lô hàng xuất tại bến.';
        }
        else logMsg = `${who} đổi cảng đích của ${box} từ ${portGuide[BOARD_TILES[evt.previousDestinationTileId].code].name} sang ${to}.`;
        setBoardNotice(evt.type === 'CARGO_DESTINATION_CHANGED'
          ? { type: 'diversion', change: evt, captain: who, revision: state.cargoRevision ?? 0 }
          : { type: 'freight', text: logMsg });
      } else if (state.mode === 'logistics' && evt.type === 'SHIP_STEPPED') {
        const who = state.players.find(p => p.id === evt.playerId)?.name ?? 'Thuyền trưởng';
        logMsg = evt.feeder
          ? `${who} dùng chuyến trung chuyển để cập cảng ${portGuide[BOARD_TILES[evt.to].code].name}.`
          : `${who} cập cảng ${portGuide[BOARD_TILES[evt.to].code].name}.`;
        setBoardNotice(null);
      } else if (evt.type === 'LOGISTICS_TURN_ENDED') {
        setBoardNotice(null);
      } else if (evt.type === 'DICE_ROLLED') {
        setBoardNotice(null);
        logMsg = `🎲 Đổ được ${evt.dice[0]} + ${evt.dice[1]} = ${evt.dice[0] + evt.dice[1]}`;
      } else if (evt.type === 'AUCTION_STARTED') {
        logMsg = `Mở đấu giá ${BOARD_TILES[evt.tileId].name}.`;
      } else if (evt.type === 'AUCTION_ENDED') {
        const property = BOARD_TILES[evt.tileId].name;
        const winner = state.players.find(player => player.id === evt.winnerId);
        logMsg = winner
          ? `${winner.name} thắng đấu giá ${property} với giá $${evt.price}M.`
          : `${property} chưa có người mua.`;
        setBoardNotice({ type: 'auction', text: logMsg });
      } else if (evt.type === 'TRADE_OFFERED' && evt.offer.sellerId === myPlayerId) {
        const buyer = state.players.find(player => player.id === evt.offer.buyerId);
        logMsg = `${buyer?.name ?? 'Một thuyền trưởng'} đề nghị mua ${BOARD_TILES[evt.offer.tileId].name} với giá $${evt.offer.price}M.`;
        setBoardNotice({ type: 'trade', text: logMsg });
      } else if (evt.type === 'TRADE_CLOSED') {
        const { buyerId, sellerId, price, tileId } = evt.offer;
        const property = BOARD_TILES[tileId].name;
        if (evt.result === 'ACCEPTED') {
          const buyer = state.players.find(player => player.id === buyerId);
          const seller = state.players.find(player => player.id === sellerId);
          logMsg = `${buyer?.name} mua ${property} từ ${seller?.name} với giá $${price}M.`;
        } else if (myPlayerId === buyerId || myPlayerId === sellerId) {
          const status = { DECLINED: 'đã bị từ chối', WITHDRAWN: 'đã được rút lại', EXPIRED: 'đã hết hiệu lực' };
          logMsg = `Đề nghị mua ${property} với giá $${price}M ${status[evt.result]}.`;
        }
        if (logMsg && (evt.result === 'ACCEPTED' || !tradeSettled)) setBoardNotice({ type: 'trade', text: logMsg });
      } else if (evt.type === 'STORM_RESOLVED') {
        logMsg = evt.choice === 'TUG'
          ? `⚓ Thuê tàu kéo giữ vị trí với phí $${STORM_TUG_FEE}M`
          : `🌊 Tàu trôi lùi ${Math.abs(STORM_DRIFT_STEPS)} ô trong bão`;
      } else if (evt.type === 'PASSED_GO') {
        logMsg = `🏁 Đi qua Singapore Hub nhận $${evt.reward}M`;
      } else if (evt.type === 'TILE_PURCHASED' && sale?.tileId !== evt.tileId) {
        logMsg = `🏗️ Đã mua ô #${evt.tileId} với giá $${evt.price}M`;
      } else if (evt.type === 'DEMURRAGE_PAID') {
        if (state.mode === 'harbor') {
          const owner = state.players.find(player => player.id === evt.creditorId)?.name ?? 'chủ cảng';
          const visitor = state.players.find(player => player.id === evt.debtorId)?.name ?? 'Thuyền trưởng';
          logMsg = `${visitor} trả ${owner} $${evt.amount}M tiền thuê tại ${BOARD_TILES[evt.tileId].name}.`;
        } else logMsg = `💸 Nộp $${evt.amount}M phí lưu bãi`;
      } else if (evt.type === 'DEBT_SETTLED') {
        const debtor = state.players.find(player => player.id === evt.debtorId);
        logMsg = `${debtor?.name ?? 'Thuyền trưởng'} đã thanh toán khoản nợ $${evt.amount}M.`;
        setBoardNotice({ type: 'debt', text: logMsg });
      } else if (evt.type === 'TILE_MORTGAGED') {
        logMsg = `⚓ Thế chấp ${BOARD_TILES[evt.tileId].name}, nhận $${evt.amount}M.`;
      } else if (evt.type === 'SENT_TO_HOLD') {
        logMsg = `⚓ Bị giữ tàu kiểm hóa: ${evt.reason}`;
      } else if (evt.type === 'RELEASED_FROM_HOLD') {
        logMsg = `🚢 Đã được thông quan hải quan`;
      } else if (evt.type === 'CONTAINER_BUILT') {
        logMsg = `📦 Nâng cấp container lên cấp ${evt.newLevel}`;
      } else if (evt.type === 'CONTAINER_SOLD') {
        logMsg = `💰 Bán bớt container thu hồi $${evt.refund}M`;
      } else if (evt.type === 'GREEN_FLEET_UPGRADED') {
        logMsg = `🌱 Nâng cấp Tàu Nhiên Liệu Xanh (Green Fuel Ready)`;
      } else if (evt.type === 'SLOT_CHARTER_ACCEPTED') {
        logMsg = `🤝 Liên minh "As ONE, We Can": Chia sẻ chỗ thành công (giảm 50% cước)`;
      } else if (evt.type === 'SLOT_CHARTER_RENT_SPLIT') {
        logMsg = `⚓ Chủ cảng nhận $${evt.ownerAmount ?? evt.splitAmount}M, đối tác nhận $${evt.splitAmount}M`;
      } else if (evt.type === 'MISSION_COMPLETED') {
        const captain = state.players.find(player => player.id === evt.playerId);
        logMsg = `🎯 ${captain?.name ?? 'Thuyền trưởng'} hoàn thành ${evt.mission.title} (+$${evt.reward}M)!`;
      } else if (evt.type === 'CARBON_TAX_EXEMPTED') {
        logMsg = `🌱 Miễn 100% Thuế Carbon nhờ Tàu Nhiên Liệu Xanh`;
      } else if (evt.type === 'PLAYER_BANKRUPT') {
        logMsg = `💥 Người chơi đã tuyên bố phá sản!`;
      }

      if (logMsg) {
        setEventLogs((prev) => [logMsg, ...prev.slice(0, 15)]);
      }
    }
  }), [subscribeBoard, myPlayerId]);

  const activePlayer = gameState?.players[gameState.activePlayerIndex];
  const NoticeIcon = boardNotice && 'text' in boardNotice ? noticeIcons[boardNotice.type] : MapPin;
  const captain = gameState?.players.find(player => player.id === myPlayerId);
  const freightGame = gameState?.mode === 'logistics';
  const canOpenTrades = !freightGame && captain && !captain.isBankrupt && !gameState?.winnerId;
  const mission = React.useMemo(() => gameState && gameState.mode !== 'logistics' && myPlayerId ? getMissionProgress(gameState, myPlayerId) : null,
    [gameState, myPlayerId]);
  const missionTargetIds = showMissionTargets && mission && !captain?.secretMission?.isCompleted && !captain?.isBankrupt
    ? mission.objectives.flatMap(objective => !objective.achieved && objective.tileId !== undefined ? [objective.tileId] : [])
    : [];
  const incoming = gameState?.tradeOffers?.filter(offer => offer.sellerId === myPlayerId).length ?? 0;
  const sky = gameState && getBoardLighting({
    turnCount: gameState.turnCount,
    activePlayerIndex: gameState.activePlayerIndex,
    playerCount: gameState.players.length,
    stormActive: gameState.stormActive,
  });
  const conditions = weatherReadouts[sky && sky.weather !== 'clear' ? sky.weather : sky?.body ?? 'sun'];

  return (
    <div className="chart-app">
      <header className="chart-masthead">
        <div className="chart-brand">
          <Compass aria-hidden="true" />
          <div><strong>ONE</strong> <span>Monopoly</span></div>
        </div>
        <nav className="chart-nav" aria-label="Thông tin phòng">
          {room && <span className="chart-room">Phòng <b>{room.id}</b></span>}
          <span className={`chart-connection ${isConnected ? 'online' : ''}`} title={isConnected ? 'Đã kết nối' : 'Đang kết nối...'}>
            <Radio size={16} aria-hidden="true" />
            <span>{isConnected ? 'Đã kết nối' : 'Đang kết nối...'}</span>
          </span>
          {gameState && <button type="button" data-table-guide className="chart-nav-guide" aria-haspopup="dialog" aria-label="Cách chơi"
            onClick={() => setGuideMode(gameState.mode ?? 'classic')}><BookOpenCheck size={15} aria-hidden="true" /><span>Cách chơi</span></button>}
          {gameState && (
            <details className="chart-log">
              <summary aria-label="Nhật ký vận hành"><BookOpen size={17} /> <span>Nhật ký</span></summary>
              <div className="chart-log-popover">
                <h2>Nhật ký vận hành</h2>
                {eventLogs.length === 0
                  ? <p>Ván chơi mới bắt đầu.</p>
                  : <ol>{eventLogs.map((log, idx) => <li key={idx}>{log}</li>)}</ol>}
              </div>
            </details>
          )}
          {room && <button className="chart-nav-icon" onClick={leaveRoom} title="Rời phòng" aria-label="Rời phòng"><LogOut size={17} /></button>}
        </nav>
      </header>

      {errorMsg && (
        <div className="chart-error" role="alert">
          <AlertCircle size={17} />
          <span>{errorMsg}</span>
          <button onClick={clearError} aria-label="Đóng thông báo"><X size={16} /></button>
        </div>
      )}

      {!room || !gameState || !activePlayer || !sky ? (
        <main className="chart-lobby-main">
          <Lobby
            room={room}
            isStarting={isStarting}
            myPlayerId={myPlayerId}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            onToggleReady={toggleReady}
            onStartGame={startGame}
            onOpenGuide={setGuideMode}
            onLeaveRoom={leaveRoom}
          />
        </main>
      ) : (
        <main className="game-table">
          <section className="chart-sheet" aria-label="Hải đồ hành trình">
            <header className="chart-sheet-header">
              <div className="chart-sheet-heading">
                <h1>Hải đồ</h1>
                <div className="chart-voyage-meta">
                  <span>Vòng {gameState.turnCount}</span>
                  <span className="chart-weather-readout" role="status"><conditions.Icon size={13} aria-hidden="true" />{sky.label} · {conditions.label}</span>
                </div>
              </div>
              {freightGame && <div className="freight-chart-tools" role="group" aria-label="Công cụ vận tải">
                <button type="button" data-freight-tool="market" aria-haspopup="dialog" onClick={() => setFreightTool('market')}>
                  <Store size={15} aria-hidden="true" />Thị trường cảng
                </button>
                <button type="button" data-freight-tool="voyages" aria-haspopup="dialog" onClick={() => setFreightTool('voyages')}>
                  <Route size={15} aria-hidden="true" />Sổ chuyến
                </button>
              </div>}
              {canOpenTrades && (
                <button type="button" className="chart-trade-open" onClick={() => openTrades()} aria-haspopup="dialog"
                  aria-label={incoming ? `Giao dịch, ${incoming} đề nghị đang chờ` : 'Giao dịch'} aria-expanded={!!tradeDesk}>
                  <Handshake size={16} aria-hidden="true" /> Giao dịch
                  {incoming > 0 && <strong className="chart-trade-count">{incoming}</strong>}
                </button>
              )}
              <div className="chart-view-picker" role="group" aria-label="Góc nhìn bàn cờ">
                <button type="button" aria-pressed={!is3D} onClick={() => setIs3D(false)}><Map size={15} />2D</button>
                <button type="button" aria-pressed={is3D} onClick={() => setIs3D(true)}><Box size={15} />3D</button>
              </div>
            </header>
            <div className="board-viewport">
              <Board
                gameState={gameState}
                sky={sky}
                subscribeBoard={subscribeBoard}
                myPlayerId={myPlayerId}
                selectedTileId={selectedTileId}
                onSelectTile={setSelectedTileId}
                missionTargetIds={missionTargetIds}
                onAction={sendAction}
                onOfferForTile={openTrades}
                onOpenFeederChart={openFeederChart}
                yardReturn={boardNotice?.type === 'yardReturn' ? boardNotice : undefined}
                focusFeederTileId={feederFocus?.room === gameState.roomId && feederFocus.round === gameState.turnCount &&
                  feederFocus.captainId === activePlayer?.id ? feederFocus.tileId : undefined}
                isRolling={isRolling}
                activeCard={activeCard}
                onCloseCard={() => setActiveCard(null)}
                is3D={is3D}
                onPawnMovingChange={setIsPawnMoving}
                onRentReceiptsChange={updateRent}
              />
            </div>
            <div className="chart-position" role="status">
              {boardNotice?.type === 'yardReturn' ? (
                <YardReturnReceipt key={boardNotice.revision} {...boardNotice} is3D={is3D} />
              ) : boardNotice?.type === 'truckCall' ? (
                <TruckCallReceipt key={boardNotice.revision} call={boardNotice.call} captain={boardNotice.captain} stock={boardNotice.stock} is3D={is3D} />
              ) : boardNotice?.type === 'diversion' ? (
                <DiversionReceipt key={boardNotice.revision} change={boardNotice.change} captain={boardNotice.captain} />
              ) : boardNotice ? (
                <><NoticeIcon size={14} aria-hidden="true" /><strong>{boardNotice.text}</strong></>
              ) : (
                <><MapPin size={14} aria-hidden="true" /><span>Vị trí tàu</span><strong>{BOARD_TILES[activePlayer.position].name}</strong></>
              )}
            </div>
          </section>
          <aside className="table-controls">
            <PlayerSidebar gameState={gameState} myPlayerId={myPlayerId} turnTimer={turnTimer}
              onOfferForTile={openTrades} rentReceipts={rent.visible} pendingRent={rent.pending} reactions={reactions} />
            <div className="table-actions">
              {freightGame && <RivalDispatch state={gameState} myPlayerId={myPlayerId} subscribeBoard={subscribeBoard} onInspectPort={setSelectedTileId} />}
              {freightGame ? <FreightDesk key={`${gameState.roomId}/${myPlayerId}`} gameState={gameState} myPlayerId={myPlayerId} is3D={is3D} onAction={sendAction}
                remainingSeconds={turnTimer?.playerId === activePlayer.id ? turnTimer.seconds : undefined}
                onOpenFeederChart={openFeederChart} marketOpen={freightTool === 'market'} onOpenMarket={() => setFreightTool('market')}
                onCloseMarket={() => setFreightTool(null)} onInspectPort={setSelectedTileId} /> : <ActionControls
                gameState={gameState}
                myPlayerId={myPlayerId}
                onAction={sendAction}
                onOpenTrades={() => openTrades()}
                isRolling={isRolling}
                isPawnMoving={isPawnMoving}
              />}
              {gameState.mode === 'harbor' && !gameState.winnerId && <HarborFreightDesk
                state={gameState} myPlayerId={myPlayerId} onAction={sendAction} is3D={is3D}
                busy={isRolling || isPawnMoving || !!activeCard} />}
              {captain && mission && (!captain.isBankrupt || captain.secretMission?.isCompleted) && (
                <SecretMissionCardView gameState={gameState} player={captain} progress={mission}
                  showTargets={showMissionTargets} onToggleTargets={() => setShowMissionTargets(value => !value)}
                  onInspectTile={setSelectedTileId} />
              )}
            </div>
            <ReactionFloatingBar onSendReaction={sendReaction} />
          </aside>
          {tradeDesk && myPlayerId && canOpenTrades && (
            <TradeDesk gameState={gameState} myPlayerId={myPlayerId} initialTileId={tradeDesk.tileId}
              onAction={sendAction} onClose={() => setTradeDesk(null)} />
          )}
          {freightGame && !gameState.winnerId && freightTool === 'voyages' &&
            <VoyageLog gameState={gameState} myPlayerId={myPlayerId} onClose={() => setFreightTool(null)} />}
          {freightGame && !gameState.winnerId && freightTool && typeof freightTool === 'object' &&
            <FeederChartDialog state={gameState} {...freightTool} myPlayerId={myPlayerId} is3D={is3D} onAction={sendAction}
              onClose={() => setFreightTool(null)} onSailed={(tileId, keyboard) => {
                if (keyboard) setFeederFocus({ room: gameState.roomId, round: gameState.turnCount, captainId: freightTool.captainId, tileId });
                setFreightTool(null);
              }} />}
          <GameOverModal gameState={gameState} myPlayerId={myPlayerId} onRestart={leaveRoom} />
        </main>
      )}
      {guideMode && <BeginnerGuide mode={guideMode} live={!!gameState?.gameStarted && !gameState.winnerId}
        onClose={() => setGuideMode(null)} />}
    </div>
  );
};
