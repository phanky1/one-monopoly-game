import {
  BoardTile,
  CardEffect,
  CharterRent,
  EngineResult,
  GameAction,
  GameCard,
  GameEvent,
  GameMode,
  GameState,
  LoopGroup,
  PendingSlotCharter,
  Player,
  PropertyAuction,
  PropertyState,
  SecretMissionCard,
  VesselToken,
} from './types.js';
import {
  AUCTION_INCREMENT,
  BOARD_TILES,
  GAME_CARDS,
  GO_REWARD,
  GO_TO_HOLD_TILE_INDEX,
  GREEN_FLEET_COST,
  GREEN_FLEET_ESG_BONUS,
  HOLD_FINE_AMOUNT,
  HOLD_TILE_INDEX,
  INFRA_TILES,
  LOOP_GROUPS_CONFIG,
  ownsPortGroup,
  MAX_HOLD_TURNS,
  SECRET_MISSIONS,
  SERVICE_LINES,
  STARTING_BALANCE,
  STORM_DRIFT_STEPS,
  STORM_TUG_FEE,
} from './boardData.js';
import { createLogisticsState, dispatchLogistics } from './cargo.js';
import { createHarborFreight, dispatchHarborFreight, getHarborFreightOpportunity, recordHarborVisit } from './harborFreight.js';
import { dispatchTrade, expireTradeOffers, isTradeAction } from './trade.js';
import { getMissionProgress } from './missionProgress.js';
import { getPropertyCashOption, getRedemptionCost } from './debtRecovery.js';

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function tradeChangesHarborOpportunity(before: GameState, after: GameState): boolean {
  const captainId = before.players[before.activePlayerIndex].id;
  const previous = getHarborFreightOpportunity(before, captainId);
  const current = getHarborFreightOpportunity(after, captainId);
  if (previous?.kind !== current?.kind) return true;
  return previous?.kind === 'discharge' && current?.kind === 'discharge' &&
    (previous.quote.operatorId !== current.quote.operatorId || previous.quote.feePercent !== current.quote.feePercent);
}

