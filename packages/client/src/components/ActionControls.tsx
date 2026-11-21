import React from 'react';
import { BOARD_TILES, GREEN_FLEET_COST, LOOP_GROUPS_CONFIG, getTradeRestriction, type GameAction, type GameState } from '@one-monopoly/shared';
import { Building2, Dices, DollarSign, Flag, Handshake, Leaf, Ship, Ticket } from 'lucide-react';
import { DebtRescuePanel } from './DebtRescuePanel.js';
import { StormDecision } from './StormDecision.js';
import { PropertyAuctionPanel } from './PropertyAuctionPanel.js';
import { PortPurchaseDecision } from './PortPurchaseDecision.js';
import { SlotCharterDecision } from './SlotCharterDecision.js';
import { HarborUpgradeTerms } from './HarborUpgradeTerms.js';
import './chart-actions.css';

interface Props {
  gameState: GameState;
  myPlayerId: string | null;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  onOpenTrades: () => void;
  isRolling: boolean;
  isPawnMoving?: boolean;
}

export const ActionControls: React.FC<Props> = ({
  gameState,
  myPlayerId,
  onAction,
  onOpenTrades,
  isRolling,
  isPawnMoving = false,
}) => {
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer.id === myPlayerId;
  const currentTile = BOARD_TILES[activePlayer.position];
  const [receiptFocus, setReceiptFocus] = React.useState<{
    kind: 'rent' | 'purchase'; revision: number; source: HTMLButtonElement; playerId: string; tileId: number; roomId: string;
  } | null>(null);
  function focusAcceptedReceipt(kind: 'rent' | 'purchase', revision: number, source: HTMLButtonElement) {
    setReceiptFocus({ kind, revision, source, roomId: gameState.roomId, tileId: currentTile.id, playerId: activePlayer.id });
  }
  React.useLayoutEffect(() => {
    if (!receiptFocus) return;
    const harbor = gameState.harborFreight;
    if (receiptFocus.roomId === gameState.roomId && harbor?.revision === receiptFocus.revision) return;
    const receipt = harbor?.lastDelivery;
    const matchingKind = receiptFocus.kind === 'rent' ? receipt?.rentRelief?.shortfallAfter === 0 : receipt?.purchasePrice !== undefined;
    if (receipt && matchingKind && receipt.revision === receiptFocus.revision + 1
      && receipt.tileId === receiptFocus.tileId && receipt.playerId === receiptFocus.playerId
      && receiptFocus.roomId === gameState.roomId && isMyTurn && !gameState.pendingDebt
      && !document.hidden && !document.querySelector('dialog[open]')
      && (document.activeElement === document.body || document.activeElement === receiptFocus.source)) {
      document.querySelector<HTMLElement>(`[data-harbor-${receiptFocus.kind}-receipt="${receipt.revision}"]`)?.focus();
    }
    setReceiptFocus(null);
  }, [gameState, receiptFocus, isMyTurn]);

  // Another captain's bid clock can already be running while the landing ship is moving.
  if (gameState.phase === 'AWAITING_AUCTION' && gameState.auction) {
    const auction = gameState.auction;
    return <PropertyAuctionPanel key={`${auction.id}-${auction.revision}`} auction={auction}
      gameState={gameState} myPlayerId={myPlayerId} onAction={onAction} />;
  }

  if (isRolling) {
    return (
      <div role="status" className="chart-action-panel chart-action-status">
        <Dices size={18} aria-hidden="true" />
        <span>Đang lắc xúc xắc...</span>
      </div>
    );
  }

  if (isPawnMoving) {
    return (
      <div role="status" className="chart-action-panel chart-action-status">
        <Ship size={18} aria-hidden="true" />
        <span>Tàu đang di chuyển tới bến cảng...</span>
      </div>
    );
  }

  if (gameState.phase === 'AWAITING_STORM_DECISION') {
    return <StormDecision gameState={gameState} isMyTurn={isMyTurn} onAction={onAction} />;
  }

  if (gameState.phase === 'AWAITING_SLOT_CHARTER_RESPONSE' && gameState.pendingSlotCharter) {
    return <SlotCharterDecision state={gameState} charter={gameState.pendingSlotCharter} viewerId={myPlayerId}
      onAction={onAction} />;
  }

  const debt = gameState.phase === 'AWAITING_DEBT_RESOLUTION' && gameState.pendingDebt;
  const debtPanel = debt && (
    <DebtRescuePanel key={JSON.stringify([activePlayer.id, debt.creditorId, debt.tileId, debt.amount, debt.reason])}
      gameState={gameState} debt={debt} canAct={isMyTurn} onAction={onAction}
      onCoveredRentAccepted={(revision, source) => focusAcceptedReceipt('rent', revision, source)} />
  );
  if (isMyTurn && debtPanel) return debtPanel;

  if (!isMyTurn) {
    const offers = gameState.tradeOffers ?? [];
    const hasOffers = offers.some(offer => offer.sellerId === myPlayerId || offer.buyerId === myPlayerId);
    const canShop = myPlayerId && BOARD_TILES.some(tile => !getTradeRestriction(gameState, myPlayerId, tile.id));
    const shopButton = (hasOffers || canShop) && (
      <button className="chart-button chart-button-navy" type="button" onClick={onOpenTrades}>
        <Handshake aria-hidden="true" />{hasOffers ? 'Xem đề nghị giao dịch' : 'Tìm tài sản để mua'}
      </button>
    );
    if (debtPanel) return <>{debtPanel}{shopButton}</>;
    return (
      <div className="chart-action-panel">
        <p role="status" className="chart-waiting-turn"><Flag size={18} aria-hidden="true" />
          <span>Đang chờ <strong>{activePlayer.name}</strong> thực hiện lượt...</span></p>
        {shopButton}
      </div>
    );
  }

  if (gameState.phase === 'AWAITING_BUY_DECISION') {
    return <PortPurchaseDecision key={`${gameState.roomId}/${activePlayer.id}/${currentTile.id}/${gameState.turnCount}`}
      state={gameState} buyerId={activePlayer.id} onAction={onAction}
      onPurchaseAccepted={(revision, source) => focusAcceptedReceipt('purchase', revision, source)} />;
  }

  if (activePlayer.inHold && gameState.phase === 'WAIT_FOR_ROLL') {
    return (
      <section className="chart-action-panel">
        <h3 className="chart-action-title">
          BẠN ĐANG BỊ KẸT TẠI KHU NEO ĐẬU KIỂM HÓA ({activePlayer.holdTurns}/3 LƯỢT)
        </h3>

        <div className="chart-action-options">
          <button
            onClick={() => onAction({ type: 'ROLL_DICE' })}
            disabled={isRolling}
            className="chart-button chart-button-primary"
          >
            <Dices size={18} aria-hidden="true" /> TUNG ĐÔI ĐỂ THOÁT
          </button>

          <button
            onClick={() => onAction({ type: 'PAY_HOLD_FINE' })}
            disabled={activePlayer.balance < 50}
            className="chart-button"
          >
            <DollarSign size={18} aria-hidden="true" /> NỘP $50M PHÍ
          </button>

          <button
            onClick={() => onAction({ type: 'USE_CLEARANCE_PASS' })}
            disabled={activePlayer.customsClearancePasses <= 0}
            className="chart-button"
          >
            <Ticket size={18} aria-hidden="true" /> DÙNG THẺ THÔNG QUAN
          </button>
        </div>
      </section>
    );
  }

  const currentProp = gameState.properties[activePlayer.position];
  const isDockedAtMyPort =
    Boolean(gameState.canUpgradeCurrentPort) &&
    currentTile.type === 'PORT' &&
    currentProp?.ownerId === myPlayerId &&
    !currentProp.isMortgaged;
  const buildCost =
    currentTile.buildCost ||
    (currentTile.group ? LOOP_GROUPS_CONFIG[currentTile.group]?.buildCost : undefined) ||
    50;
  const canBuildDockedContainer =
    isDockedAtMyPort &&
    currentProp.containerLevel < 5 &&
    activePlayer.balance >= buildCost;
  const canUpgradeDockedGreen =
    isDockedAtMyPort &&
    currentProp.containerLevel === 5 &&
    !currentProp.hasGreenFleet &&
    activePlayer.balance >= GREEN_FLEET_COST;
  const showDockedUpgradePanel =
    isDockedAtMyPort &&
    (currentProp.containerLevel < 5 || !currentProp.hasGreenFleet);

  const dockedUpgradeControls = showDockedUpgradePanel ? (
    <section className="chart-action-panel">
      <div className="chart-action-offer">
        <div>
          <p className="chart-action-copy">NÂNG CẤP TẠI CẢNG ĐANG ĐẬU</p>
          <h3 className="chart-action-title">
            {currentTile.name} (Cấp {currentProp.containerLevel}/5)
          </h3>
        </div>
        <div className="chart-action-price">
          ${currentProp.containerLevel < 5 ? buildCost : GREEN_FLEET_COST}M
        </div>
      </div>

      <HarborUpgradeTerms state={gameState} tileId={currentTile.id} />
      {currentProp.containerLevel < 5 ? (
        <button
          onClick={() => onAction({ type: 'BUILD_CONTAINER', tileId: activePlayer.position })}
          disabled={!canBuildDockedContainer}
          className="chart-button chart-button-primary chart-button-wide"
        >
          <Building2 size={18} aria-hidden="true" />{' '}
          {currentProp.containerLevel === 4
            ? `LÊN SIÊU TÀU ONE INNOVATION (chi $${buildCost}M)`
            : `ĐẶT LÔ CONTAINER CẤP ${currentProp.containerLevel + 1} (chi $${buildCost}M)`}
        </button>
      ) : (
        !currentProp.hasGreenFleet && (
          <button
            onClick={() => onAction({ type: 'UPGRADE_GREEN_FLEET', tileId: activePlayer.position })}
            disabled={!canUpgradeDockedGreen}
            className="chart-button chart-button-primary chart-button-wide"
          >
            <Leaf size={18} aria-hidden="true" /> GẮN HUY HIỆU TÀU XANH (chi ${GREEN_FLEET_COST}M)
          </button>
        )
      )}
    </section>
  ) : null;

  if (gameState.phase === 'WAIT_FOR_ROLL') {
    return (
      <>
        {dockedUpgradeControls}
        <button
          onClick={() => onAction({ type: 'ROLL_DICE' })}
          disabled={isRolling}
          className="chart-button chart-button-primary chart-button-wide"
        >
          <Dices size={18} aria-hidden="true" />
          {isRolling ? 'ĐANG LẮC XÚC XẮC...' : 'LẮC XÚC XẮC!'}
        </button>
      </>
    );
  }

  return (
    <>
      {dockedUpgradeControls}
      <button
        onClick={() => onAction({ type: 'END_TURN' })}
        className="chart-button chart-button-navy chart-button-wide"
      >
        <Flag size={18} aria-hidden="true" /> KẾT THÚC LƯỢT
      </button>
    </>
  );
};
