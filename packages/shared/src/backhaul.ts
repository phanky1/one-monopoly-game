import type { BackhaulAccept, BackhaulJob, DeliveryReceipt, GameEvent, GameState, Player } from './types.js';

export const BACKHAUL_BONUS = 6;

export function getAcceptBackhaulAction(state: GameState, playerId: string): BackhaulAccept | null {
  const player = state.players[state.activePlayerIndex];
  const job = player?.backhaul;
  if (!state.logistics?.backhaulEnabled || state.mode !== 'logistics' || !state.gameStarted || state.winnerId ||
      !player || player.id !== playerId || player.isBankrupt || player.inHold || player.balance < 0 ||
      state.pendingDebt || state.pendingSlotCharter || state.auction ||
      (state.phase !== 'AWAITING_SAIL' && state.phase !== 'END_OF_TURN') ||
      job?.status !== 'offered' || job.offeredRound !== state.turnCount || player.lastDelivery?.bookingId !== job.bookingId) return null;
  return { type: 'ACCEPT_BACKHAUL', bookingId: job.bookingId, revision: state.cargoRevision ?? 0 };
}

export function offerBackhaul(state: GameState, player: Player, receipt: DeliveryReceipt, deadlineRound: number) {
  if (!state.logistics?.backhaulEnabled) return;
  player.backhaul = { bookingId: receipt.bookingId, originTileId: receipt.tileId, destinationTileId: receipt.originTileId,
    offeredRound: state.turnCount, deadlineRound, status: 'offered' };
}

function closeJob(player: Player, job: BackhaulJob, paid: boolean): GameEvent {
  const settled: BackhaulJob = { ...job, status: paid ? 'fulfilled' : 'expired' };
  player.lastBackhaul = settled;
  delete player.backhaul;
  return { type: paid ? 'BACKHAUL_FULFILLED' : 'BACKHAUL_EXPIRED', playerId: player.id, job: settled };
}

export function getBackhaulBonus(state: GameState, player: Player, receipt: Pick<DeliveryReceipt, 'bookingId' | 'originTileId' | 'tileId'>, round: number) {
  const job = player.backhaul;
  return state.logistics?.backhaulEnabled && job?.status === 'active' &&
    round <= job.deadlineRound && player.lastBackhaulPaidRound !== round && receipt.bookingId !== job.bookingId &&
    receipt.originTileId === job.originTileId && receipt.tileId === job.destinationTileId ? BACKHAUL_BONUS : 0;
}

export function settleBackhaul(state: GameState, player: Player, receipt: DeliveryReceipt): GameEvent | null {
  const job = player.backhaul;
  if (!state.logistics?.backhaulEnabled || job?.status !== 'active') return null;
  const bonus = getBackhaulBonus(state, player, receipt, state.turnCount);
  if (bonus) {
    receipt.backhaulBonus = bonus;
    player.lastBackhaulPaidRound = state.turnCount;
  }
  return closeJob(player, job, bonus > 0);
}

export function closeBackhaulTurn(state: GameState, events: GameEvent[], finalRound: boolean) {
  if (!state.logistics?.backhaulEnabled) return;
  const captain = state.players[state.activePlayerIndex];
  if (captain.backhaul?.status === 'offered') delete captain.backhaul;
  if (state.activePlayerIndex !== state.players.length - 1) return;
  for (const player of state.players) {
    const job = player.backhaul;
    if (job?.status === 'active' && (finalRound || job.deadlineRound <= state.turnCount)) {
      events.push(closeJob(player, job, false));
    }
  }
}
