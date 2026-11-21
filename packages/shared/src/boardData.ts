import { BoardTile, GameCard, GameState, LoopGroup, SecretMissionCard } from './types.js';

export const AUCTION_INCREMENT = 10;
export const AUCTION_BID_SECONDS = 20;
export const STARTING_BALANCE = 1500;
export const GO_REWARD = 200;
export const HOLD_TILE_INDEX = 8;
export const GO_TO_HOLD_TILE_INDEX = 24;
export const STORM_TUG_FEE = 25;
export const STORM_DRIFT_STEPS = -3;
export const HOLD_FINE_AMOUNT = 50;
export const MAX_HOLD_TURNS = 3;
export const GREEN_FLEET_COST = 150;
export const GREEN_FLEET_ESG_BONUS = 300;

export const LOOP_GROUPS_CONFIG: Record<
  LoopGroup,
  { name: string; color: string; tileIds: number[]; buildCost: number }
> = {
  INTRA_ASIA: {
    name: 'Intra-Asia Route',
    color: '#8D5B4C', // Nâu ấm
    tileIds: [1, 3],
    buildCost: 50,
  },
  MIDDLE_EAST: {
    name: 'Middle East Route',
    color: '#70C1B3', // Xanh biển nhạt
    tileIds: [5, 7],
    buildCost: 50,
  },
  MEDITERRANEAN: {
    name: 'Mediterranean Route',
    color: '#C379B4', // Tím hồng
    tileIds: [9, 11, 12],
    buildCost: 100,
  },
  NORTH_EUROPE: {
    name: 'North Europe Route',
    color: '#F9844A', // Cam sáng
    tileIds: [14, 15],
    buildCost: 100,
  },
  TRANS_PACIFIC_WEST: {
    name: 'Trans-Pacific West',
    color: '#E63946', // Đỏ son
    tileIds: [17, 19],
    buildCost: 150,
  },
  TRANS_PACIFIC_EAST: {
    name: 'Trans-Pacific East',
    color: '#F4A261', // Vàng nghệ
    tileIds: [21, 23],
    buildCost: 150,
  },
  LATIN_AMERICA: {
    name: 'Latin America Route',
    color: '#2A9D8F', // Xanh lá ngọc
    tileIds: [25, 27],
    buildCost: 200,
  },
  GLOBAL_HUB: {
    name: 'Global Flagship Hub',
    color: '#1D3557', // Xanh hải quân
    tileIds: [30, 31],
    buildCost: 200,
  },
};

export function ownsPortGroup(state: GameState, group: LoopGroup, ownerId: string): boolean {
  return LOOP_GROUPS_CONFIG[group].tileIds.every(id => state.properties[id]?.ownerId === ownerId);
}

// 4 Tuyến Dịch Vụ Huyết Mạch của ONE
export const SERVICE_LINES = [4, 13, 20, 28]; // VSS, MD2, FE2, PS3

// 2 Nền Tảng Số Đột Phá của ONE
export const INFRA_TILES = [10, 22]; // ONE QUOTE, ONE Eco Calculator

