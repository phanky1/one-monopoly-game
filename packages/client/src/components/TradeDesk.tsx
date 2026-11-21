import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import {
  BOARD_TILES, INFRA_TILES, LOOP_GROUPS_CONFIG, SERVICE_LINES, canSettleTrade, getBotAskingPrice, getTradeCounterAction, getTradeRestriction,
  type GameAction, type GameState, type TradeOffer,
} from '@one-monopoly/shared';
import { BoardDialog } from './BoardDialog.js';
import { TradeCargoImpact } from './TradeCargoImpact.js';
import './trade-desk.css';

interface Props {
  gameState: GameState;
  myPlayerId: string;
  initialTileId: number | null;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  onClose: () => void;
}

type TradeAction = Extract<GameAction, { type: 'OFFER_TRADE' | 'COUNTER_TRADE' | 'RESPOND_TRADE' | 'CANCEL_TRADE' }>;
const noOffers: TradeOffer[] = [];
const serviceGroup = { name: 'Tuyến dịch vụ', color: '#346765', tileIds: SERVICE_LINES };
const infrastructureGroup = { name: 'Hạ tầng số', color: '#6f7888', tileIds: INFRA_TILES };
const money = (amount: number) => `$${amount.toLocaleString('en-US')}M`;

const boardPrompts: Record<GameState['phase'], string> = {
  AWAITING_SAIL: 'Đến lượt bạn điều tàu.',
  WAIT_FOR_ROLL: 'Đến lượt bạn gieo xúc xắc.',
  AWAITING_BUY_DECISION: 'Đến lượt bạn quyết định mua tài sản.',
  AWAITING_AUCTION: 'Đến lượt bạn trả giá.',
  AWAITING_STORM_DECISION: 'Đến lượt bạn chọn cách vượt bão.',
  AWAITING_SLOT_CHARTER_RESPONSE: 'Bạn có đề nghị chia sẻ chỗ cần trả lời.',
  AWAITING_DEBT_RESOLUTION: 'Đến lượt bạn xử lý khoản nợ.',
  END_OF_TURN: 'Bạn có thể kết thúc lượt trên bàn cờ.',
};

function myBoardDecision(state: GameState, playerId: string) {
  if (!state.gameStarted || state.winnerId) return null;
  let actorId: string | undefined = state.players[state.activePlayerIndex]?.id;
  if (state.phase === 'AWAITING_AUCTION') actorId = state.auction?.bidderId;
  if (state.phase === 'AWAITING_SLOT_CHARTER_RESPONSE') actorId = state.pendingSlotCharter?.ownerId;
  return actorId === playerId ? state.phase : null;
}

function rivalProperties(state: GameState, buyerId: string) {
  return BOARD_TILES.flatMap((tile) => {
    const owner = state.properties[tile.id]?.ownerId;
    if (!owner || owner === buyerId || tile.price === undefined) return [];
    const seller = state.players.find((player) => player.id === owner && !player.isBankrupt);
    if (!seller) return [];
    const group = tile.group ? LOOP_GROUPS_CONFIG[tile.group] : tile.type === 'SERVICE_LINE' ? serviceGroup : infrastructureGroup;
    const owned = group.tileIds.filter((id) => state.properties[id]?.ownerId === buyerId).length;
    return [{
      tile, price: tile.price, seller, group, owned, completes: owned + 1 === group.tileIds.length,
      restriction: getTradeRestriction(state, buyerId, tile.id),
    }];
  }).sort((a, b) => Number(!!a.restriction) - Number(!!b.restriction)
    || Number(b.completes && !!b.tile.group) - Number(a.completes && !!a.tile.group)
    || b.owned / b.group.tileIds.length - a.owned / a.group.tileIds.length || a.tile.id - b.tile.id);
}

