import { useLayoutEffect, useRef, useState } from 'react';
import { Anchor, Container, PackageCheck, Ship } from 'lucide-react';
import {
  BOARD_TILES, getHarborExportBooking, getHarborFreightOpportunity, getHarborRedemption, getHarborRentRelief,
  type GameAction, type GameState, type HarborFreightQuote,
} from '@one-monopoly/shared';
import { HarborFreightReceipt } from './HarborFreightReceipt.js';
import { HarborLoadingPreview } from './HarborLoadingPreview.js';
import { portGuide } from './ports/portGuide.js';
import './harbor-freight-desk.css';

interface Props {
  state: GameState;
  myPlayerId: string | null;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  onInspectPort: (tileId: number) => void;
  is3D: boolean;
  busy?: boolean;
}

const number = new Intl.NumberFormat('vi-VN');
const money = (amount: number) => `$${number.format(amount)}M`;
function place(tileId: number) {
  const tile = BOARD_TILES[tileId];
  return portGuide[tile.code]?.name ?? tile.name;
}

function FreightPrice({ quote }: { quote: HarborFreightQuote }) {
  return <div className="harbor-price">
    <dl aria-label="Phân chia cước vận tải">
      <div><dt>Cước gộp</dt><dd data-harbor-gross={quote.gross}>{money(quote.gross)}</dd></div>
      <div><dt>Phí khai thác bến</dt><dd data-harbor-fee={quote.handlingFee}>{money(quote.handlingFee)}</dd></div>
      <div><dt>Tàu thực nhận</dt><dd data-harbor-net={quote.carrierNet}>{money(quote.carrierNet)}</dd></div>
    </dl>
    {quote.feePercent > 0 && <p data-harbor-operator={quote.operatorId}>
      <strong>{quote.operatorName}</strong> nhận {quote.feePercent}% cước gộp{quote.feePercent === 50 ? ' vì sở hữu trọn bộ tuyến' : ' khi tàu dỡ tại cảng'}. Tiền thuê khi cập bến được tính riêng.
    </p>}
  </div>;
}

function BerthStatus({ state, loaded }: { state: GameState; loaded: boolean }) {
  const captain = state.players[state.activePlayerIndex];
  const tile = BOARD_TILES[captain.position];
  const harbor = state.harborFreight!;
  const property = state.properties[tile.id];
  if (tile.type === 'PORT' || tile.type === 'GO') {
    switch (state.phase) {
      case 'AWAITING_BUY_DECISION': return <>Hoàn tất quyết định mua cảng trước khi làm hàng.</>;
      case 'AWAITING_AUCTION': return <>Chờ kết quả đấu giá cảng trước khi làm hàng.</>;
      case 'AWAITING_DEBT_RESOLUTION': return getHarborRentRelief(state, captain.id)
        ? <>Có thể dỡ lô hàng này để trả tiền thuê trong mục “Xử lý công nợ”.</>
        : <>Hoàn tất thanh toán khoản nợ trước khi làm hàng.</>;
      case 'AWAITING_SLOT_CHARTER_RESPONSE': return <>Chờ xử lý thỏa thuận chia chỗ và tiền thuê cảng.</>;
    }
    if (property?.isMortgaged) return <>Cảng đang thế chấp và tạm dừng xếp dỡ.</>;
    if (loaded && harbor.manifests[captain.id]?.originTileId === tile.id) return <>Dỡ container tại một cảng khác đang hoạt động.</>;
    if (harbor.visits[captain.id]?.handled) return <>Lượt ghé bến này đã làm hàng.</>;
  }
  if (loaded) return <>Giữ container trên tàu đến khi ghé một cảng khác đang hoạt động.</>;
  if (state.supportsHarborExportBooking === true) return <>Xếp miễn phí ở Singapore hoặc cảng của mình. Tại cảng đối thủ đã nâng cấp, tàu có thể trả phí để xếp hàng.</>;
  return <>Có thể xếp một container ở Singapore hoặc cảng đang hoạt động do {captain.name} sở hữu.</>;
}

