import React, { useLayoutEffect } from 'react';
import { BOARD_TILES, GameAction, GameCard, GameState, getCargoOpportunity, getFeederRoutes, getImportTruckReservation, getVoyagePayment, OneMonopolyEngine, Player } from '@one-monopoly/shared';
import { LogisticsTile, TileView } from './TileView.js';
import { TILE_CENTER_PERCENT } from './boardCoordinates.js';
import { getPortTender } from './ports/portTender.js';
import { DiceView } from './DiceView.js';
import { PropertyModal } from './PropertyModal.js';
import type { YardReturnRecord } from './YardReturnReceipt.js';
import { CardModal } from './CardModal.js';
import { Pawn3D } from './Pawn3D.js';
import { StormTugRescue } from './StormTugRescue.js';
import { CargoTransfer, useCargoTransfer } from './CargoTransfer.js';
import { useStormTugRescue } from './stormTugPlayback.js';
import { BoardSky } from './BoardSky.js';
import { getPortCallCargo, getPortCallLoad } from './ports/portCallCargo.js';
import { portGuide } from './ports/portGuide.js';
import { WorldPortAtlas } from './WorldPortAtlas.js';
import { ChartTerrainContours } from './ChartTerrainContours.js';
import { TerrainRelief } from './TerrainRelief.js';
import { TERRAIN_RANGES } from './terrainMesh.js';
import type { BoardLighting } from './boardLighting.js';
import { forwardHeading, type TravelFrame } from './boardTravel.js';
import { useBoardPlayback, type RentReceipt } from './useBoardPlayback.js';
import { useIdleMotion } from '../hooks/useIdleMotion.js';
import type { SubscribeBoard } from '../hooks/useSocket.js';
import './chart-board.css';
import './tile-rent.css';

interface Props {
  gameState: GameState;
  sky: BoardLighting;
  subscribeBoard: SubscribeBoard;
  myPlayerId: string | null;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  onOfferForTile: (tileId: number) => void;
  onOpenFeederChart: (captainId: string, originTileId: number, initialTileId?: number) => void;
  focusFeederTileId?: number;
  yardReturn?: YardReturnRecord;
  selectedTileId: number | null;
  onSelectTile: (tileId: number | null) => void;
  missionTargetIds?: readonly number[];
  isRolling: boolean;
  activeCard: GameCard | null;
  onCloseCard: () => void;
  is3D?: boolean;
  onPawnMovingChange?: (isMoving: boolean) => void;
  onRentReceiptsChange?: (visible: Record<number, RentReceipt>, pending: Record<number, RentReceipt>) => void;
}

