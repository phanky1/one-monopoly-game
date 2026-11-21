import {
  FREIGHT_TENDER_MAX_BID, FREIGHT_TENDER_MIN_BID, canReceiveCargo, getCargoBookings, getCargoOpportunity,
  getAcceptBackhaulAction, getCargoRedirections, getEarlyTruckCalls, getEmptyNeed, getFeederDistanceNm, getFeederRoutes, getLogisticsRoutes,
  getImportTruckReservation, getReserveImportTruckAction, getReturnCargoToYardAction, getStreetTurnAction, getTenderBidAction,
  isFinalLogisticsRound, isReeferPort,
  OneMonopolyEngine, REEFER_ON_TIME_BONUS,
  type FreightRivalStyle, type FreightTender, type GameAction, type GameState, type Player, type PortStock,
} from '@one-monopoly/shared';

function bestBooking(state: GameState, captain: Player, choices: ReturnType<typeof getCargoBookings>) {
  const best = [...choices].sort((a, b) => b.quote.reward - a.quote.reward)[0];
  if (!best || state.logistics?.hasSailed || best.action.kind === 'empty') return best?.action;
  const cold = getCargoBookings(state, captain.id, 'laden', true)
    .filter(reefer => choices.some(choice => choice.tileId === reefer.tileId && choice.action.kind === 'laden'))
    .sort((a, b) => b.quote.reward - a.quote.reward)[0];
  return cold && cold.quote.reward + REEFER_ON_TIME_BONUS >= best.quote.reward ? cold.action : best.action;
}

function equipmentBooking(state: GameState, captain: Player) {
  const ports = state.logistics!.ports;
  return getCargoBookings(state, captain.id, 'empty')
    .map(choice => ({ choice, shortage: getEmptyNeed(ports[choice.tileId]) }))
    .filter(({ shortage }) => shortage > 0)
    .sort((a, b) => b.shortage - a.shortage || b.choice.quote.reward - a.choice.quote.reward ||
      a.choice.tileId - b.choice.tileId)[0]?.choice.action;
}

function shortSeaBooking(state: GameState, captain: Player, canDeliverNow: boolean) {
  const bookings = [
    ...getCargoBookings(state, captain.id, 'laden'),
    ...getCargoBookings(state, captain.id, 'empty'),
    ...(canDeliverNow ? getCargoBookings(state, captain.id, 'laden', true) : []),
  ];
  const localJobs = bookings.flatMap(({ action, quote, tileId }) => {
    const distance = getFeederDistanceNm(captain.position, tileId);
    const payment = quote.reward + (action.reefer ? REEFER_ON_TIME_BONUS : 0);
    return distance === null ? [] : [{ action, distance, payment, tileId }];
  });
  return localJobs.sort((a, b) => a.distance - b.distance || b.payment - a.payment || a.tileId - b.tileId)[0]?.action;
}

function coastalStreetTurn(state: GameState, captain: Player, feederRoutes: ReturnType<typeof getFeederRoutes>) {
  const operations = state.logistics!;
  if (!operations.backhaulEnabled || operations.ports[captain.position].supply !== 0) return null;
  const reuse = getStreetTurnAction(state, captain.id);
  if (!reuse) return null;

  // Discharging can trigger the final round or settle an award. Check the actual resulting return terms.
  const after = OneMonopolyEngine.dispatch(state, reuse, captain.id).state;
  const offer = after.players[after.activePlayerIndex].backhaul;
  if (offer?.status !== 'offered' || offer.bookingId !== reuse.bookingId) return null;
  const target = offer.destinationTileId;
  const contract = after.logistics?.market?.contract;
  if (contract?.status === 'active' && contract.playerId === captain.id &&
      (contract.destinationTileId !== target || contract.kind !== 'laden')) return null;
  if (!canReceiveCargo(after, captain.id, target, 'laden')) return null;
  const canSailNow = !operations.hasSailed || feederRoutes.some(route => route.tileId === target);
  if (!canSailNow && (offer.deadlineRound <= state.turnCount || operations.ports[target].demand < 1)) return null;
  return reuse;
}

function contestedTruck(state: GameState, captain: Player, feederRoutes: ReturnType<typeof getFeederRoutes>) {
  const booking = captain.cargo;
  if (!state.logistics?.hasSailed || booking?.kind !== 'laden') return null;
  const destination = booking.destinationTileId;
  if (state.logistics.ports[destination]?.demand !== 1 ||
      feederRoutes.some(route => route.tileId === destination && route.quote)) return null;
  const competes = state.players.some(other => other.id !== captain.id && !other.isBankrupt &&
    other.cargo?.kind === 'laden' && other.cargo.destinationTileId === destination && !getImportTruckReservation(state, other.id));
  return competes ? getReserveImportTruckAction(state, captain.id) : null;
}