type HarborOffer = NonNullable<ReturnType<typeof getHarborFreightOpportunity>>;
type Redemption = NonNullable<ReturnType<typeof getHarborRedemption>>;
type ExportBooking = NonNullable<ReturnType<typeof getHarborExportBooking>>;
type CargoCommand = HarborOffer['action'] | Redemption['action'] | ExportBooking['action'];
interface Submission { action: CargoCommand; keyboard: boolean }

function ExportBookingOffer({ booking, mine, disabled, endTurn, submit }: {
  booking: ExportBooking; mine: boolean; disabled: boolean; endTurn: boolean;
  submit: (action: CargoCommand, keyboard: boolean) => void;
}) {
  const { action, operatorName, shortfall } = booking;
  const terms = JSON.stringify([action.operatorId, action.fee]);
  const [reviewed, setReviewed] = useState(terms);
  const changed = terms !== reviewed;
  return <section className="harbor-export-quote" data-harbor-export-quote={action.fee}
    aria-label="Đặt lô hàng xuất">
    <h4><Container size={16} aria-hidden="true" />Đặt lô hàng xuất</h4>
    <p>Trả <strong>{money(action.fee)}</strong> cho <strong>{operatorName}</strong> để xếp 1 container.
      {' '}Dỡ hàng khi ghé cảng khác để nhận cước.</p>
    <p className="harbor-export-skip">Tàu có thể {endTurn ? 'kết thúc lượt' : 'gieo xúc xắc'} với khoang trống.</p>
    {shortfall > 0 && <p className="harbor-adjustment" data-harbor-export-shortfall={shortfall}>
      Tàu còn thiếu <strong>{money(shortfall)}</strong> để xếp hàng.</p>}
    {mine && <>
      {changed && <p className="harbor-adjustment" role="status">Chủ cảng hoặc phí xếp hàng vừa thay đổi.</p>}
      <button type="button" className="harbor-action" data-harbor-book-export={changed ? undefined : action.fee}
        disabled={disabled || shortfall > 0}
        onClick={event => changed ? setReviewed(terms) : submit(action, event.detail === 0)}>
        {changed ? 'Xem lại phí xếp hàng' : `Trả ${money(action.fee)} và xếp hàng`}
      </button>
    </>}
  </section>;
}

function RedemptionPrice({ redemption }: { redemption: Redemption }) {
  const { quote, redemptionCost, cashChange, shortfall } = redemption;
  return <section className="harbor-redemption-price" data-harbor-redemption-quote tabIndex={-1}
    aria-label={`Chi phí chuộc cảng và dỡ hàng tại ${place(quote.tileId)}`}>
    <h4>Chuộc {place(quote.tileId)} bằng cước hàng</h4>
    <dl>
      <div><dt>Cước lô hàng</dt><dd data-harbor-redemption-credit={quote.carrierNet}>+{money(quote.carrierNet)}</dd></div>
      <div><dt>Giá chuộc trả ngân hàng</dt><dd data-harbor-redemption-cost={redemptionCost}>−{money(redemptionCost)}</dd></div>
      <div className="harbor-redemption-cash"><dt>{cashChange > 0 ? 'Tiền dư về tàu' : 'Tiền mặt cần góp'}</dt>
        <dd data-harbor-redemption-cash={cashChange}>{money(Math.abs(cashChange))}</dd></div>
    </dl>
    <p>Có thể dùng cước để chuộc cảng khi dỡ tại đây, hoặc giữ container trên tàu để đi tiếp.</p>
    {shortfall > 0 && <p className="harbor-redemption-shortfall" data-harbor-redemption-shortfall={shortfall}>
      Số dư của thuyền trưởng còn thiếu <strong>{money(shortfall)}</strong> để chuộc cảng.</p>}
  </section>;
}

