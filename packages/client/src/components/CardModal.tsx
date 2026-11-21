import React, { useId } from 'react';
import { GameCard } from '@one-monopoly/shared';
import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp, Wrench, X } from 'lucide-react';
import { BoardDialog } from './BoardDialog.js';

interface Props {
  card: GameCard | null;
  onClose: () => void;
}

export const CardModal: React.FC<Props> = ({ card, onClose }) => {
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  if (!card) return null;

  const isMarket = card.type === 'MARKET';
  const Icon = isMarket ? TrendingUp : Wrench;

  return (
    <BoardDialog key={card.id} labelledBy={titleId} onClose={onClose}>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="chart-dialog-sheet chart-event-sheet"
      >
        <button type="button" aria-label="Đóng thẻ" className="chart-dialog-close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>

        <span className="chart-event-icon" aria-hidden="true"><Icon size={26} /></span>
        <p className="chart-dialog-kicker">
          {isMarket ? 'THẺ BIẾN ĐỘNG THỊ TRƯỜNG' : 'THẺ SỰ CỐ & VẬN HÀNH'}
        </p>
        <h3 className="chart-dialog-title" id={titleId}>{card.title}</h3>
        <p className="chart-dialog-copy">{card.description}</p>

        <button type="button" onClick={onClose} className="chart-button chart-button-primary chart-button-wide">
          ĐÃ HIỂU
        </button>
      </motion.div>
    </BoardDialog>
  );
};
