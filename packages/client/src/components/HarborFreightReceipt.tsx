import { useId } from 'react';
import { ArrowRight, ReceiptText } from 'lucide-react';
import { BOARD_TILES, LOOP_GROUPS_CONFIG, type GameState, type HarborFreightReceipt as FreightRecord } from '@one-monopoly/shared';
import { portGuide } from './ports/portGuide.js';
import './harbor-freight-receipt.css';

const number = new Intl.NumberFormat('vi-VN');
const money = (amount: number) => `$${number.format(amount)}M`;
const signedMoney = (amount: number) => `${amount < 0 ? '−' : amount > 0 ? '+' : ''}${money(Math.abs(amount))}`;

function ExchangeStamp({ destination, animate }: { destination: string; animate: boolean }) {
  return <div className="harbor-exchange-stamp">
    <span className="harbor-exchange-scene" aria-hidden="true" data-harbor-turnaround-motion={animate ? 'live' : 'still'}>
      <i className="harbor-exchange-ship" /><i className="harbor-exchange-quay" /><i className="harbor-exchange-gantry" />
      <i className="harbor-exchange-box harbor-box-inbound" /><i className="harbor-exchange-box harbor-box-outbound" />
    </span>
    <p><strong>Lô mới đã lên tàu</strong><span>Cảng xếp · {destination}</span></p>
  </div>;
}

