import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OneMonopolyEngine } from '../src/gameEngine.js';
import { BOARD_TILES, GREEN_FLEET_COST } from '../src/boardData.js';

describe('OneMonopolyEngine Unit Tests', () => {
  const initialPlayers = [
    { id: 'p1', name: 'Captain Apus', token: 'ONE_APUS' as const },
    { id: 'p2', name: 'Chief Magenta', token: 'ONE_MAGENTA' as const },
  ];

  it('createGame initializes game state properly with secret missions', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);

    assert.equal(state.roomId, 'room-1');
    assert.equal(state.players.length, 2);
    assert.equal(state.players[0].balance, 1500);
    assert.equal(state.players[0].position, 0);
    assert.ok(state.players[0].secretMission);
    assert.equal(state.players[0].secretMission?.isCompleted, false);
    assert.equal(state.phase, 'WAIT_FOR_ROLL');
    assert.equal(state.activePlayerIndex, 0);
    assert.equal(state.winnerId, null);

    // Verify properties initialized
    assert.equal(state.properties[1].ownerId, null);
    assert.equal(state.properties[1].containerLevel, 0);
    assert.equal(state.properties[1].isMortgaged, false);
    assert.equal(state.properties[1].hasGreenFleet, false);
  });

  it('ROLL_DICE moves player and prompts for buy on unowned port', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);

    // Force dice [1, 2] -> sum = 3 -> lands on tile 3 (VNVUT)
    const { state: nextState, events } = OneMonopolyEngine.dispatch(state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 2],
    });

    assert.equal(nextState.players[0].position, 3);
    assert.equal(nextState.phase, 'AWAITING_BUY_DECISION');

    const rollEvent = events.find((e) => e.type === 'DICE_ROLLED');
    assert.ok(rollEvent);
    const stepEvent = events.find((e) => e.type === 'SHIP_STEPPED');
    assert.ok(stepEvent);
  });

  it('BUY_PROPERTY deducts cash and assigns ownership', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);
    const s1 = OneMonopolyEngine.dispatch(state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 2], // Tile 3 (VNVUT, price $60M)
    }).state;

    const { state: s2, events } = OneMonopolyEngine.dispatch(s1, {
      type: 'BUY_PROPERTY',
    });

    assert.equal(s2.players[0].balance, 1500 - 60);
    assert.equal(s2.properties[3].ownerId, 'p1');
    assert.equal(s2.phase, 'END_OF_TURN');

    const purchaseEvent = events.find((e) => e.type === 'TILE_PURCHASED');
    assert.ok(purchaseEvent);
  });

  it('Passed GO awards $200M', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);
    state.players[0].position = 30;

    // Roll 3 -> 30 + 3 = 33 % 32 = 1 (VNSGN, passed 0)
    const { state: nextState, events } = OneMonopolyEngine.dispatch(state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 2],
    });

    assert.equal(nextState.players[0].position, 1);
    assert.ok(nextState.players[0].balance >= 1700);

    const goEvent = events.find((e) => e.type === 'PASSED_GO');
    assert.ok(goEvent);
  });

  it('blocks building on first purchase visit and allows at most 1 upgrade per subsequent visit to an owned port', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);
    // Player 2 owns Tile 3 (VNVUT) so Player 1 never owns full color group
    state.properties[3].ownerId = 'p2';

    // 1. First visit to Tile 1 (VNSGN): roll [0, 1] -> lands on Tile 1 and buys it
    let res = OneMonopolyEngine.dispatch(state, {
      type: 'ROLL_DICE',
      forcedDice: [0, 1],
    });
    assert.equal(res.state.phase, 'AWAITING_BUY_DECISION');

    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'BUY_PROPERTY',
    });
    assert.equal(res.state.properties[1].ownerId, 'p1');
    assert.equal(res.state.canUpgradeCurrentPort, false);

    // Attempt to build immediately on the purchase visit -> BLOCKED
    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'BUILD_CONTAINER',
      tileId: 1,
    });
    assert.equal(res.state.properties[1].containerLevel, 0, 'Cannot build on the same visit as buying the port');

    // 2. Subsequent visit to Tile 1: Player 1 moves from tile 31 -> rolls [1, 1] -> lands on Tile 1
    res.state.players[0].position = 31;
    res.state.phase = 'WAIT_FOR_ROLL';
    res.state.hasRolled = false;

    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 1],
    });
    assert.equal(res.state.players[0].position, 1);
    assert.equal(res.state.canUpgradeCurrentPort, true);

    // First upgrade on this visit -> SUCCEEDS (level 0 -> 1)
    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'BUILD_CONTAINER',
      tileId: 1,
    });
    assert.equal(res.state.properties[1].containerLevel, 1);
    assert.equal(res.state.canUpgradeCurrentPort, false);

    // Second upgrade on the SAME visit -> BLOCKED (remains level 1)
    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'BUILD_CONTAINER',
      tileId: 1,
    });
    assert.equal(res.state.properties[1].containerLevel, 1, 'Cannot upgrade more than once in a single visit');

    // 3. Another visit to Tile 1 -> allows 1 more upgrade (level 1 -> 2)
    res.state.players[0].position = 31;
    res.state.phase = 'WAIT_FOR_ROLL';
    res.state.hasRolled = false;

    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 1],
    });
    assert.equal(res.state.canUpgradeCurrentPort, true);

    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'BUILD_CONTAINER',
      tileId: 1,
    });
    assert.equal(res.state.properties[1].containerLevel, 2);
    assert.equal(res.state.canUpgradeCurrentPort, false);
  });

  it('allows selling containers and mortgaging any port remotely without group-wide restrictions', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);
    state.properties[1].ownerId = 'p1';
    state.properties[3].ownerId = 'p1';
    state.properties[1].containerLevel = 2;
    state.properties[3].containerLevel = 0;
    // Player 1 is far away at tile 10
    state.players[0].position = 10;

    // Can mortgage Tile 3 (0 containers) even though Tile 1 has 2 containers
    let res = OneMonopolyEngine.dispatch(state, {
      type: 'MORTGAGE_TILE',
      tileId: 3,
    });
    assert.equal(res.state.properties[3].isMortgaged, true);

    // Cannot mortgage Tile 1 while it still has containers
    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'MORTGAGE_TILE',
      tileId: 1,
    });
    assert.equal(res.state.properties[1].isMortgaged, false);

    // Can sell containers on Tile 1 remotely from tile 10
    res = OneMonopolyEngine.dispatch(res.state, {
      type: 'SELL_CONTAINER',
      tileId: 1,
    });
    assert.equal(res.state.properties[1].containerLevel, 1);
  });

  it('Green Fleet Upgrade & Carbon Tax Exemption', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);
    // Player 1 owns Tokyo Hub (Tile 31) with 4 containers
    state.properties[31].ownerId = 'p1';
    state.properties[31].containerLevel = 4;
    state.players[0].position = 28;

    // Visit 1 to Tile 31: Upgrade from level 4 to level 5 (ONE Innovation)
    let visit1 = OneMonopolyEngine.dispatch(state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 2], // 28 -> 31
    });
    assert.equal(visit1.state.canUpgradeCurrentPort, true);
    visit1 = OneMonopolyEngine.dispatch(visit1.state, {
      type: 'BUILD_CONTAINER',
      tileId: 31,
    });
    assert.equal(visit1.state.properties[31].containerLevel, 5);
    assert.equal(visit1.state.canUpgradeCurrentPort, false);

    // Cannot also upgrade Green Fleet in the same visit!
    const sameVisitGreen = OneMonopolyEngine.dispatch(visit1.state, {
      type: 'UPGRADE_GREEN_FLEET',
      tileId: 31,
    });
    assert.equal(sameVisitGreen.state.properties[31].hasGreenFleet, false);

    // Visit 2 to Tile 31: Now at level 5, landing on it allows Green Fleet upgrade
    visit1.state.players[0].position = 28;
    visit1.state.phase = 'WAIT_FOR_ROLL';
    visit1.state.hasRolled = false;
    const visit2 = OneMonopolyEngine.dispatch(visit1.state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 2], // 28 -> 31
    });
    const initialBal = visit2.state.players[0].balance;
    assert.equal(visit2.state.canUpgradeCurrentPort, true);

    const res1 = OneMonopolyEngine.dispatch(visit2.state, {
      type: 'UPGRADE_GREEN_FLEET',
      tileId: 31,
    });
    assert.equal(res1.state.canUpgradeCurrentPort, false);

    assert.equal(res1.state.properties[31].hasGreenFleet, true);
    assert.equal(res1.state.players[0].balance, initialBal - GREEN_FLEET_COST);

    const upgradeEvent = res1.events.find((e) => e.type === 'GREEN_FLEET_UPGRADED');
    assert.ok(upgradeEvent);

    // Now Player 1 lands on Carbon Tax (Tile 29)
    res1.state.players[0].position = 27;
    res1.state.phase = 'WAIT_FOR_ROLL';
    res1.state.hasRolled = false;

    const res2 = OneMonopolyEngine.dispatch(res1.state, {
      type: 'ROLL_DICE',
      forcedDice: [1, 1], // Lands on 29
    });

    assert.equal(res2.state.players[0].position, 29);
    // Should be exempted from $100M tax!
    assert.equal(res2.state.players[0].balance, initialBal - GREEN_FLEET_COST);
    const exemptEvent = res2.events.find((e) => e.type === 'CARBON_TAX_EXEMPTED');
    assert.ok(exemptEvent);
  });

  it('Slot Chartering (As ONE, We Can) Agreement & 50/50 Revenue Split', () => {
    const state = OneMonopolyEngine.createGame('room-1', [
      ...initialPlayers,
      { id: 'p3', name: 'Third Mate', token: 'REEFER_TRUCK' as const },
    ]);

    // P2 owns Tile 1 (VNSGN) with 2 containers (rent is $30M)
    state.properties[1].ownerId = 'p2';
    state.properties[1].containerLevel = 2;

    // P1 owns Service Line VSS (Tile 4)
    state.properties[4].ownerId = 'p1';

    // P1 rolls and lands on Tile 1
    const rollRes = OneMonopolyEngine.dispatch(state, {
      type: 'ROLL_DICE',
      forcedDice: [0, 1],
    });

    assert.equal(rollRes.state.phase, 'AWAITING_SLOT_CHARTER_RESPONSE');
    assert.ok(rollRes.state.pendingSlotCharter);
    assert.equal(rollRes.state.pendingSlotCharter.originalRent, 30);
    assert.equal(rollRes.state.pendingSlotCharter.discountedRent, 15);

    // P2 accepts Slot Chartering proposal!
    const charterRes = OneMonopolyEngine.dispatch(rollRes.state, {
      type: 'RESPOND_SLOT_CHARTER',
      accept: true,
    });

    // P1 paid only $15M instead of $30M
    assert.equal(charterRes.state.players[0].balance, 1500 - 15);
    assert.equal(charterRes.state.players[1].balance, 1500 + 15);
    assert.equal(charterRes.state.properties[1].slotCharter?.active, true);
    assert.equal(charterRes.state.properties[1].slotCharter?.partnerId, 'p1');

    // Now P3 lands on Tile 1: Rent is $30M, split 50/50 between P2 and P1!
    charterRes.state.activePlayerIndex = 2; // P3's turn
    charterRes.state.phase = 'WAIT_FOR_ROLL';
    charterRes.state.hasRolled = false;

    const p3Res = OneMonopolyEngine.dispatch(charterRes.state, {
      type: 'ROLL_DICE',
      forcedDice: [0, 1], // Lands on Tile 1
    });

    assert.equal(p3Res.state.players[2].balance, 1500 - 30);
    assert.equal(p3Res.state.players[1].balance, 1500 + 15 + 15); // Owner got +15
    assert.equal(p3Res.state.players[0].balance, 1500 - 15 + 15); // Partner P1 got +15!
    assert.equal(p3Res.state.properties[1].slotCharter?.active, false);

    const splitEvent = p3Res.events.find((e) => e.type === 'SLOT_CHARTER_RENT_SPLIT');
    assert.ok(splitEvent);
  });

  it('Secret Mission completion awards bonus cash', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);
    // Assign Mission 1: Cái Mép (3), Los Angeles (23), Tuyến PS3 (28) -> $400M
    state.players[0].secretMission = {
      id: 'MISSION-1',
      title: 'Hợp Đồng 1: Cầu Nối Việt Nam – Mỹ',
      description: 'Test mission',
      reward: 400,
      isCompleted: false,
    };

    state.properties[3].ownerId = 'p1';
    state.properties[23].ownerId = 'p1';
    state.properties[28].ownerId = 'p1';

    const res = OneMonopolyEngine.dispatch(state, {
      type: 'CLAIM_MISSION_REWARD',
    });

    assert.equal(res.state.players[0].secretMission?.isCompleted, true);
    assert.equal(res.state.players[0].balance, 1500 + 400);

    const missionEvent = res.events.find((e) => e.type === 'MISSION_COMPLETED');
    assert.ok(missionEvent);
  });

  it('Bankruptcy triggers GAME_OVER when 1 survivor remains', () => {
    const state = OneMonopolyEngine.createGame('room-1', initialPlayers);
    state.phase = 'AWAITING_DEBT_RESOLUTION';
    state.pendingDebt = {
      creditorId: 'p2',
      amount: 2000,
      reason: 'Tokyo Terminal',
    };

    const res = OneMonopolyEngine.dispatch(state, {
      type: 'DECLARE_BANKRUPTCY',
    });

    assert.equal(res.state.players[0].isBankrupt, true);
    assert.equal(res.state.winnerId, 'p2');

    const gameOverEvent = res.events.find((e) => e.type === 'GAME_OVER');
    assert.ok(gameOverEvent);
  });
});
