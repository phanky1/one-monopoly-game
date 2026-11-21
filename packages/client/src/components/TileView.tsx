import React from 'react';
import { BoardTile, LOOP_GROUPS_CONFIG, Player, type PortStock, PropertyState } from '@one-monopoly/shared';
import { TOKEN_CONFIG } from './TokenBadge.js';
import { PortMiniature } from './ports/PortMiniature.js';
import { portGuide } from './ports/portGuide.js';
import type { PortTenderNotice } from './ports/portTender.js';
import { Anchor, ArrowUpRight, Boxes, Check, Coins, FileText, Flag, Handshake, Leaf, Compass, LifeBuoy, Navigation, RadioTower, Sailboat, Ship, Siren, Stamp, Waves, Wind } from 'lucide-react';
import type { RentReceipt, TileClaim } from './useBoardPlayback.js';
import './tile-claim.css';
import './tile-rent.css';
import './tile-mission.css';
import './tile-weather.css';
import './ports/port-layout.css';
import './logistics-board.css';
import './truck-appointments.css';

const tileSymbols: Partial<Record<BoardTile['type'], typeof Anchor>> = {
  GO: ArrowUpRight,
  CUSTOMS_HOLD: Stamp,
  FREE_ANCHOR: Anchor,
  GO_TO_HOLD: Siren,
  MARKET_CARD: FileText,
  OPS_CARD: Boxes,
  SERVICE_LINE: Ship,
  INFRA: RadioTower,
  TAX: Coins,
};

function TileWeather({ id }: { id: number }) {
  return (
    <span className="tile-weather-surface" aria-hidden="true"
      data-shower={id % 4 === 1 || undefined}
      data-ripple={id % 8 === 1 || undefined}
      style={{
        '--wet-x': `${12 + (id * 31) % 74}%`,
        '--rain-delay': `-${(id * 137) % 1600}ms`,
      } as React.CSSProperties}
    />
  );
}

const seamarks = [Compass, Wind, Waves, LifeBuoy, Navigation, Anchor, Sailboat];

interface LogisticsTileProps {
  tile: BoardTile;
  stock?: PortStock;
  tender: PortTenderNotice | null;
  heldTrucks?: number;
  placement: React.CSSProperties;
  is3D: boolean;
  onClick: () => void;
}

export function LogisticsTile({ tile, stock, tender, heldTrucks = 0, placement, is3D, onClick }: LogisticsTileProps) {
  const port = portGuide[tile.code];
  if (!port) {
    const Mark = seamarks[tile.id % seamarks.length];
    return (
      <div className="board-tile logistics-seamark" style={placement} data-seamark={tile.id} aria-hidden="true">
        <TileWeather id={tile.id} />
        <Mark strokeWidth={1.4} />
      </div>
    );
  }
  const holdsLabel = heldTrucks ? `${heldTrucks} xe nhận hàng đã được giữ chỗ.` : '';
  return (
    <button type="button" className="board-tile logistics-port" style={placement} data-port-tile={tile.code}
      data-terminal-tile={tile.id} data-port-tender={tender?.phase} data-port-truck-hold={heldTrucks || undefined} aria-haspopup="dialog" onClick={onClick}
      aria-label={`Xem cảng ${port.name}. ${tender ? tender.label + '. ' : ''}${stock ? `${stock.supply} xe chở hàng xuất, ${stock.demand} xe chờ hàng nhập, ${stock.empties} vỏ rỗng.` : ''} ${holdsLabel}`.trim()}>
      <TileWeather id={tile.id} />
      <PortMiniature code={tile.code} variant="tile" is3D={is3D} />
      {heldTrucks > 0 && <span className="terminal-truck-marker" data-held-truck-marker title={holdsLabel} aria-hidden="true">
        <svg viewBox="0 0 18 15" focusable="false">
          <path d="M1 8h8.6V4h3.5l3.4 3.7v3.2H1z" fill="currentColor" />
          <path d="M11 5.3h1.6l1.8 2h-3.4z" fill="#2e6565" />
          <g fill="currentColor" stroke="#2e6565" strokeWidth=".9"><circle cx="4.2" cy="11.9" r="2" /><circle cx="13.6" cy="11.9" r="2" /></g>
          <path d="m2.4 3.9 1.8 1.8L7.7 2" fill="none" stroke="#f8d778" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>}
      {tender && <span className="port-tender-flag" title={tender.label} aria-hidden="true">
        {tender.phase === 'open' ? <Flag /> : <Check />}
      </span>}
      <strong className="logistics-code">{tile.code}</strong>
      {stock && (
        <span className="logistics-stock" aria-hidden="true">
          <span className="stock-out" title="Xe chở hàng xuất">↑{stock.supply}</span>
          <span className="stock-in" title="Xe chờ hàng nhập">↓{stock.demand}</span>
          <span className="stock-empty" title="Vỏ rỗng tại bãi">□{stock.empties}</span>
        </span>
      )}
    </button>
  );
}

