# Thiết Kế: Hiệu Ứng Nổi Nhận Biết Trừ / Cộng Tiền Lưu Bãi Tại Ô Cảng (Floating Rent Receipt)

## 1. Mục đích & Bối cảnh (Intent & Context)
- **Vấn đề:** Khi tàu của đối thủ đi vào ô cảng của người chơi khác, tiền cước lưu bãi (`DEMURRAGE_PAID`) hoặc chia cước liên minh (`SLOT_CHARTER_RENT_SPLIT`) bị trừ và cộng âm thầm vào số dư tài khoản. Người chơi không nhận biết được ngay trên bàn cờ rằng ai vừa trả tiền và ai vừa nhận tiền.
- **Giải pháp (Cách A):** Xuất hiện một cụm thẻ nổi (Floating Mini-Card / Rent Receipt Popup) trực tiếp ngay tại ô cảng vừa ghé trong 1.8 giây, hiển thị rõ ràng:
  - Dòng đỏ: Người ghé cảng bị trừ tiền (`[Tên khách]: -$...M 💸`).
  - Dòng xanh: Chủ cảng được nhận tiền (`[Tên chủ cảng]: +$...M 💰`).
  - (Nếu có thỏa thuận Slot Chartering): Thêm dòng xanh cho đối tác liên minh (`[Tên đối tác]: +$...M 🤝`).
  - Animation: Nảy nhẹ xuất hiện, trôi nhẹ lên phía trên và mờ dần trong 1.8 giây (hỗ trợ billboard trong chế độ 3D).

## 2. Dữ liệu & Sự kiện (Events)
Hệ thống lắng nghe qua `subscribeBoard`:
1. `DEMURRAGE_PAID`:
   - `debtorId`: Người trả
   - `creditorId`: Người nhận
   - `tileId`: Ô cảng
   - `amount`: Số tiền
2. `SLOT_CHARTER_RENT_SPLIT`:
   - `visitorId`: Người trả
   - `ownerId`: Chủ cảng nhận
   - `partnerId`: Đối tác nhận
   - `tileId`: Ô cảng
   - `splitAmount`: Tiền đối tác
   - `ownerAmount`: Tiền chủ cảng

## 3. Kiến trúc Client
1. **Quản lý trạng thái hiển thị (`useBoardPlayback.ts`):**
   - Bổ sung state `rentReceipts: Record<number, RentReceipt>` với TTL 1800ms (tương tự `claims` cho `TILE_PURCHASED`).
2. **Component hiển thị (`RentReceiptPopup.tsx` hoặc trong `TileView.tsx`):**
   - Đặt ngay tại ô cảng trong `TileView.tsx` hoặc overlay trên `Board.tsx`.
   - Sử dụng CSS animation với keyframes `tile-rent-float` (translate Y, scale, fade out).
   - Hỗ trợ billboard trong 3D: `transform: is3D ? 'var(--board-billboard)' : undefined`.
