import { BOARD_TILES, HOLD_TILE_INDEX, STORM_DRIFT_STEPS } from '@one-monopoly/shared';
import type { GameEvent } from '@one-monopoly/shared';
import { TILE_CENTER_PERCENT } from './boardCoordinates.js';

export const DICE_ROLL_MS = 950;
const TILE_MS = 240;
const TURN_MS = 210;
const tileCount = BOARD_TILES.length;

export interface Pose {
  tile: number;
  heading: number;
}

export interface TravelFrame extends Pose {
  duration: number;
  gliding?: boolean;
}

export function forwardHeading(tile: number): number {
  // Tile zero is at the bottom left. The route runs up, right, down, then left.
  return [270, 0, 90, 180][Math.floor(tile / 8)];
}

export function restingPose(tile: number): Pose {
  return { tile, heading: forwardHeading(tile) };
}

export function buildTravelFrames(start: Pose, playerId: string, events: GameEvent[], directSailing = false): TravelFrame[] {
  const frames: TravelFrame[] = [];
  let pose = start;
  let steps: number | undefined;
  const add = (frame: TravelFrame) => {
    frames.push(frame);
    pose = frame;
  };

  for (const event of events) {
    if (!('playerId' in event) || event.playerId !== playerId) continue;
    switch (event.type) {
      case 'DICE_ROLLED':
        steps = event.dice[0] + event.dice[1];
        add({ ...pose, duration: DICE_ROLL_MS, gliding: false });
        break;
      case 'CARD_DRAWN':
        steps = event.card.effect.type === 'MOVE_STEPS' ? event.card.effect.steps : undefined;
        break;
      case 'STORM_RESOLVED':
        steps = event.choice === 'DRIFT' ? STORM_DRIFT_STEPS : undefined;
        break;
      case 'SENT_TO_HOLD':
        add({ ...restingPose(HOLD_TILE_INDEX), duration: 0 });
        break;
      case 'SHIP_STEPPED': {
        if (directSailing && pose.tile === event.from && event.from !== event.to) {
          const from = TILE_CENTER_PERCENT[event.from], to = TILE_CENTER_PERCENT[event.to];
          const dx = to.x - from.x, dy = to.y - from.y;
          const heading = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
          if (pose.heading !== heading) add({ ...pose, heading, duration: TURN_MS });
          add({ tile: event.to, heading, duration: Math.round(400 + Math.hypot(dx, dy) * 5), gliding: true });
          break;
        }
        // A destination card, or an update with no matching route, is an immediate relocation.
        if (steps === undefined || pose.tile !== event.from ||
            (event.from + steps + tileCount) % tileCount !== event.to) {
          add({ ...restingPose(event.to), duration: 0 });
          break;
        }
        const direction = Math.sign(steps);
        for (let i = 0; i < Math.abs(steps); i++) {
          const next = (pose.tile + direction + tileCount) % tileCount;
          const heading = direction > 0 ? forwardHeading(pose.tile) : (forwardHeading(next) + 180) % 360;
          if (pose.heading !== heading) add({ tile: pose.tile, heading, duration: TURN_MS });
          add({ tile: next, heading, duration: TILE_MS, gliding: true });
        }
        steps = undefined;
        break;
      }
    }
  }
  return frames;
}
