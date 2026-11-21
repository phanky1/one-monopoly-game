import { Component, createRef, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Award, Container, CalendarDays, MapPin, Ship, Truck, X } from 'lucide-react';
import { BOARD_TILES, isFinalLogisticsRound, type CargoKind, type GameState } from '@one-monopoly/shared';
import { BoardDialog } from './BoardDialog.js';
import { freightMarketRows, type MarketFilter, type MarketSort } from './freightMarketRows.js';
import { marketPlanRates, marketRowsByRate, type MarketPlanService } from './marketPlanRates.js';
import { getWatchRates, getWatchTurn, type WatchPlan, type WatchService } from './watchPlan.js';
import { portGuide } from './ports/portGuide.js';
import { TruckTimetable } from './TruckTimetable.js';
import './freight-market-board.css';

type Service = CargoKind | 'reefer';
type PlanSort = MarketSort | 'baseRate';
const serviceLabels: Record<Service, string> = { laden: 'Hàng xuất', empty: 'Vỏ rỗng', reefer: 'Hàng lạnh' };

interface Props {
  gameState: GameState;
  myPlayerId: string | null;
  onClose: () => void;
  onSelectPort: (tileId: number) => void;
  service?: Service;
  onPlanPort?: (tileId: number, service: MarketPlanService) => void;
  onSaveWatchPlan?: (service: WatchService, tileId: number) => void;
  savedWatchPlan?: WatchPlan | null;
}

const filters: { key: MarketFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' }, { key: 'export', label: 'Có hàng xuất' },
  { key: 'surplus', label: 'Dư vỏ rỗng' }, { key: 'shortage', label: 'Thiếu vỏ rỗng' },
  { key: 'import', label: 'Có xe nhận' },
];
const number = new Intl.NumberFormat('vi-VN');
const columns = [
  { key: 'supply', label: 'Xe hàng xuất' }, { key: 'surplus', label: 'Vỏ dư' },
  { key: 'shortage', label: 'Thiếu vỏ' }, { key: 'demand', label: 'Xe nhận trống' },
] as const;

interface MarketContentProps { focusScope: string; children: ReactNode }

function ServicePicker({ value, onChange, hasReefer, watch = false }: {
  value: Service; onChange: (service: Service) => void; hasReefer: boolean; watch?: boolean;
}) {
  const group = useId();
  return <fieldset className={watch ? 'market-watch-services' : 'market-booking-services'}>
    <legend className={watch ? 'sr-only' : undefined}>{watch ? 'Loại lô hàng dự kiến' : 'So cước theo loại hàng'}</legend>
    {(['laden', 'empty', 'reefer'] as const).filter(kind => kind !== 'reefer' || hasReefer).map(kind =>
      <label key={kind}><input type="radio" name={group} value={kind} checked={value === kind}
        data-watch-service={watch ? kind : undefined} data-market-booking-service={watch ? undefined : kind}
        onChange={() => onChange(kind)} /><span>{serviceLabels[kind]}</span></label>)}
  </fieldset>;
}

class MarketContent extends Component<MarketContentProps> {
  private readonly section = createRef<HTMLElement>();

  // Capture the real focus before React removes or reorders rows during a turn handoff.
  getSnapshotBeforeUpdate(previous: MarketContentProps) {
    const focused = document.activeElement;
    return previous.focusScope !== this.props.focusScope && focused instanceof HTMLElement && this.section.current?.contains(focused)
      ? focused : null;
  }

  componentDidUpdate(_props: MarketContentProps, _state: unknown, previousFocus: HTMLElement | null) {
    const market = this.section.current;
    const dialog = market?.closest('dialog');
    if (!previousFocus || !market || !dialog?.open) return;
    const focused = document.activeElement;
    if (focused !== document.body && focused !== dialog) return;
    const target = market.contains(previousFocus) ? previousFocus
      : market.querySelector<HTMLElement>('[data-watch-handoff]') ?? market.querySelector('h2');
    if (target?.tagName === 'H2') target.tabIndex = -1;
    target?.focus({ preventScroll: true });
  }

  render() {
    return <section ref={this.section} className="freight-market-board">{this.props.children}</section>;
  }
}

