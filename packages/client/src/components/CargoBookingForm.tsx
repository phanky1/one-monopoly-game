import { useEffect, useId, useRef } from 'react';
import { ArrowRight, Container, Route, Snowflake, Store, Truck } from 'lucide-react';
import {
  BOARD_TILES, getCargoBookings, getEmptyNeed, getTenderBonus,
  type CargoKind, type GameAction, type GameState, type Player,
} from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import { ReeferBookingTerms } from './ReeferCargo.js';
import { EmptyYardImpact } from './EmptyYardImpact.js';
import './cargo-manifest.css';

export type BookingService = CargoKind | 'reefer';
export interface DestinationDraft {
  service: BookingService;
  tileId?: number;
  redirectOpen?: boolean;
  fromMarket?: boolean;
}
export interface DraftControls {
  draft: DestinationDraft;
  editDraft: (draft: DestinationDraft) => void;
  onOpenMarket: () => void;
}

export type Submit = (action: GameAction, after?: () => void) => void;
const distance = new Intl.NumberFormat('vi-VN');
export const typeName = (kind: CargoKind) => kind === 'empty' ? 'Container rỗng' : 'Hàng xuất';

export function port(id: number) {
  const tile = BOARD_TILES[id];
  return portGuide[tile.code] ?? { name: tile.name, country: '', code: tile.code };
}

export function getDefaultBookingService(state: GameState, playerId: string): CargoKind {
  const contract = state.logistics?.market?.contract;
  return contract && getTenderBonus(state, playerId, contract.destinationTileId, contract.kind) ? contract.kind : 'laden';
}

export function PortSelect({ label, value, options, onChange, purpose, onOpenMarket, focusDraft, disabled }: {
  label: string; value: number | ''; options: { tileId: number; description?: string }[];
  onChange: (id: number) => void; purpose: 'booking' | 'destination' | 'redirect' | 'terminal';
  onOpenMarket?: () => void;
  focusDraft?: DestinationDraft;
  disabled?: boolean;
}) {
  const id = useId();
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!focusDraft) return;
    // The native market dialog restores focus to its opener as it closes.
    const frame = requestAnimationFrame(() => {
      select.current?.focus({ preventScroll: true });
      select.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusDraft]);

  return (
    <div className="freight-field">
      <div className="freight-field-heading">
        <label htmlFor={id}>{label}</label>
        {onOpenMarket && <button type="button" data-cargo-market aria-haspopup="dialog" onClick={onOpenMarket}>
          <Store aria-hidden="true" />So sánh cảng</button>}
      </div>
      <select id={id} ref={select} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}
        data-terminal-destination={purpose === 'terminal' || undefined}
        data-cargo-booking={purpose === 'booking' || undefined}
        data-cargo-destination={purpose === 'destination' || undefined}
        data-cargo-redirect={purpose === 'redirect' || undefined}>
        {value === '' && <option value="" disabled>Chọn lại cảng đích</option>}
        {options.map(({tileId, description}) => {
          const place = port(tileId);
          return <option key={tileId} value={tileId}>
            {place.name}{place.country && place.country !== place.name ? ` · ${place.country}` : ''}{description ? ` · ${description}` : ''}
          </option>;
        })}
      </select>
    </div>
  );
}

export function receiving(state: GameState, playerId: string, tileId: number, kind: CargoKind) {
  const stock = state.logistics!.ports[tileId];
  const capacity = kind === 'empty' ? getEmptyNeed(stock) : stock.demand;
  const bonus = getTenderBonus(state, playerId, tileId, kind);
  const label = capacity === 0 && bonus > 0 ? 'Chỗ nhận riêng của chủ hàng'
    : kind === 'empty' ? `Cần ${capacity} vỏ rỗng` : `${capacity} xe chờ nhận`;
  return bonus > 0 ? `${label} · hợp đồng +$${bonus}M` : label;
}

export function ContractRate({ amount, terminal }: { amount: number; terminal?: boolean }) {
  return amount > 0 ? <span className="freight-contract-rate" data-contract-bonus={!terminal ? amount : undefined}
    data-terminal-contract-bonus={terminal ? amount : undefined}>
    Phụ phí hợp đồng <strong>+${amount}M</strong>
  </span> : null;
}

export function Quote({ nm, reward }: { nm: number; reward?: number }) {
  return <span className="freight-quote"><Route aria-hidden="true" />
    {distance.format(nm)} hải lý{reward !== undefined && <strong>+${reward}M</strong>}
  </span>;
}

