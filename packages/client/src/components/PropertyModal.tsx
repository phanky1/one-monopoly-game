import React, { useId, useLayoutEffect, useRef } from 'react';
import {
  BOARD_TILES,
  BoardTile,
  GameAction,
  GameState,
  GREEN_FLEET_COST,
  GREEN_FLEET_ESG_BONUS,
  getTradeRestriction,
  getEmptyNeed,
  getHarborTerminalShare,
  getImportTruckReservation,
  getPortTruckSchedule,
  getReserveImportTruckAction,
  type PortTruckSchedule,
  type PortStock,
  LOOP_GROUPS_CONFIG,
  OneMonopolyEngine,
} from '@one-monopoly/shared';
import { TokenBadge } from './TokenBadge.js';
import { TerminalCargoExchange } from './TerminalCargoExchange.js';
import { PortDeliverySlip, PortLoadingSlip } from './PortDeliverySlip.js';
import { TerminalOutboundBooking } from './TerminalOutboundBooking.js';
import { ImportTruckDesk } from './ImportTruckDesk.js';
import { ReturnCargoDesk } from './ReturnCargoDesk.js';
import { YardReturnReceipt, type YardReturnRecord } from './YardReturnReceipt.js';
import { TruckAppointmentNotice } from './TruckAppointmentNotice.js';
import type { SubscribeBoard } from '../hooks/useSocket.js';
import { getPortCallCargo, getPortCallLoad } from './ports/portCallCargo.js';
import type { PortDischarge, PortLoad } from './ports/portArrival.js';
import { ScheduledOperations } from './TruckTimetable.js';
import { BoardDialog } from './BoardDialog.js';
import { PortMiniature } from './ports/PortMiniature.js';
import { portGuide, type PortGuide } from './ports/portGuide.js';
import { getPortTender, type PortTenderNotice } from './ports/portTender.js';
import { X, Building2, TrendingDown, DollarSign, ShieldAlert, Leaf, Handshake, Truck, Container } from 'lucide-react';

function getRentSchedule(tile: BoardTile): [string, string][] {
  if (tile.type === 'PORT' && tile.rentTiers) {
    const [base, one, two, three, four, terminal] = tile.rentTiers;
    return [
      ['Phí cước cơ bản', `$${base}M`],
      ['Trọn bộ tuyến, chưa xây', `$${base * 2}M`],
      ['1 lô Container Magenta', `$${one}M`],
      ['2 lô Container Magenta', `$${two}M`],
      ['3 lô Container Magenta', `$${three}M`],
      ['4 lô Container Magenta', `$${four}M`],
      ['Siêu tàu ONE Innovation (24K TEU)', `$${terminal}M`],
    ];
  }
  if (tile.type === 'SERVICE_LINE') {
    return [
      ['Sở hữu 1 tuyến', '$25M'],
      ['Sở hữu 2 tuyến', '$50M'],
      ['Sở hữu 3 tuyến', '$100M'],
      ['Trọn bộ 4 tuyến toàn cầu', '$200M'],
    ];
  }
  if (tile.type === 'INFRA') {
    return [
      ['Sở hữu 1 nền tảng', '4 × tổng xúc xắc'],
      ['Sở hữu cả 2 nền tảng', '10 × tổng xúc xắc'],
    ];
  }
  return [];
}

function TerminalQueue({ quantity, direction }: { quantity: number; direction: 'export' | 'import' }) {
  const label = direction === 'export' ? 'Xe chở hàng xuất' : 'Xe nhận hàng còn trống';
  return (
    <div className="terminal-queue" data-direction={direction}>
      <dt>{label}</dt>
      <dd>
        <span className="terminal-trucks" aria-hidden="true">
          {Array.from({ length: Math.min(quantity, 5) }, (_, index) => <Truck key={index} />)}
        </span>
        <strong>{quantity} xe</strong>
      </dd>
    </div>
  );
}

type TerminalHandling = PortDischarge | PortLoad;

