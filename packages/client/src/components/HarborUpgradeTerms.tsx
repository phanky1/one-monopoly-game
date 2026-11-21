import { GREEN_FLEET_ESG_BONUS, OneMonopolyEngine, getHarborExportFee, type GameState } from '@one-monopoly/shared';

export function HarborUpgradeTerms({ state, tileId }: { state: GameState; tileId: number }) {
  if (state.mode !== 'harbor' || state.supportsHarborExportBooking !== true) return null;
  const port = state.properties[tileId];
  if (!port?.ownerId || port.isMortgaged || port.hasGreenFleet) return null;
  const greenUpgrade = port.containerLevel === 5;
  const after = greenUpgrade ? state : {
    ...state,
    properties: { ...state.properties, [tileId]: { ...port, containerLevel: port.containerLevel + 1 } },
  };
  const rent = OneMonopolyEngine.calculateRent(state, tileId, state.dice);
  const nextRent = OneMonopolyEngine.calculateRent(after, tileId, state.dice);
  const fee = getHarborExportFee(after, tileId);

  return <p className="chart-action-copy" data-harbor-upgrade-terms={tileId}>
    {greenUpgrade
      ? <>Huy hiệu xanh miễn thuế carbon và cộng <strong>${GREEN_FLEET_ESG_BONUS}M</strong> điểm ESG. Tiền thuê niêm yết vẫn là <strong>${rent}M</strong>.</>
      : <>Tiền thuê niêm yết tăng từ <strong>${rent}M</strong> lên <strong data-upgrade-rent={nextRent}>${nextRent}M</strong>.</>}
    {' '}{port.containerLevel === 0
      ? <>Từ cấp 1, mỗi khi đối thủ chọn xếp hàng tại đây, bạn thu <strong data-upgrade-export-fee={fee}>${fee}M</strong>.</>
      : <>Bạn vẫn thu <strong data-upgrade-export-fee={fee}>${fee}M</strong> mỗi khi đối thủ chọn xếp hàng tại đây.</>}
  </p>;
}