export function FreightMarketBoard({ gameState, myPlayerId, onClose, onSelectPort, service = 'laden', onPlanPort, onSaveWatchPlan, savedWatchPlan }: Props) {
  const heading = useId(), sortId = useId();
  const [showSchedule, setShowSchedule] = useState(false);
  const hasSchedule = !!gameState.logistics?.earlyTruckAvailable && !gameState.winnerId && !isFinalLogisticsRound(gameState);
  const timetableOpen = hasSchedule && showSchedule;
  const [filter, setFilter] = useState<MarketFilter>('all');
  const captain = gameState.players.find(p => p.id === myPlayerId) ?? gameState.players[gameState.activePlayerIndex];
  const berth = captain && portGuide[BOARD_TILES[captain.position]?.code];
  const active = !!onPlanPort && !!myPlayerId && !gameState.winnerId && gameState.players[gameState.activePlayerIndex]?.id === myPlayerId;
  const watchRound = onSaveWatchPlan && myPlayerId ? getWatchTurn(gameState, myPlayerId) : null;
  const mode = active ? 'active' : watchRound !== null ? 'watch' : 'inspect';
  const sessionKey = [gameState.roomId, myPlayerId, mode, active ? gameState.turnCount : watchRound,
    captain?.position, captain?.cargo?.bookingId, captain?.cargo?.destinationTileId, captain?.lastDelivery?.bookingId].join('/');
  const [session, setSession] = useState<{ key: string | null; mode: typeof mode }>({ key: sessionKey, mode });
  // A new manifest can open and close at the same berth. Require an explicit handoff even if the old key recurs.
  useEffect(() => {
    setSession(previous => previous.key === null || previous.key === sessionKey ? previous : { ...previous, key: null });
  }, [sessionKey]);
  const [sort, setSort] = useState<PlanSort>(mode === 'watch' ? 'baseRate' : 'opportunity');
  const saved = savedWatchPlan?.roomId === gameState.roomId && savedWatchPlan.playerId === myPlayerId &&
    savedWatchPlan.turnRound === watchRound ? savedWatchPlan : null;
  const initialService = active ? service : saved && saved.service !== 'redirect' ? saved.service : 'laden';
  const [selectedService, setSelectedService] = useState<Service>(initialService);
  // A live handoff must never change a private save button into a captain's booking control.
  const sameSession = session.key === sessionKey;
  const watching = sameSession && mode === 'watch';
  const canPlan = sameSession && active;
  const hasReefer = !!gameState.logistics?.reeferSlots;
  const bookingService = selectedService === 'reefer' && !hasReefer ? 'laden' : selectedService;
  const canChooseService = canPlan && !captain?.cargo;
  const planType: MarketPlanService = captain?.cargo ? 'redirect' : bookingService;
  const cargoService = captain?.cargo
    ? captain.cargo.reeferDueRound !== undefined ? 'reefer' : captain.cargo.kind
    : bookingService;
  const priceOrigin = captain && BOARD_TILES[captain.cargo?.originTileId ?? captain.position];
  const baseRates = useMemo(() => {
    if (myPlayerId && watching) return getWatchRates(gameState, myPlayerId, planType);
    if (myPlayerId && canPlan) return marketPlanRates(gameState, myPlayerId, planType);
    return new Map<number, number>();
  }, [myPlayerId, watching, gameState, canPlan, planType]);
  const hasRateSort = watching || canChooseService || baseRates.size > 0;
  const effectiveSort = sort === 'baseRate' && !hasRateSort ? 'opportunity' : sort;
  const rows = useMemo(() => effectiveSort === 'baseRate'
    ? marketRowsByRate(gameState, myPlayerId, filter, baseRates)
    : freightMarketRows(gameState, myPlayerId, filter, effectiveSort),
  [effectiveSort, gameState, myPlayerId, filter, baseRates]);
  const hasPlans = rows.some(row => baseRates.has(row.tileId));
  const hasActivity = rows.some(row => row.incoming.length || row.award || row.ownTruckThrough !== undefined);
  function inspect(tileId: number) {
    onClose();
    onSelectPort(tileId);
  }
  function enterCurrentMarket() {
    setSession({ key: sessionKey, mode });
    setSort(mode === 'watch' ? 'baseRate' : 'opportunity');
    setSelectedService(initialService);
    setShowSchedule(false);
  }

  return <BoardDialog onClose={onClose} labelledBy={heading}>
    <MarketContent focusScope={`${sessionKey}:${sameSession}`}>
      <header className="market-board-heading">
        <div><h2 id={heading}>Thị trường cảng</h2>
          {berth && <p><MapPin aria-hidden="true" />Khoảng cách từ {captain.id === myPlayerId ? 'tàu của bạn' : `tàu của ${captain.name}`} tại <strong>{berth.name}</strong></p>}</div>
        <button type="button" className="chart-dialog-close" aria-label="Đóng thị trường cảng" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      {hasSchedule && <div className="market-view-picker" role="group" aria-label="Chế độ thị trường cảng">
        <button type="button" aria-pressed={!timetableOpen} onClick={() => setShowSchedule(false)}>Tồn bến hiện tại</button>
        <button type="button" data-market-truck-schedule aria-pressed={timetableOpen} onClick={() => setShowSchedule(true)}>
          <CalendarDays size={15} aria-hidden="true" />Lịch xe vòng {gameState.turnCount + 1}
        </button>
      </div>}
      {!sameSession && (session.mode !== 'inspect' || mode !== 'inspect') && <div className="market-watch-handoff" data-watch-notice>
        <span role="status">{active ? session.mode === 'watch' ? 'Đã đến lượt bạn. Đã hết thời gian lưu kế hoạch cho lượt này.'
          : session.mode === 'active' ? 'Tình trạng tàu đã thay đổi. Kiểm tra lại lựa chọn trong lượt.' : 'Đã đến lượt bạn điều độ tàu.'
          : mode === 'watch' ? 'Lượt điều độ đã đổi. Bạn có thể lập kế hoạch cho lượt tới.'
            : 'Không còn lượt tới để lưu kế hoạch.'}</span>
        {mode !== 'inspect' && <button type="button" data-watch-handoff onClick={enterCurrentMarket}>
          {active ? 'Xem lựa chọn trong lượt' : 'Lập kế hoạch lượt tới'}
        </button>}
      </div>}
      {timetableOpen ? <TruckTimetable state={gameState} viewerId={myPlayerId} inspect={inspect} /> : <>
      {watching && <section className="market-watch" data-market-watch={watchRound} aria-label="Kế hoạch lượt tới">
        <div className="market-watch-head"><h3>Kế hoạch lượt tới</h3><span>Vòng {watchRound}</span></div>
        <p>Chỉ bạn thấy kế hoạch. Cước cơ bản tính từ <strong>{priceOrigin && (portGuide[priceOrigin.code]?.name ?? priceOrigin.name)}</strong>.
          {' '}Lưu kế hoạch không giữ hàng hoặc chỗ nhận.</p>
        {captain.cargo ? <strong data-watch-service="redirect" className="market-watch-cod">
          Đổi cảng dỡ · {serviceLabels[cargoService]}
        </strong> : <ServicePicker value={bookingService} onChange={setSelectedService} hasReefer={hasReefer} watch />}
        {!hasPlans && <p className="market-watch-empty">Không có đích phù hợp trong danh sách này.</p>}
      </section>}
      {canChooseService && <ServicePicker value={bookingService} onChange={setSelectedService} hasReefer={hasReefer} />}
      <div className="market-board-toolbar">
        <div className="market-board-filters" role="group" aria-label="Lọc theo nhu cầu tại cảng">
          {filters.map(({ key, label }) => <button type="button" key={key} data-market-filter={key}
            aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
        <label htmlFor={sortId} className="market-board-sort">Sắp xếp
          <select id={sortId} data-market-sort value={effectiveSort} onChange={event => setSort(event.target.value as PlanSort)}>
            <option value="opportunity">Theo cơ hội</option><option value="distance">Gần tàu nhất</option>
            {hasRateSort && <option value="baseRate">Cước cơ bản cao nhất</option>}
          </select>
        </label>
      </div>
      <div className="market-board-context">
        <strong role="status">{rows.length} cảng</strong>
        {effectiveSort === 'opportunity' && <span>{filter !== 'all' ? 'Số lượng lớn nhất xếp trước.'
          : captain?.cargo ? 'Ưu tiên đích vận đơn, hợp đồng và bến còn chỗ nhận hàng.'
          : 'Ưu tiên hợp đồng, sau đó đến bến có nhiều hàng xuất hoặc vỏ dư.'}</span>}
        {canPlan && <span className="market-plan-context" data-market-service={cargoService}>
          {planType === 'redirect' && <><strong>{serviceLabels[cargoService]}</strong> · </>}
          {hasPlans ? (planType === 'redirect' ? 'So cước cơ bản rồi chọn đích đổi vận đơn.' : 'Chọn cảng để điền vào phiếu xếp hàng.')
            : 'Chưa có đích phù hợp trong danh sách này.'}
        </span>}
      </div>
      {rows.length ? <div className="market-board-list" tabIndex={0} role="region" aria-label="So sánh các cảng">
        <table><thead><tr>
          <th scope="col">Cảng</th>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}
          <th scope="col" className="market-distance">Hải lý</th>{hasActivity && <th scope="col" className="market-activity-header">Hàng đặt tại bến</th>}
          {hasPlans && <th scope="col" className="market-plan-heading">Cước cơ bản</th>}
        </tr></thead>
        <tbody>{rows.map(row => {
          const rate = baseRates.get(row.tileId);
          const savedHere = watching && saved?.service === planType && saved.tileId === row.tileId;
          return <tr key={row.tileId} data-market-row={row.tileId} data-market-current={row.current || undefined}>
            <th scope="row" className="market-port-cell">
              <button type="button" data-market-port={row.tileId} aria-label={`Xem cảng ${row.name}, ${row.country}`} onClick={() => inspect(row.tileId)}>
                <span className="market-port-title">{row.name}<ArrowUpRight aria-hidden="true" /></span>
                <span className="market-port-location">{row.code} · {row.country}</span>
              </button>
              {(row.current || row.booked) && <span className="market-row-mark"><Ship aria-hidden="true" />{row.current ? 'Đang neo' : ''}{row.current && row.booked ? ' · ' : ''}{row.booked ? 'Đích vận đơn' : ''}</span>}
            </th>
            {columns.map(column => <td key={column.key} className="market-quantity" data-zero={row[column.key] === 0 || undefined}>
              <span className="market-mobile-label" aria-hidden="true">{column.label}</span>{row[column.key]}</td>)}
            <td className="market-distance"><span className="market-mobile-label" aria-hidden="true">Hải lý</span>
              {row.distanceNm === null ? '—' : number.format(row.distanceNm)}</td>
            {hasActivity && <td className="market-activity" data-empty={!row.award && !row.incoming.length && row.ownTruckThrough === undefined || undefined}>
              {row.ownTruckThrough !== undefined && <div className="market-award" data-market-held-truck><Truck aria-hidden="true" />
                <span>{captain.id === myPlayerId ? 'Xe của bạn' : `Xe của ${captain.name}`} · giữ đến hết vòng {row.ownTruckThrough}</span></div>}
              {row.award && <div className="market-award"><Award aria-hidden="true" /><span>{row.award.own ? 'Hợp đồng của bạn' : `Hợp đồng · ${row.award.name}`} · {row.award.kind === 'empty' ? 'vỏ rỗng' : 'hàng xuất'} +${row.award.amount}M</span></div>}
              {row.incoming.map((shipment, index) => <div className="market-inbound" key={index}>{shipment.kind === 'empty'
                ? <Container aria-hidden="true" /> : <Truck aria-hidden="true" />}<span>{shipment.captain} · {shipment.refrigerated ? 'hàng lạnh' : shipment.kind === 'empty' ? 'vỏ rỗng' : 'hàng xuất'}
                  {shipment.heldThrough !== undefined && <strong data-market-held-truck> · xe giữ đến hết vòng {shipment.heldThrough}</strong>}</span></div>)}
              {!row.award && !row.incoming.length && row.ownTruckThrough === undefined && <span aria-label="Chưa có lô đặt tại bến">—</span>}
            </td>}
            {hasPlans && <td className="market-plan-cell" data-empty={rate === undefined || undefined}>
              {rate !== undefined && watching && <button type="button" className="market-plan-button" data-watch-save={row.tileId}
                data-watch-saved={savedHere || undefined}
                aria-label={`${savedHere ? 'Đã lưu' : 'Lưu'} kế hoạch ${planType === 'redirect' ? 'đổi cảng dỡ' : serviceLabels[planType]} đi ${row.name}, cước cơ bản $${rate}M`}
                onClick={() => onSaveWatchPlan?.(planType, row.tileId)}>
                <span>{savedHere ? 'Đã lưu' : 'Lưu đích'}</span><strong>${rate}M</strong>
              </button>}
              {rate !== undefined && canPlan && <button type="button" className="market-plan-button" data-market-plan={row.tileId}
                aria-label={`Chọn đích ${row.name} để ${planType === 'redirect' ? 'chuẩn bị đổi vận đơn' : 'chuẩn bị đặt chỗ'}, ${serviceLabels[cargoService]}, cước cơ bản $${rate}M`}
                onClick={() => onPlanPort?.(row.tileId, planType)}>
                <span>Chọn đích</span><strong>${rate}M</strong>
              </button>}
            </td>}
          </tr>;
        })}</tbody></table>
      </div> : <p className="market-board-empty">Hiện chưa có cảng đáp ứng bộ lọc này.</p>}
      </>}
    </MarketContent>
  </BoardDialog>;
}
