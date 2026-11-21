import React, { useEffect, useId, useState } from 'react';
import {
  FREIGHT_RIVALS, FREIGHT_RIVAL_STYLES, LOGISTICS_DELIVERY_TARGET, LOGISTICS_ROUND_LIMIT, VESSEL_TOKENS,
  type FreightRivalStyle, type GameMode, type VesselToken,
} from '@one-monopoly/shared';
import { ArrowRight, BookOpen, Check, Compass, Copy, KeyRound, Plus, Users } from 'lucide-react';
import { RoomState } from '../hooks/useSocket.js';
import { TOKEN_CONFIG } from './TokenBadge.js';
import { useIdleMotion } from '../hooks/useIdleMotion.js';
import { TokenModel, tokenPosterUrl } from './TokenModel.js';
import './chart-lobby.css';
import './lobby-rival-picker.css';

interface Props {
  room: RoomState | null;
  myPlayerId: string | null;
  onCreateRoom: (name: string, token: VesselToken) => void;
  onJoinRoom: (roomId: string, name: string, token: VesselToken) => void;
  onToggleReady: (isReady: boolean) => void;
  onStartGame: (style?: FreightRivalStyle, mode?: GameMode) => void;
  onOpenGuide: (mode: GameMode) => void;
  isStarting?: boolean;
  onLeaveRoom: () => void;
}

const gameModes: ReadonlyArray<{ mode: GameMode; name: string; description: string }> = [
  { mode: 'harbor', name: 'Monopoly', description: 'Gieo xúc xắc, mua cảng và thu tiền thuê. Xếp hàng rồi dỡ ở cảng khác để nhận cước. Chủ cảng có thể thu phí xếp dỡ.' },
  { mode: 'logistics', name: 'Empty Reposition', description: `Chở vỏ container từ cảng thừa đến cảng thiếu hoặc giao hàng xuất. Giao ${LOGISTICS_DELIVERY_TARGET} chuyến để mở vòng cuối, tối đa ${LOGISTICS_ROUND_LIMIT} vòng. Nếu bằng số chuyến, đội có cước cao hơn thắng.` },
  { mode: 'classic', name: 'Monopoly cổ điển', description: 'Mua và nâng cấp cảng để tăng tiền thuê. Thắng khi các đối thủ phá sản.' },
];

function LobbyGuide({ mode, onOpenGuide }: { mode: GameMode; onOpenGuide: Props['onOpenGuide'] }) {
  return <button className="lobby-guide-button" type="button" data-lobby-guide={mode} onClick={() => onOpenGuide(mode)}>
    <BookOpen size={16} aria-hidden="true" />Hướng dẫn cho người mới
  </button>;
}

