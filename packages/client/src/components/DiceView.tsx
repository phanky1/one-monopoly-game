import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  dice: [number, number];
  isRolling?: boolean;
  hasRolled?: boolean;
  is3D?: boolean;
}

// Hàm render các chấm tròn (pips) của xúc xắc
const renderPips = (value: number, pipColor = '#FFFFFF') => {
  const pipMap: Record<number, number[][]> = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [25, 75], [75, 25], [75, 75]],
    5: [[25, 25], [25, 75], [50, 50], [75, 25], [75, 75]],
    6: [[25, 25], [25, 50], [25, 75], [75, 25], [75, 50], [75, 75]],
  };

  const pips = pipMap[value] || pipMap[1];

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full p-1.5">
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="11" fill={pipColor} />
      ))}
    </svg>
  );
};

// Component Viên Xúc Xắc 3D Khối Hộp (3D Cube Die)
interface DieProps {
  value: number;
  isRolling: boolean;
  theme: 'magenta' | 'navy';
}

const Die3D: React.FC<DieProps> = ({ value, isRolling, theme }) => {
  const isMagenta = theme === 'magenta';
  const topBg = isMagenta
    ? 'bg-gradient-to-br from-[#FF1A8C] via-[#E1007A] to-[#B80063]'
    : 'bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#020617]';
  const frontBg = isMagenta ? 'bg-[#A8005A]' : 'bg-[#0B1120]';
  const rightBg = isMagenta ? 'bg-[#8F004D]' : 'bg-[#030712]';
  const leftBg = isMagenta ? 'bg-[#C20068]' : 'bg-[#1E293B]';

  // Số hiển thị trên các mặt lân cận
  const frontValue = value === 6 ? 2 : value + 1;
  const rightValue = value === 1 ? 4 : (value + 2) % 6 || 6;

  return (
    <div className="chart-die-3d relative w-14 h-14 flex items-center justify-center">
      {/* Khối Lập Phương 3D (Cube) */}
      <motion.div
        className="w-12 h-12 relative cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
        }}
        animate={
          isRolling
            ? {
                rotateX: [0, 360, 720, 1080],
                rotateY: [0, -360, -720, -1080],
                rotateZ: [0, 180, 360, 540],
                y: [0, -30, 0, -15, 0],
                scale: [1, 1.15, 1, 1.05, 1],
              }
            : {
                rotateX: -24,
                rotateY: 28,
                rotateZ: 0,
                y: 0,
                scale: 1,
              }
        }
        whileHover={{ scale: 1.08 }}
        transition={
          isRolling
            ? { duration: 0.6, repeat: Infinity, ease: 'linear' }
            : { type: 'spring', stiffness: 300, damping: 20 }
        }
      >
        {/* MẶT TRÊN (TOP FACE - Hiển thị giá trị xúc xắc chính xác) */}
        <div
          className={`absolute inset-0 rounded-xl border border-white/40 shadow-inner flex items-center justify-center ${topBg}`}
          style={{
            transform: 'rotateX(90deg) translateZ(24px)',
            boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.6)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none rounded-xl" />
          {renderPips(value)}
        </div>

        {/* MẶT TRƯỚC (FRONT FACE - Tạo độ dày khối nhìn từ góc người chơi) */}
        <div
          className={`absolute inset-0 rounded-xl border border-black/20 flex items-center justify-center ${frontBg}`}
          style={{
            transform: 'rotateX(0deg) translateZ(24px)',
          }}
        >
          {renderPips(frontValue, 'rgba(255,255,255,0.75)')}
        </div>

        {/* MẶT PHẢI (RIGHT FACE - Tạo góc nhìn 3D Isometric chuẩn) */}
        <div
          className={`absolute inset-0 rounded-xl border border-black/30 flex items-center justify-center ${rightBg}`}
          style={{
            transform: 'rotateY(90deg) translateZ(24px)',
          }}
        >
          {renderPips(rightValue, 'rgba(255,255,255,0.6)')}
        </div>

        {/* MẶT TRÁI (LEFT FACE) */}
        <div
          className={`absolute inset-0 rounded-xl border border-black/20 ${leftBg}`}
          style={{
            transform: 'rotateY(-90deg) translateZ(24px)',
          }}
        />

        {/* MẶT ĐÁY (BOTTOM FACE) */}
        <div
          className="absolute inset-0 rounded-xl bg-black/60"
          style={{
            transform: 'rotateX(-90deg) translateZ(24px)',
          }}
        />
      </motion.div>
    </div>
  );
};

const Die2D: React.FC<DieProps> = ({ value, isRolling, theme }) => (
  <span className="chart-die-2d relative block">
    <span className={`chart-die chart-die-${theme}`} data-rolling={isRolling}>
      {renderPips(value, 'currentColor')}
    </span>
  </span>
);

export const DiceView: React.FC<Props> = ({ dice, isRolling = false, hasRolled = false, is3D = true }) => {
  const [d1, d2] = dice;
  const isDouble = d1 === d2;
  const Die = is3D ? Die3D : Die2D;

  return (
    <div
      className="flex flex-col items-center gap-3 select-none"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div
        className={`flex items-center justify-center ${is3D ? 'gap-6' : 'gap-2'}`}
        style={{ transformStyle: is3D ? 'preserve-3d' : undefined }}
        role="img"
        aria-label={isRolling ? 'Đang gieo xúc xắc' : `Xúc xắc: ${d1} và ${d2}`}
      >
        <Die value={d1} isRolling={isRolling} theme="magenta" />
        <Die value={d2} isRolling={isRolling} theme="navy" />
      </div>

      {/* Thông báo đổ đôi */}
      {isDouble && !isRolling && hasRolled && (
        <motion.span
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="chart-double-result"
          style={{ transform: is3D ? 'translateZ(20px)' : undefined }}
        >
          Đổ đôi {d1}–{d2}<span>Đi tiếp lượt nữa</span>
        </motion.span>
      )}
    </div>
  );
};
