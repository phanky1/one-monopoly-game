import React, { useLayoutEffect, useRef, useState } from 'react';
import { loadVesselRenderer } from './TokenModel.js';
import type { StormRescue } from './stormTugPlayback.js';
import './storm-tug-rescue.css';

const tugAsset = '/models/storm/harbor-tug';

interface Props {
  rescue: StormRescue;
  is3D: boolean;
  motion: boolean;
  faceLeft: boolean;
  exposure: number;
  finish: (rescue: StormRescue) => void;
}

export function StormTugRescue({ rescue, is3D, motion, faceLeft, exposure, finish }: Props) {
  const slot = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const duration = motion ? 2800 : 1500;
  useLayoutEffect(() => {
    const timer = setTimeout(() => finish(rescue), duration);
    return () => clearTimeout(timer);
  }, [rescue, duration, finish]);

  useLayoutEffect(() => {
    setReady(false);
    const mount = slot.current!;
    if (!is3D) return;
    let active = true;
    void loadVesselRenderer().then(supported => {
      if (!active || !supported) return;
      const viewer = document.createElement('model-viewer');
      viewer.inert = true;
      viewer.setAttribute('src', tugAsset + '.glb');
      viewer.setAttribute('alt', '');
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('camera-orbit', '30deg 62deg auto');
      viewer.setAttribute('environment-image', 'neutral');
      viewer.setAttribute('exposure', mount.dataset.exposure!);
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('animation-name', 'Tow');
      viewer.toggleAttribute('autoplay', mount.dataset.motion === 'sail');
      viewer.addEventListener('load', () => { if (active) setReady(true); });
      viewer.addEventListener('error', () => { if (active) setReady(false); });
      mount.append(viewer);
    });
    return () => {
      active = false;
      mount.replaceChildren();
    };
  }, [is3D]);

  useLayoutEffect(() => {
    const viewer = slot.current?.querySelector('model-viewer');
    if (!viewer || !ready) return;
    viewer.setAttribute('exposure', String(exposure));
    if (motion) viewer.play();
    else {
      viewer.pause();
      viewer.currentTime = 0;
    }
  }, [ready, motion, exposure]);

  return (
    <span className="storm-tug-rescue" aria-hidden="true"
      data-player-id={rescue.playerId} data-tile-id={rescue.tileId}
      data-view={is3D ? 'tilted' : 'flat'} data-motion={motion ? 'sail' : 'still'}
      data-face={faceLeft ? 'left' : 'right'} style={{ '--tow-duration': duration + 'ms' } as React.CSSProperties}>
      <svg className="storm-tug-rope" viewBox="0 0 100 60" fill="none" focusable="false">
        <path d="M2 51Q48 55 97 4" stroke="#4e342c" strokeWidth="6.5" strokeLinecap="round" />
        <path d="M2 51Q48 55 97 4" stroke="#ffdc86" strokeWidth="2.8" strokeDasharray="6 3" />
      </svg>
      <span className="storm-tug-vessel" data-ready={is3D && ready ? '' : undefined}>
        <svg className="storm-tug-wake" viewBox="0 0 100 38" fill="none" focusable="false">
          <path d="M95 12C68 27 37 22 5 12M86 20C61 32 49 31 28 30" stroke="#367c83" strokeWidth="5" />
          <path d="M92 10C70 23 40 21 14 12M77 24C62 29 42 28 32 27" stroke="#fffce8" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <img className="storm-tug-poster" src={tugAsset + '.webp'} alt="" draggable={false} />
        <span className="storm-tug-model" ref={slot} data-exposure={exposure} data-motion={motion ? 'sail' : 'still'} />
      </span>
    </span>
  );
}
