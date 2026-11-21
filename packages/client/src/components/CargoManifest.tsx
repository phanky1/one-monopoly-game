import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  LOGISTICS_DELIVERY_TARGET, getCargoBookings, getCargoDestinationEstimate, getCargoOpportunity, getCargoRedirections, getVoyagePayment,
  getEmptyNeed, getFeederDistanceNm, getFreightQuote, getImportTruckReservation, getLogisticsRoutes, getTenderBonus,
  isFinalLogisticsRound, type GameAction, type GameState, type Player,
} from '@one-monopoly/shared';
import { ArrowRight, Check, Container, MapPin, Route, Ship, Snowflake, Truck } from 'lucide-react';
import {
  CargoBooking, ContractRate, PortSelect, Quote, getDefaultBookingService, port, receiving, typeName,
  type DestinationDraft, type DraftControls, type Submit,
} from './CargoBookingForm.js';
import './cargo-manifest.css';
import { DiversionComparison } from './DiversionComparison.js';
import { FreightMarketBoard } from './FreightMarketBoard.js';
import { TenderDesk } from './TenderDesk.js';
import { BackhaulDesk } from './BackhaulDesk.js';
import { EarlyTruckDesk } from './EarlyTruckDesk.js';
import { ImportTruckDesk } from './ImportTruckDesk.js';
import { ReturnCargoDesk } from './ReturnCargoDesk.js';
import { FeederSailing } from './FeederSailing.js';
import { ReeferDeadline, ReeferReceipt } from './ReeferCargo.js';
import { FinalPortCallEnd } from './FinalPortCallEnd.js';
import { PortDeliverySlip } from './PortDeliverySlip.js';
import { StreetTurnOption } from './StreetTurnOption.js';
import { WaybillAmendment } from './WaybillAmendment.js';
import { WatchPlanCard } from './WatchPlanCard.js';
import { useWatchPlan } from '../hooks/useWatchPlan.js';

interface DeskProps {
  gameState: GameState;
  myPlayerId: string | null;
  is3D: boolean;
  onOpenFeederChart: (captainId: string, originTileId: number) => void;
  remainingSeconds?: number;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
}

type PortStock = NonNullable<GameState['logistics']>['ports'][number];
const distance = new Intl.NumberFormat('vi-VN');

function Stock({ stock }: { stock: PortStock }) {
  return (
    <dl className="freight-stock">
      <div><dt>Xe chở hàng xuất</dt><dd>{stock.supply}</dd></div>
      <div><dt>Xe nhận hàng nhập</dt><dd>{stock.demand}</dd></div>
      <div><dt>Vỏ rỗng tại bến</dt><dd>{stock.empties}
        <small>{stock.empties > stock.emptyTarget ? `dư ${stock.empties - stock.emptyTarget}` : getEmptyNeed(stock) ? `thiếu ${getEmptyNeed(stock)}` : 'đủ'}</small>
      </dd></div>
    </dl>
  );
}

function ChangeDestination({ choices, booked, state, busy, submit, draft, editDraft, onOpenMarket }: {
  choices: ReturnType<typeof getCargoRedirections>; booked: NonNullable<Player['cargo']>; state: GameState; busy: boolean; submit: Submit;
} & DraftControls) {
  const open = !!draft.redirectOpen;
  const fieldId = useId();
  const playerId = state.players[state.activePlayerIndex].id;
  const choice = choices.find(b => b.tileId === draft.tileId) ?? choices.find(b => getTenderBonus(state, playerId, b.tileId, booked.kind)) ?? choices[0];
  return (
    <div className="freight-amend">
      <button type="button" className="freight-link" aria-expanded={open} aria-controls={fieldId}
        onClick={() => editDraft({ service: draft.service, redirectOpen: !open })}><Route aria-hidden="true" />{open ? 'Hủy đổi cảng đích' : 'Đổi cảng đích'}</button>
      {open && <div className="freight-amend-form" id={fieldId}>
        <strong lang="en">Change of Destination (COD)</strong>
        {booked.reeferDueRound !== undefined && <p className="freight-note">Hàng lạnh chỉ đổi sang cảng có kho lạnh. Hạn giao vẫn là vòng {booked.reeferDueRound}.</p>}
        {choice ? <>
          <PortSelect label="Cảng đích mới của lô hàng" value={choice.tileId} purpose="redirect"
            onChange={tileId => editDraft({ service: draft.service, redirectOpen: true, tileId })} onOpenMarket={onOpenMarket} focusDraft={draft.fromMarket ? draft : undefined}
            options={choices.map(b => ({ tileId: b.tileId, description: receiving(state, playerId, b.tileId, booked.kind) }))} />
          <DiversionComparison state={state} playerId={playerId} currentId={booked.destinationTileId} proposedId={choice.tileId} />
          <button type="button" className="chart-button freight-handling" disabled={busy} data-cargo-action="CHANGE_DESTINATION"
            onClick={() => submit(choice.action, () => editDraft({ service: draft.service }))}><Check aria-hidden="true" />Xác nhận đổi cảng đích</button>
        </> : <p className="freight-note">Chưa có bến khác nhận được lô hàng này.</p>}
      </div>}
    </div>
  );
}

