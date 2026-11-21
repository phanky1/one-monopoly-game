import { useId, useRef, useState } from 'react';
import { Handshake } from 'lucide-react';
import { BOARD_TILES, getHarborExportFee, type GameAction, type GameState, type PendingSlotCharter } from '@one-monopoly/shared';
import { getPortArrivalFreight } from './portInvestment.js';

interface Props {
  state: GameState;
  charter: PendingSlotCharter;
  viewerId: string | null;
  onAction: (action: GameAction, onFailure?: () => void) => void;
}

export function SlotCharterDecision({ state, charter, viewerId, onAction }: Props) {
  const title = useId();
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const owner = state.players.find(player => player.id === charter.ownerId);
  const partner = state.players.find(player => player.id === charter.requesterId);
  if (!owner || !partner) return null;
  const role = viewerId === owner.id ? 'owner' : viewerId === partner.id ? 'partner' : 'observer';
  const thirdCaptain = state.players.some(player => !player.isBankrupt && player.id !== owner.id && player.id !== partner.id);
  const { tileId, originalRent, discountedRent } = charter;
  const partnerShare = Math.floor(originalRent / 2);
  const pickupFee = state.mode === 'harbor' && state.supportsHarborCharterPickup ? getHarborExportFee(state, tileId) : 0;
  const cargo = state.mode === 'harbor' ? getPortArrivalFreight(state, tileId)?.quote : null;
  function answer(accept: boolean) {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    onAction({ type: 'RESPOND_SLOT_CHARTER', accept }, () => {
      sending.current = false;
      setPending(false);
    });
  }
  return <section className="chart-action-panel charter-decision" aria-labelledby={title} data-harbor-charter-decision={role}>
    <h3 id={title} className="chart-action-title"><Handshake size={18} aria-hidden="true" />Chia chỗ tại {BOARD_TILES[tileId].name}</h3>
    <p className="chart-action-copy"><strong>{partner.name}</strong> sở hữu tuyến dịch vụ và đề nghị <strong>{owner.name}</strong> giảm tiền thuê cho lần cập bến này.</p>
    <dl className="charter-rent"><div><dt>Tiền thuê nếu đồng ý</dt><dd data-charter-rent="accept">${discountedRent}M</dd></div>
      <div><dt>Nếu từ chối hoặc hết giờ</dt><dd data-charter-rent="decline">${originalRent}M</dd></div></dl>
    {cargo && <p className="chart-action-copy">Nếu {partner.name} dỡ lô đang chở, tàu nhận <strong>${cargo.carrierNet}M</strong> cước và {owner.name} nhận <strong>${cargo.handlingFee}M</strong> phí bến.</p>}
    <div className="charter-claim">
      <h4>Quyền của {partner.name} sau khi trả tiền thuê đã giảm</h4>
      <p>{thirdCaptain
        ? <>Khi hãng thứ ba ghé bến, quyền được dùng để chia tiền thuê lần đó. Theo mức thuê hiện tại, {partner.name} nhận <b>${partnerShare}M</b>, {owner.name} nhận <b>${originalRent - partnerShare}M</b>.</>
        : <>Chỉ còn hai hãng. Không có hãng thứ ba để chia tiền thuê.</>}</p>
      {pickupFee > 0 && <p>{partner.name} cũng có thể dùng quyền tại bến này để xếp một lô xuất miễn phí, tiết kiệm <b>${pickupFee}M</b>. Dùng quyền xếp hàng sẽ kết thúc thỏa thuận.</p>}
    </div>
    {role === 'owner' ? <div className="chart-action-row">
      <button className="chart-button chart-button-primary" type="button" disabled={pending}
        data-charter-answer="accept" onClick={() => answer(true)}>Đồng ý · ${discountedRent}M</button>
      <button className="chart-button" type="button" disabled={pending}
        data-charter-answer="decline" onClick={() => answer(false)}>Từ chối · ${originalRent}M</button>
    </div> : <p role="status" className="chart-action-copy">Đang chờ chủ cảng <strong>{owner.name}</strong> quyết định.</p>}
  </section>;
}