function HarborAction({ offer, disabled, submit }: {
  offer: HarborOffer; disabled: boolean; submit: (action: CargoCommand, keyboard: boolean) => void;
}) {
  const quote = offer.kind === 'discharge' ? offer.quote : null;
  const terms = quote ? [quote.originTileId, quote.tileId, quote.operatorId, quote.feePercent,
    quote.gross, quote.handlingFee, quote.carrierNet].join('/') : 'load';
  const [reviewed, setReviewed] = useState(terms);
  const changed = reviewed !== terms;
  return <>
    {changed && <p className="harbor-adjustment" role="status">Phần cước của tàu hoặc chủ cảng vừa thay đổi.</p>}
    <button type="button" className="harbor-action" disabled={disabled}
      data-harbor-review={changed || undefined} data-harbor-load={offer.kind === 'load' || undefined}
      data-harbor-discharge={offer.kind === 'discharge' && !changed || undefined}
      onClick={event => changed ? setReviewed(terms) : submit(offer.action, event.detail === 0)}>
      {offer.kind === 'load' ? <Container aria-hidden="true" /> : <PackageCheck aria-hidden="true" />}
      {changed ? 'Xem lại phần cước mới' : offer.kind === 'load' ? 'Xếp 1 container' : `Dỡ hàng · nhận ${money(offer.quote.carrierNet)}`}
    </button>
  </>;
}