function TerminalDetails({ guide, stock, tender, schedule, titleId, onClose, onShowPort, cargo, handling, yardReturn, captainName, is3D, truckNotice }: {
  yardReturn?: YardReturnRecord;
  truckNotice: React.ReactNode;
  cargo: React.ReactNode;
  handling: TerminalHandling | null;
  captainName: string;
  is3D: boolean;
  guide: PortGuide;
  stock?: PortStock;
  tender: PortTenderNotice | null;
  schedule: PortTruckSchedule | null;
  titleId: string;
  onClose: () => void;
  onShowPort: (port: PortGuide) => void;
}) {
  const handlingOnOpen = useRef(handling);
  const returnOnOpen = useRef(yardReturn?.revision);
  const animate = handling?.type !== handlingOnOpen.current?.type || handling?.bookingId !== handlingOnOpen.current?.bookingId;
  const column = useRef<HTMLDivElement>(null);
  const keyboardConfirmation = useRef<TerminalHandling['type'] | null>(null);
  useLayoutEffect(() => {
    if (handling && keyboardConfirmation.current === handling.type) {
      keyboardConfirmation.current = null;
      column.current?.querySelector<HTMLElement>('[data-terminal-load-slip], [data-terminal-receipt]')?.focus();
    }
  }, [handling]);
  const shortage = stock ? getEmptyNeed(stock) : 0;
  const surplus = stock ? Math.max(0, stock.empties - stock.emptyTarget) : 0;
  const equipmentStatus = shortage ? `Cần thêm ${shortage} vỏ` : surplus ? `Dư ${surplus} vỏ` : 'Đủ vỏ dự trữ';
  return (
    <BoardDialog labelledBy={titleId} onClose={onClose}>
      <div className="chart-dialog-sheet chart-manifest terminal-detail" data-working-berth={cargo || handling || yardReturn ? true : undefined}>
        <button type="button" aria-label="Đóng thông tin cảng" onClick={onClose} className="chart-dialog-close">
          <X aria-hidden="true" />
        </button>
        <header className="chart-manifest-heading">
          <div className="chart-dialog-kicker"><span>{guide.code}</span><span>{guide.country}</span></div>
          <h3 id={titleId} className="chart-dialog-title">Cảng {guide.name}</h3>
        </header>
        {(cargo || handling || yardReturn) && <div className="terminal-quay-column" ref={column}
          onClickCapture={event => {
            if (event.detail !== 0 || !(event.target instanceof Element)) return;
            if (event.target.closest('[data-terminal-load]')) keyboardConfirmation.current = 'CARGO_LOADED';
            if (event.target.closest('[data-terminal-unload], [data-street-turn-unload="quay"]')) keyboardConfirmation.current = 'CARGO_UNLOADED';
          }}>
          {handling?.type === 'CARGO_LOADED' && <PortLoadingSlip key={handling.bookingId} event={handling}
            captainName={captainName} is3D={is3D} animate={animate} />}
          {handling?.type === 'CARGO_UNLOADED' && <PortDeliverySlip key={handling.bookingId} event={handling}
            captainName={captainName} is3D={is3D} animate={animate} />}
          {yardReturn && <YardReturnReceipt key={yardReturn.revision} {...yardReturn} is3D={is3D}
            animate={yardReturn.revision !== returnOnOpen.current} />}
          {cargo}
        </div>}
        <div className="terminal-port-information">
          <PortMiniature code={guide.code} variant="detail" />
          {tender && <section className="terminal-tender-note" data-phase={tender.phase}>
            <strong>{tender.label}</strong><p>{tender.detail}</p>
          </section>}
          {stock && (
            <section className="terminal-activity" aria-label="Điều độ tại bến">
              <h4>Điều độ tại bến</h4>
              <dl>
                <TerminalQueue quantity={stock.supply} direction="export" />
                <TerminalQueue quantity={stock.demand} direction="import" />
                <div className="terminal-equipment">
                  <dt><Container aria-hidden="true" /> Vỏ rỗng tại bãi</dt>
                  <dd><strong>{stock.empties} vỏ</strong>
                    <span>{equipmentStatus}</span>
                  </dd>
                </div>
              </dl>
            </section>
          )}
          {truckNotice}
          {schedule && (schedule.operations.length > 0 || !!schedule.returningImportTrucks) && <section className="terminal-truck-schedule" aria-label="Lịch xe tại bến">
            <h4>Lịch xe vòng {schedule.scheduledRound}</h4>
            <ScheduledOperations schedule={schedule} />
          </section>}
          <div className="port-deed-geography terminal-geography">
            <p>{guide.fact}</p>
            <button type="button" onClick={() => onShowPort(guide)}>Xem trên bản đồ</button>
          </div>
        </div>
      </div>
    </BoardDialog>
  );
}

