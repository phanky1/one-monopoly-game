import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import {
  BOARD_TILES, INFRA_TILES, LOOP_GROUPS_CONFIG, SERVICE_LINES, canSettleTrade, getBotAskingPrice, getBotPortSwapTerms,
  getPortSwapOptions, getTradeCounterAction, getTradeRestriction, isValidTradeOffer,
  type GameAction, type GameState, type TradeOffer,
} from '@one-monopoly/shared';
import { BoardDialog } from './BoardDialog.js';
import { TradeCargoImpact } from './TradeCargoImpact.js';
import { TradeRouteImpact } from './TradeRouteImpact.js';
import { PortSwapReceipt } from './PortSwapReceipt.js';
import './trade-desk.css';

interface Props {
  gameState: GameState;
  myPlayerId: string;
  initialTileId: number | null;
  settledSwap?: TradeOffer;
  onAction: (action: GameAction, onFailure?: () => void, onSuccess?: () => void) => void;
  onClose: () => void;
}

type TradeAction = Extract<GameAction, { type: 'OFFER_TRADE' | 'OFFER_PORT_SWAP' | 'COUNTER_TRADE' | 'RESPOND_TRADE' | 'CANCEL_TRADE' }>;
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

type TradeParties = Pick<TradeOffer, 'buyerId' | 'sellerId' | 'tileId' | 'offeredTileId'>;

function swapSummary(state: GameState, offer: TradeParties & { price: number }) {
  const buyer = state.players.find(player => player.id === offer.buyerId)?.name ?? 'Bên mua';
  const seller = state.players.find(player => player.id === offer.sellerId)?.name ?? 'Bên bán';
  const cash = offer.price > 0 ? `${buyer} trả ${seller} ${money(offer.price)} tiền bù.` : 'Tiền bù $0M.';
  return `${buyer} nhận ${BOARD_TILES[offer.tileId].name}. ${seller} nhận ${BOARD_TILES[offer.offeredTileId!].name}. ${cash}`;
}

function SwapTerms({ state, offer, price }: { state: GameState; offer: TradeParties; price: number | null }) {
  if (offer.offeredTileId === undefined) return null;
  const buyer = state.players.find(player => player.id === offer.buyerId)?.name;
  const seller = state.players.find(player => player.id === offer.sellerId)?.name;
  return <dl className="trade-swap-terms" data-swap-terms={offer.offeredTileId} aria-label="Điều khoản đổi cảng">
    <div><dt>{buyer} nhận</dt><dd>{BOARD_TILES[offer.tileId].name}</dd></div>
    <div><dt>{seller} nhận</dt><dd>{BOARD_TILES[offer.offeredTileId].name}</dd></div>
    <div><dt>Tiền bù · {buyer} trả {seller}</dt><dd>{price === null ? '—' : money(price)}</dd></div>
  </dl>;
}

function TradeImpact({ state, ...terms }: TradeParties & { state: GameState }) {
  return <>
    <TradeRouteImpact state={state} {...terms} />
    <TradeCargoImpact state={state} {...terms} />
  </>;
}