// Spend the once-per-game call only if it creates a booking or discharge right now.
function callTruckForCargo(state: GameState, captain: Player, target?: number) {
  const operations = state.logistics;
  const berth = captain.position;
  const cargo = captain.cargo;
  if (!operations || (cargo ? cargo.destinationTileId !== berth : operations.ports[berth].supply > 0)) return;
  const operation = cargo?.kind === 'laden' ? 'import' : 'export';
  const choice = getEarlyTruckCalls(state, captain.id).find(call => call.operation === operation);
  if (!choice) return;
  const after = { ...state, logistics: { ...operations, ports: { ...operations.ports, [berth]: choice.after } } };
  if (cargo) {
    if (getCargoOpportunity(after, captain.id)?.action.type === 'UNLOAD_CARGO') return choice.action;
  } else if (getCargoBookings(after, captain.id, 'laden').some(option => target === undefined || option.tileId === target)) {
    return choice.action;
  }
}

function quoteNextRound(captain: Player, stock: PortStock, tender: FreightTender): number | null {
  const job = captain.cargo;
  if (job) {
    if (job.kind !== tender.kind || job.originTileId === tender.destinationTileId) return null;
    if (job.reeferDueRound !== undefined && !isReeferPort(tender.destinationTileId)) return null;
    return FREIGHT_TENDER_MIN_BID + (job.destinationTileId === tender.destinationTileId ? 1 : 4);
  }
  const available = tender.kind === 'laden' ? stock.supply : stock.empties - stock.emptyTarget;
  if (captain.position === tender.destinationTileId || available < 1) return null;
  return FREIGHT_TENDER_MAX_BID - (available > 1 ? 5 : 3);
}

