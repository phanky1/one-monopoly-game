import { useId, type CSSProperties } from 'react';
import type { BoardLighting } from './boardLighting.js';
import './board-sky.css';

interface Props {
  sky: BoardLighting;
}

export function BoardSky({ sky }: Props) {
  const patternId = useId();
  const waterMaskId = useId();
  const x = 240 + sky.sourceX * 163;
  const y = 240 + sky.sourceY * 154;
  const rainy = sky.weather !== 'clear';

  return (
    <svg className="board-sky" viewBox="0 0 480 480" aria-hidden="true" focusable="false"
      data-body={sky.body} data-phase={sky.phase} data-weather={sky.weather}
      style={{ '--sky-x': `${x / 4.8}%`, '--sky-y': `${y / 4.8}%` } as CSSProperties}>
      {rainy && (
        <>
          <defs>
            <pattern id={patternId} width="36" height="30" patternUnits="userSpaceOnUse">
              <path d="m5 3-4 7m21 5-5 9m18-23-2 4" fill="none" stroke="currentColor"
                strokeWidth="1.4" strokeLinecap="round" />
            </pattern>
            <mask id={waterMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="480">
              <rect width="480" height="480" fill="white" />
              <use href="#chart-coasts" fill="black" />
            </mask>
          </defs>
          <g className="board-sky-storm" mask={`url(#${waterMaskId})`}>
            <g className="board-sky-showers" fill={`url(#${patternId})`}>
              <path d="M-18 177Q74 94 191 99q-11 20-46 46-83 15-163 97z" />
              {sky.weather === 'storm' && <path d="M239 329q135-118 258-106v55q-119-6-210 79z" />}
            </g>
            {sky.weather === 'storm' && <g className="board-sky-fronts" fill="none" stroke="currentColor" strokeLinecap="round">
              <path d="M8 178q53-54 111-65t92-28m-171 72q35-32 77-42m196 173q68-51 146-49m-108 29q41-28 97-26" />
            </g>}
          </g>
        </>
      )}

      <g key={sky.body} className="board-sky-source" style={{ transform: `translate(${x}px, ${y}px)` }}>
        {sky.body === 'sun' ? (
          <g className="board-sky-sun">
            <circle r="27" className="board-sky-scale" fill="none" stroke="currentColor" strokeDasharray="1 4.3" />
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={i % 3 === 0 ? 'M0-15v-11' : 'M0-15v-6'} transform={`rotate(${i * 30})`}
                stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            ))}
            <circle r="11.5" fill="#ffe4a1" stroke="currentColor" strokeWidth="2" />
            <path d="M-8.5 0a8.5 8.5 0 0 1 8.5-8.5" stroke="#fff8dd" fill="none" strokeWidth="2" />
          </g>
        ) : (
          <g className="board-sky-moon">
            <circle r="25" className="board-sky-scale" fill="none" stroke="currentColor" strokeDasharray="1 4.3" />
            <path d="M4-15A16 16 0 1 0 16 8 16 16 0 0 1 4-15Z"
              fill="#fff1cd" stroke="#203a50" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="m11-11 1.1 3.2 3.1 1-3.1 1.1L11-2.5l-1-3.2-3.2-1.1 3.2-1z" fill="currentColor" />
          </g>
        )}
        {rainy && (
          <g className="board-sky-cloud" transform="translate(-12 8)" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-23 6q1-7 8-7 2-9 11-8 6 0 9 6 6-3 10 1 6-1 9 6z" />
            <path d="M-18 10H5m-15 4H0m8-4h6" fill="none" />
          </g>
        )}
      </g>
    </svg>
  );
}