function OfferForm({ state, tileId, buyerId, sellerId, balance, listPrice, askingPrice, disabled, send }: {
  state: GameState; tileId: number; buyerId: string; sellerId: string; balance: number; listPrice: number;
  askingPrice: number | null; disabled: boolean; send: (action: TradeAction) => void;
}) {
  const id = useId();
  const cashDefault = String(Math.min(listPrice, balance) || '');
  const [amount, setAmount] = useState(cashDefault);
  const [offeredTileId, setOfferedTileId] = useState<number>();
  const supportsSwaps = state.supportsPortSwaps === true;
  const options = supportsSwaps ? getPortSwapOptions(state, buyerId, tileId) : [];
  const swap = offeredTileId !== undefined;
  const lostPort = swap && !options.includes(offeredTileId);
  const botTerms = askingPrice !== null && swap && !lostPort
    ? getBotPortSwapTerms(state, sellerId, tileId, offeredTileId) : null;
  const minimum = swap ? 0 : 1;
  const price = Number(amount);
  const validPrice = amount.trim() !== '' && Number.isSafeInteger(price) && price >= minimum;
  const terms = { tileId, buyerId, sellerId, offeredTileId };
  const fillPrice = swap ? botTerms?.minimumCash : askingPrice;
  const valid = validPrice && price <= balance && !lostPort;

  function choosePort(value: string) {
    const next = value === '' ? undefined : Number(value);
    setOfferedTileId(next);
    setAmount(next === undefined ? cashDefault : '0');
  }

  return <form className="trade-price-form" onSubmit={event => {
    event.preventDefault();
    if (!valid || disabled) return;
    if (offeredTileId === undefined) send({ type: 'OFFER_TRADE', tileId, sellerId, price });
    else send({ type: 'OFFER_PORT_SWAP', tileId, sellerId, price, offeredTileId });
  }}>
    {supportsSwaps && (options.length > 0 || swap) && <>
      <label htmlFor={id + '-port'}>Cảng của bạn muốn đem đổi</label>
      <select id={id + '-port'} data-swap-port value={offeredTileId ?? ''} disabled={disabled}
        onChange={event => choosePort(event.target.value)}>
        <option value="">Chỉ trả bằng tiền</option>
        {lostPort && <option value={offeredTileId} disabled>{BOARD_TILES[offeredTileId].name} · Tạm khóa</option>}
        {options.map(port => <option key={port} value={port}>{BOARD_TILES[port].name}</option>)}
      </select>
    </>}
    {lostPort && <p className="trade-desk-guidance" role="alert">Cảng vừa chọn không còn giao dịch được. Hãy chọn lại điều khoản.
      {!supportsSwaps && <button type="button" className="chart-button" onClick={() => choosePort('')}>Chỉ trả bằng tiền</button>}
    </p>}
    {!lostPort && <TradeImpact state={state} {...terms} />}
    {askingPrice !== null && <div className="trade-bot-quote">
      {botTerms ? <><p>AI định giá cảng của bạn <strong>{money(botTerms.credit)}</strong> · Tiền bù <strong>{money(botTerms.minimumCash)}</strong></p>
        {offeredTileId !== undefined && botTerms.credit > (BOARD_TILES[offeredTileId].price ?? 0) &&
          <small>AI trả cao hơn giá niêm yết vì sẽ sở hữu thêm cảng cùng màu.</small>}</>
        : <><p>Giá AI yêu cầu <strong>{money(askingPrice)}</strong></p>
          <small>{state.mode === 'harbor' && BOARD_TILES[tileId].type === 'PORT'
            ? 'Nếu bạn đề nghị thấp hơn, AI có thể ra giá mới để bạn cân nhắc.'
            : 'AI chỉ bán từ mức này. Giá tăng khi AI có nhiều tài sản cùng nhóm.'}</small></>}
    </div>}
    <div className="trade-price-label">
      <label htmlFor={id}>{swap ? 'Tiền bù thêm (triệu USD)' : 'Giá đề nghị (triệu USD)'}</label>
      {fillPrice != null && <button type="button" className="trade-fill-quote" disabled={disabled}
        onClick={() => setAmount(String(fillPrice))}>Điền giá AI</button>}
    </div>
    <div className="trade-price-entry">
      <input id={id} type="number" inputMode="numeric" min={minimum} step="1" max={balance} required
        data-trade-price value={amount} onChange={event => setAmount(event.target.value)} disabled={disabled}
        aria-describedby={id + '-balance'} />
      <button type="submit" className="chart-button chart-button-primary" disabled={!valid || disabled}>Gửi đề nghị</button>
    </div>
    <small id={id + '-balance'}>Số dư của bạn <strong>{money(balance)}</strong>
      {price > balance && Number.isSafeInteger(price) && <> · Cần thêm {money(price - balance)} để gửi.</>}
    </small>
    {!lostPort && swap && <SwapTerms state={state} offer={terms} price={validPrice ? price : null} />}
  </form>;
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
      <label htmlFor={id}>{offer.offeredTileId !== undefined ? 'Tiền bù mới (triệu USD)' : 'Giá bán mới (triệu USD)'}</label>
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

export function TradeDesk({ gameState, myPlayerId, initialTileId, settledSwap, onAction, onClose }: Props) {
  const titleId = useId();
  const initialSwap = useRef(settledSwap?.id);
  const lastAnnouncedSwap = useRef(settledSwap?.id);
  const confirmedSwapNotice = settledSwap ? `Đã đổi cảng. ${swapSummary(gameState, settledSwap)}` : '';
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
    const closed = removed.find(offer => offer.id === settledSwap?.id) ?? removed.find(offer =>
      offer.offeredTileId === undefined && gameState.properties[offer.tileId]?.ownerId === offer.buyerId) ?? removed[0];
    if (settledSwap && settledSwap.id !== lastAnnouncedSwap.current) {
      lastAnnouncedSwap.current = settledSwap.id;
      setNotice(confirmedSwapNotice);
    } else if (counter) {
      const asset = BOARD_TILES[counter.tileId].name;
      if (counter.offeredTileId !== undefined) {
        setNotice(`Đã cập nhật tiền bù. ${swapSummary(gameState, counter)}`);
      } else if (counter.sellerId === myPlayerId) {
        setNotice(`Bạn đã ra giá ${money(counter.price)} cho ${asset}. Đang chờ người mua trả lời.`);
      } else {
        const seller = gameState.players.find(player => player.id === counter.sellerId);
        setNotice(`${seller?.name ?? 'Chủ sở hữu'} đã ra giá mới ${money(counter.price)} cho ${asset}.`);
      }
    } else if (sent) {
      setNotice(sent.offeredTileId !== undefined ? `Đã gửi đề nghị đổi cảng. ${swapSummary(gameState, sent)}`
        : `Đã gửi đề nghị mua ${BOARD_TILES[sent.tileId].name}.`);
      setMode('offers');
    } else if (closed) {
      const name = BOARD_TILES[closed.tileId].name;
      if (closed.offeredTileId !== undefined) {
        setNotice(settledSwap?.id === closed.id ? confirmedSwapNotice
          : `Đề nghị đổi ${BOARD_TILES[closed.offeredTileId].name} lấy ${name} đã đóng.`);
      } else if (gameState.properties[closed.tileId]?.ownerId === closed.buyerId) {
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
      setNotice(received.offeredTileId !== undefined ? `Bạn có đề nghị đổi cảng. ${swapSummary(gameState, received)}`
        : `Bạn có đề nghị mới cho ${BOARD_TILES[received.tileId].name}.`);
    }
  }, [offers, myPlayerId, gameState, settledSwap, confirmedSwapNotice]);

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
  const canAccept = (offer: TradeOffer) => settlementOpen && isValidTradeOffer(gameState, offer);
  function accept(offer: TradeOffer) {
    send({ type: 'RESPOND_TRADE', offerId: offer.id, accept: true,
      ...(offer.offeredTileId !== undefined && { offeredTileId: offer.offeredTileId }) });
  }
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
        {settledSwap && <PortSwapReceipt key={settledSwap.id} offer={settledSwap} state={gameState} animate={settledSwap.id !== initialSwap.current} />}
        {decisionChanged && decision && (
          <div className="trade-board-prompt">
            <p role="status">{boardPrompts[decision]}</p>
            <button type="button" className="chart-button chart-button-navy" onClick={onClose}>Về bàn cờ</button>
          </div>
        )}
        <div className={notice && notice === confirmedSwapNotice ? 'sr-only' : 'trade-desk-notice'}
          role="status" aria-atomic="true">{notice}</div>
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
                    {selected.completes && <p>{selected.tile.group ? 'Nếu mua bằng tiền, bạn sẽ hoàn thành tuyến.' : 'Mua tài sản này để sở hữu trọn bộ.'}</p>}
                    <dl className="trade-facts">
                      <div><dt>Chủ sở hữu</dt><dd>{selected.seller.name}</dd></div>
                      <div><dt>Giá niêm yết</dt><dd>{money(selected.price)}</dd></div>
                    </dl>
                    {outgoing && askingPrice !== null && <p className="trade-bot-quote">Giá mua bằng tiền AI yêu cầu <strong>{money(askingPrice)}</strong></p>}
                    {outgoing && !selected.restriction && <TradeImpact state={gameState} tileId={selected.tile.id} buyerId={myPlayerId}
                      sellerId={selected.seller.id} offeredTileId={outgoing.tileId === selected.tile.id ? outgoing.offeredTileId : undefined} />}
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
                    <OfferForm key={`${selected.tile.id}-${selected.seller.id}`} state={gameState} tileId={selected.tile.id}
                      buyerId={myPlayerId} sellerId={selected.seller.id} balance={buyer.balance} listPrice={selected.price}
                      askingPrice={askingPrice} disabled={pending} send={send} />
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
                    {offer.offeredTileId !== undefined ? <>
                      <strong className="trade-swap-heading">Đề nghị đổi cảng</strong>
                      <SwapTerms state={gameState} offer={offer} price={offer.price} />
                      {counter && <p>Tiền bù ban đầu {money(offer.originalPrice!)}. Đang chờ {bidder?.name} trả lời.</p>}
                    </> : <>
                      <div><strong>{BOARD_TILES[offer.tileId].name}</strong><b>{money(offer.price)}</b></div>
                      {counter ? <p>{bidder?.name} đề nghị {money(offer.originalPrice!)}. Đang chờ {bidder?.name} trả lời mức giá mới của bạn.</p>
                        : <p>{bidder?.name} hỏi mua · Giá niêm yết {money(BOARD_TILES[offer.tileId].price!)}</p>}
                    </>}
                    <TradeImpact state={gameState} {...offer} />
                    {counter ? <button type="button" className="chart-button" data-counter-withdraw disabled={pending}
                      onClick={() => send({ type: 'CANCEL_TRADE', offerId: offer.id })}>Rút giá mới</button>
                      : <>
                        <div className="chart-action-row">
                          <button type="button" className="chart-button chart-button-primary" disabled={pending || !canAccept(offer)}
                            data-swap-accept={offer.offeredTileId !== undefined ? true : undefined} onClick={() => accept(offer)}>Chấp nhận</button>
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
                {outgoing.offeredTileId !== undefined ? <>
                  <strong className="trade-swap-heading">Đề nghị đổi cảng</strong>
                  <SwapTerms state={gameState} offer={outgoing} price={outgoing.price} />
                  {outgoing.originalPrice !== undefined
                    ? <p>Tiền bù bạn đề nghị ban đầu {money(outgoing.originalPrice)}. {playerName(outgoing.sellerId)} đã đề nghị mức mới.</p>
                    : <p>Đang chờ {playerName(outgoing.sellerId)} phản hồi.</p>}
                </> : <>
                  <div><strong>{BOARD_TILES[outgoing.tileId].name}</strong><b>{money(outgoing.price)}</b></div>
                  {outgoing.originalPrice !== undefined
                    ? <p>Bạn đã đề nghị {money(outgoing.originalPrice)}. {playerName(outgoing.sellerId)} muốn bán với giá <strong>{money(outgoing.price)}</strong>.</p>
                    : <p>Đang chờ {playerName(outgoing.sellerId)} phản hồi.</p>}
                </>}
                <TradeImpact state={gameState} {...outgoing} />
                {outgoing.originalPrice !== undefined ? <div className="chart-action-row">
                  <button type="button" className="chart-button chart-button-primary" data-counter-accept disabled={pending || !canAccept(outgoing)}
                    onClick={() => accept(outgoing)}>Chấp nhận giá mới</button>
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