export class OneMonopolyEngine {
  public static createGame(
    roomId: string,
    playersData: Array<{ id: string; name: string; token: VesselToken }>,
    mode: GameMode = 'classic'
  ): GameState {
    const freight = mode === 'logistics';
    const shuffledMissions = freight ? [] : shuffle(SECRET_MISSIONS);

    const players: Player[] = playersData.map((p, idx) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      balance: freight ? 0 : STARTING_BALANCE,
      position: 0,
      inHold: false,
      holdTurns: 0,
      customsClearancePasses: 0,
      isBankrupt: false,
      isOnline: true,
      ...(freight ? {} : { secretMission: structuredClone(shuffledMissions[idx % shuffledMissions.length]) }),
    }));

    const properties: Record<number, PropertyState> = {};
    for (const tile of BOARD_TILES) {
      if (tile.type === 'PORT' || tile.type === 'SERVICE_LINE' || tile.type === 'INFRA') {
        properties[tile.id] = {
          ownerId: null,
          containerLevel: 0,
          isMortgaged: false,
          hasGreenFleet: false,
          slotCharter: null,
        };
      }
    }

    const marketCardIds = freight ? [] : shuffle(
      GAME_CARDS.filter((c) => c.type === 'MARKET').map((c) => c.id)
    );
    const opsCardIds = freight ? [] : shuffle(
      GAME_CARDS.filter((c) => c.type === 'OPS').map((c) => c.id)
    );

    return {
      roomId,
      mode,
      ...(freight ? { logistics: createLogisticsState(players), cargoRevision: 0 } : {}),
      ...(mode === 'harbor' ? { harborFreight: createHarborFreight(players) } : {}),
      players,
      activePlayerIndex: 0,
      properties,
      phase: freight ? 'AWAITING_SAIL' : 'WAIT_FOR_ROLL',
      dice: [1, 1],
      consecutiveDoubles: 0,
      hasRolled: false,
      marketDeck: marketCardIds,
      opsDeck: opsCardIds,
      stormActive: false,
      auction: null,
      auctionSequence: 0,
      tradeOffers: [],
      tradeSequence: 0,
      canUpgradeCurrentPort: false,
      pendingDebt: null,
      pendingSlotCharter: null,
      winnerId: null,
      turnCount: 1,
      gameStarted: true,
    };
  }

  public static dispatch(state: GameState, action: GameAction, actorId?: string): EngineResult {
    if (!action || state.winnerId !== null) return { state, events: [] };
    if (action.type === 'HARBOR_LOAD' || action.type === 'HARBOR_DISCHARGE' ||
        action.type === 'HARBOR_REDEEM_AND_DISCHARGE' || action.type === 'HARBOR_DISCHARGE_FOR_RENT') {
      const result = dispatchHarborFreight(state, action, actorId);
      if (result.state === state) return result;
      if (action.type === 'HARBOR_DISCHARGE_FOR_RENT' && result.state.harborFreight?.lastDelivery?.rentRelief?.shortfallAfter === 0) {
        const settled = OneMonopolyEngine.dispatchTurnAction(result.state, { type: 'SETTLE_DEBT' });
        result.state = settled.state;
        result.events.push(...settled.events);
      }
      if (action.type === 'HARBOR_REDEEM_AND_DISCHARGE' || action.type === 'HARBOR_DISCHARGE_FOR_RENT') {
        expireTradeOffers(result.state, result.events);
      }
      return result;
    }
    if (state.mode === 'logistics') {
      return dispatchLogistics(state, action, actorId ?? state.players[state.activePlayerIndex]?.id);
    }
    if (action.type === 'LOAD_CARGO' || action.type === 'UNLOAD_CARGO' || action.type === 'CALL_PORT_TRUCK' ||
        action.type === 'RESERVE_IMPORT_TRUCK' || action.type === 'RETURN_CARGO_TO_YARD' ||
        action.type === 'SAIL_TO_PORT' || action.type === 'SAIL_FEEDER' || action.type === 'ACCEPT_BACKHAUL' ||
        action.type === 'CHANGE_DESTINATION' || action.type === 'BID_FREIGHT_TENDER' ||
        action.type === 'WITHDRAW_FREIGHT_TENDER_BID') return { state, events: [] };
    const isTrade = isTradeAction(action);
    const result = isTrade
      ? dispatchTrade(state, action, actorId, OneMonopolyEngine.checkMissionCompletion)
      : OneMonopolyEngine.dispatchTurnAction(state, action);
    if (result.state === state) return result;
    if (result.state.canUpgradeCurrentPort) {
      // Selling the port ends this visit's upgrade opportunity, even if the captain later buys it back.
      const captain = result.state.players[result.state.activePlayerIndex];
      result.state.canUpgradeCurrentPort = result.state.properties[captain.position]?.ownerId === captain.id;
    }
    expireTradeOffers(result.state, result.events);
    const harbor = result.state.harborFreight;
    if (harbor) {
      const changed = isTrade
        ? result.events.some(event => event.type === 'TRADE_CLOSED' && event.result === 'ACCEPTED') &&
          tradeChangesHarborOpportunity(state, result.state)
        : result.events.length > 0 || result.state.phase !== state.phase ||
          result.state.activePlayerIndex !== state.activePlayerIndex || result.state.turnCount !== state.turnCount ||
          result.state.auction?.revision !== state.auction?.revision;
      if (changed) result.state.harborFreight = { ...harbor, revision: harbor.revision + 1 };
    }
    return result;
  }

  private static dispatchTurnAction(state: GameState, action: GameAction): EngineResult {
    if ((action.type === 'DECLARE_BANKRUPTCY' || action.type === 'SETTLE_DEBT') &&
        (state.phase !== 'AWAITING_DEBT_RESOLUTION' || !state.pendingDebt)) {
      return { state, events: [] };
    }
    if ((state.phase === 'AWAITING_STORM_DECISION' && action.type !== 'RESOLVE_STORM') ||
        (state.phase === 'AWAITING_BUY_DECISION' && action.type === 'END_TURN')) {
      return { state, events: [] };
    }
    if (action.type === 'AUCTION_BID' || action.type === 'AUCTION_PASS') {
      return OneMonopolyEngine.answerAuction(state, action);
    }
    if (state.phase === 'AWAITING_AUCTION') return { state, events: [] };

    const nextState: GameState = JSON.parse(JSON.stringify(state));
    const events: GameEvent[] = [];
    const activePlayer = nextState.players[nextState.activePlayerIndex];

    switch (action.type) {
      case 'RESOLVE_STORM': {
        const { choice } = action;
        if (state.phase !== 'AWAITING_STORM_DECISION' || (choice !== 'TUG' && choice !== 'DRIFT') ||
            (choice === 'TUG' && activePlayer.balance < STORM_TUG_FEE)) {
          return { state, events: [] };
        }
        events.push({ type: 'STORM_RESOLVED', playerId: activePlayer.id, choice });
        if (choice === 'TUG') {
          activePlayer.balance -= STORM_TUG_FEE;
          events.push({
            type: 'BALANCE_CHANGED',
            playerId: activePlayer.id,
            delta: -STORM_TUG_FEE,
            newBalance: activePlayer.balance,
            reason: 'Thuê tàu kéo trong bão',
          });
          OneMonopolyEngine.finishStepPhase(nextState);
        } else {
          OneMonopolyEngine.movePlayerSteps(nextState, events, activePlayer, STORM_DRIFT_STEPS);
        }
        break;
      }

      case 'ROLL_DICE':
        OneMonopolyEngine.handleRollDice(nextState, events, activePlayer, action.forcedDice);
        break;

      case 'BUY_PROPERTY':
        OneMonopolyEngine.handleBuyProperty(nextState, events, activePlayer);
        break;

      case 'SKIP_BUY':
        if (nextState.phase === 'AWAITING_BUY_DECISION') {
          OneMonopolyEngine.startAuction(nextState, events, activePlayer.position);
        }
        break;

      case 'BUILD_CONTAINER':
        OneMonopolyEngine.handleBuildContainer(nextState, events, activePlayer, action.tileId);
        break;

      case 'SELL_CONTAINER':
        OneMonopolyEngine.handleSellContainer(nextState, events, activePlayer, action.tileId, action.expectedLevel);
        break;

      case 'UPGRADE_GREEN_FLEET':
        OneMonopolyEngine.handleUpgradeGreenFleet(nextState, events, activePlayer, action.tileId);
        break;

      case 'PROPOSE_SLOT_CHARTER':
        OneMonopolyEngine.handleProposeSlotCharter(nextState, events, activePlayer, action.tileId);
        break;

      case 'RESPOND_SLOT_CHARTER':
        OneMonopolyEngine.handleRespondSlotCharter(nextState, events, action.accept);
        break;

      case 'CLAIM_MISSION_REWARD':
        OneMonopolyEngine.checkMissionCompletion(nextState, events, activePlayer);
        break;

      case 'MORTGAGE_TILE':
        OneMonopolyEngine.handleMortgageTile(nextState, events, activePlayer, action.tileId);
        break;

      case 'UNMORTGAGE_TILE':
        OneMonopolyEngine.handleUnmortgageTile(nextState, events, activePlayer, action.tileId);
        break;

      case 'PAY_HOLD_FINE':
        OneMonopolyEngine.handlePayHoldFine(nextState, events, activePlayer);
        break;

      case 'USE_CLEARANCE_PASS':
        OneMonopolyEngine.handleUseClearancePass(nextState, events, activePlayer);
        break;

      case 'SETTLE_DEBT':
        OneMonopolyEngine.handleSettleDebt(nextState, events, activePlayer);
        break;

      case 'DECLARE_BANKRUPTCY':
        OneMonopolyEngine.handleDeclareBankruptcy(nextState, events, activePlayer);
        break;

      case 'END_TURN':
        OneMonopolyEngine.handleEndTurn(nextState, events, activePlayer);
        break;
    }

    // Check mission completion after actions
    if (activePlayer && !activePlayer.isBankrupt) {
      OneMonopolyEngine.checkMissionCompletion(nextState, events, activePlayer);
    }

    return { state: nextState, events };
  }

  // ======================== ACTION HANDLERS ======================== //

  private static handleRollDice(
    state: GameState,
    events: GameEvent[],
    player: Player,
    forcedDice?: [number, number]
  ): void {
    if (state.phase !== 'WAIT_FOR_ROLL' || state.hasRolled) {
      return;
    }

    const d1 = forcedDice ? forcedDice[0] : Math.floor(Math.random() * 6) + 1;
    const d2 = forcedDice ? forcedDice[1] : Math.floor(Math.random() * 6) + 1;
    const dice: [number, number] = [d1, d2];
    const isDouble = d1 === d2;
    state.dice = dice;
    state.hasRolled = true;

    events.push({
      type: 'DICE_ROLLED',
      playerId: player.id,
      dice,
      isDouble,
    });

    // 1. If currently in CUSTOMS_HOLD
    if (player.inHold) {
      if (isDouble) {
        player.inHold = false;
        player.holdTurns = 0;
        state.consecutiveDoubles = 0;
        events.push({
          type: 'RELEASED_FROM_HOLD',
          playerId: player.id,
          method: 'DICE_DOUBLE',
        });
        OneMonopolyEngine.movePlayerSteps(state, events, player, d1 + d2);
      } else {
        player.holdTurns++;
        if (player.holdTurns >= MAX_HOLD_TURNS) {
          // Mandatory exit: pay $50M fine
          if (player.balance >= HOLD_FINE_AMOUNT) {
            player.balance -= HOLD_FINE_AMOUNT;
            player.inHold = false;
            player.holdTurns = 0;
            events.push({
              type: 'TAX_PAID',
              playerId: player.id,
              tileId: HOLD_TILE_INDEX,
              amount: HOLD_FINE_AMOUNT,
            });
            events.push({
              type: 'RELEASED_FROM_HOLD',
              playerId: player.id,
              method: 'FINE',
            });
            OneMonopolyEngine.movePlayerSteps(state, events, player, d1 + d2);
          } else {
            // Must create debt to bank
            player.inHold = false;
            player.holdTurns = 0;
            events.push({
              type: 'RELEASED_FROM_HOLD',
              playerId: player.id,
              method: 'FINE',
            });
            OneMonopolyEngine.createDebt(
              state,
              events,
              player.id,
              'BANK',
              HOLD_FINE_AMOUNT,
              'Phí lưu bãi bắt buộc sau 3 lượt kẹt cảng'
            );
            OneMonopolyEngine.movePlayerSteps(state, events, player, d1 + d2, false);
          }
        } else {
          // Still in hold
          state.phase = 'END_OF_TURN';
        }
      }
      return;
    }

    // 2. Normal movement
    if (isDouble) {
      state.consecutiveDoubles++;
      if (state.consecutiveDoubles === 3) {
        OneMonopolyEngine.sendToHold(state, events, player, 'Tung xúc xắc đôi 3 lần liên tiếp');
        state.phase = 'END_OF_TURN';
        return;
      }
    } else {
      state.consecutiveDoubles = 0;
    }

    OneMonopolyEngine.movePlayerSteps(state, events, player, d1 + d2);
  }

  private static movePlayerSteps(
    state: GameState,
    events: GameEvent[],
    player: Player,
    steps: number,
    resolveLanding = true
  ): void {
    const from = player.position;
    let to = (from + steps) % BOARD_TILES.length;
    if (to < 0) to += BOARD_TILES.length;

    // Check passing GO (if stepped forward and wrapped around)
    if (steps > 0 && to < from) {
      player.balance += GO_REWARD;
      events.push({
        type: 'PASSED_GO',
        playerId: player.id,
        reward: GO_REWARD,
      });
      events.push({
        type: 'BALANCE_CHANGED',
        playerId: player.id,
        newBalance: player.balance,
        delta: GO_REWARD,
        reason: 'Đi qua Singapore Global Hub',
      });
    }

    player.position = to;
    events.push({
      type: 'SHIP_STEPPED',
      playerId: player.id,
      from,
      to,
    });

    if (resolveLanding) {
      OneMonopolyEngine.resolveTileLanding(state, events, player, to);
    } else {
      recordHarborVisit(state, player.id, null);
    }
  }

  private static resolveTileLanding(
    state: GameState,
    events: GameEvent[],
    player: Player,
    tileId: number
  ): void {
    state.canUpgradeCurrentPort = false;
    const tile = BOARD_TILES[tileId];
    recordHarborVisit(state, player.id, tileId);

    switch (tile.type) {
      case 'GO':
      case 'CUSTOMS_HOLD':
      case 'FREE_ANCHOR':
        OneMonopolyEngine.finishStepPhase(state);
        break;

      case 'GO_TO_HOLD':
        OneMonopolyEngine.sendToHold(state, events, player, 'Lệnh Giữ Tàu Kiểm Hóa (Ô 30)');
        state.phase = 'END_OF_TURN';
        break;

      case 'TAX': {
        const amount = tile.taxAmount || 100;

        // Check Green Fleet exemption on Carbon Tax
        if (tile.code === 'CARBON-TAX') {
          const hasAnyGreenFleet = Object.values(state.properties).some(
            (prop) => prop.ownerId === player.id && prop.hasGreenFleet
          );
          if (hasAnyGreenFleet) {
            events.push({
              type: 'CARBON_TAX_EXEMPTED',
              playerId: player.id,
              tileId,
              reason: 'Sở hữu Huy hiệu Tàu Nhiên Liệu Xanh (Green Fuel Ready)',
            });
            OneMonopolyEngine.finishStepPhase(state);
            return;
          }
        }

        if (player.balance >= amount) {
          player.balance -= amount;
          events.push({
            type: 'TAX_PAID',
            playerId: player.id,
            tileId,
            amount,
          });
          events.push({
            type: 'BALANCE_CHANGED',
            playerId: player.id,
            newBalance: player.balance,
            delta: -amount,
            reason: tile.name,
          });
          OneMonopolyEngine.finishStepPhase(state);
        } else {
          OneMonopolyEngine.createDebt(state, events, player.id, 'BANK', amount, tile.name, tileId);
        }
        break;
      }

      case 'MARKET_CARD':
      case 'OPS_CARD':
        OneMonopolyEngine.drawCard(state, events, player, tile.type === 'MARKET_CARD' ? 'MARKET' : 'OPS');
        break;

      case 'PORT':
      case 'SERVICE_LINE':
      case 'INFRA': {
        const prop = state.properties[tileId];
        if (!prop) {
          OneMonopolyEngine.finishStepPhase(state);
          return;
        }
        if (prop.ownerId === null) {
          if (tile.price !== undefined && player.balance >= tile.price) {
            state.phase = 'AWAITING_BUY_DECISION';
          } else {
            OneMonopolyEngine.startAuction(state, events, tileId);
          }
          return;
        }

        const owner = state.players.find((p) => p.id === prop.ownerId);
        if (prop.isMortgaged || !owner || owner.isBankrupt || owner.id === player.id) {
          if (
            tile.type === 'PORT' &&
            owner?.id === player.id &&
            !prop.isMortgaged &&
            (prop.containerLevel < 5 || !prop.hasGreenFleet)
          ) {
            state.canUpgradeCurrentPort = true;
          }
          OneMonopolyEngine.finishStepPhase(state);
          return;
        }

        const rent = OneMonopolyEngine.calculateRent(state, tileId, state.dice);
        const agreement = prop.slotCharter;
        if (agreement?.active && agreement.partnerId !== player.id) {
          const partner = state.players.find((p) => p.id === agreement.partnerId && !p.isBankrupt);
          // The next third-party visit uses this agreement, even if payment goes to debt.
          agreement.active = false;
          if (partner) {
            OneMonopolyEngine.collectRent(state, events, player, owner, tileId, rent, {
              type: 'SPLIT',
              partnerId: partner.id,
            });
            return;
          }
        }

        const charter = OneMonopolyEngine.getSlotCharterOffer(state, tileId, player.id, rent);
        if (charter) {
          state.pendingSlotCharter = charter;
          state.phase = 'AWAITING_SLOT_CHARTER_RESPONSE';
          return;
        }

        OneMonopolyEngine.collectRent(state, events, player, owner, tileId, rent);
        break;
      }
    }
  }

  private static collectRent(
    state: GameState,
    events: GameEvent[],
    visitor: Player,
    owner: Player,
    tileId: number,
    amount: number,
    charterRent?: CharterRent
  ): void {
    const reason = `Tiền lưu bãi tại ${BOARD_TILES[tileId].name}`;
    if (visitor.balance < amount) {
      OneMonopolyEngine.createDebt(state, events, visitor.id, owner.id, amount, reason, tileId, charterRent);
      return;
    }

    const partner = charterRent?.type === 'SPLIT'
      ? state.players.find((p) => p.id === charterRent.partnerId && !p.isBankrupt)
      : undefined;
    const partnerAmount = partner ? Math.floor(amount / 2) : 0;
    const ownerAmount = amount - partnerAmount;

    if (partner) {
      events.push({
        type: 'SLOT_CHARTER_RENT_SPLIT',
        visitorId: visitor.id,
        ownerId: owner.id,
        partnerId: partner.id,
        tileId,
        splitAmount: partnerAmount,
        ownerAmount,
      });
    } else {
      if (charterRent?.type === 'DISCOUNT') {
        state.properties[tileId].slotCharter = { partnerId: visitor.id, active: true };
        events.push({
          type: 'SLOT_CHARTER_ACCEPTED',
          requesterId: visitor.id,
          ownerId: owner.id,
          tileId,
          rentPaid: amount,
        });
      }
      events.push({
        type: 'DEMURRAGE_PAID',
        debtorId: visitor.id,
        creditorId: owner.id,
        tileId,
        amount,
      });
    }

    OneMonopolyEngine.applyRentBalance(visitor, -amount, reason, events);
    const receipt = `Thu tiền lưu bãi từ ${visitor.name}`;
    OneMonopolyEngine.applyRentBalance(owner, ownerAmount, receipt, events);
    if (partner) {
      OneMonopolyEngine.applyRentBalance(partner, partnerAmount, receipt, events);
    }
    OneMonopolyEngine.finishStepPhase(state);
  }

  private static applyRentBalance(player: Player, delta: number, reason: string, events: GameEvent[]): void {
    player.balance += delta;
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta,
      reason,
    });
  }

  /** Negotiable terms for a visit under the current deed and service-line ownership. */
  public static getSlotCharterOffer(
    state: GameState, tileId: number, visitorId: string, rent: number
  ): PendingSlotCharter | null {
    const property = state.properties[tileId];
    if (BOARD_TILES[tileId]?.type !== 'PORT' || !property?.ownerId || property.ownerId === visitorId ||
        property.isMortgaged || property.containerLevel < 1 ||
        !SERVICE_LINES.some(id => state.properties[id]?.ownerId === visitorId)) return null;

    // A live third party's existing agreement takes precedence on this visit.
    const agreement = property.slotCharter;
    if (agreement?.active && agreement.partnerId !== visitorId &&
        state.players.some(player => player.id === agreement.partnerId && !player.isBankrupt)) return null;
    return { requesterId: visitorId, ownerId: property.ownerId, tileId, originalRent: rent, discountedRent: Math.floor(rent / 2) };
  }

  public static calculateRent(state: GameState, tileId: number, dice: [number, number]): number {
    const tile = BOARD_TILES[tileId];
    const prop = state.properties[tileId];
    if (!prop || !prop.ownerId || prop.isMortgaged) return 0;

    const ownerId = prop.ownerId;

    if (tile.type === 'PORT') {
      if (!tile.rentTiers) return 0;
      if (prop.containerLevel > 0) {
        return tile.rentTiers[prop.containerLevel] || 0;
      }
      if (ownsPortGroup(state, tile.group!, ownerId)) {
        return tile.rentTiers[0] * 2;
      }
      return tile.rentTiers[0];
    }

    if (tile.type === 'SERVICE_LINE') {
      const ownedLinesCount = SERVICE_LINES.filter(
        (id) => state.properties[id]?.ownerId === ownerId
      ).length;
      return 25 * Math.pow(2, ownedLinesCount - 1);
    }

    if (tile.type === 'INFRA') {
      const ownedInfraCount = INFRA_TILES.filter(
        (id) => state.properties[id]?.ownerId === ownerId
      ).length;
      const diceSum = dice[0] + dice[1];
      const multiplier = ownedInfraCount >= 2 ? 10 : 4;
      return diceSum * multiplier;
    }

    return 0;
  }

  private static drawCard(
    state: GameState,
    events: GameEvent[],
    player: Player,
    type: 'MARKET' | 'OPS'
  ): void {
    const deck = type === 'MARKET' ? state.marketDeck : state.opsDeck;
    if (deck.length === 0) {
      OneMonopolyEngine.finishStepPhase(state);
      return;
    }

    const cardId = deck.shift()!;
    // Place drawn card at the bottom of the deck
    deck.push(cardId);

    const card = GAME_CARDS.find((c) => c.id === cardId);
    if (!card) {
      OneMonopolyEngine.finishStepPhase(state);
      return;
    }

    events.push({
      type: 'CARD_DRAWN',
      playerId: player.id,
      card,
    });

    OneMonopolyEngine.applyCardEffect(state, events, player, card.effect);
  }

  private static applyCardEffect(
    state: GameState,
    events: GameEvent[],
    player: Player,
    effect: CardEffect
  ): void {
    switch (effect.type) {
      case 'STORM_CHOICE':
        state.stormActive = true;
        state.phase = 'AWAITING_STORM_DECISION';
        break;

      case 'CASH': {
        const amount = effect.amount || 0;
        if (amount >= 0) {
          player.balance += amount;
          events.push({
            type: 'BALANCE_CHANGED',
            playerId: player.id,
            newBalance: player.balance,
            delta: amount,
            reason: 'Thẻ bài thưởng tiền',
          });
          OneMonopolyEngine.finishStepPhase(state);
        } else {
          const fine = Math.abs(amount);
          if (player.balance >= fine) {
            player.balance -= fine;
            events.push({
              type: 'TAX_PAID',
              playerId: player.id,
              tileId: player.position,
              amount: fine,
            });
            events.push({
              type: 'BALANCE_CHANGED',
              playerId: player.id,
              newBalance: player.balance,
              delta: -fine,
              reason: 'Thẻ bài phạt tiền',
            });
            OneMonopolyEngine.finishStepPhase(state);
          } else {
            OneMonopolyEngine.createDebt(
              state,
              events,
              player.id,
              'BANK',
              fine,
              'Thẻ bài phạt tiền'
            );
          }
        }
        break;
      }

      case 'MOVE_TO': {
        const targetTile = effect.targetTile ?? 0;
        if (targetTile < player.position && targetTile !== 0) {
          // Passed GO
          player.balance += GO_REWARD;
          events.push({
            type: 'PASSED_GO',
            playerId: player.id,
            reward: GO_REWARD,
          });
        }
        const from = player.position;
        player.position = targetTile;
        events.push({
          type: 'SHIP_STEPPED',
          playerId: player.id,
          from,
          to: targetTile,
        });
        OneMonopolyEngine.resolveTileLanding(state, events, player, targetTile);
        break;
      }

      case 'MOVE_STEPS': {
        const steps = effect.steps || 0;
        OneMonopolyEngine.movePlayerSteps(state, events, player, steps, true);
        break;
      }

      case 'GO_TO_HOLD':
        OneMonopolyEngine.sendToHold(state, events, player, 'Lệnh giữ tàu từ Thẻ Bài');
        state.phase = 'END_OF_TURN';
        break;

      case 'GET_PASS':
        player.customsClearancePasses++;
        OneMonopolyEngine.finishStepPhase(state);
        break;

      case 'PAY_PER_CONTAINER': {
        let totalFine = 0;
        for (const tileId of Object.keys(state.properties)) {
          const prop = state.properties[Number(tileId)];
          if (prop?.ownerId === player.id) {
            if (prop.containerLevel === 5) {
              totalFine += effect.perMegaTerminalAmount || 100;
            } else if (prop.containerLevel > 0) {
              totalFine += prop.containerLevel * (effect.perContainerAmount || 25);
            }
          }
        }

        if (totalFine === 0) {
          OneMonopolyEngine.finishStepPhase(state);
          return;
        }

        if (player.balance >= totalFine) {
          player.balance -= totalFine;
          events.push({
            type: 'TAX_PAID',
            playerId: player.id,
            tileId: player.position,
            amount: totalFine,
          });
          events.push({
            type: 'BALANCE_CHANGED',
            playerId: player.id,
            newBalance: player.balance,
            delta: -totalFine,
            reason: 'Bảo trì Lô container / Siêu tàu ONE Innovation',
          });
          OneMonopolyEngine.finishStepPhase(state);
        } else {
          OneMonopolyEngine.createDebt(
            state,
            events,
            player.id,
            'BANK',
            totalFine,
            'Bảo trì Lô container / Siêu tàu ONE Innovation'
          );
        }
        break;
      }

      case 'COLLECT_FROM_PLAYERS': {
        const amount = effect.amount || 50;
        let collected = 0;
        for (const p of state.players) {
          if (p.id !== player.id && !p.isBankrupt) {
            const actual = Math.min(p.balance, amount);
            p.balance -= actual;
            collected += actual;
          }
        }
        player.balance += collected;
        events.push({
          type: 'BALANCE_CHANGED',
          playerId: player.id,
          newBalance: player.balance,
          delta: collected,
          reason: 'Thu phí liên minh từ đối thủ',
        });
        OneMonopolyEngine.finishStepPhase(state);
        break;
      }

      case 'PAY_PLAYERS': {
        const amount = effect.amount || 50;
        const activeOthers = state.players.filter((p) => p.id !== player.id && !p.isBankrupt);
        const needed = amount * activeOthers.length;

        if (player.balance >= needed) {
          player.balance -= needed;
          for (const p of activeOthers) {
            p.balance += amount;
          }
          events.push({
            type: 'BALANCE_CHANGED',
            playerId: player.id,
            newBalance: player.balance,
            delta: -needed,
            reason: 'Hỗ trợ đình công cho người chơi khác',
          });
          OneMonopolyEngine.finishStepPhase(state);
        } else {
          OneMonopolyEngine.createDebt(
            state,
            events,
            player.id,
            'BANK',
            needed,
            'Hỗ trợ đình công cho người chơi khác'
          );
        }
        break;
      }
    }
  }

  private static finishStepPhase(state: GameState): void {
    if (state.pendingDebt !== null) {
      state.phase = 'AWAITING_DEBT_RESOLUTION';
      return;
    }
    const [d1, d2] = state.dice;
    const isDouble = d1 === d2;
    const activePlayer = state.players[state.activePlayerIndex];

    // If rolled double and not in hold, player gets another roll!
    if (isDouble && !activePlayer.inHold && state.consecutiveDoubles > 0) {
      state.phase = 'WAIT_FOR_ROLL';
      state.hasRolled = false;
    } else {
      state.phase = 'END_OF_TURN';
    }
  }

  private static sendToHold(
    state: GameState,
    events: GameEvent[],
    player: Player,
    reason: string
  ): void {
    player.position = HOLD_TILE_INDEX;
    recordHarborVisit(state, player.id, null);
    player.inHold = true;
    player.holdTurns = 0;
    state.consecutiveDoubles = 0;
    state.canUpgradeCurrentPort = false;
    events.push({
      type: 'SENT_TO_HOLD',
      playerId: player.id,
      reason,
    });
  }

  private static createDebt(
    state: GameState,
    events: GameEvent[],
    debtorId: string,
    creditorId: string | 'BANK',
    amount: number,
    reason: string,
    tileId?: number,
    charterRent?: CharterRent
  ): void {
    state.pendingDebt = {
      creditorId,
      amount,
      reason,
      tileId,
      charterRent,
    };
    state.phase = 'AWAITING_DEBT_RESOLUTION';
    events.push({
      type: 'DEBT_CREATED',
      debtorId,
      creditorId,
      amount,
      reason,
    });
  }

  private static handleBuyProperty(
    state: GameState,
    events: GameEvent[],
    player: Player
  ): void {
    if (state.phase !== 'AWAITING_BUY_DECISION') return;
    const tile = BOARD_TILES[player.position];
    const prop = state.properties[player.position];
    if (!tile || !prop || prop.ownerId !== null || !tile.price) return;

    if (player.balance < tile.price) return;

    OneMonopolyEngine.purchaseProperty(state, events, player, tile, tile.price);
    OneMonopolyEngine.finishStepPhase(state);
  }

  private static purchaseProperty(
    state: GameState, events: GameEvent[], player: Player, tile: BoardTile, price: number
  ): void {
    player.balance -= price;
    state.properties[tile.id].ownerId = player.id;
    events.push({
      type: 'TILE_PURCHASED',
      playerId: player.id,
      tileId: tile.id,
      price,
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: -price,
      reason: `Mua cảng/tuyến ${tile.name}`,
    });
  }

  private static startAuction(state: GameState, events: GameEvent[], tileId: number): void {
    if (state.properties[tileId]?.ownerId !== null) return;
    const id = (state.auctionSequence ?? 0) + 1;
    const auction: PropertyAuction = {
      id, revision: 0, tileId, bidderId: state.players[state.activePlayerIndex].id,
      leaderId: null, highestBid: 0, passedIds: [],
    };
    state.auctionSequence = id;
    state.auction = auction;
    state.phase = 'AWAITING_AUCTION';
    events.push({ type: 'AUCTION_STARTED', tileId });
    OneMonopolyEngine.advanceAuction(state, events, auction);
  }

  private static answerAuction(
    state: GameState, action: Extract<GameAction, { type: 'AUCTION_BID' | 'AUCTION_PASS' }>
  ): EngineResult {
    const auction = state.auction;
    if (state.phase !== 'AWAITING_AUCTION' || !auction ||
        auction.id !== action.auctionId || auction.revision !== action.revision) {
      return { state, events: [] };
    }
    const bidder = state.players.find(player => player.id === auction.bidderId);
    if (!bidder || bidder.isBankrupt || bidder.id === auction.leaderId || auction.passedIds.includes(bidder.id)) {
      return { state, events: [] };
    }
    if (action.type === 'AUCTION_BID') {
      const { amount } = action;
      if (!Number.isSafeInteger(amount) || amount % AUCTION_INCREMENT !== 0 ||
          amount < auction.highestBid + AUCTION_INCREMENT || amount > bidder.balance) {
        return { state, events: [] };
      }
    }

    const nextState: GameState = JSON.parse(JSON.stringify(state));
    const nextAuction = nextState.auction!;
    if (action.type === 'AUCTION_PASS') {
      nextAuction.passedIds.push(bidder.id);
    } else {
      nextAuction.highestBid = action.amount;
      nextAuction.leaderId = bidder.id;
    }
    nextAuction.revision++;
    const events: GameEvent[] = [];
    OneMonopolyEngine.advanceAuction(nextState, events, nextAuction);
    return { state: nextState, events };
  }

  private static advanceAuction(
    state: GameState, events: GameEvent[], auction: PropertyAuction
  ): void {
    const players = state.players;
    const currentIndex = players.findIndex(player => player.id === auction.bidderId);
    for (let offset = 1; offset <= players.length; offset++) {
      const next = players[(currentIndex + offset) % players.length];
      if (!next.isBankrupt && next.id !== auction.leaderId && !auction.passedIds.includes(next.id) &&
          next.balance >= auction.highestBid + AUCTION_INCREMENT) {
        auction.bidderId = next.id;
        return;
      }
    }

    const { tileId, leaderId, highestBid } = auction;
    state.auction = null;
    events.push({ type: 'AUCTION_ENDED', tileId, winnerId: leaderId, price: highestBid });
    if (leaderId !== null) {
      const winner = players.find(player => player.id === leaderId)!;
      OneMonopolyEngine.purchaseProperty(state, events, winner, BOARD_TILES[tileId], highestBid);
      OneMonopolyEngine.checkMissionCompletion(state, events, winner);
    }
    OneMonopolyEngine.finishStepPhase(state);
  }

  private static handleBuildContainer(
    state: GameState,
    events: GameEvent[],
    player: Player,
    tileId: number
  ): void {
    const tile = BOARD_TILES[tileId];
    const prop = state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== player.id || tile.type !== 'PORT') return;
    if (prop.isMortgaged) return;
    if (prop.containerLevel >= 5) return;
    if (player.position !== tileId || !state.canUpgradeCurrentPort) return;

    const groupConfig = LOOP_GROUPS_CONFIG[tile.group!];
    if (!groupConfig) return;

    const cost = tile.buildCost || groupConfig.buildCost;
    if (player.balance < cost) return;

    player.balance -= cost;
    prop.containerLevel++;
    state.canUpgradeCurrentPort = false;

    events.push({
      type: 'CONTAINER_BUILT',
      playerId: player.id,
      tileId,
      newLevel: prop.containerLevel,
      cost,
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: -cost,
      reason:
        prop.containerLevel === 5
          ? `Nâng cấp Siêu tàu ONE Innovation (24.000 TEU) tại ${tile.name}`
          : `Đặt Lô Container Magenta thứ ${prop.containerLevel} tại ${tile.name}`,
    });
  }

  private static handleSellContainer(
    state: GameState,
    events: GameEvent[],
    player: Player,
    tileId: number,
    expectedLevel?: number
  ): void {
    const option = getPropertyCashOption(state, player.id, tileId);
    if (option?.action.type !== 'SELL_CONTAINER') return;
    const prop = state.properties[tileId];
    if (expectedLevel !== undefined && prop.containerLevel !== expectedLevel) return;
    const tile = BOARD_TILES[tileId];
    const refund = option.proceeds;

    prop.containerLevel--;
    // If downgraded from level 5, also remove green fleet
    if (prop.containerLevel < 5) {
      prop.hasGreenFleet = false;
    }
    player.balance += refund;

    events.push({
      type: 'CONTAINER_SOLD',
      playerId: player.id,
      tileId,
      newLevel: prop.containerLevel,
      refund,
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: refund,
      reason: `Bán bớt container tại ${tile.name}`,
    });
  }

  // ==================== TÍNH NĂNG MỚI: TÀU NHIÊN LIỆU XANH ==================== //
  private static handleUpgradeGreenFleet(
    state: GameState,
    events: GameEvent[],
    player: Player,
    tileId: number
  ): void {
    const tile = BOARD_TILES[tileId];
    const prop = state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== player.id || prop.isMortgaged) return;
    if (player.position !== tileId || !state.canUpgradeCurrentPort) return;
    if (prop.containerLevel !== 5) return; // Chỉ áp dụng cho Siêu tàu ONE Innovation (Mức 5)
    if (prop.hasGreenFleet) return; // Đã nâng cấp rồi
    if (player.balance < GREEN_FLEET_COST) return;

    player.balance -= GREEN_FLEET_COST;
    prop.hasGreenFleet = true;
    state.canUpgradeCurrentPort = false;

    events.push({
      type: 'GREEN_FLEET_UPGRADED',
      playerId: player.id,
      tileId,
      cost: GREEN_FLEET_COST,
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: -GREEN_FLEET_COST,
      reason: `Nâng cấp Tàu Nhiên Liệu Xanh (Green Fuel Ready) tại ${tile.name}`,
    });
  }

  // ==================== TÍNH NĂNG MỚI: SLOT CHARTERING (AS ONE, WE CAN) ==================== //
  private static handleProposeSlotCharter(
    state: GameState,
    events: GameEvent[],
    player: Player,
    tileId: number
  ): void {
    if (state.phase !== 'AWAITING_SLOT_CHARTER_RESPONSE' || !state.pendingSlotCharter) return;
    const charter = state.pendingSlotCharter;
    if (charter.requesterId !== player.id || charter.tileId !== tileId) return;

    events.push({
      type: 'SLOT_CHARTER_PROPOSED',
      requesterId: player.id,
      ownerId: charter.ownerId,
      tileId,
    });
    // Awaiting owner response
  }

  private static handleRespondSlotCharter(
    state: GameState,
    events: GameEvent[],
    accept: boolean
  ): void {
    if (state.phase !== 'AWAITING_SLOT_CHARTER_RESPONSE' || !state.pendingSlotCharter) return;
    const charter = state.pendingSlotCharter;
    const requester = state.players.find((p) => p.id === charter.requesterId);
    const owner = state.players.find((p) => p.id === charter.ownerId);
    const prop = state.properties[charter.tileId];
    const tile = BOARD_TILES[charter.tileId];

    if (!requester || !owner || !prop || !tile) return;

    state.pendingSlotCharter = null;
    if (!accept) {
      events.push({
        type: 'SLOT_CHARTER_REJECTED',
        requesterId: requester.id,
        ownerId: owner.id,
        tileId: charter.tileId,
      });
    }
    OneMonopolyEngine.collectRent(
      state, events, requester, owner, charter.tileId,
      accept ? charter.discountedRent : charter.originalRent,
      accept ? { type: 'DISCOUNT' } : undefined
    );
  }

  // ==================== TÍNH NĂNG MỚI: KIỂM TRA THẺ NHIỆM VỤ BÍ MẬT ==================== //
  public static checkMissionCompletion(
    state: GameState,
    events: GameEvent[],
    player: Player
  ): void {
    if (!player.secretMission || player.secretMission.isCompleted || player.isBankrupt) return;

    const mission = player.secretMission;
    const progress = getMissionProgress(state, player.id);
    if (!progress || progress.current < progress.target) return;

    mission.isCompleted = true;
    player.balance += mission.reward;
    events.push({
      type: 'MISSION_COMPLETED',
      playerId: player.id,
      mission,
      reward: mission.reward,
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: mission.reward,
      reason: `Hoàn thành ${mission.title}`,
    });
  }

  private static handleMortgageTile(
    state: GameState,
    events: GameEvent[],
    player: Player,
    tileId: number
  ): void {
    const option = getPropertyCashOption(state, player.id, tileId);
    if (option?.action.type !== 'MORTGAGE_TILE') return;
    const tile = BOARD_TILES[tileId];
    const prop = state.properties[tileId];
    const mortgageValue = option.proceeds;
    prop.isMortgaged = true;
    if (player.position === tileId) {
      state.canUpgradeCurrentPort = false;
    }
    player.balance += mortgageValue;

    events.push({
      type: 'TILE_MORTGAGED',
      playerId: player.id,
      tileId,
      amount: mortgageValue,
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: mortgageValue,
      reason: `Thế chấp ${tile.name}`,
    });
  }

  private static handleUnmortgageTile(
    state: GameState,
    events: GameEvent[],
    player: Player,
    tileId: number
  ): void {
    const tile = BOARD_TILES[tileId];
    const prop = state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== player.id || !prop.isMortgaged) return;

    const unmortgageCost = getRedemptionCost(tile);

    if (player.balance < unmortgageCost) return;

    player.balance -= unmortgageCost;
    prop.isMortgaged = false;

    events.push({
      type: 'TILE_UNMORTGAGED',
      playerId: player.id,
      tileId,
      cost: unmortgageCost,
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: -unmortgageCost,
      reason: `Chuộc tài sản ${tile.name}`,
    });
  }

  private static handlePayHoldFine(
    state: GameState,
    events: GameEvent[],
    player: Player
  ): void {
    if (!player.inHold || state.phase !== 'WAIT_FOR_ROLL' || state.hasRolled) return;
    if (player.balance < HOLD_FINE_AMOUNT) return;

    player.balance -= HOLD_FINE_AMOUNT;
    player.inHold = false;
    player.holdTurns = 0;

    events.push({
      type: 'TAX_PAID',
      playerId: player.id,
      tileId: HOLD_TILE_INDEX,
      amount: HOLD_FINE_AMOUNT,
    });
    events.push({
      type: 'RELEASED_FROM_HOLD',
      playerId: player.id,
      method: 'FINE',
    });
    events.push({
      type: 'BALANCE_CHANGED',
      playerId: player.id,
      newBalance: player.balance,
      delta: -HOLD_FINE_AMOUNT,
      reason: 'Nộp phí thông quan tự nguyện',
    });
  }

  private static handleUseClearancePass(
    state: GameState,
    events: GameEvent[],
    player: Player
  ): void {
    if (!player.inHold || state.phase !== 'WAIT_FOR_ROLL' || state.hasRolled) return;
    if (player.customsClearancePasses <= 0) return;

    player.customsClearancePasses--;
    player.inHold = false;
    player.holdTurns = 0;

    events.push({
      type: 'RELEASED_FROM_HOLD',
      playerId: player.id,
      method: 'PASS',
    });
  }

  private static handleSettleDebt(
    state: GameState,
    events: GameEvent[],
    player: Player
  ): void {
    if (state.phase !== 'AWAITING_DEBT_RESOLUTION' || !state.pendingDebt) return;
    const debt = state.pendingDebt;

    if (player.balance < debt.amount) return;

    const creditor = debt.creditorId === 'BANK'
      ? undefined
      : state.players.find((p) => p.id === debt.creditorId);
    state.pendingDebt = null;
    if (creditor && debt.tileId !== undefined) {
      OneMonopolyEngine.collectRent(state, events, player, creditor, debt.tileId, debt.amount, debt.charterRent);
    } else {
      player.balance -= debt.amount;
      if (creditor) creditor.balance += debt.amount;
      OneMonopolyEngine.finishStepPhase(state);
    }

    events.push({
      type: 'DEBT_SETTLED',
      debtorId: player.id,
      creditorId: debt.creditorId,
      amount: debt.amount,
    });
  }

  private static handleDeclareBankruptcy(
    state: GameState,
    events: GameEvent[],
    player: Player
  ): void {
    player.isBankrupt = true;
    if (state.harborFreight) {
      state.harborFreight.manifests[player.id] = null;
      recordHarborVisit(state, player.id, null);
    }
    const creditorId = state.pendingDebt?.creditorId || 'BANK';
    player.bankruptTo = creditorId;

    events.push({
      type: 'PLAYER_BANKRUPT',
      debtorId: player.id,
      creditorId,
    });

    if (creditorId !== 'BANK') {
      const creditor = state.players.find((p) => p.id === creditorId);
      if (creditor) {
        // Transfer remaining cash
        creditor.balance += Math.max(0, player.balance);
        player.balance = 0;

        // Transfer all properties (reset containers to 0, keep mortgaged state)
        for (const tileId of Object.keys(state.properties)) {
          const prop = state.properties[Number(tileId)];
          if (prop && prop.ownerId === player.id) {
            prop.ownerId = creditor.id;
            prop.containerLevel = 0;
            prop.hasGreenFleet = false;
            prop.slotCharter = null;
          }
        }
        OneMonopolyEngine.checkMissionCompletion(state, events, creditor);
      }
    } else {
      // Bank liquidation: reset all properties to unowned
      for (const tileId of Object.keys(state.properties)) {
        const prop = state.properties[Number(tileId)];
        if (prop && prop.ownerId === player.id) {
          prop.ownerId = null;
          prop.containerLevel = 0;
          prop.isMortgaged = false;
          prop.hasGreenFleet = false;
          prop.slotCharter = null;
        }
      }
      player.balance = 0;
    }

    state.pendingDebt = null;

    // Check game over
    const activeSurvivors = state.players.filter((p) => !p.isBankrupt);
    if (activeSurvivors.length === 1) {
      state.stormActive = false;
      state.winnerId = activeSurvivors[0].id;
      events.push({
        type: 'GAME_OVER',
        winnerId: state.winnerId,
      });
      return;
    }

    // Pass turn to next active player
    OneMonopolyEngine.handleEndTurn(state, events, player);
  }

  private static handleEndTurn(
    state: GameState,
    _events: GameEvent[],
    _player: Player
  ): void {
    if (state.pendingDebt !== null || state.pendingSlotCharter !== null) return;

    let nextIndex = (state.activePlayerIndex + 1) % state.players.length;
    let loopCount = 0;
    while (state.players[nextIndex].isBankrupt && loopCount < state.players.length) {
      nextIndex = (nextIndex + 1) % state.players.length;
      loopCount++;
    }

    if (nextIndex <= state.activePlayerIndex) {
      state.turnCount++;
    }

    state.activePlayerIndex = nextIndex;
    state.stormActive = false;
    state.canUpgradeCurrentPort = false;
    state.hasRolled = false;
    state.consecutiveDoubles = 0;
    state.phase = 'WAIT_FOR_ROLL';
  }
}