// Original schematic of the Pacific basin. The open ocean is the dice landing area.
const PacificChart = React.memo(function PacificChart({ is3D }: { is3D: boolean }) {
  const descriptionId = React.useId();
  return (
    <svg className="pacific-chart" viewBox="0 0 480 480" role="img" focusable="false"
      aria-describedby={descriptionId} aria-label={is3D ? 'Hải đồ Thái Bình Dương với các dãy núi nổi' : 'Hải đồ Thái Bình Dương với đường đồng mức và đỉnh núi'}>
      <desc id={descriptionId}>{TERRAIN_RANGES.map(range => range.name).join(', ')}.</desc>
      <defs>
        <pattern id="chart-graticule" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#75a7a0" strokeWidth="1" />
          <path d="M18 20h4m-2-2v4" fill="none" stroke="#8eb3a8" strokeWidth=".8" />
        </pattern>
        <pattern id="chart-land" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#ece7ca" />
          <path d="m-1 1 2-2m-1 7 6-6m-1 7 2-2" stroke="#d4d2b6" strokeWidth=".9" />
        </pattern>
        <g id="chart-coasts" strokeLinejoin="round">
          {/* East Asia and its offshore islands */}
          <path d="M-5-5h207l-12 12-13 2-8 10-12 4-2 12-9 7-6 13 4 10-6 12-5-6 1-18-9 4-10 14-4 14 5 5-8 7-3 14-7 7-4-3 1-10-8 1-5 12 6 8-3 7-11 2-6 11-11 4 3 12-9 12-10 5-3 10-15 8-7 11 6 11-2 15-8 9-7-2 1-8-8-13-4-1-1 28 6 11-1 7-9-13-5-20-9-8-9-1z" />
          <path d="m103 133 7-7 5-9 7-3-4 11-9 9-7 2z M111 112l3-7 7-4 1 6-6 5z M73 166l4-10 4-1-1 8-5 6z M69 193l5-6 5 8-2 10-5-4z M78 211l4-6 3 5-2 6z M73 220l5-5 8 5-6 4z" />
          {/* Indonesia, Australia and New Zealand */}
          <path d="m20 250 10 4 7 11 15 9-4 3-17-11z M51 277l22 4 9 3-1 3-24-4z M53 242l8-9 8 2 6-6 1 13-10 12-10-3z M98 258l13-2 8 4 14 2 6 8-14-3-12 1z" />
          <path d="m65 323 9-10 11-1 2-8 9-3 5 4 6-9 10-2 5 6 8 4 4-18 5 4 4 17 12 14 6 20-3 18-7 10-5 2-4-7-10 3-11-11-9-2-17 5-16-1-8-6-8 1-1-18z M140 377l8 1-4 9-5-3z M181 364l5 7-3 9-5 4-2-3 5-9z M177 385l-8 11-10 7-3-4 10-9z" />
          {/* Alaska, the west coast of the Americas and the Andean coast */}
          <path d="M485-5H308l-6 8-12 2-1 5 10 1-3 8 7 5-3 8-16 8-16 13 11-4 14-7 13-3 13-10 7 1 7 10 15 2 9 7 13 4 8 10 2 7 12 3 2 9 7 13-1 11 8 11 1 13 8 11 5 14 9 9 3 13 5 8 2-4-3-12-7-15 4 1 6 14 9 10 3 9 10 6 5 8 9 2 5 7 8 2 9 6z" />
          <path d="m407 139 4 9 4 4-1 3-5-6z M369 63l10 5 4 8-6-3-6-6z M352 52l9 3 3 6-5-2z M263 54l-8 3-5 1 7-4z" />
          <path d="m485 229-11-4-9-8-13 1-7 10-6 3-4 17-6 5 2 13-4 13 5 15 8 9 8 16 5 5 5 16 6 8 3 16-5 18 3 13-5 19 5 13 5 12 7 7 9 2z" />
        </g>
      </defs>
      <rect width="480" height="480" fill="url(#chart-graticule)" opacity=".64" />
      {[19, 11, 5].map((width) => (
        <use key={width} href="#chart-coasts" fill="none" stroke="#80b3a9" strokeOpacity=".22" strokeWidth={width} />
      ))}
      <use href="#chart-coasts" fill="url(#chart-land)" stroke="#7f9d88" strokeWidth="1.3" />
      {!is3D && <ChartTerrainContours />}
      <g fill="none" strokeLinecap="round" strokeDasharray="5 4">
        <path d="M43 174Q188 12 404 107" stroke="#b92d67" strokeWidth="1.9" />
        <path d="M112 127Q286 37 422 150Q452 202 431 274" stroke="#417e80" strokeWidth="1.6" />
        <path d="M43 174Q39 279 151 330Q193 363 201 394" stroke="#417e80" strokeWidth="1.5" />
      </g>
      <g fill="#fff8dd" stroke="#9f305d" strokeWidth="2">
        {[[43, 174], [112, 127], [404, 107], [422, 150], [431, 274], [151, 330]].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="3.6" />
        ))}
      </g>
      <g transform="translate(356 369)" fill="none" stroke="#487f79">
        <circle r="28" opacity=".5" />
        <circle r="32" strokeDasharray="1 5.28" />
        <path d="M-38 0h76M0-38v76" strokeWidth=".8" />
        {[0, 90, 180, 270].map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <path d="m0-30 5 25-5 5z" fill="#2d6765" />
            <path d="m0-30-5 25 5 5z" fill="#f2e9cb" />
          </g>
        ))}
        <circle r="3.5" fill="#b82a63" stroke="#f3e8c9" />
      </g>
      <g fill="none" stroke="#4b827b" strokeWidth="1.2">
        <rect x="7" y="7" width="466" height="466" opacity=".5" />
        <path d="M12 30V12h18m420 0h18v18m0 420v18h-18m-420 0H12v-18" />
      </g>
    </svg>
  );
});