export function getFreightBotAction(state: GameState, style: FreightRivalStyle = 'standard'): GameAction {
  const captain = state.players[state.activePlayerIndex];
  const operations = state.logistics;
  if (!operations) return { type: 'END_TURN' };
  const job = captain.cargo;
  const discharge = getCargoOpportunity(state, captain.id);
  const contract = operations.market?.contract;
  const owesDelivery = contract?.status === 'active' && contract.playerId === captain.id && contract.deliveryRound === state.turnCount;
  const backhaul = captain.backhaul;
  const feederRoutes = operations.hasSailed ? getFeederRoutes(state, captain.id) : [];
  if (owesDelivery && discharge?.action.type !== 'UNLOAD_CARGO') {
    const target = contract.destinationTileId;
    const routes = operations.hasSailed ? feederRoutes : getLogisticsRoutes(state, captain.id);
    const canReach = routes.some(route => route.tileId === target);
    if (job && canReach && (job.kind !== contract.kind || (job.reeferDueRound !== undefined && !isReeferPort(target)))) {
      const giveBack = getReturnCargoToYardAction(state, captain.id);
      if (giveBack) {
        const returned = OneMonopolyEngine.dispatch(state, giveBack, captain.id).state;
        if (getCargoBookings(returned, captain.id, contract.kind).some(choice => choice.tileId === target)) return giveBack;
      }
    }
    if (!job && canReach) {
      const load = bestBooking(state, captain, getCargoBookings(state, captain.id, contract.kind).filter(choice => choice.tileId === target));
      if (load) return load;
      if (contract.kind === 'laden') {
        const supply = callTruckForCargo(state, captain, target);
        if (supply) return supply;
      }
    } else if (job?.kind === contract.kind && (canReach || captain.position === target)) {
      if (job.destinationTileId !== target) {
        const redirect = getCargoRedirections(state, captain.id).find(choice => choice.tileId === target);
        if (redirect) return redirect.action;
      } else {
        const route = getLogisticsRoutes(state, captain.id).find(choice => choice.tileId === target && choice.quote);
        if (route) return route.action;
      }
    }
  }
  if (discharge?.action.type === 'UNLOAD_CARGO') {
    return style === 'coastal' ? coastalStreetTurn(state, captain, feederRoutes) ?? discharge.action : discharge.action;
  }
  if (job && captain.position === job.destinationTileId) {
    const receiver = callTruckForCargo(state, captain);
    if (receiver) return receiver;
  }
  if (job && (job.reeferDueRound === state.turnCount ||
      (owesDelivery && job.kind === contract.kind && job.destinationTileId === contract.destinationTileId) ||
      (backhaul?.status === 'active' && backhaul.deadlineRound === state.turnCount &&
        job.originTileId === backhaul.originTileId && job.destinationTileId === backhaul.destinationTileId))) {
    const feeder = feederRoutes.find(route => route.tileId === job.destinationTileId && route.quote);
    if (feeder) return feeder.action;
  }

  const coastalLoad = style === 'coastal' && !job
    ? shortSeaBooking(state, captain, !operations.hasSailed || feederRoutes.length > 0) : undefined;
  const canLoadForFeeder = coastalLoad && feederRoutes.some(route => route.tileId === coastalLoad.destinationTileId);
  const reservation = style !== 'standard' ? contestedTruck(state, captain, feederRoutes) : null;
  const streetReturn = style === 'coastal' && captain.lastDelivery?.streetTurn &&
    backhaul?.bookingId === captain.lastDelivery.bookingId;
  // Delay a speculative bid while the coastal ship can make another delivery or a specialist owes a return.
  const tender = operations.market?.tender;
  if (operations.hasSailed && tender && !owesDelivery && !canLoadForFeeder && !reservation &&
      !streetReturn && (style === 'standard' || backhaul?.status !== 'active')) {
    const amount = quoteNextRound(captain, operations.ports[captain.position], tender);
    if (amount !== null) {
      if (tender.bids[captain.id] === undefined) {
        const bid = getTenderBidAction(state, captain.id, amount);
        if (bid) return bid;
      } else if (!job) {
        const load = getCargoBookings(state, captain.id, tender.kind).find(choice => choice.tileId === tender.destinationTileId);
        // A winning shipper can receive a box even if the public berth is already full.
        return load?.action ?? { type: 'END_TURN' };
      }
    }
  }

  const conflictingBid = tender && tender.bids[captain.id] !== undefined && tender.destinationTileId !== backhaul?.destinationTileId;
  if (backhaul && !owesDelivery && (backhaul.status === 'active' || streetReturn || !conflictingBid)) {
    const target = backhaul.destinationTileId;
    const pickup = !job && captain.position === backhaul.originTileId ? bestBooking(state, captain,
      [...getCargoBookings(state, captain.id, 'laden'), ...getCargoBookings(state, captain.id, 'empty')]
        .filter(choice => choice.tileId === target)) : undefined;
    const carriesReturn = job?.originTileId === backhaul.originTileId;
    const redirect = carriesReturn && job.destinationTileId !== target
      ? getCargoRedirections(state, captain.id).find(choice => choice.tileId === target) : undefined;
    if (backhaul.status === 'offered' && (pickup || redirect || (carriesReturn && job.destinationTileId === target))) {
      const accept = getAcceptBackhaulAction(state, captain.id);
      if (accept) return accept;
    }
    if (backhaul.status === 'active') {
      if (pickup) return pickup;
      if (redirect) return redirect.action;
    }
  }

  if (style === 'coastal' && job) {
    const feeder = feederRoutes.find(route => route.tileId === job.destinationTileId && route.quote);
    if (feeder) return feeder.action;
  }
  if (reservation) return reservation;
  if (!job) {
    if (style !== 'standard' && operations.hasSailed && !canLoadForFeeder && isFinalLogisticsRound(state)) {
      return { type: 'END_TURN' };
    }
    if (coastalLoad) return coastalLoad;
    if (style === 'equipment') {
      const empty = equipmentBooking(state, captain);
      if (empty) return empty;
    }
    const exports = getCargoBookings(state, captain.id, 'laden');
    const equipment = getCargoBookings(state, captain.id, 'empty');
    // After an export, try returning equipment to a shortage port for the next ship.
    const preferEmpty = captain.lastDelivery?.kind === 'laden';
    const preferred = preferEmpty ? equipment : exports;
    // Start an export tender round by returning surplus boxes to a port that can ship next round.
    const feeder = !captain.lastDelivery && tender?.kind === 'laden'
      ? equipment.filter(choice => choice.tileId !== tender.destinationTileId && operations.ports[choice.tileId].supply > 0)
      : [];
    const options = [feeder, preferred, preferEmpty ? exports : equipment].find(choices => choices.length);
    if (options) return bestBooking(state, captain, options);
    if (!operations.hasSailed) {
      const supply = callTruckForCargo(state, captain);
      if (supply) return supply;
    }
  } else if (!canReceiveCargo(state, captain.id, job.destinationTileId, job.kind)) {
    const alternatives = getCargoRedirections(state, captain.id);
    const atBerth = alternatives.find(option => option.tileId === captain.position);
    if (atBerth) return atBerth.action;
    if (alternatives.length) return alternatives[0].action;
  }

  const routes = getLogisticsRoutes(state, captain.id);
  if (job) {
    const booked = routes.find(route => route.tileId === job.destinationTileId);
    if (booked) return booked.action;
  } else {
    const source = [...routes].sort((a, b) => b.supply - a.supply || a.distanceNm - b.distanceNm)[0];
    if (source) return source.action;
  }
  return { type: 'END_TURN' };
}
