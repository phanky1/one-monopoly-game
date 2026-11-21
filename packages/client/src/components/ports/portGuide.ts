import { PORT_COORDINATES } from '@one-monopoly/shared';

export interface PortGuide {
  code: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  fact: string;
}

export interface PortArrival {
  id: number;
  playerId?: string;
  playerName?: string;
  paidRent?: number;
  port: PortGuide;
  origin?: PortGuide;
}

// Coordinates mark a representative waterfront for each playable port, in decimal degrees.
function port(code: string, name: string, country: string, fact: string): PortGuide {
  return { code, name, country, ...PORT_COORDINATES[code], fact };
}

const harbors = [
  port('SGSIN', 'Singapore', 'Singapore', 'Eo biển Singapore nối eo biển Malacca với Biển Đông, trên tuyến tàu giữa Ấn Độ Dương và Thái Bình Dương.'),
  port('VNSGN', 'Cát Lái', 'Việt Nam', 'Cát Lái nằm bên sông Đồng Nai. Các sà lan đưa container từ nhiều bến sông đến cảng.'),
  port('VNVUT', 'Cái Mép', 'Việt Nam', 'Cụm cảng nước sâu Cái Mép – Thị Vải đón tàu container lớn đi thẳng từ Việt Nam sang các châu lục khác.'),
  port('THLCH', 'Laem Chabang', 'Thái Lan', 'Laem Chabang nằm bên vịnh Thái Lan. Ô tô xuất khẩu có thể chạy thẳng lên tàu qua cầu dẫn.'),
  port('AEJEA', 'Jebel Ali', 'Các Tiểu vương quốc Ả Rập Thống nhất', 'Jebel Ali là cảng nhân tạo ở phía tây nam Dubai, bên bờ vịnh Ba Tư.'),
  port('GRPIR', 'Piraeus', 'Hy Lạp', 'Piraeus là cửa ngõ đường biển của Athens. Từ đây, phà đưa hành khách đến nhiều đảo trên biển Aegea.'),
  port('ITGOA', 'Genoa', 'Ý', 'Ngọn hải đăng Lanterna đánh dấu lối vào cảng Genoa trên bờ biển Liguria.'),
  port('ESVLC', 'Valencia', 'Tây Ban Nha', 'Valencia nhìn ra Địa Trung Hải. Bến du thuyền nằm cạnh khu cảng thương mại của thành phố.'),
  port('DEHAM', 'Hamburg', 'Đức', 'Hamburg nằm sâu trong đất liền. Tàu biển đi theo sông Elbe để đến thành phố từ Biển Bắc.'),
  port('NLRTM', 'Rotterdam', 'Hà Lan', 'Rotterdam nằm ở vùng châu thổ Rhine – Meuse, nơi hàng hóa chuyển từ tàu biển sang sà lan đi sâu vào châu Âu.'),
  port('KRPUS', 'Busan', 'Hàn Quốc', 'Busan nằm ở góc đông nam bán đảo Triều Tiên, bên eo biển ngăn cách Hàn Quốc với Nhật Bản.'),
  port('CNYTN', 'Yantian', 'Trung Quốc', 'Yantian là cảng nước sâu ở phía đông Thâm Quyến, bên vịnh Đại Bằng và dưới chân những sườn núi ven biển.'),
  port('USOAK', 'Oakland', 'Hoa Kỳ', 'Oakland nằm ở bờ đông vịnh San Francisco. Tàu đi dưới cầu Cổng Vàng để ra Thái Bình Dương.'),
  port('USLAX', 'Los Angeles', 'Hoa Kỳ', 'Cảng nằm ở vịnh San Pedro. Hải đăng Angels Gate ở cuối đê chắn sóng dẫn tàu vào cảng.'),
  port('USSAV', 'Savannah', 'Hoa Kỳ', 'Các bến cảng Savannah nằm dọc dòng sông cùng tên. Tàu xuôi sông để ra Đại Tây Dương.'),
  port('BRSSZ', 'Santos', 'Brazil', 'Santos nằm trên bờ Đại Tây Dương. Cảng từng là cửa ngõ xuất khẩu cà phê từ vùng trồng trọt của São Paulo.'),
  port('HKHKG', 'Hồng Kông', 'Trung Quốc', 'Các bến container Kwai Tsing nằm ở phía tây cảng Victoria, trên đường ra Biển Đông.'),
  port('JPTYO', 'Tokyo', 'Nhật Bản', 'Cảng Tokyo nằm ở đầu phía bắc vịnh Tokyo. Tàu xuôi vịnh rồi đi qua thủy đạo Uraga để ra Thái Bình Dương.'),
];

export const portGuide: Readonly<Record<string, PortGuide>> = Object.fromEntries(harbors.map(entry => [entry.code, entry]));
