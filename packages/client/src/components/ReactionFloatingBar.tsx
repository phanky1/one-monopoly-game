import { cabinReactions } from '../hooks/useSocket.js';

interface Props {
  onSendReaction: (emoji: string) => void;
}

export function ReactionFloatingBar({ onSendReaction }: Props) {
  return (
    <div className="table-reactions" role="group" aria-label="Biểu cảm">
      <span className="chart-reaction-label">Biểu cảm</span>
      {Array.from(cabinReactions, ([emoji, name]) => (
        <button key={emoji} type="button" className="chart-reaction" onClick={() => onSendReaction(emoji)}
          aria-label={`Gửi ${name}`} title={`Gửi ${name}`}>
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}