interface MovingPawnProps {
  children?: React.ReactNode;
  player: Player;
  frame?: TravelFrame;
  allowIdle: boolean;
  exposure: number;
  tile: number;
  heading: number;
  is3D: boolean;
  zIndex: number;
  stackIndex: number;
  stackSize: number;
  advance: (id: string, frame: TravelFrame) => void;
}

function MovingPawn({ player, frame, allowIdle, exposure, tile, heading, is3D, zIndex, stackIndex, stackSize, advance, children }: MovingPawnProps) {
  useLayoutEffect(() => {
    if (!frame) return;
    if (frame.duration === 0) {
      advance(player.id, frame);
      return;
    }
    const timer = setTimeout(() => advance(player.id, frame), frame.duration);
    return () => clearTimeout(timer);
  }, [player.id, frame, advance]);

  const coord = TILE_CENTER_PERCENT[tile];
  return (
    <div className="absolute pointer-events-none" style={{
      left: `${coord.x}%`,
      top: `${coord.y}%`,
      transition: frame?.gliding ? `left ${frame.duration}ms linear, top ${frame.duration}ms linear` : 'none',
      transform: 'translate(-50%, -50%)',
      transformStyle: is3D ? 'preserve-3d' : undefined,
      zIndex,
    }}>
      <Pawn3D player={player} idle={allowIdle && !frame} exposure={exposure} is3D={is3D} heading={heading} stackIndex={stackIndex} stackSize={stackSize}>
        {children}
      </Pawn3D>
    </div>
  );
}

function arrivalStatus(call: NonNullable<ReturnType<typeof getPortCallCargo>>, loadedHere: boolean) {
  if (call.receipt) {
    const type = call.receipt.kind === 'empty' ? 'vỏ rỗng' : call.receipt.reeferDueRound !== undefined ? 'hàng lạnh' : 'hàng xuất';
    return `Đã giao ${type} · +$${getVoyagePayment(call.receipt)}M${call.receipt.streetTurn ? ' · thêm 1 lô xuất' : ''}`;
  }
  if (!call.booking) {
    const excess = Math.max(0, call.stock.empties - call.stock.emptyTarget);
    return `Khoang trống · ${call.stock.supply} lô xuất · ${excess} vỏ dư`;
  }
  const service = call.cargoType === 'reefer' ? 'Hàng lạnh' : call.cargoType === 'empty' ? 'Vỏ rỗng' : 'Hàng xuất';
  if (!call.bookedHere) {
    const destination = portGuide[BOARD_TILES[call.booking.destinationTileId].code].name;
    return loadedHere ? `Đã xếp ${service.toLocaleLowerCase('vi')} → ${destination}` : `${service} còn trên tàu → ${destination}`;
  }
  if (!call.active) return `${service} · chờ lượt dỡ`;
  if (call.receiver === 'unavailable') return call.cargoType === 'empty' ? 'Bến đã đủ vỏ rỗng' : 'Chưa có xe trống nhận hàng';
  const total = call.estimate?.total;
  if (call.receiver === 'appointment') return `${service} · xe đã giữ${total != null ? ` · $${total}M` : ''}`;
  return `${service} · có thể dỡ tại bến${total != null ? ` · $${total}M` : ''}`;
}