export function HarborFreightReceipt({ state, receipt, animateExchange = false }: {
  state: GameState; receipt: FreightRecord | null; animateExchange?: boolean;
}) {
  const title = useId();
  if (!receipt || state.mode !== 'harbor') return null;
  const originTile = BOARD_TILES[receipt.originTileId], destinationTile = BOARD_TILES[receipt.tileId];
  const origin = portGuide[originTile.code]?.name ?? originTile.name;
  const destination = portGuide[destinationTile.code]?.name ?? destinationTile.name;
  const carrier = state.players.find(player => player.id === receipt.playerId)?.name ?? 'Hãng vận chuyển';
  const group = receipt.feePercent === 50 && destinationTile.group ? LOOP_GROUPS_CONFIG[destinationTile.group] : null;
  const purchase = receipt.purchasePrice;
  const bankPayment = purchase ?? receipt.redemptionCost;
  const rent = receipt.rentRelief;
  const booking = receipt.exportBooking;
  const originCharter = receipt.charterPickup;
  const turnaround = receipt.turnaround;
  const rentPaid = rent && rent.shortfallAfter === 0 ? rent.rentDue : 0;
  const cashChange = receipt.carrierNet - (bankPayment ?? 0) - rentPaid - (turnaround?.fee ?? 0);
  const hasPayment = bankPayment !== undefined || !!rent || !!turnaround;
  const cashLabel = purchase !== undefined ? `Số dư ${carrier} thay đổi do mua cảng và dỡ hàng` : hasPayment ? `Thay đổi số dư của ${carrier}` : `${carrier} thực nhận`;
  const heading = purchase !== undefined ? 'Biên lai mua cảng và dỡ hàng' : rent ? 'Biên lai dỡ hàng khi nợ tiền thuê'
    : bankPayment !== undefined ? 'Biên lai chuộc cảng và dỡ hàng' : turnaround ? 'Biên lai dỡ và xếp lô mới' : 'Biên lai dỡ hàng';
  return <section className="harbor-freight-receipt" data-harbor-receipt={receipt.revision}
    data-harbor-charter-receipt={turnaround?.waivedFee ? 'turnaround' : originCharter ? 'origin' : undefined}
    data-harbor-turnaround-receipt={turnaround ? receipt.revision : undefined}
    data-harbor-rent-receipt={rent ? receipt.revision : undefined} tabIndex={rent || purchase !== undefined ? -1 : undefined}
    data-harbor-purchase-receipt={purchase !== undefined ? receipt.revision : undefined}
    data-harbor-redemption-receipt={receipt.redemptionCost !== undefined ? receipt.revision : undefined} aria-labelledby={title}>
    <header>
      <h4 id={title}><ReceiptText size={15} aria-hidden="true" />{heading}</h4>
      <small>Vòng {receipt.round}</small>
    </header>
    <p className="harbor-receipt-route" data-harbor-receipt-route>
      <b>{origin}</b><ArrowRight size={14} aria-hidden="true" /><span className="sr-only">đến</span><b>{destination}</b>
      <small>{number.format(receipt.distanceNm)} hải lý</small>
    </p>
    <dl>
      <div><dt>{purchase !== undefined ? 'Cước dỡ hàng dùng để mua cảng' : bankPayment !== undefined ? 'Cước hàng dùng để chuộc cảng' : 'Cước vận chuyển'}</dt>
        <dd data-harbor-receipt-gross={receipt.gross}>{bankPayment !== undefined && '+'}{money(receipt.gross)}</dd></div>
      {bankPayment !== undefined ? <div><dt>{purchase !== undefined ? 'Giá mua đã trả cho ngân hàng' : 'Đã trả ngân hàng để chuộc cảng'}</dt>
        <dd data-harbor-receipt-purchase-price={purchase} data-harbor-receipt-redemption-cost={receipt.redemptionCost}>−{money(bankPayment)}</dd>
      </div> : <div className="harbor-receipt-fee">
        <dt>Phí khai thác bến{receipt.feePercent > 0 && ` (${receipt.feePercent}%)`}
          {receipt.operatorName && <small>Đã chuyển cho <b>{receipt.operatorName}</b></small>}
          {group && <small className="harbor-receipt-group" data-harbor-receipt-group>
            <i aria-hidden="true" style={{ backgroundColor: group.color }} />Sở hữu trọn tuyến {group.name}
          </small>}
        </dt>
        <dd data-harbor-receipt-fee={receipt.handlingFee}>{receipt.handlingFee > 0 && '−'}{money(receipt.handlingFee)}</dd>
      </div>}
      {rent && <div><dt>Tiền thuê đã trả khi dỡ hàng</dt>
        <dd data-harbor-receipt-rent-paid={rentPaid}>{rentPaid > 0 ? '−' : ''}{money(rentPaid)}</dd>
      </div>}
      {turnaround && <div className="harbor-receipt-fee"><dt>Phí xếp lô mới tại {destination}
        {turnaround.fee > 0 && <small>Đã chuyển cho <b>{turnaround.operatorName}</b></small>}
        {turnaround.waivedFee && <small>Đã dùng quyền chia chỗ để miễn <b>{money(turnaround.waivedFee)}</b> phí xếp.</small>}</dt>
        <dd data-harbor-turnaround-paid={turnaround.fee}>
          {turnaround.fee > 0 ? `−${money(turnaround.fee)}` : 'Miễn phí'}</dd></div>}
      <div className="harbor-receipt-net"><dt>{cashLabel}{booking && ' tại bến này'}</dt>
        <dd data-harbor-receipt-net={cashChange} data-harbor-receipt-cash-change={hasPayment ? cashChange : undefined}>
          {signedMoney(cashChange)}</dd></div>
    </dl>
    {turnaround && <ExchangeStamp destination={destination} animate={animateExchange} />}
    {originCharter && <p className="harbor-receipt-rent-note" data-harbor-origin-charter={originCharter.waivedFee}>
      Phí xếp {money(originCharter.waivedFee)} tại {origin} đã được miễn bằng quyền chia chỗ với <b>{originCharter.operatorName}</b>.
    </p>}
    {booking && <dl className="harbor-voyage-result" aria-label="Cước cả chuyến sau phí xếp dỡ">
      <div><dt>Phí xếp tại {origin}<small>Đã trả cho <b>{booking.operatorName}</b> khi xếp hàng</small></dt>
        <dd data-harbor-export-cost={booking.fee}>−{money(booking.fee)}</dd></div>
      <div><dt>Cước ròng cả chuyến<small>{purchase !== undefined ? 'Sau phí xếp dỡ, tính riêng với giá mua cảng' : 'Sau phí xếp dỡ, chưa tính tiền thuê hoặc chuộc cảng'}</small></dt>
        <dd data-harbor-voyage-net={receipt.carrierNet - booking.fee}>{signedMoney(receipt.carrierNet - booking.fee)}</dd></div>
    </dl>}
    {rent && rent.shortfallAfter > 0 && <p className="harbor-receipt-rent-note" data-harbor-receipt-shortfall={rent.shortfallAfter}>
      Ngay sau khi dỡ hàng, tàu còn thiếu {money(rent.shortfallAfter)} để trả đủ {money(rent.rentDue)} tiền thuê.</p>}
    {!rent && receipt.handlingFee > 0 && <p className="harbor-receipt-rent-note">Tiền thuê khi tàu cập bến được tính riêng.</p>}
  </section>;
}
