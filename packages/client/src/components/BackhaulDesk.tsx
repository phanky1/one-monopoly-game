import { BACKHAUL_BONUS, BOARD_TILES, getAcceptBackhaulAction, getEmptyNeed, getImportTruckReservation, getTenderBonus, isFinalLogisticsRound, isReeferPort,
  type BackhaulJob, type GameAction, type GameState, type Player } from '@one-monopoly/shared';
import { ArrowRight, Check, CornerDownLeft } from 'lucide-react';
import { portGuide } from './ports/portGuide.js';
import './backhaul-desk.css';

function place(id: number) {
  const tile = BOARD_TILES[id];
  return portGuide[tile.code]?.name ?? tile.name;
}

function advice(state: GameState, captain: Player, job: BackhaulJob) {
  const pickup = state.logistics!.ports[job.originTileId];
  const receiver = state.logistics!.ports[job.destinationTileId];
  const laden = receiver.demand > 0 || getImportTruckReservation(state, captain.id)?.destinationTileId === job.destinationTileId ||
    getTenderBonus(state, captain.id, job.destinationTileId, 'laden') > 0;
  const empty = getEmptyNeed(receiver) > 0 || getTenderBonus(state, captain.id, job.destinationTileId, 'empty') > 0;
  const cargo = captain.cargo;
  if (cargo) {
    if (cargo.originTileId !== job.originTileId) return 'Lô trên tàu không xuất phát từ cảng nhận hàng chiều về.';
    if (cargo.reeferDueRound !== undefined && !isReeferPort(job.destinationTileId)) return 'Bến về không thể nhận lô lạnh trên tàu.';
    if (!(cargo.kind === 'laden' ? laden : empty)) return 'Cảng đích hiện chưa thể nhận lô trên tàu. Nhu cầu có thể thay đổi.';
    return cargo.destinationTileId === job.destinationTileId ? 'Lô trên tàu đã đặt đúng tuyến về.' : 'Đổi cảng đích của lô trên tàu để khớp tuyến về.';
  }
  const canShipLaden = pickup.supply > 0, canShipEmpty = pickup.empties > pickup.emptyTarget;
  if (canShipLaden && laden) return canShipEmpty && empty ? 'Có thể đặt hàng xuất hoặc vỏ rỗng cho chiều về.' : 'Hiện có hàng xuất và xe nhận tại cảng đích.';
  if (canShipEmpty && empty) return 'Có vỏ rỗng dư tại bến đi và thiếu vỏ ở bến về.';
  if (!canShipLaden && !canShipEmpty) return 'Bến đi hiện chưa có hàng xuất hoặc vỏ rỗng dư.';
  return 'Cảng đích hiện chưa nhận loại container có sẵn ở bến đi. Nhu cầu có thể thay đổi.';
}

interface Props {
  state: GameState;
  viewerId: string | null;
  busy: boolean;
  submit: (action: GameAction) => void;
}

export function BackhaulDesk({ state, viewerId, busy, submit }: Props) {
  const captain = state.players.find(player => player.id === viewerId);
  if (!state.logistics?.backhaulEnabled || !captain || (!captain.backhaul && !captain.lastBackhaul)) return null;
  const job = captain.backhaul, previous = captain.lastBackhaul;
  const accept = getAcceptBackhaulAction(state, captain.id);
  return <section className="backhaul-desk" aria-label="Chuyến hàng chiều về">
    {job && <div className="backhaul-job" data-backhaul-status={job.status}>
      <div className="backhaul-head"><CornerDownLeft aria-hidden="true" /><h3>{job.status === 'offered' ? 'Đề nghị hàng chiều về' : 'Đã nhận chuyến chiều về'}</h3><strong>+${BACKHAUL_BONUS}M</strong></div>
      <div className="backhaul-route">{place(job.originTileId)} <ArrowRight aria-label="đến" /> {place(job.destinationTileId)}</div>
      <p>Giao lô kế tiếp trên tuyến này {isFinalLogisticsRound(state)
        ? `trước khi ván kết thúc ở vòng ${state.turnCount}.` : `trước khi kết thúc vòng ${job.deadlineRound}.`}</p>
      {captain.lastBackhaulPaidRound === state.turnCount && job.deadlineRound > state.turnCount &&
        <p>Vòng này đã nhận thưởng chiều về. Giao ở vòng {state.turnCount + 1} để nhận thêm ${BACKHAUL_BONUS}M.</p>}
      <p className="backhaul-availability">{advice(state, captain, job)}</p>
      {job.status === 'offered' && <div className="backhaul-sign"><span>Nhận trước khi kết thúc lượt này.</span>
        {accept && <button type="button" data-cargo-action="ACCEPT_BACKHAUL" disabled={busy} onClick={() => submit(accept)}>Nhận chuyến về</button>}
      </div>}
    </div>}
    {previous && <p className="backhaul-result" data-backhaul-status={previous.status}>
      {previous.status === 'fulfilled' ? <Check aria-hidden="true" /> : <CornerDownLeft aria-hidden="true" />}
      <span>{place(previous.originTileId)} → {place(previous.destinationTileId)} · {previous.status === 'fulfilled'
        ? 'Đã hoàn tất' : 'Đã hết hiệu lực'} · hạn vòng {previous.deadlineRound}</span>
      {previous.status === 'fulfilled' && <strong>+${BACKHAUL_BONUS}M</strong>}
    </p>}
  </section>;
}