export const BOARD_TILES: BoardTile[] = [
  // --- GÓC DƯỚI (CHÍNH DIỆN NGƯỜI DÙNG) ---
  {
    id: 0,
    code: 'SGSIN',
    name: 'Singapore Global Hub',
    type: 'GO',
  },
  // --- CẠNH DƯỚI-TRÁI (Tiles 1-7) ---
  {
    id: 1,
    code: 'VNSGN',
    name: 'Cảng Cát Lái (Sài Gòn)',
    type: 'PORT',
    group: 'INTRA_ASIA',
    price: 60,
    rentTiers: [2, 10, 30, 90, 160, 250],
    buildCost: 50,
    mortgageValue: 30,
  },
  {
    id: 2,
    code: 'MARKET-1',
    name: 'Biến Động Thị Trường',
    type: 'MARKET_CARD',
  },
  {
    id: 3,
    code: 'VNVUT',
    name: 'Cảng Cái Mép (Vũng Tàu)',
    type: 'PORT',
    group: 'INTRA_ASIA',
    price: 60,
    rentTiers: [4, 20, 60, 180, 320, 450],
    buildCost: 50,
    mortgageValue: 30,
  },
  {
    id: 4,
    code: 'VSS',
    name: 'Tuyến Vietnam Straits Service (VSS)',
    type: 'SERVICE_LINE',
    price: 200,
    mortgageValue: 100,
  },
  {
    id: 5,
    code: 'THLCH',
    name: 'Cảng Laem Chabang',
    type: 'PORT',
    group: 'MIDDLE_EAST',
    price: 100,
    rentTiers: [6, 30, 90, 270, 400, 550],
    buildCost: 50,
    mortgageValue: 50,
  },
  {
    id: 6,
    code: 'OPS-1',
    name: 'Sự Cố & Vận Hành',
    type: 'OPS_CARD',
  },
  {
    id: 7,
    code: 'AEJEA',
    name: 'Cảng Jebel Ali (Dubai)',
    type: 'PORT',
    group: 'MIDDLE_EAST',
    price: 120,
    rentTiers: [8, 40, 100, 300, 450, 600],
    buildCost: 50,
    mortgageValue: 60,
  },
  // --- GÓC TRÁI (Tile 8) ---
  {
    id: 8,
    code: 'CUSTOMS_HOLD',
    name: 'Khu Neo Chờ Thông Quan',
    type: 'CUSTOMS_HOLD',
  },
  // --- CẠNH TRÊN-TRÁI (Tiles 9-15 - Chứa ESVLC) ---
  {
    id: 9,
    code: 'GRPIR',
    name: 'Cảng Piraeus',
    type: 'PORT',
    group: 'MEDITERRANEAN',
    price: 140,
    rentTiers: [10, 50, 150, 450, 625, 750],
    buildCost: 100,
    mortgageValue: 70,
  },
  {
    id: 10,
    code: 'ONE-QUOTE',
    name: 'Nền Tảng Đặt Cước ONE QUOTE',
    type: 'INFRA',
    price: 150,
    mortgageValue: 75,
  },
  {
    id: 11,
    code: 'ITGOA',
    name: 'Cảng Genoa',
    type: 'PORT',
    group: 'MEDITERRANEAN',
    price: 140,
    rentTiers: [10, 50, 150, 450, 625, 750],
    buildCost: 100,
    mortgageValue: 70,
  },
  {
    id: 12,
    code: 'ESVLC',
    name: 'Cảng Valencia',
    type: 'PORT',
    group: 'MEDITERRANEAN',
    price: 160,
    rentTiers: [12, 60, 180, 500, 700, 900],
    buildCost: 100,
    mortgageValue: 80,
  },
  {
    id: 13,
    code: 'MD2',
    name: 'Tuyến Mediterranean 2 (MD2)',
    type: 'SERVICE_LINE',
    price: 200,
    mortgageValue: 100,
  },
  {
    id: 14,
    code: 'DEHAM',
    name: 'Cảng Hamburg',
    type: 'PORT',
    group: 'NORTH_EUROPE',
    price: 180,
    rentTiers: [14, 70, 200, 550, 750, 950],
    buildCost: 100,
    mortgageValue: 90,
  },
  {
    id: 15,
    code: 'NLRTM',
    name: 'Cảng Rotterdam',
    type: 'PORT',
    group: 'NORTH_EUROPE',
    price: 200,
    rentTiers: [16, 80, 220, 600, 800, 1000],
    buildCost: 100,
    mortgageValue: 100,
  },
  // --- GÓC TRÊN (Tile 16) ---
  {
    id: 16,
    code: 'FREE_ANCHOR',
    name: 'Vùng Neo Đậu Miễn Phí',
    type: 'FREE_ANCHOR',
  },
  // --- CẠNH TRÊN-PHẢI (Tiles 17-23) ---
  {
    id: 17,
    code: 'KRPUS',
    name: 'Cảng Busan',
    type: 'PORT',
    group: 'TRANS_PACIFIC_WEST',
    price: 220,
    rentTiers: [18, 90, 250, 700, 875, 1050],
    buildCost: 150,
    mortgageValue: 110,
  },
  {
    id: 18,
    code: 'OPS-2',
    name: 'Sự Cố & Vận Hành',
    type: 'OPS_CARD',
  },
  {
    id: 19,
    code: 'CNYTN',
    name: 'Cảng Yantian (Thâm Quyến)',
    type: 'PORT',
    group: 'TRANS_PACIFIC_WEST',
    price: 240,
    rentTiers: [20, 100, 300, 750, 925, 1100],
    buildCost: 150,
    mortgageValue: 120,
  },
  {
    id: 20,
    code: 'FE2',
    name: 'Tuyến Far East Europe 2 (FE2)',
    type: 'SERVICE_LINE',
    price: 200,
    mortgageValue: 100,
  },
  {
    id: 21,
    code: 'USOAK',
    name: 'Cảng Oakland',
    type: 'PORT',
    group: 'TRANS_PACIFIC_EAST',
    price: 260,
    rentTiers: [22, 110, 330, 800, 975, 1150],
    buildCost: 150,
    mortgageValue: 130,
  },
  {
    id: 22,
    code: 'ECO-CALC',
    name: 'Nền Tảng ONE Eco Calculator',
    type: 'INFRA',
    price: 150,
    mortgageValue: 75,
  },
  {
    id: 23,
    code: 'USLAX',
    name: 'Cảng Los Angeles',
    type: 'PORT',
    group: 'TRANS_PACIFIC_EAST',
    price: 280,
    rentTiers: [24, 120, 360, 850, 1025, 1200],
    buildCost: 150,
    mortgageValue: 140,
  },
  // --- GÓC PHẢI (Tile 24) ---
  {
    id: 24,
    code: 'GO_TO_HOLD',
    name: 'Lệnh Giữ Tàu Kiểm Hóa',
    type: 'GO_TO_HOLD',
  },
  // --- CẠNH DƯỚI-PHẢI (Tiles 25-31 - Chứa HKHKG) ---
  {
    id: 25,
    code: 'USSAV',
    name: 'Cảng Savannah',
    type: 'PORT',
    group: 'LATIN_AMERICA',
    price: 300,
    rentTiers: [26, 130, 390, 900, 1100, 1275],
    buildCost: 200,
    mortgageValue: 150,
  },
  {
    id: 26,
    code: 'MARKET-2',
    name: 'Biến Động Thị Trường',
    type: 'MARKET_CARD',
  },
  {
    id: 27,
    code: 'BRSSZ',
    name: 'Cảng Santos (Brazil)',
    type: 'PORT',
    group: 'LATIN_AMERICA',
    price: 320,
    rentTiers: [28, 150, 450, 1000, 1200, 1400],
    buildCost: 200,
    mortgageValue: 160,
  },
  {
    id: 28,
    code: 'PS3',
    name: 'Tuyến Pacific South 3 (PS3)',
    type: 'SERVICE_LINE',
    price: 200,
    mortgageValue: 100,
  },
  {
    id: 29,
    code: 'CARBON-TAX',
    name: 'Thuế Carbon & Phạt Phát Thải',
    type: 'TAX',
    taxAmount: 100,
  },
  {
    id: 30,
    code: 'HKHKG',
    name: 'Hong Kong Flagship Hub',
    type: 'PORT',
    group: 'GLOBAL_HUB',
    price: 350,
    rentTiers: [35, 175, 500, 1100, 1300, 1500],
    buildCost: 200,
    mortgageValue: 175,
  },
  {
    id: 31,
    code: 'JPTYO',
    name: 'Tokyo Flagship Hub',
    type: 'PORT',
    group: 'GLOBAL_HUB',
    price: 400,
    rentTiers: [50, 200, 600, 1400, 1700, 2000],
    buildCost: 200,
    mortgageValue: 200,
  },
];

