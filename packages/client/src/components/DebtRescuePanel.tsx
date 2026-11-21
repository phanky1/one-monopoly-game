import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, CircleCheck, Container, Landmark, LifeBuoy } from 'lucide-react';
import { BOARD_TILES, getDebtRecovery, getHarborRentRelief, type DebtInfo, type DebtRecoveryOption, type GameAction, type GameState } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './debt-rescue.css';

interface Props {
  gameState: GameState;
  debt: DebtInfo;
  canAct: boolean;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  onCoveredRentAccepted?: (revision: number, source: HTMLButtonElement) => void;
}

function money(amount: number) {
  return '$' + amount.toLocaleString('en-US') + 'M';
}

type Relief = NonNullable<ReturnType<typeof getHarborRentRelief>>;
interface ReliefRequest { relief: Relief; keyboard: boolean; source: HTMLButtonElement }

function RentReliefQuote({ relief, cash, canAct, busy, submit }: {
  relief: Relief; cash: number; canAct: boolean; busy: boolean; submit: (request: ReliefRequest) => void;
}) {
  const title = useId();
  const { quote, rentDue, shortfallAfter } = relief;
  const covered = shortfallAfter === 0;
  const wallet = cash + quote.carrierNet - (covered ? rentDue : 0);
  const origin = portGuide[BOARD_TILES[quote.originTileId].code].name;
  const destination = portGuide[BOARD_TILES[quote.tileId].code].name;
  return <section className="debt-cargo" data-rent-relief={covered ? 'covered' : 'partial'} aria-labelledby={title}>
    <div className="debt-cargo-heading"><h4 id={title}>Dỡ container đang chở</h4><small>{origin} → {destination}</small></div>
    <dl>
      <div><dt>Cước vận chuyển</dt><dd data-rent-relief-gross={quote.gross}>{money(quote.gross)}</dd></div>
      <div><dt>Phí khai thác bến{quote.operatorName && <> trả cho <b>{quote.operatorName}</b></>}</dt>
        <dd data-rent-relief-fee={quote.handlingFee}>{quote.handlingFee > 0 && '−'}{money(quote.handlingFee)}</dd></div>
      <div><dt>Cước tàu thực nhận</dt><dd data-rent-relief-net={quote.carrierNet}>+{money(quote.carrierNet)}</dd></div>
      <div className="debt-cargo-wallet"><dt>{covered ? 'Tiền mặt sau khi trả thuê' : 'Tiền mặt sau khi dỡ hàng'}</dt>
        <dd data-rent-relief-wallet={wallet}>{money(wallet)}</dd></div>
    </dl>
    <p data-rent-relief-shortfall={shortfallAfter}>{covered
      ? <>Dỡ hàng sẽ thanh toán đủ <b>{money(rentDue)}</b> tiền thuê.</>
      : <>Sau khi dỡ, khoản thuê <b>{money(rentDue)}</b> vẫn chờ thanh toán. Cần huy động thêm <b>{money(shortfallAfter)}</b>.</>}</p>
    {canAct && <button type="button" className="chart-button chart-button-primary" data-rent-relief-action disabled={busy}
      onClick={event => submit({ relief, keyboard: event.detail === 0, source: event.currentTarget })}>
      <Container size={16} aria-hidden="true" />{covered ? 'Dỡ hàng và trả tiền thuê' : 'Dỡ hàng để huy động vốn'}
    </button>}
  </section>;
}