function HostStart({ room, onStartGame, onOpenGuide, isStarting }: Pick<Props, 'onStartGame' | 'onOpenGuide' | 'isStarting'> & { room: RoomState }) {
  const [selected, setSelected] = useState<FreightRivalStyle>('standard');
  const [mode, setMode] = useState<GameMode>('harbor');
  const groupId = useId();
  const solo = room.players.length === 1;
  const chooseRival = solo && mode === 'logistics';

  return <>
    <fieldset className="lobby-rules-picker" disabled={isStarting || room.isGameStarted}>
      <legend>Chế độ chơi</legend>
      {gameModes.map(option => {
        const radio = <label className="lobby-rules-option" key={option.mode}>
          <input type="radio" name={`${groupId}-mode`} value={option.mode} checked={mode === option.mode}
            data-lobby-mode={option.mode} aria-labelledby={`${groupId}-${option.mode}-name`}
            aria-describedby={`${groupId}-${option.mode}-description`} onChange={() => setMode(option.mode)} />
          <span>
            <strong id={`${groupId}-${option.mode}-name`}>{option.name}</strong>
            <span id={`${groupId}-${option.mode}-description`}>{option.description}</span>
          </span>
        </label>;
        return option.mode === 'classic' ? <details key={option.mode} className="lobby-classic-rules">
          <summary>Luật cổ điển{mode === 'classic' && <strong> · Đang chọn Monopoly cổ điển</strong>}</summary>
          {radio}
        </details> : radio;
      })}
    </fieldset>
    <LobbyGuide mode={mode} onOpenGuide={onOpenGuide} />
    {chooseRival && !room.isGameStarted && <fieldset className="lobby-rival-picker" data-rival-picker disabled={isStarting}>
      <legend>Chọn đối thủ máy</legend>
      <div className="lobby-rival-options">
        {FREIGHT_RIVAL_STYLES.map(style => {
          const rival = FREIGHT_RIVALS[style];
          const id = `${groupId}-${style}`;
          return <label key={style} className="lobby-rival-option">
            <input type="radio" name={groupId} value={style} data-rival-option={style} checked={selected === style}
              aria-labelledby={`${id}-name`} aria-describedby={`${id}-description`} onChange={() => setSelected(style)} />
            <span className="lobby-rival-card">
              <span className="lobby-rival-emoji" aria-hidden="true">{rival.emoji}</span>
              <strong id={`${id}-name`} title={rival.name}>{rival.shortName}</strong>
              <span className="lobby-rival-description" id={`${id}-description`}>{rival.description}</span>
            </span>
          </label>;
        })}
      </div>
    </fieldset>}
    <button className="chart-lobby-primary" type="button" data-lobby-start disabled={!room.players.length || room.isGameStarted || isStarting}
      onClick={() => onStartGame(chooseRival ? selected : undefined, mode)}>
      {isStarting ? 'Đang mở ván…' : solo ? 'Bắt đầu ván đấu (cùng bot)' : 'Bắt đầu ván đấu'}<ArrowRight />
    </button>
  </>;
}