interface Props {
  tile: BoardTile;
  property?: PropertyState;
  owner?: Player;
  claim?: TileClaim;
  auctioned?: boolean;
  missionTarget?: boolean;
  receipt?: RentReceipt;
  playersOnTile?: Player[];
  currentRent?: number;
  onClick?: () => void;
  orientation: 'bottom' | 'left' | 'top' | 'right' | 'corner';
  is3D?: boolean;
  movingPlayerIds?: Set<string>;
  myPlayerId?: string | null;
}

export const TileView: React.FC<Props> = ({
  tile,
  property,
  owner,
  claim,
  auctioned,
  missionTarget,
  receipt,
  playersOnTile,
  currentRent,
  onClick,
  orientation,
  is3D = false,
  movingPlayerIds,
  myPlayerId,
}) => {
  const groupConfig = tile.group ? LOOP_GROUPS_CONFIG[tile.group] : null;
  const isCorner = orientation === 'corner';
  const isPort = tile.type === 'PORT' || tile.type === 'GO';
  const isFreshClaim = owner && claim?.tileId === tile.id && claim.playerId === owner.id;
  const TileSymbol = tileSymbols[tile.type] ?? Waves;

  // Format Container & ONE Innovation badge
  const renderContainers = () => {
    if (!property || property.containerLevel <= 0) return null;

    if (property.containerLevel === 5) {
      return (
        <span className="flex items-center gap-0.5 bg-gradient-to-r from-pink-600 to-[#E1007A] text-white px-1 py-0.2 rounded text-[7px] font-black shadow-xs whitespace-nowrap">
          <span>🛳️</span>
          <span>24K</span>
          {property.hasGreenFleet && <span className="text-emerald-300">🌱</span>}
        </span>
      );
    }

    return (
      <span className="flex items-center gap-0.5">
        {Array.from({ length: property.containerLevel }).map((_, i) => (
          <span
            key={i}
            className="w-2.5 h-1.5 rounded-[1px] bg-[#E1007A] border border-white"
            title={`Lô Container ${i + 1}`}
          />
        ))}
      </span>
    );
  };

  // Hiển thị CƯỚC (khi đã mua) hoặc GIÁ (chưa mua)
  const renderPriceOrRent = () => {
    if (tile.type === 'GO') {
      return <span className="text-emerald-600 font-black text-[9px] sm:text-[10px] leading-none whitespace-nowrap">+$200M</span>;
    }
    if (tile.type === 'TAX') {
      return <span className="text-red-600 font-black text-[9px] sm:text-[10px] leading-none whitespace-nowrap">-${tile.taxAmount}M</span>;
    }
    if (tile.type === 'CUSTOMS_HOLD') {
      return <span className="text-amber-700 font-black text-[8px] sm:text-[9px] leading-none whitespace-nowrap">KIỂM HÓA</span>;
    }
    if (tile.type === 'FREE_ANCHOR') {
      return <span className="text-teal-700 font-black text-[8px] sm:text-[9px] leading-none whitespace-nowrap">NEO ĐẬU</span>;
    }
    if (tile.type === 'GO_TO_HOLD') {
      return <span className="text-red-700 font-black text-[8px] sm:text-[9px] leading-none whitespace-nowrap">VÀO HOLD</span>;
    }
    if (tile.type === 'MARKET_CARD') {
      return <span className="text-pink-600 font-black text-[8px] sm:text-[9px] leading-none whitespace-nowrap">THỊ TRƯỜNG</span>;
    }
    if (tile.type === 'OPS_CARD') {
      return <span className="text-amber-600 font-black text-[8px] sm:text-[9px] leading-none whitespace-nowrap">VẬN HÀNH</span>;
    }

    if (owner) {
      if (property?.isMortgaged) {
        return <span className="text-gray-400 font-black text-[8px] sm:text-[9px] leading-none whitespace-nowrap">CẦM CỐ</span>;
      }
      return (
        <span className="font-black text-[9px] sm:text-[10px] text-[#E1007A] leading-none whitespace-nowrap">
          ${currentRent}M
        </span>
      );
    }

    return (
      <span className="font-black text-[9px] sm:text-[10px] text-gray-700 leading-none whitespace-nowrap">
        ${tile.price}M
      </span>
    );
  };

  // Rút gọn mã ô hiển thị
  const getDisplayCode = () => {
    if (tile.code === 'CUSTOMS_HOLD') return 'HOLD';
    if (tile.code === 'FREE_ANCHOR') return 'ANCHOR';
    if (tile.code === 'GO_TO_HOLD') return 'TO HOLD';
    if (tile.code.startsWith('MARKET')) return 'MKT';
    if (tile.code.startsWith('OPS')) return 'OPS';
    if (tile.code === 'CARBON-TAX') return 'CARBON';
    if (tile.code === 'ONE-QUOTE') return 'QUOTE';
    if (tile.code === 'ECO-CALC') return 'ECO';
    return tile.code;
  };

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-tile-type={tile.type}
      data-port-tile={isPort ? tile.code : undefined}
      data-auction={auctioned || undefined}
      data-mission-target={missionTarget || undefined}
      data-claim-edge={isFreshClaim ? orientation : undefined}
      data-has-rent={receipt ? 'true' : undefined}
      onClick={onClick}
      className={`board-tile relative w-full h-full flex flex-col justify-between border focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-700 transition cursor-pointer select-none overflow-hidden ${
        isCorner ? 'p-1.5' : 'p-0.5'
      } ${isCorner ? 'chart-corner' : ''} ${property?.isMortgaged ? 'chart-mortgaged' : ''}`}
      style={{
        '--tile-owner-color': owner && TOKEN_CONFIG[owner.token].color,
        '--weather-inset': owner ? 'var(--tile-owner-ring, 3px)' : undefined,
        boxShadow: owner ? 'inset 0 0 0 var(--tile-owner-ring, 3px) var(--tile-owner-color)' : undefined,
        transformStyle: is3D ? 'preserve-3d' : undefined,
      } as React.CSSProperties}
    >
      <span className="sr-only">Xem chi tiết ô {tile.name}. {missionTarget && 'Mục tiêu nhiệm vụ của bạn. '}{auctioned && 'Đang đấu giá. '}{owner && `Chủ sở hữu: ${owner.name}. `}</span>
      <TileWeather id={tile.id} />
      {/* KHUNG NỘI DUNG XOAY ĐỒNG BỘ: Vạch màu nằm INSIDE để luôn ở phía trên của mã cảng và song song với chữ */}
      <span
        className={`tile-content flex-1 flex flex-col items-center justify-between p-0.5 w-full h-full text-center ${is3D && (orientation === 'left' || orientation === 'right') ? 'rotate-90' : ''}`}
      >
        {/* VẠCH MÀU PHÂN BIỆT NHÓM TUYẾN - LUÔN Ở PHÍA TRÊN CỦA MÃ CẢNG */}
        {groupConfig ? (
          <span
            className="tile-group-color w-full h-2 shrink-0 mb-0.5"
            style={{ backgroundColor: groupConfig.color }}
          />
        ) : isPort ? (
          <span className="port-start-stripe" aria-hidden="true" />
        ) : (
          <TileSymbol className="chart-tile-symbol" strokeWidth={1.75} aria-hidden="true" />
        )}
        {isPort && <PortMiniature code={tile.code} variant="tile" is3D={is3D} />}

        {/* MÃ CẢNG - ĐẶT NGAY DƯỚI VẠCH MÀU, CHỮ TO RÕ NÉT */}
        <span className="tile-code-row flex items-center justify-center gap-0.5 w-full my-auto">
          <span className="tile-code text-[10px] sm:text-[11px] font-bold leading-none whitespace-nowrap">
            {getDisplayCode()}
          </span>
          {property?.hasGreenFleet && (
            <span className="tile-upgrade" title="Tàu Nhiên Liệu Xanh">
              <Leaf className="w-2.5 h-2.5 text-emerald-500 fill-emerald-500 shrink-0" />
            </span>
          )}
          {property?.slotCharter?.active && (
            <span className="tile-upgrade" title="Đang chia sẻ chỗ (Slot Charter)">
              <Handshake className="w-2.5 h-2.5 text-blue-500 shrink-0" />
            </span>
          )}
        </span>

        {/* Lô Container (nếu có) */}
        {property && property.containerLevel > 0 && (
          <span className="tile-upgrade my-0.5 shrink-0">{renderContainers()}</span>
        )}

        {/* CƯỚC HOẶC GIÁ */}
        <span className="tile-amount mt-0.5 flex items-center justify-center w-full">
          {renderPriceOrRent()}
        </span>
      </span>

      {missionTarget && (
        <svg className="tile-mission-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10.7" fill="#124d50" stroke="#fff3ca" strokeWidth="1.8" />
          <path d="M12 3.6l2.1 6.3 6.3 2.1-6.3 2.1-2.1 6.3-2.1-6.3L3.6 12l6.3-2.1z" fill="#ffdb79" />
          <path d="M12 3.6v8.4L9.9 9.9zM20.4 12H12l2.1-2.1zM12 20.4V12l2.1 2.1zM3.6 12H12l-2.1 2.1z" fill="#fff9e5" />
        </svg>
      )}
      {owner && (
        <span className="tile-owner-pennant" title={`Chủ sở hữu: ${owner.name}`} aria-hidden="true">
          <Flag />
        </span>
      )}
      {isFreshClaim && (
        <span key={claim.swapId ?? owner.id} className="tile-claim-effect" data-port-swap-claim={claim.swapId} aria-hidden="true">
          <span className="tile-claim-ripple" />
          <span className="tile-claim-marker"><Flag className="tile-claim-flag" /></span>
        </span>
      )}
    </button>
  );
};
