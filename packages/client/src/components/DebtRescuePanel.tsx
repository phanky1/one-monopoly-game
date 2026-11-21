import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, CircleCheck, Container, Landmark, LifeBuoy } from 'lucide-react';
import { BOARD_TILES, getDebtRecovery, type DebtInfo, type DebtRecoveryOption, type GameAction, type GameState } from '@one-monopoly/shared';
import './debt-rescue.css';

interface Props {
  gameState: GameState;
  debt: DebtInfo;
  canAct: boolean;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
}

function money(amount: number) {
  return '$' + amount.toLocaleString('en-US') + 'M';
}

export function DebtRescuePanel({ gameState, debt, canAct, onAction }: Props) {
  const titleId = useId();
  const confirmationId = useId();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [confirmationBalance, setConfirmationBalance] = useState<number | null>(null);
  const bankruptcyButton = useRef<HTMLButtonElement>(null);
  const keepPlayingButton = useRef<HTMLButtonElement>(null);
  const debtor = gameState.players[gameState.activePlayerIndex];
  const confirming = confirmationBalance === debtor.balance;
  useEffect(() => {
    if (confirming) keepPlayingButton.current?.focus();
  }, [confirming]);

  const recovery = getDebtRecovery(gameState);
  if (!recovery) return null;
  const { shortfall, maxProceeds, recommended, options } = recovery;
  const ready = shortfall === 0;
  const creditorName = debt.creditorId === 'BANK'
    ? 'Ngân hàng'
    : gameState.players.find(player => player.id === debt.creditorId)?.name ?? 'Chủ nợ';
  const partnerId = debt.charterRent?.type === 'SPLIT' ? debt.charterRent.partnerId : null;
  const partner = gameState.players.find(player => player.id === partnerId && !player.isBankrupt);
  const partnerShare = Math.floor(debt.amount / 2);
  const firstOption = recommended ?? options[0];
  const otherOptions = options.filter(option => option !== firstOption);

  function submit(action: GameAction) {
    if (!canAct || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setConfirmationBalance(null);
    const release = () => {
      inFlight.current = false;
      setPending(false);
    };
    onAction(action, release, release);
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
      <button type="button" className="debt-option" key={tileId} data-debt-tile={tileId}
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
      <div className="debt-funds" role="status" aria-atomic="true">
        <dl><div><dt>Tiền mặt</dt><dd>{money(debtor.balance)}</dd></div>
          <div><dt>{ready ? 'Sau thanh toán' : 'Còn thiếu'}</dt>
            <dd>{money(ready ? debtor.balance - debt.amount : shortfall)}</dd></div></dl>
        <div className="debt-gauge" aria-hidden="true">
          <span className="debt-gauge-fill" style={{ transform: `scaleX(${Math.min(1, Math.max(0, debtor.balance / Math.max(1, debt.amount)))})` }} />
        </div>
      </div>
      {canAct && (
        <>
          {!ready && (
            <div className="debt-sources">
              {shortfall > maxProceeds && (
                <p className="debt-limit">{options.length
                  ? `Dù huy động hết ${money(maxProceeds)} từ tài sản, bạn vẫn thiếu ${money(shortfall - maxProceeds)}.`
                  : 'Bạn không còn tài sản có thể bán container hoặc thế chấp.'}</p>
              )}
              {firstOption && <>
                <h4>{recommended ? 'Gợi ý huy động vốn' : 'Tài sản có thể huy động'}</h4>
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
            <p>{ready ? 'Hết giờ, khoản nợ sẽ tự động được thanh toán.' : 'Nếu vẫn thiếu tiền khi hết giờ, bạn sẽ phá sản.'}</p>
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
