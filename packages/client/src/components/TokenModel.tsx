import React, { useLayoutEffect, useRef, useState } from 'react';
import type { VesselToken } from '@one-monopoly/shared';
import { TOKEN_CONFIG } from './TokenBadge.js';

function tokenAsset(token: VesselToken, extension: 'webp' | 'glb') {
  return `/models/tokens/${token.toLowerCase().replaceAll('_', '-')}.${extension}`;
}

export const tokenPosterUrl = (token: VesselToken) => tokenAsset(token, 'webp');

let rendererReady: Promise<boolean> | undefined;

async function loadRenderer() {
  if (!window.customElements || !window.WebGL2RenderingContext) return false;
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return false;
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  await import('@google/model-viewer');
  return true;
}

export function loadVesselRenderer() {
  return rendererReady ??= loadRenderer().catch(() => false);
}

interface Props {
  token: VesselToken;
  interactive?: boolean;
  idle: boolean;
  cameraOrbit?: string;
  exposure?: number;
}

export const TokenModel: React.FC<Props> = ({ token, interactive = false, cameraOrbit, exposure, idle }) => {
  const slot = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const { label, desc } = TOKEN_CONFIG[token];

  useLayoutEffect(() => {
    const mount = slot.current!;
    let current = true;
    setReady(false);
    void loadVesselRenderer().then((supported) => {
      if (!current || !supported) return;
      const viewer = document.createElement('model-viewer');
      viewer.setAttribute('src', tokenAsset(token, 'glb'));
      viewer.setAttribute('alt', interactive ? `${label}. ${desc}. Kéo hoặc dùng phím mũi tên để xoay.` : label);
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('animation-name', 'Idle');
      viewer.setAttribute('camera-orbit', mount.dataset.orbit ?? '30deg 62deg auto');
      if (mount.dataset.orbit) viewer.setAttribute('interpolation-decay', '30');
      viewer.setAttribute('environment-image', 'neutral');
      // Board models cast onto their tile; the lobby preview retains its studio shadow.
      viewer.setAttribute('shadow-intensity', mount.dataset.orbit ? '0' : '0.6');
      if (mount.dataset.exposure !== undefined) viewer.setAttribute('exposure', mount.dataset.exposure);
      viewer.setAttribute('interaction-prompt', 'none');
      if (interactive) {
        viewer.setAttribute('camera-controls', '');
        viewer.setAttribute('disable-pan', '');
        viewer.setAttribute('disable-zoom', '');
        viewer.setAttribute('disable-tap', '');
        viewer.setAttribute('touch-action', 'pan-y');
      }

      viewer.inert = true;
      viewer.addEventListener('load', () => {
        if (!current) return;
        viewer.inert = !interactive;
        setReady(true);
      });
      viewer.addEventListener('error', () => {
        if (!current) return;
        viewer.inert = true;
        setReady(false);
      });
      mount.append(viewer);
    });

    return () => {
      current = false;
      mount.replaceChildren();
    };
  }, [token, interactive, label, desc]);

  useLayoutEffect(() => {
    const viewer = slot.current?.querySelector('model-viewer');
    if (!ready || !viewer?.availableAnimations.includes('Idle')) return;
    if (idle) {
      viewer.play();
    } else {
      viewer.pause();
      viewer.currentTime = 0;
    }
  }, [idle, ready, token]);

  useLayoutEffect(() => {
    if (!cameraOrbit) return;
    const viewer = slot.current?.querySelector('model-viewer');
    if (!viewer) return;
    viewer.setAttribute('camera-orbit', cameraOrbit);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) viewer.jumpCameraToGoal();
  }, [cameraOrbit]);

  useLayoutEffect(() => {
    if (exposure !== undefined) slot.current?.querySelector('model-viewer')?.setAttribute('exposure', String(exposure));
  }, [exposure]);

  return (
    <span className={interactive ? 'token-model token-model-interactive' : 'token-model'}
      data-ready={ready ? '' : undefined} aria-hidden={interactive ? undefined : true}>
      <img src={tokenPosterUrl(token)} alt={interactive ? `${label}. ${desc}.` : ''} draggable={false} />
      <span ref={slot} data-orbit={cameraOrbit} data-exposure={exposure} />
    </span>
  );
};
