import type { AuctionCashOutcome, HarborAuctionChoices } from './harborAuctionChoices.js';

const money = (amount: number) => `$${amount.toLocaleString('vi-VN')}M`;

function WalletRow({ outcome, viewerId, draft, hasCargo }: {
  outcome: AuctionCashOutcome; viewerId: string | null; draft: boolean; hasCargo: boolean;
}) {
  const label = outcome.buyerId === null ? 'Nếu tất cả rút' :
    outcome.buyerId === viewerId ? 'Nếu bạn thắng' : `Nếu ${outcome.buyerName} thắng`;
  return <tr data-auction-outcome={draft ? 'bid' : 'standing'}>
    <th scope="row">{label}
      <small>{outcome.buyerId === null ? 'Cảng còn vô chủ' : money(outcome.price)}</small>
    </th>
    <td data-award-cash={outcome.cashOnAward}>{money(outcome.cashOnAward)}</td>
    {hasCargo && <td data-discharge-cash={outcome.cashAfterDischarge}>{money(outcome.cashAfterDischarge)}</td>}
  </tr>;
}

export function HarborAuctionWallet({ choices, viewerId }: { choices: HarborAuctionChoices; viewerId: string | null }) {
  const { bid, standing, freightCarrierName } = choices;
  const hasCargo = freightCarrierName !== null;
  return <div className="harbor-auction-wallet" data-auction-cash-compare>
    <table>
      <caption>Số dư của bạn</caption>
      <thead><tr><th scope="col">Kết quả</th><th scope="col">Khi chốt phiên</th>
        {hasCargo && <th scope="col">Nếu dỡ hàng</th>}</tr></thead>
      <tbody>
        {bid && <WalletRow outcome={bid} viewerId={viewerId} draft hasCargo={hasCargo} />}
        <WalletRow outcome={standing} viewerId={viewerId} draft={false} hasCargo={hasCargo} />
      </tbody>
    </table>
    <p>{hasCargo && <>Cước chỉ được trả nếu <b>{freightCarrierName}</b> chọn dỡ hàng. </>}Số dư chưa tính thưởng nhiệm vụ.</p>
  </div>;
}
