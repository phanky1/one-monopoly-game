import {
  BOARD_TILES, LOOP_GROUPS_CONFIG, OneMonopolyEngine, getHarborTerminalShare, ownsPortGroup,
  type GameState,
} from '@one-monopoly/shared';
import { projectPortTrade } from './portInvestment.js';
import { portGuide } from './ports/portGuide.js';
import './trade-route-impact.css';

interface Props { state: GameState; tileId: number; buyerId: string; sellerId: string; offeredTileId?: number }

function rateChange(before: number, after: number, percent = false) {
  const format = (rate: number) => percent ? `${rate}%` : `$${rate}M`;
  return before === after ? format(after) : `${format(before)} → ${format(after)}`;
}

export function TradeRouteImpact({ state, tileId, buyerId, sellerId, offeredTileId }: Props) {
  const targetGroup = BOARD_TILES[tileId]?.group;
  const offeredGroup = offeredTileId === undefined ? undefined : BOARD_TILES[offeredTileId]?.group;
  if (state.mode !== 'harbor' || !targetGroup || buyerId === sellerId || state.properties[tileId]?.ownerId !== sellerId ||
      (offeredTileId !== undefined && (!offeredGroup || state.properties[offeredTileId]?.ownerId !== buyerId))) return null;
  const captains = state.players.filter(p => !p.isBankrupt && (p.id === buyerId || p.id === sellerId));
  if (captains.length !== 2) return null;

  const after = projectPortTrade(state, tileId, buyerId, sellerId, offeredTileId);
  const groups = offeredGroup && offeredGroup !== targetGroup ? [targetGroup, offeredGroup] : [targetGroup];
  const changed = groups.flatMap(group => {
    const previous = captains.find(p => ownsPortGroup(state, group, p.id));
    const next = captains.find(p => ownsPortGroup(after, group, p.id));
    if (previous?.id === next?.id) return [];
    const owner = next ?? previous;
    return owner ? [{ group, owner, completes: !!next }] : [];
  });
  if (!changed.length) return null;

  return <div className="trade-route-impact" data-trade-route-impact={tileId}>
    {changed.map(({ group, owner, completes }) => {
      const route = LOOP_GROUPS_CONFIG[group];
      return <details key={group} data-route-id={group} className="trade-route-change">
        <summary>
          <i aria-hidden="true" style={{ backgroundColor: route.color }} />
          <strong>{owner.name}</strong> {completes ? 'sẽ sở hữu trọn tuyến' : 'sẽ mất quyền sở hữu trọn tuyến'} <strong>{route.name}</strong>
        </summary>
        <table>
          <caption>Mức thu từ đối thủ trước và sau giao dịch</caption>
          <thead><tr><th scope="col">Cảng · Chủ bến</th><th scope="col">Tiền thuê khi ghé</th><th scope="col">Phần cước khi dỡ</th></tr></thead>
          <tbody>{route.tileIds.map(id => {
            const tile = BOARD_TILES[id];
            const beforeDeed = state.properties[id], afterDeed = after.properties[id];
            const beforeOwner = captains.find(p => p.id === beforeDeed.ownerId)?.name;
            const afterOwner = captains.find(p => p.id === afterDeed.ownerId)?.name;
            const rent = OneMonopolyEngine.calculateRent(state, id, state.dice);
            const newRent = OneMonopolyEngine.calculateRent(after, id, state.dice);
            const share = getHarborTerminalShare(state, id);
            const newShare = getHarborTerminalShare(after, id);
            return <tr key={id} data-route-port={id}>
              <th scope="row">{portGuide[tile.code]?.name ?? tile.name}
                <small>{beforeDeed.ownerId !== afterDeed.ownerId ? `${beforeOwner} → ${afterOwner}` : afterOwner}
                  {afterDeed.isMortgaged && ' · đang thế chấp'}</small>
              </th>
              <td>{rateChange(rent, newRent)}</td><td>{rateChange(share, newShare, true)}</td>
            </tr>;
          })}</tbody>
        </table>
      </details>;
    })}
  </div>;
}
