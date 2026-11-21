import { FREIGHT_TENDER_MAX_BID, FREIGHT_TENDER_MIN_BID, type FreightTender, type GameState } from '@one-monopoly/shared';
import { tenderQuoteTerms } from './tenderQuoteTerms.js';
import './tender-quote-preview.css';

interface Props { state: GameState; playerId: string; tender: FreightTender; amount: number | null }
const number = new Intl.NumberFormat('vi-VN');

export function TenderQuotePreview({ state, playerId, tender, amount }: Props) {
  const terms = tenderQuoteTerms(state, playerId, tender, amount);
  if (!terms) return null;
  if (terms.reason !== undefined) return <p className="tender-quote-unavailable" data-tender-quote-preview>{terms.reason}</p>;

  return <section className="tender-quote-preview" data-tender-quote-preview aria-label="Ước tính cho báo giá đang soạn">
    <div className="tender-quote-route">
      <strong>{terms.origin} → {terms.destination}</strong>
      <span>{terms.service} {terms.aboard ? 'trên tàu' : 'tại bến'} · <span data-tender-distance={terms.distanceNm}>{number.format(terms.distanceNm)} hải lý</span></span>
    </div>
    {terms.bookedElsewhere && <p>Vận đơn đang ghi {terms.bookedElsewhere}. Để giao theo thầu, cần đổi cảng dỡ sang {terms.destination}.</p>}
    <dl className="tender-quote-math">
      <div><dt>Cước cơ bản</dt><dd data-tender-base={terms.base}>${terms.base}M</dd></div>
      <div><dt>Phụ phí đang soạn</dt><dd data-tender-proposed={terms.proposed ?? undefined}>
        {terms.proposed === null ? '—' : `+$${terms.proposed}M`}</dd></div>
      {terms.subtotal != null && <div className="tender-quote-total"><dt>Tạm tính</dt>
        <dd data-tender-subtotal={terms.subtotal}>${terms.subtotal}M</dd></div>}
    </dl>
    {terms.proposed === null
      ? <p>Nhập phụ phí nguyên từ ${FREIGHT_TENDER_MIN_BID}M đến ${FREIGHT_TENDER_MAX_BID}M để tính tổng.</p>
      : <p>Nếu trúng thầu và giao trong vòng {tender.round + 1}. Chưa tính các khoản thưởng khác.</p>}
  </section>;
}