export const GAME_CARDS: GameCard[] = [
  // 10 THẺ BIẾN ĐỘNG THỊ TRƯỜNG (MARKET)
  {
    id: 'MKT-01',
    type: 'MARKET',
    title: 'Giá Cước Tăng Đột Biến (GRI Peak)',
    description: 'Chỉ số cước container toàn cầu tăng kỷ lục. Nhận ngay $200M tiền cước bổ sung.',
    effect: { type: 'CASH', amount: 200 },
  },
  {
    id: 'MKT-02',
    type: 'MARKET',
    title: 'Cổ Tức Cuối Năm Từ ONE Corp',
    description: 'ONE công bố lợi nhuận kinh doanh vượt mục tiêu. Nhận $100M cổ tức.',
    effect: { type: 'CASH', amount: 100 },
  },
  {
    id: 'MKT-03',
    type: 'MARKET',
    title: 'Biến Động Tỷ Giá USD/JPY',
    description: 'Tỷ giá hối đoái có lợi cho hợp đồng thuê tàu. Nhận $50M.',
    effect: { type: 'CASH', amount: 50 },
  },
  {
    id: 'MKT-04',
    type: 'MARKET',
    title: 'Chuyến Tàu Tốc Hành Đi Singapore',
    description: 'Điều động tàu khẩn cấp về Singapore Global Hub. Đi thẳng đến ô xuất phát và nhận $200M.',
    effect: { type: 'MOVE_TO', targetTile: 0 },
  },
  {
    id: 'MKT-05',
    type: 'MARKET',
    title: 'Khảo Sát Tuyến Á - Âu',
    description: 'Di chuyển thẳng đến Cảng Rotterdam (NLRTM - Ô 15). Nếu qua ô xuất phát, nhận $200M.',
    effect: { type: 'MOVE_TO', targetTile: 15 },
  },
  {
    id: 'MKT-06',
    type: 'MARKET',
    title: 'Chi Phí Thu Hồi Vỏ Container Rỗng',
    description: 'Tình trạng thiếu vỏ container tại các cảng nội địa. Nộp $150M chi phí logistics.',
    effect: { type: 'CASH', amount: -150 },
  },
  {
    id: 'MKT-07',
    type: 'MARKET',
    title: 'Quyên Góp Quỹ Hàng Hải Xanh',
    description: 'Đóng góp $50M vào chương trình giảm thải phát xạ Carbon của ONE.',
    effect: { type: 'CASH', amount: -50 },
  },
  {
    id: 'MKT-08',
    type: 'MARKET',
    title: 'Phí Thẩm Định Tiêu Chuẩn Xanh Cảng Biển',
    description: 'Bảo trì hệ thống bến bãi: Nộp $25M cho mỗi Lô Container và $100M cho mỗi Siêu tàu ONE Innovation.',
    effect: { type: 'PAY_PER_CONTAINER', perContainerAmount: 25, perMegaTerminalAmount: 100 },
  },
  {
    id: 'MKT-09',
    type: 'MARKET',
    title: 'Hợp Đồng Hợp Tác Liên Minh THE Alliance',
    description: 'Các đối tác hãng tàu thanh toán phí sử dụng bãi chung. Thu từ mỗi người chơi $50M.',
    effect: { type: 'COLLECT_FROM_PLAYERS', amount: 50 },
  },
  {
    id: 'MKT-10',
    type: 'MARKET',
    title: 'Giấy Chứng Nhận Hải Quan Ưu Tiên (AEO)',
    description: 'Thẻ miễn phí thông quan hải quan. Giữ lại để sử dụng khi bị giữ tàu hoặc bán lại.',
    effect: { type: 'GET_PASS' },
  },

  // 10 THẺ SỰ CỐ & VẬN HÀNH (OPS)
  {
    id: 'OPS-01',
    type: 'OPS',
    title: 'Kênh Đào Suez Ùn Tắc Khẩn Cấp',
    description: 'Hải quân thông báo phong tỏa hải trình. Tàu của bạn phải quay về Vùng Neo Đậu Miễn Phí (Ô 16).',
    effect: { type: 'MOVE_TO', targetTile: 16 },
  },
  {
    id: 'OPS-02',
    type: 'OPS',
    title: 'Bão Biển Bất Ngờ Ngoài Khơi',
    description: `Thuê tàu kéo với giá $${STORM_TUG_FEE}M để giữ nguyên vị trí, hoặc để tàu trôi lùi ${Math.abs(STORM_DRIFT_STEPS)} ô và xử lý ô cập bến.`,
    effect: { type: 'STORM_CHOICE' },
  },
  {
    id: 'OPS-03',
    type: 'OPS',
    title: 'Nghi Vấn Vi Phạm Quy Định Tải Trọng (VGM)',
    description: 'Cơ quan kiểm định cảng yêu cầu giữ tàu. Đi thẳng vào Khu Neo Chờ Thông Quan (Ô 8). Không nhận tiền xuất phát.',
    effect: { type: 'GO_TO_HOLD' },
  },
  {
    id: 'OPS-04',
    type: 'OPS',
    title: 'Thẻ Thông Quan Xanh Đặc Cách (Green Lane)',
    description: 'Được miễn kiểm hóa hải quan. Giữ lại thẻ này để thoát khỏi Khu Neo Đậu bất cứ lúc nào.',
    effect: { type: 'GET_PASS' },
  },
  {
    id: 'OPS-05',
    type: 'OPS',
    title: 'Trợ Cấp Cứu Hộ Hàng Hải',
    description: 'Hoàn thành nhiệm vụ cứu hộ một tàu lai dắt trên biển. Nhận thưởng $100M.',
    effect: { type: 'CASH', amount: 100 },
  },
  {
    id: 'OPS-06',
    type: 'OPS',
    title: 'Chi Phí Đại Tu Động Cơ Siêu Tàu',
    description: 'Bảo dưỡng định kỳ trục chân vịt và hệ thống máy chính. Nộp $100M.',
    effect: { type: 'CASH', amount: -100 },
  },
  {
    id: 'OPS-07',
    type: 'OPS',
    title: 'Đình Công Tại Cảng Bốc Dỡ',
    description: 'Hỗ trợ chi phí lưu kho bãi và bốc xếp ngoài giờ cho công nhân: Trả cho mỗi người chơi $50M.',
    effect: { type: 'PAY_PLAYERS', amount: 50 },
  },
  {
    id: 'OPS-08',
    type: 'OPS',
    title: 'Nâng Cấp Hệ Thống Cẩu Bờ Cảng Biển',
    description: 'Bảo dưỡng định kỳ: Nộp $40M cho mỗi Lô Container và $115M cho mỗi Siêu tàu ONE Innovation bạn sở hữu.',
    effect: { type: 'PAY_PER_CONTAINER', perContainerAmount: 40, perMegaTerminalAmount: 115 },
  },
  {
    id: 'OPS-09',
    type: 'OPS',
    title: 'Bảo Hiểm Hàng Hải Bồi Thường Rủi Ro',
    description: 'Công ty bảo hiểm bồi thường thiệt hại hỏng hóc container hàng lạnh. Nhận $150M.',
    effect: { type: 'CASH', amount: 150 },
  },
  {
    id: 'OPS-10',
    type: 'OPS',
    title: 'Thưởng Dịch Vụ Vận Chuyển Đúng Giờ (On-Time Delivery)',
    description: 'Chỉ số KPI vận hành quý đạt hạng 1 thế giới. Nhận thưởng $50M.',
    effect: { type: 'CASH', amount: 50 },
  },
];