export const Board: React.FC<Props> = ({
  gameState,
  sky,
  subscribeBoard,
  myPlayerId,
  onAction,
  onOfferForTile,
  onOpenFeederChart,
  focusFeederTileId,
  yardReturn,
  selectedTileId,
  onSelectTile,
  missionTargetIds,
  isRolling,
  activeCard,
  onCloseCard,
  is3D = true,
  onPawnMovingChange,
  onRentReceiptsChange,
}) => {
  const idleMotion = useIdleMotion();
  const isLogistics = gameState.mode === 'logistics';
  const heldTrucks = React.useMemo(() => {
    const counts: Record<number, number> = {};
    for (const player of gameState.players) {
      const hold = getImportTruckReservation(gameState, player.id);
      if (hold) counts[hold.destinationTileId] = (counts[hold.destinationTileId] ?? 0) + 1;
    }
    return counts;
  }, [gameState]);
  const allowIdle = idleMotion && selectedTileId === null && !activeCard && !gameState.winnerId;
  const { tracks, claims, rentReceipts, pendingRentReceipts, advance, atlas, showPort, closeAtlas, portDischarge, portLoad } = useBoardPlayback(gameState, subscribeBoard);
  const { rescue, finishRescue } = useStormTugRescue(subscribeBoard);
  const { transfer, finishTransfer } = useCargoTransfer(subscribeBoard);
  const moving = gameState.players.some((player) => !player.isBankrupt && tracks[player.id]?.frames.length);
  const visibleAtlas = !moving && !isRolling && !gameState.winnerId ? atlas : null;
  const [terminalArrival, setTerminalArrival] = React.useState<{ tileId: number; playerId: string } | null>(null);
  const activeCaptain = gameState.players[gameState.activePlayerIndex];
  const atlasTile = visibleAtlas ? BOARD_TILES.find(tile => tile.code === visibleAtlas.port.code) : undefined;
  const arrivalCaptain = visibleAtlas?.playerId ?? activeCaptain?.id;
  const arrivalCargo = React.useMemo(() => isLogistics && atlasTile && arrivalCaptain
    ? getPortCallCargo(gameState, atlasTile.id, arrivalCaptain, portDischarge ?? undefined) : null,
  [gameState, isLogistics, atlasTile, arrivalCaptain, portDischarge]);
  const loadedHere = !!getPortCallLoad(arrivalCargo, portLoad);
  const feederRoutes = React.useMemo(() => isLogistics && visibleAtlas?.playerId === activeCaptain?.id && activeCaptain &&
    atlasTile?.id === activeCaptain.position ? getFeederRoutes(gameState, activeCaptain.id) : [],
  [gameState, isLogistics, activeCaptain, visibleAtlas?.playerId, atlasTile]);
  const canPickUp = React.useMemo(() => arrivalCargo?.active && !arrivalCargo.booking && arrivalCargo.playerId === myPlayerId
    && getCargoOpportunity(gameState, arrivalCargo.playerId)?.action.type === 'LOAD_CARGO', [gameState, arrivalCargo, myPlayerId]);
  const atlasFreight = atlasTile && arrivalCargo ? {
    status: arrivalStatus(arrivalCargo, loadedHere),
    actionLabel: canPickUp ? 'Chọn lô để xếp' : loadedHere ? 'Xem vận đơn' : arrivalCargo.receipt ? 'Xem biên nhận' : 'Xem cầu cảng',
    feeder: feederRoutes.length ? {
      stops: feederRoutes.map(route => ({ tileId: route.tileId, code: BOARD_TILES[route.tileId].code, distanceNm: route.distanceNm })),
      open: (tileId?: number) => onOpenFeederChart(arrivalCargo.playerId, atlasTile.id, tileId),
    } : undefined,
    onOpenTerminal: () => {
      setTerminalArrival({ tileId: atlasTile.id, playerId: arrivalCargo.playerId });
      onSelectTile(atlasTile.id);
    },
  } : undefined;
  const boardRoot = React.useRef<HTMLDivElement>(null);
  const returnToPortTile = () => {
    if (visibleAtlas) boardRoot.current?.querySelector<HTMLButtonElement>(
      `button[data-port-tile="${visibleAtlas.port.code}"]`,
    )?.focus({ preventScroll: true });
    closeAtlas();
  };
  useLayoutEffect(() => { onPawnMovingChange?.(moving); }, [moving, onPawnMovingChange]);
  useLayoutEffect(() => {
    onRentReceiptsChange?.(rentReceipts, pendingRentReceipts);
  }, [rentReceipts, pendingRentReceipts, onRentReceiptsChange]);

  // Helper to determine orientation cho bàn cờ 32 ô (9 ô mỗi cạnh)
  const getTileOrientation = (
    id: number
  ): 'bottom' | 'left' | 'top' | 'right' | 'corner' => {
    if (id === 0 || id === 8 || id === 16 || id === 24) return 'corner';
    if (id >= 1 && id <= 7) return 'left';
    if (id >= 9 && id <= 15) return 'top';
    if (id >= 17 && id <= 23) return 'right';
    return 'bottom';
  };

  // Build grid coordinate map cho bàn cờ 32 ô (Lưới 9x9):
  // Tile 0 (SGSIN) nằm ở Row 9, Col 1 (Góc dưới-trái trong 2D, khi xoay -45 độ sẽ nằm CHÍNH DIỆN hướng vào người dùng)
  const getTileGridStyle = (id: number): React.CSSProperties => {
    // Cạnh Dưới-Trái (Row 9 down to 1, Col 1):
    // id 0 (SGSIN): Row 9, Col 1
    // id 1..7: Row 8..2, Col 1
    if (id >= 0 && id <= 7) {
      return {
        gridRow: 9 - id,
        gridColumn: 1,
      };
    }
    // Cạnh Trên-Trái (Row 1, Col 1..9 - Chứa cảng ESVLC ở id 12):
    // id 8 (CUSTOMS_HOLD): Row 1, Col 1
    // id 9..15: Row 1, Col 2..8
    // id 16 (FREE_ANCHOR): Row 1, Col 9
    if (id >= 8 && id <= 16) {
      return {
        gridRow: 1,
        gridColumn: id - 8 + 1,
      };
    }
    // Cạnh Trên-Phải (Col 9, Row 2..9):
    // id 17..23: Row 2..8, Col 9
    // id 24 (GO_TO_HOLD): Row 9, Col 9
    if (id >= 17 && id <= 24) {
      return {
        gridRow: id - 16 + 1,
        gridColumn: 9,
      };
    }
    // Cạnh Dưới-Phải (Row 9, Col 8 down to 2 - Chứa cảng HKHKG ở id 30):
    // id 25..31: Row 9, Col 8..2
    return {
      gridRow: 9,
      gridColumn: 9 - (id - 24),
    };
  };

  const livePlayers = gameState.players.filter((player) => !player.isBankrupt);

  return (
    <div ref={boardRoot} className="relative flex items-center justify-center">
      {/* 3D Perspective Scene Container */}
      <div
        className="w-full flex items-center justify-center overflow-visible transition-all duration-700"
        style={{
          perspective: is3D ? '2000px' : undefined,
          transformStyle: is3D ? 'preserve-3d' : undefined,
        }}
      >
        {/* Printed board and layered edge */}
        <div
          className={`chart-slab relative ${
            is3D ? 'board-tilted' : 'board-flat'
          } aspect-square origin-center border-4 p-2 select-none transition-all duration-700 ease-out`}
          data-mode={gameState.mode ?? 'classic'}
          data-sky-phase={sky.phase}
          data-light={sky.body}
          data-weather={sky.weather}
          data-weather-motion={idleMotion ? 'active' : 'still'}
          style={{
            '--cast-x': `${sky.shadowX.toFixed(2)}px`,
            '--cast-y': `${sky.shadowY.toFixed(2)}px`,
            '--cast-blur': `${sky.shadowBlur}px`,
            '--cast-opacity': sky.shadowOpacity,
            '--model-exposure': sky.exposure,
            transform: is3D
              ? 'rotateX(var(--board-tilt)) rotateZ(var(--board-yaw)) scale(var(--board-scale))'
              : 'none',
            transformStyle: is3D ? 'preserve-3d' : undefined,
          } as React.CSSProperties}
        >
          {/* Lưới 9x9: 4 ô góc hình vuông (1.35fr x 1.35fr), các ô cạnh hình chữ nhật (1fr x 1.35fr) */}
          <div
            className="board-grid w-full h-full gap-1 grid"
            style={{
              gridTemplateColumns: 'minmax(0, 1.35fr) repeat(7, minmax(0, 1fr)) minmax(0, 1.35fr)',
              gridTemplateRows: 'minmax(0, 1.35fr) repeat(7, minmax(0, 1fr)) minmax(0, 1.35fr)',
              transformStyle: is3D ? 'preserve-3d' : undefined,
            }}
          >
            {/* 32 Ô Bàn Cờ */}
            {BOARD_TILES.map((tile) => {
              if (isLogistics) {
                return (
                  <LogisticsTile key={tile.id} tile={tile} placement={getTileGridStyle(tile.id)}
                    stock={gameState.logistics?.ports[tile.id]} tender={getPortTender(gameState, tile.id)}
                    heldTrucks={heldTrucks[tile.id]}
                    is3D={is3D} onClick={() => onSelectTile(tile.id)} />
                );
              }
              const prop = gameState.properties[tile.id];
              const owner = prop?.ownerId
                ? gameState.players.find((p) => p.id === prop.ownerId)
                : undefined;
              const currentRent = OneMonopolyEngine.calculateRent(gameState, tile.id, gameState.dice);

              return (
                <div
                  key={tile.id}
                  style={getTileGridStyle(tile.id)}
                  className="w-full h-full flex"
                >
                  <TileView
                    tile={tile}
                    property={prop}
                    claim={claims[tile.id]}
                    auctioned={gameState.auction?.tileId === tile.id}
                    missionTarget={missionTargetIds?.includes(tile.id)}
                    receipt={rentReceipts[tile.id]}
                    owner={owner}
                    currentRent={currentRent}
                    orientation={getTileOrientation(tile.id)}
                    is3D={is3D}
                    myPlayerId={myPlayerId}
                    onClick={() => onSelectTile(tile.id)}
                  />
                </div>
              );
            })}

            {/* Hải đồ Thái Bình Dương và khu vực gieo xúc xắc */}
            <div
              style={{
                gridRow: '2 / 9',
                gridColumn: '2 / 9',
                transformStyle: is3D ? 'preserve-3d' : undefined,
              }}
              className="chart-water pointer-events-none relative flex items-center justify-center p-3"
            >
              {visibleAtlas ? (
                <WorldPortAtlas arrival={visibleAtlas} is3D={is3D} onClose={returnToPortTile} freight={atlasFreight}
                  onOpenDeed={gameState.mode === 'harbor' && atlasTile ? () => onSelectTile(atlasTile.id) : undefined}
                  focusTerminalOnArrival={focusFeederTileId !== undefined && focusFeederTileId === atlasTile?.id && visibleAtlas.playerId === myPlayerId}
                  dice={!isLogistics && visibleAtlas.playerId && gameState.hasRolled ? gameState.dice : undefined} />
              ) : (
                <>
                  <PacificChart is3D={is3D} />
                  {is3D && <TerrainRelief sky={sky} />}
                  <BoardSky sky={sky} />
                  {isLogistics ? (
                    <div className="logistics-chart-key" aria-label="Chú giải hoạt động cảng">
                      <span className="stock-out">↑ Hàng xuất</span>
                      <span className="stock-in">↓ Xe chờ nhập</span>
                      <span className="stock-empty">□ Vỏ rỗng</span>
                      {gameState.logistics?.market?.tender && <span className="stock-tender">⚑ Mời thầu</span>}
                      {gameState.logistics?.market?.contract?.status === 'active' && <span className="stock-award">✓ Bến hợp đồng</span>}
                    </div>
                  ) : <div
                    className="w-full h-full flex items-center justify-center select-none z-10"
                    style={{
                      transform: is3D ? 'var(--board-billboard) translateZ(38px) scale(var(--model-scale))' : undefined,
                      transformStyle: is3D ? 'preserve-3d' : undefined,
                      transformOrigin: 'center center',
                    }}
                  >
                    <DiceView is3D={is3D} dice={gameState.dice} isRolling={isRolling} hasRolled={gameState.hasRolled} />
                  </div>}
                </>
              )}
            </div>
          </div>

          {/* Keep each player's pawn mounted as it travels between tiles. */}
          <div
            className="absolute inset-2 pointer-events-none z-30"
            style={{ transformStyle: is3D ? 'preserve-3d' : undefined }}
          >
            {livePlayers.map((player, index) => {
              const track = tracks[player.id];
              const frame = track?.frames[0];
              const pose = frame ?? track?.settled;
              const tile = pose?.tile ?? player.position;
              const manifest = gameState.harborFreight?.manifests[player.id] ?? player.cargo;
              const occupants = frame?.gliding ? [] : livePlayers.filter((other) => {
                const otherTrack = tracks[other.id];
                const next = otherTrack?.frames[0];
                return !next?.gliding && (next?.tile ?? otherTrack?.settled.tile ?? other.position) === tile;
              });
              return (
                <MovingPawn
                  key={player.id}
                  player={player}
                  frame={frame}
                  allowIdle={allowIdle}
                  exposure={sky.exposure}
                  tile={tile}
                  heading={pose?.heading ?? forwardHeading(tile)}
                  is3D={is3D}
                  zIndex={player.id === gameState.players[gameState.activePlayerIndex]?.id ? 45 : 20 + index}
                  stackIndex={Math.max(0, occupants.indexOf(player))}
                  stackSize={occupants.length || 1}
                  advance={advance}
                >
                  {manifest && transfer?.playerId !== player.id && (
                    <span className="cargo-box cargo-manifest-box" data-cargo-kind={player.cargo?.reeferDueRound !== undefined ? 'reefer' : player.cargo?.kind ?? 'laden'}
                      data-cargo-origin={manifest.originTileId} aria-hidden="true" />
                  )}
                  {transfer?.playerId === player.id && transfer.tileId === tile && !frame && (
                    <CargoTransfer key={transfer.revision} transfer={transfer} is3D={is3D} motion={idleMotion}
                      faceLeft={TILE_CENTER_PERCENT[tile].x > 50} finish={finishTransfer} />
                  )}
                  {rescue?.playerId === player.id && rescue.tileId === tile && !frame && (
                    <StormTugRescue key={rescue.sequence} rescue={rescue} is3D={is3D}
                      motion={idleMotion} exposure={sky.exposure} faceLeft={TILE_CENTER_PERCENT[tile].x > 50}
                      finish={finishRescue} />
                  )}
                </MovingPawn>
              );
            })}
          </div>

          {/* Floating Rent Receipts in 3D Scene */}
          <div
            className="absolute inset-2 pointer-events-none z-50"
            style={{ transformStyle: is3D ? 'preserve-3d' : undefined }}
          >
            {Object.values(rentReceipts).map((receipt) => {
              const coord = TILE_CENTER_PERCENT[receipt.tileId];
              if (!coord) return null;
              return (
                <div
                  key={`receipt-${receipt.tileId}`}
                  className="absolute pointer-events-none tile-rent-container"
                  style={{
                    left: `${coord.x}%`,
                    top: `${coord.y}%`,
                    transform: is3D
                      ? 'translate(-50%, -50%) rotateZ(calc(0deg - var(--board-yaw))) rotateX(calc(0deg - var(--board-tilt) - 12deg)) translateZ(54px)'
                      : 'translate(-50%, -50%)',
                    transformStyle: is3D ? 'preserve-3d' : undefined,
                  }}
                  aria-hidden="true"
                >
                  <div className="tile-rent-popup">
                    {receipt.lines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`tile-rent-line ${line.type === 'deduct' ? 'tile-rent-deduct' : 'tile-rent-credit'}`}
                      >
                        <span className="tile-rent-name">{line.playerName}:</span>
                        <span className="tile-rent-val">
                          {line.type === 'deduct' ? `-$${line.amount}M 💸` : `+$${line.amount}M 💰`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <span className="sr-only" role="status">
        {Object.values(claims).map((claim) => (
          <span key={claim.tileId}>{gameState.players.find((player) => player.id === claim.playerId)?.name} {claim.swapId === undefined ? 'đã mua' : 'nhận được'} {BOARD_TILES[claim.tileId].name}. </span>
        ))}
        {Object.values(rentReceipts).map((receipt) => (
          <span key={`rent-${receipt.tileId}`}>
            Thanh toán cước tại {BOARD_TILES[receipt.tileId]?.name}: {receipt.lines.map((l) => `${l.playerName} ${l.type === 'deduct' ? 'bị trừ' : 'nhận'} $${l.amount}M`).join(', ')}.
          </span>
        ))}
      </span>

      {/* Property Details Modal */}
      <PropertyModal
        subscribeBoard={subscribeBoard}
        tileId={selectedTileId}
        gameState={gameState}
        myPlayerId={myPlayerId}
        is3D={is3D}
        arrivalCaptainId={terminalArrival?.tileId === selectedTileId ? terminalArrival.playerId : undefined}
        portDischarge={portDischarge}
        portLoad={portLoad}
        yardReturn={yardReturn}
        onClose={() => { setTerminalArrival(null); onSelectTile(null); }}
        onShowPort={(port) => {
          setTerminalArrival(null);
          onSelectTile(null);
          if (gameState.mode === 'harbor' && visibleAtlas?.port.code === port.code) {
            requestAnimationFrame(() => boardRoot.current?.querySelector<HTMLButtonElement>('[data-atlas-deed]')?.focus({ preventScroll: true }));
          } else {
            showPort(port);
          }
        }}
        onOfferForTile={(id) => {
          onSelectTile(null);
          onOfferForTile(id);
        }}
        onAction={onAction}
      />

      {/* Card Modal */}
      <CardModal card={activeCard} onClose={onCloseCard} />
    </div>
  );
};