function Sailing({ state, player, busy, routes, submit }: {
  state: GameState; player: Player; busy: boolean; routes: ReturnType<typeof getLogisticsRoutes>; submit: Submit;
}) {
  const [chosen, setChosen] = useState<number | undefined>();
  const preferred = player.cargo?.destinationTileId;
  const stocked = routes.find(route => {
    const stock = state.logistics!.ports[route.tileId];
    return stock.supply > 0 || stock.empties > stock.emptyTarget;
  });
  const choice = routes.find(r => r.tileId === chosen) ?? routes.find(r => r.tileId === preferred) ?? stocked ?? routes[0];
  if (!choice) return null;
  const feederDistance = preferred !== undefined && state.logistics?.feederAvailable?.[player.id] === true
    ? getFeederDistanceNm(choice.tileId, preferred) : null;
  const bonus = player.cargo && choice.tileId === preferred ? getTenderBonus(state, player.id, choice.tileId, player.cargo.kind) : 0;
  const tenderSlot = bonus > 0 && player.cargo && (player.cargo.kind === 'empty'
    ? getEmptyNeed(state.logistics!.ports[choice.tileId]) : choice.demand) === 0;
  const appointment = getImportTruckReservation(state, player.id);
  let arrivalNote = 'Ghé bến, giữ hàng trên tàu';
  if (choice.tileId === preferred) {
    if (!choice.quote) arrivalNote = 'Bến đích đã hết chỗ nhận';
    else if (appointment?.destinationTileId === choice.tileId && appointment.throughRound >= state.turnCount) {
      arrivalNote = `Xe nhận đã giữ đến hết vòng ${appointment.throughRound}`;
    } else arrivalNote = tenderSlot ? 'Chỗ nhận riêng của chủ hàng' : 'Đến cảng đã đặt';
  }
  const contents = <>
    <PortSelect label="Cảng ghé tiếp theo của tàu" value={choice.tileId} purpose="destination" onChange={setChosen}
      options={routes.map(r => ({ tileId: r.tileId, description: `${r.supply} xe xuất · ${r.demand} xe nhận` }))} />
    <div className="freight-terms">
      <span>{player.cargo ? arrivalNote
        : `${state.logistics!.ports[choice.tileId].empties} vỏ rỗng tại bến`}</span>
      <Quote nm={choice.distanceNm} reward={choice.quote?.reward} />
    </div>
    {feederDistance !== null && preferred !== undefined && <p className="freight-feeder-preview" data-feeder-preview={preferred}>
      <Route aria-hidden="true" />
      <span>Từ {port(choice.tileId).name}, bạn có thể dùng chuyến nối cảng đến <strong>{port(preferred).name}</strong> · {distance.format(feederDistance)} hải lý.</span>
    </p>}
    <ContractRate amount={bonus} />
    <button type="button" className="chart-button freight-sail" disabled={busy} data-cargo-action="SAIL_TO_PORT"
      onClick={() => submit(choice.action)}><Ship aria-hidden="true" />Khởi hành đến {port(choice.tileId).name}</button>
  </>;
  if (!player.cargo) {
    const canBookHere = getCargoBookings(state, player.id, 'laden').length > 0 || getCargoBookings(state, player.id, 'empty').length > 0;
    if (!canBookHere) return <div className="freight-sailing">{contents}</div>;
    return <details className="freight-empty-sailing"><summary><Ship aria-hidden="true" />Chạy tàu không chở hàng</summary>{contents}</details>;
  }
  return <div className="freight-sailing">{contents}</div>;
}