function BerthCard({ state, myPlayerId, onAction, onInspectPort, is3D, busy = false }: Props) {
  const harbor = state.harborFreight!;
  const captain = state.players[state.activePlayerIndex];
  const manifest = harbor.manifests[captain.id];
  const visit = harbor.visits[captain.id];
  const offer = getHarborFreightOpportunity(state, captain.id);
  const redemption = getHarborRedemption(state, captain.id);
  const booking = state.supportsHarborExportBooking === true ? getHarborExportBooking(state, captain.id) : null;
  const mine = captain.id === myPlayerId;
  const at = place(captain.position);
  const last = harbor.lastDelivery;
  const receipt = !manifest && visit?.handled && last?.playerId === captain.id && last.tileId === captain.position
    && last.round === state.turnCount ? last : null;
  const inFlight = useRef<Submission | null>(null);
  const card = useRef<HTMLElement>(null);
  const summary = useRef<HTMLParagraphElement>(null);
  const proof = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState<Submission | null>(null);
  const [failedAction, setFailedAction] = useState<CargoCommand | null>(null);

  useLayoutEffect(() => {
    if (!accepted || inFlight.current !== accepted || harbor.revision === accepted.action.revision) return;
    inFlight.current = null;
    setPending(false);
    setAccepted(null);
    if (!accepted.keyboard || document.hidden || document.querySelector('dialog[open]')) return;
    const { action } = accepted;
    let target: HTMLElement | null = null;
    if (action.type === 'HARBOR_LOAD' || action.type === 'HARBOR_BOOK_EXPORT') {
      if (manifest?.originTileId === action.tileId && (action.type === 'HARBOR_LOAD' ||
          (manifest.exportBooking?.operatorId === action.operatorId && manifest.exportBooking.fee === action.fee))) {
        target = summary.current;
      }
    } else if (receipt) target = proof.current;
    if (target && (document.activeElement === document.body || card.current?.contains(document.activeElement))) {
      target.focus({ preventScroll: true });
    }
  }, [accepted, harbor.revision, manifest, receipt]);

  function submit(action: CargoCommand, keyboard: boolean) {
    if (!mine || busy || inFlight.current || action.revision !== harbor.revision) return;
    if (action.type === 'HARBOR_BOOK_EXPORT' && (!booking || booking.shortfall > 0)) return;
    const request = { action, keyboard };
    inFlight.current = request;
    setPending(true);
    setFailedAction(null);
    onAction(action, () => {
      if (inFlight.current !== request) return;
      inFlight.current = null;
      setPending(false);
      setFailedAction(action);
    }, () => {
      if (inFlight.current === request) setAccepted(request);
    });
  }

  return <section ref={card} className="harbor-freight" data-harbor-freight={captain.id} data-view={is3D ? 'tilted' : 'flat'}
    aria-label={`Vận tải cảng của ${captain.name}`}>
    <header className="harbor-freight-heading"><h3><Anchor aria-hidden="true" />Vận tải cảng</h3>
      <span>{captain.name} · {at}</span></header>
    <p className="harbor-manifest" ref={summary} tabIndex={-1} data-harbor-manifest={manifest ? 'laden' : 'empty'}>
      <Ship aria-hidden="true" />{manifest ? <>1 container từ <strong>{place(manifest.originTileId)}</strong></> : 'Khoang tàu trống'}
      {manifest?.exportBooking && <small className="harbor-prepaid-fee" data-harbor-prepaid-fee={manifest.exportBooking.fee}>
        Đã trả {money(manifest.exportBooking.fee)} phí xếp hàng cho <strong>{manifest.exportBooking.operatorName}</strong>.
      </small>}
    </p>
    {mine && manifest && (state.phase === 'WAIT_FOR_ROLL' || state.phase === 'END_OF_TURN') &&
      <p className="harbor-instruction">Bấm một cảng khác trên bàn cờ để so sánh tiền cước và tiền thuê.</p>}
    {receipt && <div ref={proof} tabIndex={-1} className="harbor-freight-proof" role="group"
      aria-label={receipt.redemptionCost !== undefined ? 'Biên lai chuộc cảng và dỡ hàng tại bến' : 'Biên lai dỡ hàng tại bến'}>
      <HarborFreightReceipt state={state} receipt={receipt} />
    </div>}
    {redemption ? <RedemptionPrice redemption={redemption} />
      : offer?.kind === 'discharge' ? <>
      <p className="harbor-instruction">{number.format(offer.quote.distanceNm)} hải lý đến <strong>{at}</strong>.
        {' '}Có thể dỡ tại đây hoặc giữ hàng cho chuyến sau.</p>
      <FreightPrice quote={offer.quote} />
    </> : offer?.kind === 'load' ? <p className="harbor-instruction">Xếp tại {at}, rồi dỡ khi ghé một cảng khác.</p>
      : booking ? <ExportBookingOffer booking={booking} mine={mine} disabled={busy || pending}
        endTurn={state.phase === 'END_OF_TURN'} submit={submit} />
      : !receipt && <p className="harbor-instruction"><BerthStatus state={state} loaded={!!manifest} /></p>}
    {mine && offer && <HarborAction key={`${offer.kind}/${manifest?.originTileId ?? ''}`} offer={offer}
      disabled={busy || pending} submit={submit} />}
    {mine && (offer?.kind === 'load' || booking) &&
      <HarborLoadingPreview state={state} viewerId={captain.id} onInspectPort={onInspectPort} />}
    {mine && redemption && <button type="button" className="harbor-action" data-harbor-redeem
      disabled={busy || pending || redemption.shortfall > 0}
      onClick={event => submit(redemption.action, event.detail === 0)}>
      <PackageCheck aria-hidden="true" />Chuộc cảng và dỡ hàng
    </button>}
    {(failedAction?.revision === harbor.revision || (failedAction?.type === 'HARBOR_BOOK_EXPORT' && !manifest)) &&
      <p className="harbor-adjustment" role="alert">Lệnh làm hàng chưa được xác nhận. Kiểm tra lại vận đơn rồi thử lại.</p>}
  </section>;
}

export function HarborFreightDesk(props: Props) {
  const { state, myPlayerId } = props;
  const captain = state.players[state.activePlayerIndex];
  if (state.mode !== 'harbor' || !state.harborFreight || !state.gameStarted || state.winnerId || !captain) return null;
  return <BerthCard key={[state.roomId, state.turnCount, captain.id, captain.position, myPlayerId].join('/')} {...props} />;
}
