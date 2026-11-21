import { BOARD_TILES, type CargoBooking } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './waybill-amendment.css';

export function WaybillAmendment({ booking }: { booking: CargoBooking }) {
  const record = booking.destinationAmendment;
  if (!record) return null;

  const port = portGuide[BOARD_TILES[record.firstDestinationTileId].code];
  const returned = booking.destinationTileId === record.firstDestinationTileId;
  return <p className="waybill-amendment" data-waybill-amendment={booking.bookingId}>
    <strong>Đã đổi cảng dỡ {record.count} lần</strong>
    <span>{returned ? 'Đăng ký lại cảng dỡ' : 'Đích trước lần đổi đầu tiên'} {port.name}
      {' · '}cước cơ bản ${record.originalQuote.reward}M.</span>
  </p>;
}