function CashOffer({ balance, listPrice, askingPrice, disabled, send }: {
  balance: number; listPrice: number; askingPrice: number | null; disabled: boolean; send: (price: number) => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState(String(Math.min(listPrice, balance) || ''));
  const price = Number(amount);
  const valid = Number.isSafeInteger(price) && price > 0 && price <= balance;
  return (
    <form className="trade-price-form" onSubmit={(event) => {
      event.preventDefault();
      if (valid && !disabled) send(price);
    }}>
      <div className="trade-price-label">
        <label htmlFor={id}>Giá đề nghị (triệu USD)</label>
        {askingPrice !== null && (
          <button type="button" className="trade-fill-quote" disabled={disabled}
            onClick={() => setAmount(String(askingPrice))}>Điền giá AI</button>
        )}
      </div>
      <div className="trade-price-entry">
        <input id={id} type="number" inputMode="numeric" min="1" step="1" max={balance} required
          value={amount} onChange={event => setAmount(event.target.value)} disabled={disabled}
          aria-describedby={`${id}-balance`} />
        <button type="submit" className="chart-button chart-button-primary" disabled={!valid || disabled}>Gửi đề nghị</button>
      </div>
      <small id={`${id}-balance`}>Số dư của bạn <strong>{money(balance)}</strong>
        {price > balance && Number.isSafeInteger(price) && <> · Cần thêm {money(price - balance)} để gửi.</>}
      </small>
    </form>
  );
}

function CounterPriceForm({ state, offer, balance, disabled, send }: {
  state: GameState; offer: TradeOffer; balance: number; disabled: boolean; send: (action: TradeAction) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const minimum = offer.price + 1;
  if (!getTradeCounterAction(state, offer.sellerId, offer.id, minimum)) return null;
  const action = getTradeCounterAction(state, offer.sellerId, offer.id, Number(draft));
  return <details className="trade-counter-form">
    <summary data-counter-open>Ra giá khác</summary>
    <form onSubmit={event => { event.preventDefault(); if (action && !disabled) send(action); }}>
      <label htmlFor={id}>Giá bán mới (triệu USD)</label>
      <div className="trade-price-entry">
        <input type="number" id={id} inputMode="numeric" min={minimum} max={balance} step="1" required
          data-counter-price aria-describedby={id + '-range'} disabled={disabled}
          value={draft} onChange={event => setDraft(event.target.value)} />
        <button type="submit" className="chart-button chart-button-primary" data-counter-send
          disabled={disabled || !action}>Gửi giá mới</button>
      </div>
      <small id={id + '-range'}>Chọn số nguyên từ {money(minimum)} đến {money(balance)} theo số dư bên mua. Người mua sẽ quyết định ở mức giá mới.</small>
    </form>
  </details>;
}

export function TradeDesk({ gameState, myPlayerId, initialTileId, onAction, onClose }: Props) {
  const titleId = useId();
  const selectId = useId();
  const offers = gameState.tradeOffers ?? noOffers;
  const incoming = offers.filter(offer => offer.sellerId === myPlayerId);
  const outgoing = offers.find(offer => offer.buyerId === myPlayerId);
  const offerCount = incoming.length + Number(!!outgoing);
  const buyer = gameState.players.find(player => player.id === myPlayerId);
  const options = rivalProperties(gameState, myPlayerId);
  const [mode, setMode] = useState<'browse' | 'offers'>(initialTileId === null && offerCount ? 'offers' : 'browse');
  const [choice, setChoice] = useState<number | null>(initialTileId ?? options[0]?.tile.id ?? null);
  const selected = options.find(option => option.tile.id === (choice ?? options[0]?.tile.id));
  const askingPrice = selected?.seller.id.startsWith('ai-')
    ? getBotAskingPrice(gameState, selected.seller.id, selected.tile.id) : null;
  const [notice, setNotice] = useState('');
  const previousOffers = useRef(offers);
  const offersTab = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const inFlight = useRef<TradeAction | null>(null);
  const [pending, setPending] = useState(false);
  const decision = myBoardDecision(gameState, myPlayerId);
  const openingDecision = useRef(decision);
  const [decisionChanged, setDecisionChanged] = useState(false);
  useEffect(() => {
    if (decision !== openingDecision.current) setDecisionChanged(true);
  }, [decision]);

  useEffect(() => {
    const previous = previousOffers.current;
    previousOffers.current = offers;
    const added = offers.filter(offer => !previous.some(old => old.id === offer.id));
    const counter = added.find(offer => offer.originalPrice !== undefined && (offer.buyerId === myPlayerId || offer.sellerId === myPlayerId));
    const sent = added.find(offer => offer.buyerId === myPlayerId && offer.originalPrice === undefined);
    const received = added.find(offer => offer.sellerId === myPlayerId);
    const removed = previous.filter(offer => (offer.buyerId === myPlayerId || offer.sellerId === myPlayerId)
      && !offers.some(current => current.id === offer.id));
    const closed = removed.find(offer => gameState.properties[offer.tileId]?.ownerId === offer.buyerId) ?? removed[0];
    if (counter) {
      const asset = BOARD_TILES[counter.tileId].name;
      if (counter.sellerId === myPlayerId) {
        setNotice(`Bạn đã ra giá ${money(counter.price)} cho ${asset}. Đang chờ người mua trả lời.`);
      } else {
        const seller = gameState.players.find(player => player.id === counter.sellerId);
        setNotice(`${seller?.name ?? 'Chủ sở hữu'} đã ra giá mới ${money(counter.price)} cho ${asset}.`);
      }
    } else if (sent) {
      setNotice(`Đã gửi đề nghị mua ${BOARD_TILES[sent.tileId].name}.`);
      setMode('offers');
    } else if (closed) {
      const name = BOARD_TILES[closed.tileId].name;
      const settled = gameState.properties[closed.tileId]?.ownerId === closed.buyerId;
      if (settled) {
        setNotice(`Bạn đã ${closed.buyerId === myPlayerId ? 'mua' : 'bán'} ${name} với giá ${money(closed.price)}.`);
      } else {
        const currentAsk = closed.originalPrice === undefined && closed.buyerId === myPlayerId && closed.sellerId.startsWith('ai-')
          && !getTradeRestriction(gameState, myPlayerId, closed.tileId)
          ? getBotAskingPrice(gameState, closed.sellerId, closed.tileId) : null;
        setNotice(currentAsk !== null && closed.price < currentAsk
          ? `Đề nghị ${money(closed.price)} mua ${name} đã đóng. Giá AI hiện tại là ${money(currentAsk)}.`
          : closed.originalPrice !== undefined ? `Đề nghị giá mới ${money(closed.price)} cho ${name} đã đóng.` : `Đề nghị mua ${name} đã đóng.`);
      }
    } else if (received) {
      setNotice(`Bạn có đề nghị mới cho ${BOARD_TILES[received.tileId].name}.`);
    }
  }, [offers, myPlayerId, gameState]);

  useLayoutEffect(() => {
    const before = lastFocus.current;
    if (!before || document.hidden || (before.isConnected && !before.closest('[hidden]'))) return;
    const dialog = offersTab.current?.closest('dialog');
    const dialogs = document.querySelectorAll('dialog[open]');
    const active = document.activeElement;
    if (dialog && dialogs[dialogs.length - 1] === dialog && (active === document.body || active === dialog || active === before)) {
      offersTab.current?.focus({ preventScroll: true });
    }
  }, [gameState, mode]);

  function send(action: TradeAction) {
    if (inFlight.current) return;
    inFlight.current = action;
    setPending(true);
    const finish = () => {
      if (inFlight.current !== action) return;
      inFlight.current = null;
      setPending(false);
    };
    onAction(action, () => {
      finish();
      setNotice('Giao dịch chưa được xác nhận. Kiểm tra lại đề nghị và thử lại.');
    }, finish);
  }

  const settlementOpen = canSettleTrade(gameState);
  const playerName = (id: string) => gameState.players.find(player => player.id === id)?.name;
  const canAccept = (offer: TradeOffer) => settlementOpen &&
    (gameState.players.find(player => player.id === offer.buyerId)?.balance ?? 0) >= offer.price &&
    gameState.properties[offer.tileId]?.ownerId === offer.sellerId && !getTradeRestriction(gameState, offer.buyerId, offer.tileId);
  return (
    <BoardDialog labelledBy={titleId} onClose={onClose}>
      <div className="chart-dialog-sheet trade-desk" onFocusCapture={event => { lastFocus.current = event.target; }}>
        <button type="button" className="chart-dialog-close" aria-label="Đóng giao dịch tài sản" onClick={onClose}><X aria-hidden="true" /></button>
        <header className="trade-desk-heading">
          <ArrowLeftRight size={22} aria-hidden="true" />
          <h2 id={titleId} className="chart-dialog-title">Giao dịch tài sản</h2>
        </header>
        <div className="trade-desk-nav" role="group" aria-label="Nội dung giao dịch">
          <button type="button" aria-pressed={mode === 'browse'} onClick={() => setMode('browse')}>Tìm mua</button>
          <button type="button" ref={offersTab} aria-pressed={mode === 'offers'} onClick={() => setMode('offers')}>Đề nghị <span>{offerCount}</span></button>
        </div>
        {decisionChanged && decision && (
          <div className="trade-board-prompt">
            <p role="status">{boardPrompts[decision]}</p>
            <button type="button" className="chart-button chart-button-navy" onClick={onClose}>Về bàn cờ</button>
          </div>
        )}
        <div className="trade-desk-notice" role="status">{notice}</div>
        {!settlementOpen && (mode === 'browse' || offerCount > 0) && (
          <p className="trade-desk-guidance" data-trade-settlement-wait>Đề nghị vẫn chờ trong lúc bàn cờ xử lý quyết định. Có thể chấp nhận sau khi đấu giá hoặc quyết định đó kết thúc.</p>
        )}
        <section className="trade-desk-browse" hidden={mode !== 'browse'}>
          {options.length === 0 ? (
            <p className="chart-dialog-copy">Chưa có tài sản nào của người chơi khác để hỏi mua.</p>
          ) : (
            <>
              <label htmlFor={selectId}>Tài sản muốn mua</label>
              <select id={selectId} value={selected?.tile.id ?? ''} onChange={event => setChoice(Number(event.target.value))}>
                {!selected && <option value="" disabled>Chọn tài sản khác</option>}
                {options.map(option => (
                  <option key={option.tile.id} value={option.tile.id}>
                    {option.tile.name}{option.restriction ? ' · Tạm khóa' : option.completes && option.tile.group ? ' · Hoàn thành tuyến' : ''}
                  </option>
                ))}
              </select>
              {selected ? (
                <>
                  <div className="trade-asset-card">
                    <div className="trade-route">
                      <i aria-hidden="true" style={{ background: selected.group.color }} />
                      <strong>{selected.group.name}</strong>
                      <span>Bạn có {selected.owned}/{selected.group.tileIds.length}</span>
                    </div>
                    {selected.completes && <p>{selected.tile.group ? 'Mua tài sản này để hoàn thành tuyến.' : 'Mua tài sản này để sở hữu trọn bộ.'}</p>}
                    <dl className="trade-facts">
                      <div><dt>Chủ sở hữu</dt><dd>{selected.seller.name}</dd></div>
                      <div><dt>Giá niêm yết</dt><dd>{money(selected.price)}</dd></div>
                    </dl>
                    {askingPrice !== null && (
                      <div className="trade-bot-quote">
                        <p>Giá AI yêu cầu <strong>{money(askingPrice)}</strong></p>
                        <small>{gameState.mode === 'harbor' && selected.tile.type === 'PORT'
                          ? 'Nếu bạn đề nghị thấp hơn, AI có thể ra giá mới để bạn cân nhắc.'
                          : 'AI chỉ bán từ mức này. Giá tăng khi AI có nhiều tài sản cùng nhóm.'}</small>
                      </div>
                    )}
                    {!selected.restriction && <TradeCargoImpact state={gameState} tileId={selected.tile.id} buyerId={myPlayerId} sellerId={selected.seller.id} />}
                  </div>
                  {outgoing ? (
                    <div className="trade-desk-guidance">
                      <p>{outgoing.originalPrice !== undefined ? `${playerName(outgoing.sellerId)} đang chờ bạn trả lời giá mới ${money(outgoing.price)}.`
                        : 'Bạn đang chờ phản hồi. Rút đề nghị hiện tại để hỏi mua tài sản khác.'}</p>
                      <button type="button" className="chart-button" onClick={() => setMode('offers')}>{outgoing.originalPrice !== undefined ? 'Xem giá mới' : 'Xem đề nghị đã gửi'}</button>
                    </div>
                  ) : selected.restriction ? (
                    <p className="trade-desk-guidance">{selected.restriction}</p>
                  ) : buyer && (
                    <CashOffer key={`${selected.tile.id}-${selected.seller.id}`} balance={buyer.balance} listPrice={selected.price} askingPrice={askingPrice}
                      disabled={pending} send={price => send({ type: 'OFFER_TRADE', tileId: selected.tile.id, sellerId: selected.seller.id, price })} />
                  )}
                </>
              ) : <p className="chart-dialog-copy">Tài sản vừa đổi chủ. Chọn tài sản khác để tiếp tục.</p>}
            </>
          )}
        </section>
        <div className="trade-desk-offers" hidden={mode !== 'offers'}>
          {incoming.length > 0 && (
            <section className="trade-desk-incoming">
              <h3>{incoming.some(offer => offer.originalPrice !== undefined) ? 'Đề nghị cho tài sản của bạn' : 'Đề nghị nhận được'}</h3>
              {incoming.map(offer => {
                const bidder = gameState.players.find(player => player.id === offer.buyerId);
                const counter = offer.originalPrice !== undefined;
                return (
                  <article key={offer.id} className="trade-offer-card" data-trade-offer={offer.id} data-trade-direction={counter ? 'counter-sent' : 'offer-received'}>
                    <div><strong>{BOARD_TILES[offer.tileId].name}</strong><b>{money(offer.price)}</b></div>
                    {counter ? <p>{bidder?.name} đề nghị {money(offer.originalPrice!)}. Đang chờ {bidder?.name} trả lời mức giá mới của bạn.</p>
                      : <p>{bidder?.name} hỏi mua · Giá niêm yết {money(BOARD_TILES[offer.tileId].price!)}</p>}
                    <TradeCargoImpact state={gameState} tileId={offer.tileId} buyerId={offer.buyerId} sellerId={offer.sellerId} />
                    {counter ? <button type="button" className="chart-button" data-counter-withdraw disabled={pending}
                      onClick={() => send({ type: 'CANCEL_TRADE', offerId: offer.id })}>Rút giá mới</button>
                      : <>
                        <div className="chart-action-row">
                          <button type="button" className="chart-button chart-button-primary" disabled={pending || !canAccept(offer)}
                            onClick={() => send({ type: 'RESPOND_TRADE', offerId: offer.id, accept: true })}>Chấp nhận</button>
                          <button type="button" className="chart-button" disabled={pending}
                            onClick={() => send({ type: 'RESPOND_TRADE', offerId: offer.id, accept: false })}>Từ chối</button>
                        </div>
                        {bidder && <CounterPriceForm state={gameState} offer={offer} balance={bidder.balance} disabled={pending} send={send} />}
                      </>}
                  </article>
                );
              })}
            </section>
          )}
          {outgoing && (
            <section className="trade-desk-outgoing">
              <h3>{outgoing.originalPrice !== undefined ? 'Giá mới từ người bán' : 'Đề nghị đã gửi'}</h3>
              <article key={outgoing.id} className="trade-offer-card" data-trade-offer={outgoing.id}
                data-trade-direction={outgoing.originalPrice !== undefined ? 'counter-received' : 'offer-sent'}>
                <div><strong>{BOARD_TILES[outgoing.tileId].name}</strong><b>{money(outgoing.price)}</b></div>
                {outgoing.originalPrice !== undefined
                  ? <p>Bạn đã đề nghị {money(outgoing.originalPrice)}. {playerName(outgoing.sellerId)} muốn bán với giá <strong>{money(outgoing.price)}</strong>.</p>
                  : <p>Đang chờ {playerName(outgoing.sellerId)} phản hồi.</p>}
                <TradeCargoImpact state={gameState} tileId={outgoing.tileId} buyerId={outgoing.buyerId} sellerId={outgoing.sellerId} />
                {outgoing.originalPrice !== undefined ? <div className="chart-action-row">
                  <button type="button" className="chart-button chart-button-primary" data-counter-accept disabled={pending || !canAccept(outgoing)}
                    onClick={() => send({ type: 'RESPOND_TRADE', offerId: outgoing.id, accept: true })}>Chấp nhận giá mới</button>
                  <button type="button" className="chart-button" data-counter-decline disabled={pending}
                    onClick={() => send({ type: 'RESPOND_TRADE', offerId: outgoing.id, accept: false })}>Từ chối giá mới</button>
                </div> : <button type="button" className="chart-button" disabled={pending}
                  onClick={() => send({ type: 'CANCEL_TRADE', offerId: outgoing.id })}>Rút đề nghị</button>}
              </article>
            </section>
          )}
          {!offerCount && (
            <div className="trade-desk-empty">
              <p className="chart-dialog-copy">Bạn chưa có đề nghị nào đang chờ.</p>
              <button type="button" className="chart-button" onClick={() => setMode('browse')}>Tìm tài sản để mua</button>
            </div>
          )}
        </div>
      </div>
    </BoardDialog>
  );
}
