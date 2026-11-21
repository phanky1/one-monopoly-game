import type { CargoKind, GameState } from '@one-monopoly/shared';

export interface PortTenderNotice { phase: 'open' | 'assigned'; label: string; detail: string }
const cargoName = (kind: CargoKind) => kind === 'empty' ? 'một container rỗng' : 'một container hàng';

export function getPortTender(state: GameState, tileId: number): PortTenderNotice | null {
  const market = state.logistics?.market;
  if (!market || state.winnerId) return null;
  const { contract, tender } = market;
  if (contract?.status === 'active' && contract.destinationTileId === tileId && contract.deliveryRound === state.turnCount) {
    const captain = state.players.find(player => player.id === contract.playerId);
    return { phase: 'assigned', label: 'Bến giao hợp đồng',
      detail: `Chủ hàng dành chỗ cho ${captain?.name ?? 'đội trúng thầu'} giao ${cargoName(contract.kind)} trong vòng ${contract.deliveryRound}. Thưởng hợp đồng $${contract.amount}M.` };
  }
  if (tender?.round === state.turnCount && tender.destinationTileId === tileId) {
    return { phase: 'open', label: 'Cảng đang mời thầu',
      detail: `Chủ hàng cần ${cargoName(tender.kind)} tại bến này trong vòng ${tender.round + 1}. Gửi giá kín trước khi kết thúc lượt của bạn.` };
  }
  return null;
}
