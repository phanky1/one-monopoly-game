import {
  BOARD_TILES, getCargoDestinationEstimate, getCargoOpportunity, getFeederRoutes,
  type FeederSailAction, type GameState,
} from '@one-monopoly/shared';
import { portGuide, type PortGuide } from './portGuide.js';

export interface FeederChartOption {
  tileId: number;
  port: PortGuide;
  distanceNm: number;
  action: FeederSailAction;
  supply: number;
  demand: number;
  empties: number;
  emptyTarget: number;
  cargoStatus: 'empty-hold' | 'deliver' | 'blocked' | 'aboard';
  payment: number | null;
}

export interface FeederChart {
  origin: PortGuide;
  captainName: string;
  options: FeederChartOption[];
  preferredTileId: number;
  departureDelivery: number | null;
}

export function getFeederChart(state: GameState, captainId: string, originTileId: number): FeederChart | null {
  const captain = state.players[state.activePlayerIndex];
  const logistics = state.logistics;
  if (!logistics || captain?.id !== captainId || captain.position !== originTileId) return null;
  const routes = getFeederRoutes(state, captainId);
  const origin = portGuide[BOARD_TILES[originTileId]?.code];
  if (!routes.length || !origin) return null;

  const booking = captain.cargo;
  const options = routes.map(({ tileId, action, distanceNm, quote }): FeederChartOption => {
    let cargoStatus: FeederChartOption['cargoStatus'] = booking ? 'aboard' : 'empty-hold';
    let payment: number | null = null;
    if (booking?.destinationTileId === tileId) {
      if (quote) payment = getCargoDestinationEstimate(state, captainId, tileId)?.total ?? null;
      cargoStatus = payment === null ? 'blocked' : 'deliver';
    }
    const { supply, demand, empties, emptyTarget } = logistics.ports[tileId];
    return { tileId, port: portGuide[BOARD_TILES[tileId].code], distanceNm, action, supply, demand, empties, emptyTarget,
      cargoStatus, payment };
  });

  const preferred = options.find(option => option.tileId === booking?.destinationTileId) ?? options[0];
  const unloadHere = booking?.destinationTileId === originTileId && getCargoOpportunity(state, captainId)?.action.type === 'UNLOAD_CARGO';
  const departureDelivery = unloadHere ? getCargoDestinationEstimate(state, captainId, originTileId)?.total ?? null : null;
  return { origin, captainName: captain.name, options, preferredTileId: preferred.tileId, departureDelivery };
}
