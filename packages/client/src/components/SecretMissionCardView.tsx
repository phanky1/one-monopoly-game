import { Check, CheckCircle2, ChevronDown, ChevronRight, MapPin, Target } from 'lucide-react';
import { BOARD_TILES, GREEN_FLEET_COST, type GameState, type MissionProgress, type Player } from '@one-monopoly/shared';
import './secret-mission.css';

interface Props {
  gameState: GameState;
  player: Player;
  progress: MissionProgress;
  onInspectTile: (tileId: number) => void;
  showTargets: boolean;
  onToggleTargets: () => void;
}

function objectiveHint(objective: MissionProgress['objectives'][number], state: GameState) {
  const tile = objective.tileId === undefined ? undefined : BOARD_TILES[objective.tileId];
  const property = tile && state.properties[tile.id];
  if (objective.key === 'innovation' || objective.key === 'green-fleet') {
    if (objective.achieved) return tile ? `Đã đạt tại ${tile.name}` : 'Đã đạt';
    if (!tile || !property) return objective.key === 'innovation'
      ? 'Mua hoặc giải chấp một cảng, rồi nâng một cấp mỗi lần ghé lại cho đến cấp 5.'
      : `Mua hoặc giải chấp một cảng, xây đến cấp 5 rồi quay lại để gắn huy hiệu với giá $${GREEN_FLEET_COST}M.`;
    if (objective.key === 'green-fleet' && property.containerLevel === 5) {
      return `${tile.name} · Ghé lại cảng để gắn huy hiệu với giá $${GREEN_FLEET_COST}M.`;
    }
    return objective.key === 'innovation'
      ? `${tile.name} · Cấp ${property.containerLevel}/5. Mỗi lần ghé lại, bạn có thể nâng một cấp.`
      : `${tile.name} · Cấp ${property.containerLevel}/5. Nâng lên cấp 5 rồi quay lại để gắn huy hiệu ($${GREEN_FLEET_COST}M).`;
  }
  if (objective.achieved) return 'Bạn đang sở hữu';
  const owner = state.players.find(player => player.id === property?.ownerId);
  return owner ? `Chủ sở hữu: ${owner.name}` : 'Chưa có chủ sở hữu';
}

export function SecretMissionCardView({ gameState, player, progress, onInspectTile, showTargets, onToggleTargets }: Props) {
  const mission = player.secretMission;
  if (!mission) return null;

  const completed = mission.isCompleted;
  const current = completed ? progress.target : progress.current;
  const title = mission.title.replace(/^Hợp đồng \d+:\s*/i, '');
  const hasMapTargets = progress.objectives.some(objective => !objective.achieved && objective.tileId !== undefined);

  return (
    <section className="mission-tracker" aria-label="Hợp đồng bí mật" data-completed={completed}>
      <details>
        <summary>
          <span className="mission-tracker-heading">
            <span className="mission-tracker-label">
              {completed ? <CheckCircle2 size={15} aria-hidden="true" /> : <Target size={15} aria-hidden="true" />}
              {completed ? 'Đã nhận thưởng' : 'Hợp đồng bí mật'}
            </span>
            <span className="mission-tracker-reward" aria-label={`Thưởng ${mission.reward} triệu USD`}>+${mission.reward}M</span>
          </span>
          <span className="mission-tracker-title">{title}<ChevronDown size={16} aria-hidden="true" /></span>
          <span className="mission-tracker-progress">
            <progress aria-label="Tiến độ hợp đồng" value={current} max={progress.target} />
            <span>{current}/{progress.target} mục tiêu</span>
          </span>
        </summary>
        <div className="mission-tracker-details">
          {completed ? (
            <>
              <p>{mission.description}</p>
              <p className="mission-tracker-payout">Phần thưởng đã được cộng vào số dư khi bạn hoàn thành hợp đồng.</p>
            </>
          ) : (
            <>
              {progress.objectives.length > progress.target && <p>Chọn {progress.target} trong {progress.objectives.length} tuyến dịch vụ bất kỳ.</p>}
              <ul className="mission-objectives">
                {progress.objectives.map(objective => {
                  const { tileId, key, label, achieved } = objective;
                  const hint = objectiveHint(objective, gameState);
                  const row = (
                    <>
                      <span className="mission-check" aria-hidden="true">{achieved && <Check size={12} strokeWidth={3} />}</span>
                      <span className="mission-objective-text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
                      {tileId !== undefined && <ChevronRight size={14} aria-hidden="true" />}
                    </>
                  );
                  return (
                    <li key={key} data-achieved={achieved}>
                      {tileId === undefined ? <div className="mission-objective">{row}</div> : (
                        <button type="button" className="mission-objective" data-mission-tile={tileId} onClick={() => onInspectTile(tileId)}>{row}</button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(hasMapTargets || showTargets) && (
                <button type="button" className="mission-map-toggle" aria-pressed={showTargets} onClick={onToggleTargets}>
                  <MapPin size={15} aria-hidden="true" /> Đánh dấu trên bàn cờ
                </button>
              )}
              <p className="mission-tracker-payout">Thưởng tự động khi hoàn thành.</p>
            </>
          )}
        </div>
      </details>
    </section>
  );
}
