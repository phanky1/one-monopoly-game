import { BOARD_TILES, SERVICE_LINES } from './boardData.js';
import type { GameState, PropertyState } from './types.js';

export interface MissionObjective {
  key: string;
  label: string;
  achieved: boolean;
  tileId?: number;
}

export interface MissionProgress {
  objectives: MissionObjective[];
  current: number;
  target: number;
}

export function getMissionProgress(state: GameState, playerId: string): MissionProgress | null {
  const mission = state.players.find(player => player.id === playerId)?.secretMission;
  if (!mission) return null;

  function ownership(tileId: number): MissionObjective {
    return {
      key: 'tile-' + tileId,
      label: BOARD_TILES[tileId].name,
      achieved: state.properties[tileId]?.ownerId === playerId,
      tileId,
    };
  }

  function upgrade(key: string, label: string, qualifies: (port: PropertyState) => boolean): MissionObjective {
    const ports = BOARD_TILES.filter(tile => tile.type === 'PORT' && state.properties[tile.id]?.ownerId === playerId);
    const achievedAt = ports.find(tile => qualifies(state.properties[tile.id]));
    const target = achievedAt ?? ports
      .filter(tile => !state.properties[tile.id].isMortgaged)
      .sort((a, b) => state.properties[b.id].containerLevel - state.properties[a.id].containerLevel || a.id - b.id)[0];
    return { key, label, achieved: achievedAt !== undefined, tileId: target?.id };
  }

  let objectives: MissionObjective[];
  switch (mission.id) {
    case 'MISSION-1':
      objectives = [3, 23, 28].map(ownership);
      break;
    case 'MISSION-2':
      objectives = [
        ownership(31),
        ownership(17),
        upgrade('innovation', 'Siêu tàu ONE Innovation (mức 5)', port => port.containerLevel === 5),
      ];
      break;
    case 'MISSION-3':
      objectives = [
        ownership(10),
        ownership(22),
        upgrade('green-fleet', 'Huy hiệu Tàu Nhiên Liệu Xanh', port => port.hasGreenFleet === true),
      ];
      break;
    case 'MISSION-4':
      objectives = SERVICE_LINES.map(ownership);
      break;
    case 'MISSION-5':
      objectives = [1, 3, 4].map(ownership);
      break;
    default:
      return null;
  }

  const target = mission.id === 'MISSION-4' ? 3 : objectives.length;
  const current = Math.min(target, objectives.filter(objective => objective.achieved).length);
  return { objectives, current, target };
}