export function CargoBooking({ state, player, busy, submit, draft, editDraft, onOpenMarket, terminal = false }: {
  state: GameState; player: Player; busy: boolean; submit: Submit;
  onOpenMarket?: () => void; terminal?: boolean;
} & Pick<DraftControls, 'draft' | 'editDraft'>) {
  const radioName = useId();
  const { service, tileId: targetId } = draft;
  const reefer = service === 'reefer';
  const kind = reefer ? 'laden' : service;
  const bookings = getCargoBookings(state, player.id, kind, reefer);
  const selected = bookings.find(b => b.tileId === targetId);
  const lostSelection = targetId !== undefined && !selected;
  const choice = lostSelection ? undefined : selected ?? bookings.find(b => getTenderBonus(state, player.id, b.tileId, kind)) ?? bookings[0];
  const stocks = state.logistics!.ports;
  const local = stocks[player.position];
  return (
    <div className="freight-booking">
      <fieldset className="freight-kind" disabled={terminal && busy}>
        <legend>{terminal ? 'Xếp lô hàng tại cầu cảng' : 'Chọn lô hàng để xếp'}</legend>
        {(['laden', 'empty', 'reefer'] as const).filter(value => value !== 'reefer' || state.logistics?.reeferSlots).map(value => (
          <label key={value}><input type="radio" name={radioName} value={value} data-cargo-kind={!terminal ? value : undefined}
            data-terminal-service={terminal ? value : undefined} checked={service === value}
            onChange={() => editDraft({ service: value })} />
            <span>{value === 'reefer' ? <Snowflake aria-hidden="true" /> : value === 'laden' ? <Truck aria-hidden="true" /> : <Container aria-hidden="true" />}
              {value === 'reefer' ? 'Hàng lạnh' : typeName(value)}</span>
          </label>
        ))}
      </fieldset>
      {reefer && !lostSelection && <ReeferBookingTerms state={state} tileId={player.position} destinationTileId={choice?.tileId} />}
      {lostSelection && <p className="freight-note" role="status">Lô hàng đi {port(targetId).name} không còn xếp được. Vui lòng chọn lại cảng hoặc loại hàng.</p>}
      {(choice || bookings.length > 0) && <PortSelect label="Cảng đích của lô hàng" value={choice?.tileId ?? ''} purpose={terminal ? 'terminal' : 'booking'}
          disabled={terminal && busy} onChange={tileId => editDraft({ service, tileId })}
          onOpenMarket={onOpenMarket} focusDraft={draft.fromMarket ? draft : undefined}
          options={bookings.map(b => ({ tileId: b.tileId, description: receiving(state, player.id, b.tileId, kind) }))} />}
      {choice ? <>
        {terminal && <div className="terminal-load-route" data-terminal-route={choice.tileId}>
          <strong>{port(player.position).name}</strong><ArrowRight aria-label="đến" /><strong>{port(choice.tileId).name}</strong>
        </div>}
        <div className="freight-terms"><span>Cước cơ bản</span>
          <Quote nm={choice.quote.distanceNm} reward={choice.quote.reward} /></div>
        {kind === 'empty' && <div className="empty-yard-booking">
          <span className="empty-yard-caption">Nếu giao 1 vỏ theo tồn bãi hiện tại</span>
          <EmptyYardImpact stock={stocks[choice.tileId]} portId={choice.tileId} />
        </div>}
        <ContractRate amount={getTenderBonus(state, player.id, choice.tileId, kind)} terminal={terminal} />
        <button type="button" className="chart-button freight-handling" disabled={busy} data-cargo-action={!terminal ? 'LOAD_CARGO' : undefined}
          data-terminal-load={terminal ? choice.tileId : undefined}
          onClick={() => submit(choice.action)}><Container aria-hidden="true" />Xếp {reefer ? 'container lạnh' : kind === 'empty' ? 'container rỗng' : 'container hàng xuất'}</button>
      </> : !reefer && !lostSelection && <p className="freight-note">{kind === 'laden'
        ? local.supply === 0 ? 'Bến này đã hết xe chở hàng xuất.' : 'Chưa có bến đích còn xe nhận hàng nhập.'
        : local.empties <= local.emptyTarget ? 'Bến này cần giữ lại số vỏ rỗng đang có.' : 'Chưa có bến đích thiếu vỏ rỗng.'}</p>}
    </div>
  );
}