export function DebtRescuePanel({ gameState, debt, canAct, onAction, onCoveredRentAccepted }: Props) {
  const titleId = useId();
  const confirmationId = useId();
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef<GameAction | null>(null);
  const [accepted, setAccepted] = useState<ReliefRequest | null>(null);
  const [reliefError, setReliefError] = useState(false);
  const funds = useRef<HTMLDivElement>(null);
  const firstAsset = useRef<HTMLButtonElement>(null);
  const [confirmationBalance, setConfirmationBalance] = useState<number | null>(null);
  const bankruptcyButton = useRef<HTMLButtonElement>(null);
  const keepPlayingButton = useRef<HTMLButtonElement>(null);
  const debtor = gameState.players[gameState.activePlayerIndex];
  const confirming = confirmationBalance === debtor.balance;
  useEffect(() => {
    if (confirming) keepPlayingButton.current?.focus();
  }, [confirming]);

  const harbor = gameState.harborFreight;
  const updated = !!accepted && !!harbor && harbor.revision > accepted.relief.action.revision;
  const pending = submitting && !updated;
  useLayoutEffect(() => {
    if (!accepted || !updated || inFlight.current !== accepted.relief.action) return;
    inFlight.current = null;
    setAccepted(null);
    setSubmitting(false);
    const receipt = harbor?.lastDelivery;
    if (!accepted.keyboard || !canAct || document.hidden || document.querySelector('dialog[open]') ||
        !receipt?.rentRelief || receipt.rentRelief.shortfallAfter <= 0 || receipt.playerId !== debtor.id ||
        receipt.tileId !== accepted.relief.quote.tileId || receipt.revision !== accepted.relief.action.revision + 1) return;
    if (document.activeElement === document.body || document.activeElement === accepted.source) {
      (firstAsset.current ?? funds.current)?.focus({ preventScroll: true });
    }
  }, [accepted, updated, harbor, debtor.id, canAct]);

  const recovery = getDebtRecovery(gameState);
  if (!recovery) return null;
  const { shortfall, maxProceeds, recommended, options } = recovery;
  const relief = getHarborRentRelief(gameState, debtor.id);
  const capacity = maxProceeds + (relief?.quote.carrierNet ?? 0);
  const ready = shortfall === 0;
  const creditorName = debt.creditorId === 'BANK'
    ? 'Ngân hàng'
    : gameState.players.find(player => player.id === debt.creditorId)?.name ?? 'Chủ nợ';
  const partnerId = debt.charterRent?.type === 'SPLIT' ? debt.charterRent.partnerId : null;
  const partner = gameState.players.find(player => player.id === partnerId && !player.isBankrupt);
  const partnerShare = Math.floor(debt.amount / 2);
  const firstOption = recommended ?? options[0];
  const otherOptions = options.filter(option => option !== firstOption);

  function submit(action: GameAction, request?: ReliefRequest) {
    if (!canAct || inFlight.current) return;
    inFlight.current = action;
    setSubmitting(true);
    setReliefError(false);
    setConfirmationBalance(null);
    const release = () => {
      if (inFlight.current !== action) return;
      inFlight.current = null;
      setSubmitting(false);
    };
    onAction(action, () => {
      if (inFlight.current !== action) return;
      release();
      if (request) setReliefError(true);
    }, () => {
      if (inFlight.current !== action) return;
      if (!request) { release(); return; }
      if (request.keyboard && request.relief.shortfallAfter === 0) {
        onCoveredRentAccepted?.(request.relief.action.revision, request.source);
      }
      setAccepted(request);
    });
  }

  function cancelBankruptcy() {
    setConfirmationBalance(null);
    bankruptcyButton.current?.focus();
  }

  function renderOption(option: DebtRecoveryOption) {
    const tileId = option.action.tileId;
    const property = gameState.properties[tileId];
    const sale = option.action.type === 'SELL_CONTAINER';
    return (
      <button type="button" className="debt-option" key={tileId} data-debt-tile={tileId} ref={option === firstOption ? firstAsset : undefined}
        onClick={() => submit(option.action)} disabled={pending}>
        {sale ? <Container aria-hidden="true" /> : <Landmark aria-hidden="true" />}
        <span><strong>{BOARD_TILES[tileId].name}</strong>
          <small>{sale ? `Bán 1 container · Cấp ${property.containerLevel} → ${property.containerLevel - 1}`
            : gameState.mode === 'harbor' && BOARD_TILES[tileId].type === 'PORT'
              ? 'Thế chấp · Dừng thu tiền thuê và xếp dỡ' : 'Thế chấp · Dừng thu cước'}</small>
          {sale && property.hasGreenFleet && <small className="debt-option-impact">Mất huy hiệu Tàu xanh</small>}
        </span>
        <b>+{money(option.proceeds)}</b>
      </button>
    );
  }

  return (
    <section className="chart-action-panel debt-rescue" aria-labelledby={titleId} data-covered={ready}>
      <header className="debt-heading">
        <div className="debt-title"><LifeBuoy size={17} aria-hidden="true" />
          <h3 id={titleId}>{canAct ? 'Xử lý công nợ' : `Công nợ của ${debtor.name}`}</h3></div>
        <div className="debt-due"><span>Khoản phải trả</span><strong>{money(debt.amount)}</strong></div>
        <p>{debt.reason}</p>
        <p>Trả cho <b>{creditorName}</b>{partner && <> ({money(debt.amount - partnerShare)}) và <b>{partner.name}</b> ({money(partnerShare)})</>}</p>
      </header>
      <div className="debt-funds" role="status" aria-atomic="true" tabIndex={-1} ref={funds}>
        <dl><div><dt>Tiền mặt</dt><dd>{money(debtor.balance)}</dd></div>
          <div><dt>{ready ? 'Sau thanh toán' : 'Còn thiếu'}</dt>
            <dd>{money(ready ? debtor.balance - debt.amount : shortfall)}</dd></div></dl>
        <div className="debt-gauge" aria-hidden="true">
          <span className="debt-gauge-fill" style={{ transform: `scaleX(${Math.min(1, Math.max(0, debtor.balance / Math.max(1, debt.amount)))})` }} />
        </div>
      </div>
      {relief && <RentReliefQuote relief={relief} cash={debtor.balance} canAct={canAct} busy={pending}
        submit={request => submit(request.relief.action, request)} />}
      {reliefError && relief && canAct && <p className="debt-limit" role="alert">Lệnh dỡ hàng chưa được xác nhận. Kiểm tra lại số tiền rồi thử lại.</p>}
      {canAct && (
        <>
          {!ready && (
            <div className="debt-sources">
              {shortfall > capacity && (
                <p className="debt-limit">{relief
                  ? `Sau khi dỡ hàng${options.length ? ' và huy động hết từ tài sản' : ''}, vẫn còn thiếu ${money(shortfall - capacity)}.`
                  : options.length
                  ? `Dù huy động hết ${money(maxProceeds)} từ tài sản, bạn vẫn thiếu ${money(shortfall - maxProceeds)}.`
                  : 'Bạn không còn tài sản có thể bán container hoặc thế chấp.'}</p>
              )}
              {firstOption && <>
                <h4>{relief ? 'Huy động từ tài sản' : recommended ? 'Gợi ý huy động vốn' : 'Tài sản có thể huy động'}</h4>
                {renderOption(firstOption)}
              </>}
              {otherOptions.length > 0 && (
                <details className="debt-alternatives">
                  <summary><ChevronDown size={14} aria-hidden="true" />Tài sản khác ({otherOptions.length})</summary>
                  <div>{otherOptions.map(renderOption)}</div>
                </details>
              )}
            </div>
          )}
          <div className="debt-payment">
            <button type="button" className="chart-button chart-button-primary debt-settle" disabled={!ready || pending}
              onClick={() => submit({ type: 'SETTLE_DEBT' })}>
              {ready ? <CircleCheck aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
              Thanh toán {money(debt.amount)}
            </button>
            <p>{ready ? 'Hết giờ, khoản nợ sẽ tự động được thanh toán.' : relief
              ? 'Cần huy động đủ tiền trước khi hết giờ. Lô hàng chỉ được dỡ khi bạn chọn.'
              : 'Nếu vẫn thiếu tiền khi hết giờ, bạn sẽ phá sản.'}</p>
          </div>
          <div className="debt-exit">
            <button type="button" ref={bankruptcyButton} className="debt-bankruptcy"
              aria-expanded={confirming} aria-controls={confirmationId} disabled={pending}
              onClick={() => setConfirmationBalance(debtor.balance)}>Tuyên bố phá sản</button>
            {confirming && (
              <div id={confirmationId} className="debt-confirmation" role="group" aria-label="Xác nhận phá sản"
                onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelBankruptcy(); } }}>
                <p>Bạn sẽ bị loại khỏi ván và mất toàn bộ tài sản. Quyết định này không thể hoàn tác.</p>
                <div><button type="button" ref={keepPlayingButton} className="chart-button" onClick={cancelBankruptcy}>Quay lại</button>
                  <button type="button" className="chart-button chart-button-danger debt-confirm"
                    onClick={() => submit({ type: 'DECLARE_BANKRUPTCY' })}>Xác nhận phá sản</button></div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