function CargoTicket({ state, player }: { state: GameState; player: Player }) {
  const cargo = player.cargo!;
  const quote = getFreightQuote(cargo.originTileId, cargo.destinationTileId, cargo.kind);
  return <div className="freight-ticket" role="group" aria-label="Vận đơn đang chở" tabIndex={-1}
    data-booked-port={cargo.destinationTileId} data-cargo-kind={cargo.kind}>
    <div className="freight-ticket-type">{cargo.reeferDueRound !== undefined ? <Snowflake aria-hidden="true" /> : <Container aria-hidden="true" />}
      <span>Trên tàu · {cargo.reeferDueRound !== undefined ? 'Hàng lạnh' : typeName(cargo.kind)}</span></div>
    <div className="freight-ticket-route"><strong>{port(cargo.originTileId).name}</strong><ArrowRight aria-label="đến" />
      <strong>{port(cargo.destinationTileId).name}</strong></div>
    <WaybillAmendment booking={cargo} />
    {quote && <Quote nm={quote.distanceNm} reward={quote.reward} />}
    <ReeferDeadline booking={cargo} round={state.turnCount} />
    <ContractRate amount={getTenderBonus(state, player.id, cargo.destinationTileId, cargo.kind)} />
  </div>;
}

function CaptainDesk({ gameState, myPlayerId, is3D, remainingSeconds, onAction, onOpenFeederChart, player, ...planning }: DeskProps & DraftControls & { player: Player }) {
  const [busy, setBusy] = useState(false);
  const [receiptBooking, setReceiptBooking] = useState<number | null>(null);
  const settlementRef = useRef<HTMLDivElement>(null);
  const unloadRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const logistics = gameState.logistics!;
  const mine = player.id === myPlayerId;
  const canAct = mine && !gameState.winnerId && !player.isBankrupt;
  const location = port(player.position);
  const stock = logistics.ports[player.position];
  const cargo = player.cargo;
  const receipt = player.lastDelivery;
  const opportunity = canAct ? getCargoOpportunity(gameState, player.id) : null;
  const unload = opportunity?.action.type === 'UNLOAD_CARGO' ? opportunity : null;
  const payable = unload ? getCargoDestinationEstimate(gameState, player.id, player.position)?.total : null;
  const showSettlement = !!receipt && !cargo && receipt.bookingId === receiptBooking && canAct;
  const canFinishReviewedCall = !!cargo && cargo.bookingId === receiptBooking && !!unload;
  useLayoutEffect(() => {
    if (document.hidden) return;
    if (showSettlement && receipt?.streetTurn) settlementRef.current?.querySelector<HTMLElement>('[data-terminal-receipt]')?.focus();
    else if (showSettlement) settlementRef.current?.focus();
    else if (canFinishReviewedCall) unloadRef.current?.focus();
  }, [showSettlement, canFinishReviewedCall, receipt?.streetTurn]);
  const dischargeBonus = unload && cargo ? getTenderBonus(gameState, player.id, player.position, cargo.kind) : 0;
  const tenderReceiver = dischargeBonus > 0 && cargo && !getImportTruckReservation(gameState, player.id) &&
    (cargo.kind === 'empty' ? getEmptyNeed(stock) : stock.demand) === 0;
  const routes = canAct ? getLogisticsRoutes(gameState, player.id) : [];
  const delivered = logistics.deliveries[player.id] ?? 0;
  const finalRound = isFinalLogisticsRound(gameState);
  const me = mine ? undefined : gameState.players.find(p => p.id === myPlayerId);
  const target = cargo && cargo.destinationTileId === player.position;
  const submit: Submit = (action, after) => {
    if (!canAct || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    const release = () => { inFlight.current = false; setBusy(false); };
    onAction(action, release, () => { release(); after?.(); });
  };
  const submitWithReceipt: Submit = (action, after) => submit(action, () => {
    if (action.type !== 'END_TURN' && cargo && !document.hidden) setReceiptBooking(cargo.bookingId);
    after?.();
  });
  return <section className="freight-desk" aria-label="Điều độ vận tải" data-captain={player.id} data-berth={player.position}>
    <header className="freight-desk-header">
      <div><h2>Điều độ vận tải</h2><p>{finalRound
        ? 'Vòng cuối · Nếu bằng số lô đã giao, cước cao hơn thắng.'
        : `Giao ${LOGISTICS_DELIVERY_TARGET} container để mở vòng cuối.`}</p></div>
      <span className="freight-progress"><Container aria-hidden="true" /><span className="sr-only">Đã giao </span>
        {delivered > LOGISTICS_DELIVERY_TARGET ? `${delivered} lô` : `${delivered}/${LOGISTICS_DELIVERY_TARGET}`}</span>
    </header>
    <TenderDesk state={gameState} viewerId={myPlayerId} canAct={canAct} busy={busy} is3D={is3D} submit={submit} />
    <div className="freight-berth"><MapPin aria-hidden="true" /><span>Bến hiện tại <strong>{location.name}</strong></span>
      <span className="freight-port-code">{location.code}</span></div>
    {stock && <Stock stock={stock} />}
    <EarlyTruckDesk state={gameState} player={player} canAct={canAct} busy={busy} submit={submit} />
    {cargo ? <CargoTicket state={gameState} player={player} /> : <p className="freight-empty"><Container aria-hidden="true" />Khoang tàu trống</p>}
    {cargo && <ImportTruckDesk state={gameState} playerId={player.id} myPlayerId={myPlayerId} onAction={onAction} />}
    <ReturnCargoDesk state={gameState} playerId={player.id} myPlayerId={myPlayerId} onAction={onAction} surface="desk" />
    {canAct && (cargo ? <>
      {unload && <button ref={unloadRef} type="button" className="chart-button freight-handling" data-cargo-action="UNLOAD_CARGO" disabled={busy}
        onClick={() => submit(unload.action)}><Truck aria-hidden="true" />Dỡ {cargo.kind === 'empty' ? 'container rỗng' : 'hàng lên xe'}{payable != null && <strong>+${payable}M</strong>}</button>}
      {dischargeBonus > 0 && (
        <p className="freight-note freight-discharge-bonus">{tenderReceiver && 'Chủ hàng có chỗ nhận riêng. '}Tổng thu đã gồm ${dischargeBonus}M phụ phí hợp đồng.</p>
      )}
      {unload && <StreetTurnOption state={gameState} playerId={player.id} placement="desk" busy={busy} onChoose={submitWithReceipt} />}
      {target && !unload && <p className="freight-note">{cargo.kind === 'empty' ? 'Bến đã đủ vỏ rỗng.' : 'Bến đã hết xe chờ nhận hàng.'} Bạn có thể đổi cảng đích.</p>}
      <ChangeDestination key={cargo.bookingId} choices={getCargoRedirections(gameState, player.id)} booked={cargo}
        state={gameState} busy={busy} submit={submit} {...planning} />
    </> : <CargoBooking state={gameState} player={player} busy={busy} submit={submit} {...planning} />)}
    {!!routes.length && <Sailing key={cargo?.destinationTileId ?? 'empty'} state={gameState} player={player}
      routes={routes} busy={busy} submit={submit} />}
    {canAct && <FeederSailing key={player.position} state={gameState} captain={player} busy={busy} submit={submit}
      onOpenChart={() => onOpenFeederChart(player.id, player.position)} />}
    {showSettlement && <div ref={settlementRef} tabIndex={-1} role="region" aria-label="Biên nhận dỡ hàng" data-desk-settlement>
      <PortDeliverySlip event={receipt} captainName={player.name} is3D={is3D} />
    </div>}
    {canAct && (gameState.phase === 'AWAITING_SAIL' || gameState.phase === 'END_OF_TURN') &&
      <FinalPortCallEnd state={gameState} playerId={player.id} remainingSeconds={remainingSeconds} busy={busy} submit={submitWithReceipt} />}
    {!mine && !gameState.winnerId && <p className="freight-wait" role="status">Đang chờ {player.name} điều độ tàu.</p>}
    <BackhaulDesk state={gameState} viewerId={myPlayerId} busy={busy} submit={submit} />
    {receipt && !showSettlement && <div className="freight-receipt-wrap"><p className="freight-receipt"><Check aria-hidden="true" /><span>Đã giao {receipt.reeferDueRound !== undefined ? 'hàng lạnh' : typeName(receipt.kind).toLocaleLowerCase('vi')} · {port(receipt.originTileId).name} → {port(receipt.tileId).name}</span><strong>Tổng +${getVoyagePayment(receipt)}M</strong></p>
      {receipt.streetTurn && <p className="freight-note" data-street-turn-summary>Đã chuyển thẳng vỏ để đóng thêm 1 lô hàng xuất tại {port(receipt.tileId).name}.</p>}
      <WaybillAmendment booking={receipt} />
      <ReeferReceipt bonus={receipt.reeferBonus} />
      {!!receipt.tenderBonus && <span className="freight-contract-paid" data-paid-contract-bonus={receipt.tenderBonus}>Đã nhận phụ phí hợp đồng <strong>+${receipt.tenderBonus}M</strong></span>}
      {!!receipt.backhaulBonus && <span className="freight-contract-paid">Đã nhận phụ phí chiều về <strong>+${receipt.backhaulBonus}M</strong></span>}
    </div>}
    {me?.cargo && <p className="freight-own-cargo">Hàng của bạn <strong>{port(me.cargo.originTileId).name} → {port(me.cargo.destinationTileId).name}</strong></p>}
  </section>;
}

interface FreightDeskProps extends DeskProps {
  marketOpen: boolean;
  onOpenMarket: () => void;
  onCloseMarket: () => void;
  onInspectPort: (tileId: number) => void;
}

export function FreightDesk({ marketOpen, onOpenMarket, onCloseMarket, onInspectPort, ...props }: FreightDeskProps) {
  const { gameState, myPlayerId } = props;
  const player = gameState.players[gameState.activePlayerIndex];
  const [saved, setSaved] = useState<{ scope: string; draft: DestinationDraft }>();
  const watch = useWatchPlan(gameState, myPlayerId ?? '');
  const [marketFromCard, setMarketFromCard] = useState(false);
  const focusSaved = useRef(false);
  useLayoutEffect(() => {
    if (!focusSaved.current || marketOpen) return;
    focusSaved.current = false;
    if (!document.hidden) document.querySelector<HTMLElement>('[data-watch-card][tabindex="-1"]')?.focus();
  }, [marketOpen, watch.drawing]);
  // Drafts belong to a particular turn, berth and manifest, including a newly emptied hold.
  const scope = [gameState.roomId, gameState.turnCount, player?.id, player?.position, player?.lastDelivery?.bookingId,
    player?.cargo?.bookingId, player?.cargo?.destinationTileId].join('/');
  // Loading and returning at the same berth can otherwise revive a previous choice for an empty hold.
  useEffect(() => { setSaved(previous => previous?.scope === scope ? previous : undefined); }, [scope]);
  if (!gameState.logistics || !player) return null;
  const draft = saved?.scope === scope ? saved.draft : { service: getDefaultBookingService(gameState, player.id) };
  const editDraft = (next: DestinationDraft) => setSaved({ scope, draft: next });
  const marketService = marketFromCard && watch.plan && watch.plan.service !== 'redirect' ? watch.plan.service : draft.service;
  function closeMarket() {
    setMarketFromCard(false);
    onCloseMarket();
  }
  function clearWatchPlan() {
    watch.clear();
    requestAnimationFrame(() => {
      if (document.activeElement === document.body && !document.hidden) {
        document.querySelector<HTMLElement>('[data-watch-market], .freight-desk [data-cargo-market]')?.focus();
      }
    });
  }
  function confirmWatchPlan() {
    const destination = watch.plan?.tileId;
    watch.confirm(props.onAction, () => requestAnimationFrame(() => {
      if (document.hidden || document.activeElement !== document.body || document.querySelector('dialog[open]')) return;
      const desk = document.querySelector<HTMLElement>('.freight-desk');
      const ticket = desk?.querySelector<HTMLElement>('.freight-ticket');
      if (desk?.dataset.captain === myPlayerId && ticket?.dataset.bookedPort === String(destination)) ticket.focus();
    }));
  }

  return <>
    {myPlayerId && <WatchPlanCard key={watch.drawing} state={gameState} playerId={myPlayerId}
      plan={watch.plan} resolution={watch.resolution} animate={watch.drawing > 0 && watch.resolution?.status === 'waiting'}
      busy={watch.busy} onClear={clearWatchPlan} onConfirm={confirmWatchPlan}
      onOpenMarket={() => { setMarketFromCard(true); onOpenMarket(); }} />}
    <CaptainDesk key={player.id} {...props} player={player} draft={draft} editDraft={editDraft} onOpenMarket={onOpenMarket} />
    {marketOpen && !gameState.winnerId && <FreightMarketBoard gameState={gameState} myPlayerId={myPlayerId}
      onClose={closeMarket} onSelectPort={onInspectPort} service={marketService} savedWatchPlan={watch.plan}
      onSaveWatchPlan={(service, tileId) => {
        if (watch.save(service, tileId)) {
          focusSaved.current = true;
          closeMarket();
        }
      }}
      onPlanPort={(tileId, service) => {
        if (watch.plan) watch.clear();
        const redirectOpen = service === 'redirect';
        editDraft({ service: service === 'redirect' ? draft.service : service, redirectOpen, tileId, fromMarket: true });
        closeMarket();
      }} />}
  </>;
}
