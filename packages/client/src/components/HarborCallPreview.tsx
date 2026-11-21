import { useId } from 'react';
import { BOARD_TILES, type GameState } from '@one-monopoly/shared';
import { getHarborCallEstimate } from './harborCallEstimate.js';
import { portGuide } from './ports/portGuide.js';
import './harbor-call-preview.css';

const number = new Intl.NumberFormat('vi-VN');
const money = (amount: number) => `$${number.format(amount)}M`;
const signed = (amount: number) => (amount < 0 ? '−' : amount > 0 ? '+' : '') + money(Math.abs(amount));
const portName = (id: number) => portGuide[BOARD_TILES[id].code]?.name ?? BOARD_TILES[id].name;

interface Props {
  state: GameState;
  tileId: number;
  viewerId: string | null;
}

export function HarborCallPreview({ state, tileId, viewerId }: Props) {
  const title = useId();
  const estimate = getHarborCallEstimate(state, tileId, viewerId);
  if (!estimate) return null;

  const open = estimate.kind === 'open' ? estimate : null;
  const loading = estimate.loadTerms;
  const now = open?.currentDischarge;
  return <section className="harbor-call-preview" data-harbor-call-preview={estimate.kind}
    data-call-tile={tileId} data-call-origin={estimate.originTileId} data-call-prospective={loading ? true : undefined}
    aria-labelledby={title}>
    <h4 id={title}>{loading ? `Nếu xếp hàng tại ${portName(loading.originTileId)}` : 'Dự tính cho lô hàng của bạn'}</h4>
    {open ? <>
      <p className="harbor-call-route">
        <strong>{portName(estimate.originTileId)} → {portName(tileId)}</strong>
        <span>{number.format(open.quote.distanceNm)} hải lý</span>
      </p>
      {loading && <div className="harbor-call-choices">
        <p>Thay đổi số dư cả chuyến</p>
        <dl aria-label="Thay đổi số dư theo cách chở hàng">
          <div><dt>Đi tàu rỗng</dt><dd data-call-empty-total={-open.rent}>{signed(-open.rent)}</dd></div>
          <div><dt>Xếp và dỡ hàng</dt>
            <dd data-call-laden-total={open.portIncome - loading.fee}>{signed(open.portIncome - loading.fee)}</dd></div>
        </dl>
      </div>}
      <dl className="harbor-call-figures">
        <div><dt>Cước gộp</dt><dd data-call-gross={open.quote.gross}>{money(open.quote.gross)}</dd></div>
        <div><dt>Phí bến{open.quote.operatorName && <> · {open.quote.operatorName} ({open.quote.feePercent}%)</>}</dt>
          <dd data-call-fee={open.quote.handlingFee}>{signed(-open.quote.handlingFee)}</dd></div>
        <div><dt>{loading ? 'Cước nhận khi dỡ' : 'Cước tàu thực nhận'}</dt>
          <dd data-call-net={open.quote.carrierNet}>{money(open.quote.carrierNet)}</dd></div>
        <div><dt>Tiền thuê khi bạn ghé bến</dt><dd data-call-rent={open.rent}>{signed(-open.rent)}</dd></div>
        <div className={loading ? undefined : 'harbor-call-total'}><dt>{loading ? 'Thay đổi số dư tại bến dỡ' : 'Sau cước và tiền thuê'}</dt>
          <dd data-call-income={open.portIncome}>{signed(open.portIncome)}</dd></div>
        {loading && <>
          <div><dt>Phí xếp tại {portName(loading.originTileId)}</dt>
            <dd data-call-load-fee={loading.fee}>{signed(-loading.fee)}</dd></div>
          <div className="harbor-call-total"><dt>Chênh lệch so với đi tàu rỗng</dt>
            <dd data-call-extra-income={open.quote.carrierNet - loading.fee}>{signed(open.quote.carrierNet - loading.fee)}</dd></div>
        </>}
      </dl>
      {loading && <p className="harbor-call-note">Hai phương án giả sử đã trả đủ tiền thuê theo mức hiện tại. Giá mua cảng, thưởng qua Singapore và thu chi dọc đường tính riêng.</p>}
      {open.ownership === 'unowned' && <p className="harbor-call-note">
        Dự tính khi bến còn vô chủ hoặc bạn mua được bến. Nếu đối thủ thắng đấu giá, họ sẽ nhận một phần cước.{!loading && ' Giá mua cảng tính riêng.'}
      </p>}
      {!loading && open.ownership === 'go' && <p className="harbor-call-note">Tiền thưởng qua Singapore được tính riêng.</p>}
      {open.charterRent !== null && <p className="harbor-call-note" data-call-charter={open.charterRent}>
        Nếu chủ cảng đồng ý chia chỗ, tiền thuê còn {money(open.charterRent)} và số tiền ròng tại bến là {signed(open.quote.carrierNet - open.charterRent)}.
      </p>}
      {now && <div className="harbor-call-now" data-call-now={now.tileId}>
        <p>Dỡ ngay tại <strong>{portName(now.tileId)}</strong><b data-call-now-net={now.carrierNet}>{signed(now.carrierNet)}</b></p>
        <small>Tiền thuê khi cập bến hiện tại (nếu có) đã được tính.</small>
      </div>}
    </> : <p className="harbor-call-note">{estimate.kind === 'origin'
      ? `Container của bạn được xếp tại ${portName(estimate.originTileId)}. Cần ghé một cảng khác đang hoạt động để dỡ hàng.`
      : state.properties[tileId]?.ownerId === viewerId
        ? 'Bến của bạn đang thế chấp. Khi ghé, bạn có thể chọn “Chuộc cảng và dỡ hàng” nếu cước hàng cộng tiền mặt đủ trả ngân hàng.'
        : 'Bến đang thế chấp và tạm dừng xếp dỡ. Bạn có thể dỡ container ở một bến khác đang hoạt động.'}</p>}
  </section>;
}
