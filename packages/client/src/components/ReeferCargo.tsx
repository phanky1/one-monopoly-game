import { REEFER_ON_TIME_BONUS, getFeederRoutes, getReeferBonus, hasReeferSlot, isReeferPort, type CargoBooking, type GameState } from '@one-monopoly/shared';
import { Snowflake } from 'lucide-react';
import './reefer-cargo.css';

export function ReeferBookingTerms({ state, tileId, destinationTileId }: {
  state: GameState; tileId: number; destinationTileId?: number;
}) {
  let message: string;
  if (!isReeferPort(tileId)) message = 'Bến này không có kho lạnh để xếp hàng.';
  else if (!hasReeferSlot(state, tileId)) message = 'Suất xếp lạnh ở bến này đã có tàu nhận. Bến mở suất mới vào vòng sau.';
  else if (!state.logistics?.ports[tileId].supply) message = 'Bến đã hết hàng xuất để xếp vào container lạnh.';
  else if (destinationTileId === undefined) message = 'Chưa có bến kho lạnh nào còn chỗ nhận hàng.';
  else if (state.logistics.hasSailed) {
    const reachable = getFeederRoutes(state, state.players[state.activePlayerIndex].id).some(route => route.tileId === destinationTileId);
    message = reachable
      ? `Dùng chuyến nối cảng để dỡ trong vòng ${state.turnCount} và nhận thêm $${REEFER_ON_TIME_BONUS}M.`
      : 'Tàu chỉ có thể tới đích này từ vòng sau. Giao muộn vẫn nhận cước, phụ phí lạnh $0M.';
  }
  else message = `Bến chỉ có một suất xếp lạnh mỗi vòng. Giao trong vòng ${state.turnCount} để nhận thêm $${REEFER_ON_TIME_BONUS}M.`;
  return <p className="reefer-terms"><Snowflake aria-hidden="true" /><span>{message}</span></p>;
}

export function ReeferDeadline({ booking, round }: { booking: CargoBooking; round: number }) {
  if (booking.reeferDueRound === undefined) return null;
  const bonus = getReeferBonus(booking, round);
  return <p className="reefer-terms" data-reefer-due={booking.reeferDueRound}>
    <Snowflake aria-hidden="true" /><span>{bonus
      ? <>Dỡ trong vòng <strong>{booking.reeferDueRound}</strong> để nhận phụ phí lạnh <strong>+${bonus}M</strong>.</>
      : <>Đã qua hạn giao lạnh ở vòng {booking.reeferDueRound}. Vẫn có thể dỡ hàng và nhận cước.</>}</span>
  </p>;
}

export function ReeferReceipt({ bonus }: { bonus?: number }) {
  if (bonus === undefined) return null;
  return <p className="reefer-receipt" data-reefer-paid={bonus}><Snowflake aria-hidden="true" />
    <span>{bonus ? <>Giao lạnh đúng hạn <strong>+${bonus}M</strong></> : 'Giao sau hạn lạnh · phụ phí $0M'}</span>
  </p>;
}
