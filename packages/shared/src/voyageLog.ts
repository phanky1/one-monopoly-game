import type { DeliveryReceipt, LogisticsState, VoyageLogEntry } from './types.js';

export function getVoyagePayment(entry: VoyageLogEntry | DeliveryReceipt): number {
  const base = 'baseFreight' in entry ? entry.baseFreight : entry.reward;
  return base + (entry.reeferBonus ?? 0) + (entry.tenderBonus ?? 0) + (entry.backhaulBonus ?? 0);
}

// Called only after UNLOAD_CARGO validates the booking and settles every premium.
export function recordVoyage(logistics: LogisticsState, playerId: string, round: number, receipt: DeliveryReceipt) {
  const log = logistics.voyageLog ??= [];
  log.push({
    bookingId: receipt.bookingId,
    playerId,
    round,
    originTileId: receipt.originTileId,
    destinationTileId: receipt.tileId,
    kind: receipt.kind,
    distanceNm: receipt.distanceNm,
    baseFreight: receipt.reward,
    ...(receipt.destinationAmendment && { destinationAmendment: structuredClone(receipt.destinationAmendment) }),
    ...(receipt.streetTurn && { streetTurn: true }),
    ...(receipt.reeferBonus !== undefined && { reeferBonus: receipt.reeferBonus }),
    ...(receipt.tenderBonus !== undefined && { tenderBonus: receipt.tenderBonus }),
    ...(receipt.backhaulBonus !== undefined && { backhaulBonus: receipt.backhaulBonus }),
  });
}