// Thẻ Hợp Đồng Chiến Lược Premier Alliance (Secret Mission Cards)
export const SECRET_MISSIONS: SecretMissionCard[] = [
  {
    id: 'MISSION-1',
    title: 'Hợp Đồng 1: Cầu Nối Việt Nam – Mỹ',
    description: 'Sở hữu đồng thời Cảng Cái Mép (VNVUT), Cảng Los Angeles (USLAX) và Tuyến PS3.',
    reward: 400,
    isCompleted: false,
  },
  {
    id: 'MISSION-2',
    title: 'Hợp Đồng 2: Di Sản Nhật – Hàn',
    description: 'Sở hữu Tokyo Flagship Hub (JPTYO), Cảng Busan (KRPUS) và 1 Siêu tàu ONE Innovation (Mức 5).',
    reward: 500,
    isCompleted: false,
  },
  {
    id: 'MISSION-3',
    title: 'Hợp Đồng 3: Tiên Phong Số & Xanh',
    description: 'Sở hữu cả ONE QUOTE, ONE Eco Calculator và có ít nhất 1 Huy hiệu Tàu Nhiên Liệu Xanh.',
    reward: 350,
    isCompleted: false,
  },
  {
    id: 'MISSION-4',
    title: 'Hợp Đồng 4: Vua Tuyến Dịch Vụ Huyết Mạch',
    description: 'Sở hữu ít nhất 3 trong 4 Tuyến Dịch Vụ Toàn Cầu (VSS, MD2, FE2, PS3).',
    reward: 450,
    isCompleted: false,
  },
  {
    id: 'MISSION-5',
    title: 'Hợp Đồng 5: Trục Vận Tải Châu Á Thần Tốc',
    description: 'Sở hữu trọn bộ Tuyến Intra-Asia (Cát Lái, Cái Mép) và Tuyến VSS.',
    reward: 350,
    isCompleted: false,
  },
];