export const Lobby: React.FC<Props> = ({
  room, myPlayerId, onCreateRoom, onJoinRoom, onToggleReady, onStartGame, onOpenGuide, isStarting = false, onLeaveRoom,
}) => {
  const idleMotion = useIdleMotion();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [playerName, setPlayerName] = useState('Thuyền Trưởng ONE');
  const [roomCode, setRoomCode] = useState('');
  const [selectedToken, setSelectedToken] = useState<VesselToken>('ONE_APUS');
  const [copied, setCopied] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room');
    if (code) {
      setRoomCode(code.toUpperCase());
      setTab('join');
    }
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const isHost = room?.hostId === myPlayerId;
  const myPlayer = room?.players.find((player) => player.id === myPlayerId);
  const creating = tab === 'create';
  const selectedConfig = TOKEN_CONFIG[selectedToken];

  async function copyRoomCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.id);
      setManualCode('');
      setCopied(true);
    } catch {
      setManualCode(room.id);
    }
  }

  return (
    <div className="chart-lobby">
      <div className="chart-lobby-spread">
        <div className="chart-lobby-poster">
          <img src="/images/harbor-approach.webp" alt="" className="chart-lobby-photo" />
          <div className="chart-lobby-poster-grid" aria-hidden="true" />
          <div className="chart-lobby-poster-title">
            <p>Vận tải container</p>
            <h1>ONE <em>Monopoly</em></h1>
          </div>
          <Compass aria-hidden="true" className="chart-lobby-compass" strokeWidth={0.8} />
        </div>

        <section className="chart-lobby-panel" aria-labelledby="lobby-panel-title">
          <h2 id="lobby-panel-title">{room ? 'Phòng chờ' : 'Phòng chơi'}</h2>
          {!room && <p className="chart-lobby-freight-intro">
            Chơi Monopoly để mua cảng, thu tiền thuê và chở hàng. Trong Empty Reposition, bạn điều tàu đưa vỏ rỗng đến cảng thiếu hoặc giao hàng xuất.
          </p>}
          {(!room || !isHost) && <LobbyGuide mode="harbor" onOpenGuide={onOpenGuide} />}
          {room ? (
            <>
              <div className="chart-room-invite">
                <div><span className="chart-field-label">Mã phòng</span><strong>{room.id}</strong></div>
                <button type="button" className="chart-link-button" onClick={copyRoomCode}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? 'Đã sao chép mã!' : 'Sao chép mã phòng'}
                </button>
              </div>
              <div className="chart-crew-heading"><Users size={17} /><h3>Thuyền trưởng</h3><span>{room.players.length}/4</span></div>
              <ul className="chart-crew">
                {room.players.map((player) => (
                  <li key={player.id}>
                    <img className="chart-crew-token" src={tokenPosterUrl(player.token)} alt="" />
                    <div className="chart-crew-name"><strong>{player.name}{player.id === myPlayerId && ' (bạn)'}</strong><small>{TOKEN_CONFIG[player.token].label}</small></div>
                    <span className="chart-crew-status">{player.id === room.hostId ? 'Chủ phòng' : player.isReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</span>
                  </li>
                ))}
              </ul>
              {isHost ? (
                <HostStart key={room.id} room={room} onStartGame={onStartGame} onOpenGuide={onOpenGuide}
                  isStarting={isStarting} />
              ) : (
                <button className="chart-lobby-primary" type="button" onClick={() => onToggleReady(!myPlayer?.isReady)}>
                  {myPlayer?.isReady ? 'Hủy sẵn sàng' : 'Tôi đã sẵn sàng!'}<Check />
                </button>
              )}
              <button type="button" className="chart-lobby-leave" onClick={onLeaveRoom}>Rời phòng</button>
            </>
          ) : (
            <>
              <div className="chart-lobby-modes" role="group" aria-label="Chọn cách vào phòng">
                <button type="button" aria-pressed={creating} onClick={() => setTab('create')}><Plus />Tạo phòng mới</button>
                <button type="button" aria-pressed={!creating} onClick={() => setTab('join')}><KeyRound />Vào bằng mã</button>
              </div>
              {creating && <p className="lobby-solo-hint">Đấu với máy hoặc mời bạn bè bằng mã phòng.</p>}

              <form onSubmit={(event) => {
                event.preventDefault();
                if (creating) onCreateRoom(playerName, selectedToken);
                else onJoinRoom(roomCode, playerName, selectedToken);
              }}>
                <label className="chart-lobby-field">
                  <span>Tên thuyền trưởng</span>
                  <input value={playerName} onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="Nhập tên của bạn..." maxLength={20} required />
                </label>
                {!creating && (
                  <label className="chart-lobby-field">
                    <span>Mã phòng</span>
                    <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                      placeholder="VD: ONE-8888" maxLength={10} autoCapitalize="characters" required />
                  </label>
                )}
                <fieldset className="chart-token-field">
                  <legend>Chọn quân cờ vận tải</legend>
                  <figure className="chart-token-preview">
                    <div className="chart-token-stage">
                      <TokenModel token={selectedToken} interactive idle={idleMotion} />
                    </div>
                    <figcaption>
                      <strong>{selectedConfig.label}</strong>
                      <span>{selectedConfig.desc}</span>
                      <small className="chart-token-rotate-hint" aria-hidden="true">Kéo hoặc dùng phím mũi tên để xoay.</small>
                    </figcaption>
                  </figure>
                  <div className="chart-token-grid">
                    {VESSEL_TOKENS.map((token) => {
                      const cfg = TOKEN_CONFIG[token];
                      return (
                        <label key={token} className="chart-token-option">
                          <input type="radio" name="vessel" aria-label={cfg.label} value={token} checked={selectedToken === token}
                            onChange={() => setSelectedToken(token)} />
                          <span className="chart-token-card">
                            <img className="chart-token-thumbnail" src={tokenPosterUrl(token)} alt="" draggable={false} />
                            <span>{cfg.shortName}</span>
                            {selectedToken === token && <Check className="chart-token-check" aria-hidden="true" />}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <button className="chart-lobby-primary" type="submit" disabled={!playerName.trim() || (!creating && !roomCode.trim())}>
                  {creating ? 'Khởi tạo phòng chơi' : 'Vào phòng ngay'}<ArrowRight />
                </button>
              </form>
            </>
          )}
          {manualCode && (
            <label className="chart-lobby-field chart-manual-link">
              <span>Sao chép mã phòng này</span>
              <input readOnly value={manualCode} onFocus={(event) => event.target.select()} />
            </label>
          )}
        </section>
      </div>
    </div>
  );
};
