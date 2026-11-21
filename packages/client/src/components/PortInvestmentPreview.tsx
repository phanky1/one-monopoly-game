import { useId } from 'react';
import type { GameState } from '@one-monopoly/shared';
import { getPortInvestment } from './portInvestment.js';
import './port-investment-preview.css';

interface Props { state: GameState; tileId: number; buyerId: string | null; scenario: 'purchase' | 'auction' }
const number = new Intl.NumberFormat('vi-VN');
const money = (amount: number) => `$${number.format(amount)}M`;

export function PortInvestmentPreview({ state, tileId, buyerId, scenario }: Props) {
  const heading = useId();
  const terms = getPortInvestment(state, tileId, buyerId);
  if (!terms) return null;

  const { arrival } = terms;
  const ownCargo = arrival?.quote.playerId === buyerId;
  const captain = state.players[state.activePlayerIndex];
  const visit = captain && state.harborFreight?.visits[captain.id];
  const emptyHere = captain?.id === buyerId && captain.position === tileId && !captain.inHold &&
    state.harborFreight?.manifests[captain.id] === null;
  return <section className="port-investment-preview" data-port-investment={scenario} aria-labelledby={heading}>
    <header>
      <h4 id={heading}>{scenario === 'auction' ? 'Nếu bạn thắng đấu giá' : 'Nếu bạn mua cảng này'}</h4>
      <p className="port-investment-group" data-investment-group={`${terms.ownedAfter}/${terms.groupSize}`}>
        {terms.groupName} <b>{terms.ownedAfter}/{terms.groupSize} cảng</b>
      </p>
    </header>
    <dl className="port-investment-rates">
      <div><dt>Tiền thuê từ lần ghé sau của đối thủ</dt><dd data-investment-rent={terms.rent}>{money(terms.rent)}</dd></div>
      <div><dt>Phần cước khi đối thủ dỡ hàng</dt><dd data-investment-share={terms.feePercent}>{terms.feePercent}%</dd></div>
    </dl>
    {scenario === 'auction' && <p className="port-investment-landing">Tiền thuê của lần cập bến mở đấu giá là $0M.</p>}
    {emptyHere && <p className="port-investment-arrival" data-investment-load={visit?.tileId === tileId && !visit.handled ? 'this-visit' : 'future'}>
      {visit?.tileId === tileId && !visit.handled
        ? 'Khoang bạn đang trống. Nếu sở hữu cảng, bạn có thể chọn “Xếp 1 container” ngay trong lần ghé này.'
        : 'Ở lần ghé sau, bạn có thể xếp hàng xuất tại cảng của mình khi khoang trống.'}
    </p>}
    {arrival && <p className="port-investment-arrival" data-investment-arrival={ownCargo ? 'own' : 'rival'}>
      {ownCargo
        ? <>Nếu bạn dỡ lô hàng đang chở tại đây, bạn giữ trọn <b data-investment-carrier-net={arrival.quote.carrierNet}>{money(arrival.quote.carrierNet)}</b> tiền cước.</>
        : <>Nếu {arrival.carrierName} dỡ lô hàng đang chở tại đây, tàu nhận <b data-investment-carrier-net={arrival.quote.carrierNet}>{money(arrival.quote.carrierNet)}</b> và bến của bạn nhận <b data-investment-handling-fee={arrival.quote.handlingFee}>{money(arrival.quote.handlingFee)}</b>.</>}
    </p>}
  </section>;
}
