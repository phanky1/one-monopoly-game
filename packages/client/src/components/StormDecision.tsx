import { useId } from 'react';
import { ChevronRight, CloudLightning, Waves } from 'lucide-react';
import { BOARD_TILES, OneMonopolyEngine, STORM_DRIFT_STEPS, STORM_TUG_FEE } from '@one-monopoly/shared';
import type { GameAction, GameState } from '@one-monopoly/shared';

interface Props {
  gameState: GameState;
  isMyTurn: boolean;
  onAction: (action: GameAction) => void;
}

export function StormDecision({ gameState, isMyTurn, onAction }: Props) {
  const titleId = useId();
  const captain = gameState.players[gameState.activePlayerIndex];
  const destination = BOARD_TILES[(captain.position + STORM_DRIFT_STEPS + BOARD_TILES.length) % BOARD_TILES.length];
  const property = gameState.properties[destination.id];
  const owner = gameState.players.find((player) => player.id === property?.ownerId);
  const canHireTug = captain.balance >= STORM_TUG_FEE;

  let arrivalCost = '';
  if (destination.price !== undefined && !property?.ownerId) {
    arrivalCost = captain.balance >= destination.price
      ? `Có thể mua với giá $${destination.price}M`
      : `Giá mua $${destination.price}M · Chưa đủ số dư để mua`;
  } else if (property?.isMortgaged) {
    arrivalCost = 'Cước $0M · Cảng đã thế chấp';
  } else if (owner?.id === captain.id) {
    arrivalCost = `Cước $0M · Cảng của ${isMyTurn ? 'bạn' : captain.name}`;
  } else if (owner && !owner.isBankrupt) {
    const rent = OneMonopolyEngine.calculateRent(gameState, destination.id, gameState.dice);
    arrivalCost = `Cước niêm yết $${rent}M`;
  }

  return (
    <section className="chart-action-panel chart-storm-decision" aria-labelledby={titleId}>
      <h3 id={titleId} className="chart-action-title">
        <CloudLightning size={20} aria-hidden="true" /> Ứng phó bão biển
      </h3>
      {isMyTurn ? (
        <>
          <button type="button" className="chart-button chart-storm-choice chart-storm-tug-choice" disabled={!canHireTug}
            onClick={() => onAction({ type: 'RESOLVE_STORM', choice: 'TUG' })}>
            <img className="storm-tug-portrait" src="/models/storm/harbor-tug.webp" width="68" height="51" alt="" />
            <span>
              <strong>Gọi tàu kéo · ${STORM_TUG_FEE}M</strong>
              <small>{canHireTug ? 'Giữ tàu tại ô hiện tại.' : `Số dư $${captain.balance}M, chưa đủ để gọi tàu kéo.`}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
          <button type="button" className="chart-button chart-storm-choice"
            onClick={() => onAction({ type: 'RESOLVE_STORM', choice: 'DRIFT' })}>
            <Waves aria-hidden="true" />
            <span>
              <strong>Thả trôi · Lùi {Math.abs(STORM_DRIFT_STEPS)} ô</strong>
              <small>{destination.name}{arrivalCost && <><br />{arrivalCost}</>}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
          <p className="chart-action-copy">Hết giờ, tàu sẽ tự động trôi lùi.</p>
        </>
      ) : (
        <p className="chart-action-copy" role="status">
          <strong>{captain.name}</strong> đang chọn cách vượt bão. Nếu thả trôi, tàu sẽ lùi {Math.abs(STORM_DRIFT_STEPS)} ô
          đến <strong>{destination.name}</strong>.{arrivalCost && <> {arrivalCost}.</>}
        </p>
      )}
    </section>
  );
}