interface Props {
  subscribeBoard: SubscribeBoard;
  tileId: number | null;
  gameState: GameState;
  myPlayerId: string | null;
  onClose: () => void;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  portDischarge: PortDischarge | null;
  portLoad: PortLoad | null;
  yardReturn?: YardReturnRecord;
  arrivalCaptainId?: string;
  is3D: boolean;
  onOfferForTile: (tileId: number) => void;
  onShowPort: (port: PortGuide) => void;
}

export const PropertyModal: React.FC<Props> = ({
  subscribeBoard,
  tileId,
  gameState,
  myPlayerId,
  onClose,
  onAction: dispatch,
  portDischarge,
  portLoad,
  yardReturn,
  arrivalCaptainId,
  is3D,
  onOfferForTile,
  onShowPort,
}) => {
  const titleId = useId();

  if (tileId === null) return null;

  const tile = BOARD_TILES[tileId];
  if (!tile) return null;

  const guide = portGuide[tile.code];
  if (gameState.mode === 'logistics') {
    const captainId = arrivalCaptainId ?? gameState.players[gameState.activePlayerIndex]?.id;
    const call = captainId ? getPortCallCargo(gameState, tileId, captainId, portDischarge) : null;
    const load = getPortCallLoad(call, portLoad);
    const captain = gameState.players[gameState.activePlayerIndex];
    // A captain can contact the booked receiver from either end of the voyage.
    const appointmentDesk = captain?.id === myPlayerId && captain.cargo &&
      (captain.position === tileId || captain.cargo.destinationTileId === tileId) &&
      (getImportTruckReservation(gameState, captain.id) || getReserveImportTruckAction(gameState, captain.id));
    const showExchange = call?.booking && !load;
    const showOutbound = call?.active && myPlayerId === call.playerId && (!call.booking ||
      (call.booking.originTileId === tileId && gameState.players[gameState.activePlayerIndex].backhaul?.originTileId === tileId));
    const ownerAtBerth = call?.active && call.playerId === myPlayerId;
    const returnedHere = call?.active && !call.booking && yardReturn?.event.playerId === call.playerId &&
      yardReturn.event.tileId === tileId ? yardReturn : undefined;
    const cargo = showExchange || showOutbound || appointmentDesk || ownerAtBerth ? <>
      {call && showExchange && <TerminalCargoExchange state={gameState} tileId={tileId} playerId={call.playerId}
        myPlayerId={myPlayerId} onAction={dispatch} />}
      {call && showOutbound && <TerminalOutboundBooking state={gameState} tileId={tileId}
        playerId={call.playerId} myPlayerId={myPlayerId} onAction={dispatch} />}
      {appointmentDesk && <ImportTruckDesk state={gameState} playerId={captain.id} myPlayerId={myPlayerId}
        onAction={dispatch} surface="quay" />}
      {ownerAtBerth && <ReturnCargoDesk state={gameState} tileId={tileId} playerId={call.playerId} myPlayerId={myPlayerId}
        onAction={dispatch} surface="quay" />}
    </> : null;
    return guide ? <TerminalDetails key={tileId} guide={guide} stock={gameState.logistics?.ports[tileId]}
      truckNotice={<TruckAppointmentNotice state={gameState} tileId={tileId} is3D={is3D} subscribeBoard={subscribeBoard} />}
      tender={getPortTender(gameState, tileId)} schedule={getPortTruckSchedule(gameState, tileId)}
      titleId={titleId} onClose={onClose} onShowPort={onShowPort} is3D={is3D} captainName={call?.playerName ?? ''}
      handling={load ?? (call?.receipt ? portDischarge : null)} yardReturn={returnedHere} cargo={cargo} /> : null;
  }
  const onAction = (action: GameAction) => { dispatch(action); onClose(); };
  const rentSchedule = getRentSchedule(tile);
  const prop = gameState.properties[tileId];
  const owner = prop?.ownerId
    ? gameState.players.find((p) => p.id === prop.ownerId)
    : null;
  const charterPartner = prop?.slotCharter?.active
    ? gameState.players.find((player) => player.id === prop.slotCharter?.partnerId)
    : null;
  const isMine = prop?.ownerId === myPlayerId;
  const groupConfig = tile.group ? LOOP_GROUPS_CONFIG[tile.group] : null;

  const buildCost = tile.buildCost || groupConfig?.buildCost || 50;
  const refund = Math.floor(buildCost * 0.5);
  const mortgageValue = tile.mortgageValue || Math.floor((tile.price || 0) * 0.5);
  const unmortgageCost = Math.ceil(mortgageValue * 1.1);

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myPlayerId;
  const isShipDockedHere = isMyTurn && activePlayer?.position === tileId;
  const canUpgradeThisVisit = isShipDockedHere && Boolean(gameState.canUpgradeCurrentPort);

  // Check if can build (must revisit this port and at most 1 upgrade per visit)
  let canBuild = false;
  let canSell = false;
  let canUpgradeGreen = false;

  if (isMine && tile.type === 'PORT' && !prop.isMortgaged) {
    canBuild =
      canUpgradeThisVisit &&
      prop.containerLevel < 5 &&
      (activePlayer?.balance || 0) >= buildCost;

    canSell = isMyTurn && prop.containerLevel > 0;

    canUpgradeGreen =
      canUpgradeThisVisit &&
      prop.containerLevel === 5 &&
      !prop.hasGreenFleet &&
      (activePlayer?.balance || 0) >= GREEN_FLEET_COST;
  }

  // Check can mortgage (no containers on this tile)
  let canMortgage = false;
  if (isMine && isMyTurn && !prop.isMortgaged) {
    if (tile.type === 'PORT') {
      canMortgage = (prop.containerLevel || 0) === 0;
    } else {
      canMortgage = true;
    }
  }

  return (
    <BoardDialog key={tileId} labelledBy={titleId} onClose={onClose}>
      <div className="chart-dialog-sheet chart-manifest">
        <button type="button" aria-label="Đóng chi tiết ô" onClick={onClose} className="chart-dialog-close">
          <X aria-hidden="true" />
        </button>

        <header className="chart-manifest-heading">
          <div className="chart-dialog-kicker">
            <span>{tile.code}</span>
            {groupConfig && (
              <span className="chart-manifest-route">
                <i aria-hidden="true" style={{ backgroundColor: groupConfig.color }} />
                {groupConfig.name}
              </span>
            )}
          </div>
          <h3 id={titleId} className="chart-dialog-title">{tile.name}</h3>
        </header>

        {guide && (
          <div className="port-deed">
            <PortMiniature code={tile.code} variant="detail" />
            <div className="port-deed-geography">
              <strong>{guide.country}</strong>
              <p>{guide.fact}</p>
              <button type="button" onClick={() => onShowPort(guide)}>Xem trên bản đồ</button>
            </div>
          </div>
        )}

        {prop && (
          <dl className="chart-manifest-facts">
            <div>
              <dt>Chủ sở hữu</dt>
              <dd>{owner ? <><TokenBadge token={owner.token} size="sm" />{owner.name}</> : 'Chưa có ai sở hữu'}</dd>
            </div>
            {tile.price !== undefined && (
              <div><dt>Giá mua</dt><dd>${tile.price}M</dd></div>
            )}
            {gameState.mode === 'harbor' && tile.type === 'PORT' && <div data-harbor-deed>
              <dt>Phần cước khi đối thủ dỡ hàng</dt>
              <dd>{prop.isMortgaged ? 'Tạm ngừng khai thác' : owner
                ? `${getHarborTerminalShare(gameState, tileId)}% cho ${owner.name}`
                : '25% cho chủ cảng · 50% nếu sở hữu trọn nhóm màu'}</dd>
            </div>}
            {owner && (tile.type !== 'INFRA' || gameState.hasRolled) && (
              <div>
                <dt>{tile.type === 'INFRA' ? 'Cước theo lần gieo' : gameState.mode === 'harbor' ? 'Tiền thuê khi ghé bến' : 'Cước niêm yết'}</dt>
                <dd>${OneMonopolyEngine.calculateRent(gameState, tileId, gameState.dice)}M</dd>
              </div>
            )}
            {prop.isMortgaged && <div><dt>Trạng thái</dt><dd>Đã thế chấp</dd></div>}
          </dl>
        )}

        {prop?.hasGreenFleet && (
          <div className="chart-manifest-note">
            <Leaf aria-hidden="true" />
            <div>
              <strong>Huy Hiệu Xanh (Green Fuel Ready)</strong>
              <p>Miễn Thuế Carbon và +${GREEN_FLEET_ESG_BONUS}M điểm ESG</p>
            </div>
          </div>
        )}
        {prop?.slotCharter?.active && (
          <div className="chart-manifest-note">
            <Handshake aria-hidden="true" />
            <div>
              <strong>Chia sẻ cước 50/50</strong>
              {charterPartner && <p>{owner?.name} và {charterPartner.name} chia đôi cước khi người chơi khác ghé cảng lần tới.</p>}
            </div>
          </div>
        )}

        {rentSchedule.length > 0 && (
          <table className="chart-rent-schedule">
            <caption>{tile.type === 'SERVICE_LINE' ? 'Cước tuyến huyết mạch' : 'Biểu cước'}</caption>
            <tbody>
              {rentSchedule.map(([label, value]) => (
                <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        {myPlayerId && owner && !gameState.tradeOffers?.some(offer => offer.buyerId === myPlayerId)
          && !getTradeRestriction(gameState, myPlayerId, tileId) && (
            <button type="button" className="chart-button chart-button-primary" onClick={() => onOfferForTile(tileId)}>
              <Handshake aria-hidden="true" /> Đề nghị mua
            </button>
          )}
        {/* Owner Management Buttons */}
        {isMine && prop && gameState.phase !== 'AWAITING_AUCTION' && (
          <div className="chart-manifest-actions">
            {tile.type === 'PORT' && (
              <>
                <div className="chart-action-row">
                  <button
                    onClick={() => onAction({ type: 'BUILD_CONTAINER', tileId })}
                    disabled={!canBuild}
                    className="chart-button chart-button-primary"
                  >
                    <Building2 aria-hidden="true" />{' '}
                    {prop.containerLevel === 4
                      ? 'Lên ONE Innovation'
                      : `Đặt Lô (+${buildCost}M)`}
                  </button>

                  <button
                    onClick={() => onAction({ type: 'SELL_CONTAINER', tileId })}
                    disabled={!canSell}
                    className="chart-button"
                  >
                    <TrendingDown aria-hidden="true" /> Bán (Hoàn ${refund}M)
                  </button>
                </div>

                {/* Green Fleet Upgrade Button */}
                {prop.containerLevel === 5 && !prop.hasGreenFleet && (
                  <button
                    onClick={() => onAction({ type: 'UPGRADE_GREEN_FLEET', tileId })}
                    disabled={!canUpgradeGreen}
                    className="chart-button chart-button-primary"
                  >
                    <Leaf aria-hidden="true" /> Gắn Huy Hiệu Xanh (+${GREEN_FLEET_COST}M)
                  </button>
                )}

                {!prop.isMortgaged && !canUpgradeThisVisit && (prop.containerLevel < 5 || !prop.hasGreenFleet) && (
                  <p className="chart-action-copy">
                    {isShipDockedHere
                      ? 'Lần đầu ghé chỉ được mua cảng; mỗi lần ghé sau chỉ được nâng cấp tối đa 1 lần.'
                      : 'Chỉ có thể nâng cấp (tối đa 1 lần) khi tàu của bạn ghé lại cảng này.'}
                  </p>
                )}
              </>
            )}

            {!prop.isMortgaged ? (
              <button
                onClick={() => onAction({ type: 'MORTGAGE_TILE', tileId })}
                disabled={!canMortgage}
                className="chart-button"
              >
                <ShieldAlert aria-hidden="true" /> Thế chấp (Nhận +${mortgageValue}M)
              </button>
            ) : (
              <button
                onClick={() => onAction({ type: 'UNMORTGAGE_TILE', tileId })}
                className="chart-button chart-button-primary"
              >
                <DollarSign aria-hidden="true" /> Chuộc lại (Nộp ${unmortgageCost}M)
              </button>
            )}
          </div>
        )}
      </div>
    </BoardDialog>
  );
};
