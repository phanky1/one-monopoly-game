# Kế Hoạch Triển Khai: Hiệu Ứng Nổi Trừ / Cộng Tiền Lưu Bãi Tại Ô Cảng (Floating Rent Receipt)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **LƯU Ý NGHIÊM NGẶT:** TUYỆT ĐỐI KHÔNG CHẠY `git commit` HOẶC `git push` theo yêu cầu của người dùng.

**Goal:** Hiển thị cụm thẻ nổi (Floating Rent Receipt) tại ô cảng vừa ghé khi phát sinh cước lưu bãi (`DEMURRAGE_PAID` hoặc `SLOT_CHARTER_RENT_SPLIT`) với dòng trừ tiền màu đỏ và dòng cộng tiền màu xanh trong 1.8 giây.

**Architecture:** Sử dụng hook `useBoardPlayback.ts` để bắt các event `DEMURRAGE_PAID` và `SLOT_CHARTER_RENT_SPLIT`, duy trì bản ghi `rentReceipts: Record<number, RentReceipt>` với bộ đếm thời gian 1800ms (tương tự cơ chế `claims` cho `TILE_PURCHASED`). Render thẻ nổi trong `TileView.tsx` với hiệu ứng CSS keyframe nổi lên và mờ dần, hỗ trợ xoay billboard trong không gian 3D.

**Tech Stack:** React, TypeScript, CSS Keyframe Animations.

**Spec:** [docs/superpowers/specs/2026-11-19-floating-rent-receipt-design.md](file:///Users/thien.buix/Documents/Games/Monopoly/docs/superpowers/specs/2026-11-19-floating-rent-receipt-design.md)

## Global Constraints
- Chỉ thao tác mã nguồn cục bộ, không commit/push.
- Đảm bảo hiển thị chuẩn ở cả chế độ 2D và 3D Isometric.
- Giữ vững trải nghiệm người dùng với `prefers-reduced-motion`.

## Review Focus
- Event `DEMURRAGE_PAID`: Hiển thị đúng người trả (đỏ `-...M 💸`) và chủ cảng nhận (xanh `+...M 💰`).
- Event `SLOT_CHARTER_RENT_SPLIT`: Hiển thị cả 3 người: khách trả, chủ cảng nhận 50% cước, đối tác liên minh nhận 50% cước.
- Chế độ 3D: Cụm thẻ áp dụng `var(--board-billboard)` để không bị nghiêng bẹp theo mặt phẳng bàn cờ mà luôn hướng về phía camera.
- Tự động dọn dẹp sau 1.8s không gây rò rỉ bộ nhớ hoặc timer kẹt.

---

### Task 1: Mở rộng `useBoardPlayback` để theo dõi biên nhận cước lưu bãi

**Files:**
- Modify: `packages/client/src/components/useBoardPlayback.ts`
- Create / Test: `packages/client/tests/boardPlaybackRent.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface RentLine {
    playerId: string;
    playerName: string;
    amount: number;
    type: 'deduct' | 'credit';
    isPartner?: boolean;
  }
  export interface RentReceipt {
    tileId: number;
    lines: RentLine[];
  }
  ```
  `useBoardPlayback` trả về `{ tracks, claims, rentReceipts, advance }`.

- [ ] **Step 1: Viết test kiểm tra useBoardPlayback trích xuất đúng RentReceipt từ events**
- [ ] **Step 2: Chạy test để xác nhận FAIL**
- [ ] **Step 3: Cập nhật `useBoardPlayback.ts` bắt `DEMURRAGE_PAID` và `SLOT_CHARTER_RENT_SPLIT` với TTL 1800ms**
- [ ] **Step 4: Chạy test để xác nhận PASS**

---

### Task 2: Tạo CSS Animation cho Floating Rent Receipt

**Files:**
- Create: `packages/client/src/components/tile-rent.css`
- Modify: `packages/client/src/components/TileView.tsx`

- [ ] **Step 1: Tạo `tile-rent.css` với keyframe `tile-rent-float`:**
  - Nền giấy hàng hải bo góc viền đổ bóng nổi bật (`box-shadow: 0 4px 14px rgba(0,0,0,0.2)`).
  - Dòng trừ tiền `rent-line-deduct`: màu đỏ hồng ONE (`#b00b60`), icon `💸`.
  - Dòng cộng tiền `rent-line-credit`: màu xanh lá cảng biển (`#1b7a4b`), icon `💰` hoặc `🤝`.
  - Hỗ trợ billboard: `transform: var(--board-billboard) translateZ(40px)`.
- [ ] **Step 2: Import `tile-rent.css` vào `TileView.tsx`**

---

### Task 3: Tích hợp hiển thị RentReceipt vào `TileView.tsx` và `Board.tsx`

**Files:**
- Modify: `packages/client/src/components/Board.tsx`
- Modify: `packages/client/src/components/TileView.tsx`

- [ ] **Step 1: Trong `Board.tsx`, lấy `rentReceipts` từ `useBoardPlayback` và truyền `receipt={rentReceipts[tile.id]}` vào `TileView`**
- [ ] **Step 2: Trong `TileView.tsx`, render cụm thẻ nổi `tile-rent-popup` khi có `receipt`**
- [ ] **Step 3: Đảm bảo hiển thị tên người chơi và số tiền rõ ràng**

---

### Task 4: Kiểm thử, xác minh (Verification) & Build

- [ ] **Step 1: Chạy toàn bộ test suites:**
  - `npm run test:shared`
  - `npm test --workspace=@one-monopoly/client`
- [ ] **Step 2: Chạy build để đảm bảo TypeScript không lỗi:**
  - `npm run build:shared && npm run build:server`
- [ ] **Step 3: Kiểm tra trạng thái Git (`git status`) để đảm bảo không có commit/push nào được tạo**
