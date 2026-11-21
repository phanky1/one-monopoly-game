export const FREIGHT_RIVAL_STYLES = ['standard', 'equipment', 'coastal'] as const;
export type FreightRivalStyle = (typeof FREIGHT_RIVAL_STYLES)[number];

export const FREIGHT_RIVALS = {
  standard: {
    name: 'AI Thuyền Phó (Bot)', shortName: 'Thuyền phó', emoji: '🧭',
    description: 'Tìm chuyến cước cao và cạnh tranh hợp đồng.',
  },
  equipment: {
    name: 'Đội vỏ rỗng (Bot)', shortName: 'Đội vỏ rỗng', emoji: '📦',
    description: 'Ưu tiên chuyển vỏ dư đến bến đang thiếu.',
  },
  coastal: {
    name: 'Hãng tàu ven biển (Bot)', shortName: 'Tàu ven biển', emoji: '⚓',
    description: 'Ưu tiên cảng gần và tận dụng chuyến nối để giao thêm lô.',
  },
} as const satisfies Record<FreightRivalStyle, {name: string; shortName: string; emoji: string; description: string}>;

export function isFreightRivalStyle(value: unknown): value is FreightRivalStyle {
  return FREIGHT_RIVAL_STYLES.some(style => style === value);
}
