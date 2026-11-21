# Thiết Kế: Cơ Chế Xây Dựng Container Khi Tàu Cập Cảng (Phương Án 3)

## 1. Mục đích & Lý do (Intent & Why)
- **Vấn đề:** ONE Monopoly không có cơ chế giao dịch (Trade) tài sản giữa các người chơi. Việc yêu cầu sở hữu trọn bộ cảng cùng màu (`LoopGroup`) mới cho phép xây dựng Container khiến hầu hết các tuyến cảng bị kẹt ở mức cước cơ bản suốt ván đấu, đồng thời làm tê liệt các cơ chế phụ thuộc vào cấp độ Container như **Slot Chartering ("As ONE, We Can")**, **Siêu tàu ONE Innovation (Cấp 5)**, **Tàu Nhiên Liệu Xanh** và **Nhiệm vụ bí mật**.
- **Giải pháp:** Bỏ điều kiện phải gom đủ bộ màu và quy tắc xây đều; thay bằng điều kiện **chỉ được nâng cấp khi tàu của người chơi đang đậu ngay tại chính cảng đó**.

## 2. Phạm vi công việc (Size)
Đây là một **thay đổi nhỏ (Small Change)** tác động tới logic kiểm tra điều kiện xây/bán/thế chấp trong `packages/shared`, giao diện điều khiển trong `packages/client`, bộ unit test và tài liệu luật chơi.

## 3. Các phương án đã cân nhắc (Approaches)
1. **Phương án 1 (Giới hạn cấp theo bộ màu):** Xây từ xa ngay khi sở hữu cảng nhưng giới hạn ở cấp 2–3; đủ bộ màu mới mở khóa cấp 4–5. *(Bỏ qua vì vẫn khó lên được Siêu tàu Cấp 5 và Tàu Xanh).*
2. **Phương án 2 (Tự do hoàn toàn từ xa):** Sở hữu cảng nào được nâng cấp từ xa lên thẳng cấp 5 bất cứ lúc nào. *(Bỏ qua vì người chơi có thể dồn tiền nâng tối đa 1 cảng đắt tiền từ quá sớm mà không cần di chuyển tới đó).*
3. **Phương án 3 (Đã chọn – Xây khi tàu cập cảng của mình):** Không cần đủ bộ màu, nhưng tàu phải đang đứng tại ô cảng đó mới được nâng cấp Container / Siêu tàu / Tàu Xanh. *(Cân bằng tốt nhất giữa việc mở khóa tính năng và kiểm soát nhịp độ nâng cấp theo bước di chuyển trên bàn cờ).*

## 4. Chi tiết thiết kế & Các quyết định đề xuất (Design & Builder Calls)

### Quy tắc cốt lõi (Theo lựa chọn của người dùng)
- **Bỏ điều kiện gom đủ bộ màu khi xây dựng:** Người chơi chỉ cần sở hữu cảng (`prop.ownerId === player.id`) và cảng không bị thế chấp (`!prop.isMortgaged`).
- **Điều kiện vị trí tàu:** Người chơi chỉ được thực hiện `BUILD_CONTAINER` (và `UPGRADE_GREEN_FLEET`) tại `tileId` khi tàu của họ đang đứng ngay tại ô đó (`player.position === tileId`).
- **Bỏ quy tắc xây đều (Even Building Rule):** Cảng nào tàu đang đậu thì được nâng cấp trực tiếp cho cảng đó (từ cấp 0 lên đến tối đa cấp 5 - Siêu tàu ONE Innovation).

### Các quyết định chi tiết do hệ thống đề xuất (Builder's Calls)
1. **Được phép xây ngay trong lượt vừa mua cảng hoặc khi ghé lại cảng (Miễn là đủ tiền):**
   - *Đề xuất:* Khi đáp vào cảng trống và bấm `BUY_PROPERTY` (hoặc đáp vào cảng đã mua từ trước), tàu đang đứng tại `player.position === tileId` ở pha `END_OF_TURN`. Người chơi có thể nâng cấp 1 hoặc nhiều cấp Container liên tiếp tại cảng đó ngay trước khi bấm Kết thúc lượt, miễn là số dư (`balance`) còn đủ.
   - *Lý do:* Tránh việc mua xong một cảng lại phải đợi đi hết cả vòng bàn cờ 32 ô mới được đặt lô container đầu tiên để kích hoạt Slot Chartering.
2. **Bán Container (`SELL_CONTAINER`) và Thế chấp (`MORTGAGE_TILE`) từ xa để xoay tiền trả nợ:**
   - *Đề xuất:* Việc **bán container** và **thế chấp cảng** KHÔNG yêu cầu tàu phải đứng tại cảng đó, và KHÔNG áp dụng quy tắc bán đều theo nhóm màu. Một cảng có thể được thế chấp ngay khi chính cảng đó có `containerLevel === 0` (không bắt các cảng khác cùng nhóm màu phải về 0 container).
   - *Lý do:* Khi người chơi mắc nợ ở một ô khác trên bàn cờ (`AWAITING_DEBT_RESOLUTION`), họ bắt buộc phải bán được container và thế chấp cảng từ xa thì mới xoay được tiền thanh toán nợ.
3. **Nút nâng cấp nhanh trên thanh hành động (`ActionControls.tsx`):**
   - *Đề xuất:* Ở pha `END_OF_TURN`, nếu tàu của người chơi đang đứng tại chính cảng của mình và đủ điều kiện nâng cấp (`BUILD_CONTAINER` hoặc `UPGRADE_GREEN_FLEET`), hiển thị nút nâng cấp nhanh ngay trên bảng điều khiển lượt (bên trên nút "KẾT THÚC LƯỢT"), song song với nút trong `PropertyModal.tsx`.
   - *Lý do:* Giúp người chơi nhận biết ngay cơ hội nâng cấp khi tàu cập cảng mà không cần phải bấm mở popup chi tiết ô đất.
4. **Giữ nguyên thưởng Bộ Màu (Monopoly Bonus):**
   - *Đề xuất:* Khi người chơi sở hữu trọn bộ cảng cùng nhóm màu, tiền cước đất trống (cấp 0) vẫn được nhân đôi (`x2`) như hiện tại.

## 5. Các tệp sẽ cập nhật (Files Touched)
- `packages/shared/src/gameEngine.ts`: Cập nhật `handleBuildContainer`, `handleUpgradeGreenFleet`, `handleSellContainer`, `handleMortgageTile`.
- `packages/client/src/components/PropertyModal.tsx`: Cập nhật điều kiện `canBuild`, `canSell`, `canUpgradeGreen`, `canMortgage` và chú thích trạng thái khi tàu không đứng tại cảng.
- `packages/client/src/components/ActionControls.tsx`: Thêm nút nâng cấp nhanh Container / Siêu tàu / Tàu Xanh khi tàu đang đậu tại cảng của mình ở pha `END_OF_TURN`.
- `packages/shared/tests/gameEngine.test.ts`: Cập nhật và bổ sung unit tests cho cơ chế xây dựng khi tàu cập cảng.
- `docs/LUAT_CHOI_ONE_MONOPOLY.md` & `docs/GAME_SPECIFICATION.md`: Đồng bộ tài liệu luật chơi.
