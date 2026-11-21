import { useId } from 'react';
import './street-turn-scene.css';

function Wheel({ x, y, radius = 4 }: { x: number; y: number; radius?: number }) {
  return <g>
    <circle cx={x} cy={y} r={radius} fill="#263941" />
    <circle cx={x} cy={y} r={radius * .54} fill="#aab4a7" />
    <circle cx={x} cy={y} r={radius * .23} fill="#45606a" />
  </g>;
}

function Exporter({ tilted }: { tilted: boolean }) {
  return <g>
    <path d="M212 31V19l23-12v11l24-12v11l25-12v11l24-12v12l14-1v53H212z" fill="#b75e49" />
    {tilted && <path d="m212 19 23-12 7-4v12l24-12v11l25-12v11l24-12v12l12-2v51l-5 6V15l-14 1V4l-24 12V5l-25 12V6l-24 12V7z" fill="#db9571" />}
    <path d="m217 18 15-7v7zm23-1 16-7v7zm25-1 16-7v7zm24-1 16-7v7z" fill="#d0e5db" />
    <path d="M215 31h105m-103-3h101" stroke="#914d42" strokeWidth="1.3" />
    <path d="M220 39h21v28h-21z" fill="#cf9270" />
    <path d="M223 40v25m5-25v25m6-25v25" stroke="#a76653" strokeWidth=".8" />
    <path d="M248 34h64v35h-64z" fill="#374f50" />
    <path d="M252 37h55v4h-55z" fill="#72877b" />
    <path d="M248 34h64v4h-64z" fill="#e3bd80" />
    <path d="M247 37v32m66-32v32" stroke="#ecd293" strokeWidth="3" />
    <path d="M246 55l3-2m-3 9 3-2m63-5 3-2m-3 9 3-2" stroke="#56615a" strokeWidth="2.2" />
    <path d="M287 55h12v13h-12zm13 5h7v8h-7z" fill="#b8864f" />
    <path d="M291 55v13m10-8v8" stroke="#d9bd80" strokeWidth="2" />
    <text x="277" y="27" textAnchor="middle" fill="#fff5d8">KHO XUẤT</text>
  </g>;
}

function ExportTruck({ tilted }: { tilted: boolean }) {
  return <g data-street-truck="">
    <ellipse cx="143" cy="76" rx="60" ry={tilted ? 3.5 : 1.5} fill="#63776e" opacity=".4" />
    <path d="M83 65h29l4 3h79v4h-84l-5-2H82z" fill="#334b51" />
    <path d="M114 65h84v3h-84z" fill="#ccaa6b" />
    <path d="M110 58h5v8h-5z" fill="#526868" />
    <path d="M82 58l6-12h17l4 5v16H81z" fill="#277271" />
    {tilted && <>
      <path d="m88 46 6-4h16l-5 4z" fill="#8ac3a9" />
      <path d="m105 46 5-4 5 7v13l-6 5V51z" fill="#164e55" />
    </>}
    <path d="m84 57 5-9h8v9z" fill="#c5dfce" />
    <path d="M99 48h5l2 3v6h-7z" fill="#96c7c2" />
    <path d="m82 60 25-1v2l-26 3z" fill="#e6be63" />
    <path d="M81 63h5v2h-5z" fill="#f7eab3" />
    <path d="M101 59h4m-4 6h4" stroke="#1a4e53" />
    <Wheel x={89} y={70} radius={5} /><Wheel x={109} y={70} />
    <Wheel x={177} y={70} /><Wheel x={187} y={70} />
    <g data-street-box="">
      {tilted && <>
        <path d="m122 43 7-5h63l-7 5z" fill="#e18a92" />
        <path d="m185 43 7-5v22l-7 5z" fill="#713b50" />
      </>}
      <rect x="122" y="43" width="63" height="22" rx=".8" fill="#ad4967" stroke="#70394e" />
      <path d="M125 46v16m5-16v16m5-16v16m5-16v16m5-16v16m5-16v16m5-16v16m5-16v16m5-16v16m5-16v16m5-16v16m5-16v16"
        fill="none" stroke="#d67988" strokeWidth="1.6" />
      <path d="M123 45h60m-60 18h60" stroke="#89425c" />
      <path d={tilted ? 'm185 43 7-5v22l-7 5z' : 'M183 43h7v22h-7z'} fill="#3e4346" />
      <g className="street-rear-door">
        <path d={tilted ? 'm185 43 7-5v22l-7 5z' : 'M183 43h7v22h-7z'} fill="#783a53" stroke="#67404c" strokeWidth=".8" />
        <path d={tilted ? 'M187 44v17m3-19v17' : 'M185 45v17m3-17v17'} stroke="#d7bdab" strokeWidth="1.2" />
      </g>
      <g data-street-seal="">
        <rect x="149" y="48" width="27" height="12" rx="1.5" fill="#fff1cc" stroke="#874456" />
        <text x="162.5" y="56.3" textAnchor="middle" fill="#65394a">XUẤT</text>
        <path d={tilted ? 'M187 52h4v4h-4z' : 'M184 52h5v4h-5z'} fill="#f9cc54" />
      </g>
    </g>
  </g>;
}

function Forklift({ tilted }: { tilted: boolean }) {
  return <g data-street-forklift="">
    <ellipse cx="265" cy="76" rx="19" ry={tilted ? 2.7 : 1.3} fill="#667b6b" opacity=".35" />
    <path d="M252 46h3v20h-23v-2h20z" fill="#344d53" />
    <path d="M256 52v13h5" stroke="#829690" strokeWidth="2" fill="none" />
    <path d="M257 64h7l2-6h11l4 8v5h-25z" fill="#dfa136" stroke="#8c6738" strokeWidth=".8" />
    {tilted && <path d="m266 58 5-3h10l5 9-5 2-4-8z" fill="#f2bd56" />}
    <path d="M261 62V47h15v13m-14-13-3 14" fill="none" stroke="#354f53" strokeWidth="2.3" />
    {tilted && <path d="m259 46 4-3h16l-3 3z" fill="#9ba895" />}
    <path d="M258 46h19" stroke="#345859" strokeWidth="2.5" />
    <circle cx="267" cy="52" r="2.4" fill="#c78f6b" />
    <path d="M264 51h5" stroke="#e4bd63" strokeWidth="1.3" />
    <path d="m267 55-1 5h4m-4-4-4 2" stroke="#516e6a" strokeWidth="2.6" fill="none" />
    <Wheel x={259} y={70} radius={4.7} /><Wheel x={277} y={70} radius={3.6} />
    <g data-street-pallet="">
      <path d="M231 61h17v3h-17z" fill="#845f3d" />
      <path d="M232 50h14v11h-14z" fill="#d0a065" stroke="#845f3d" strokeWidth=".8" />
      {tilted && <path d="m232 50 4-3h14l-4 3z" fill="#e9c88d" />}
      <path d="M238 50h3v11h-3z" fill="#efe0a6" />
    </g>
  </g>;
}

export function StreetTurnScene({ is3D, animate }: { is3D: boolean; animate: boolean }) {
  const title = useId();
  return <figure className="street-turn-scene" data-street-scene="" data-view={is3D ? 'tilted' : 'flat'} data-animate={animate}>
    <svg viewBox="0 0 328 82" aria-labelledby={title} role="img" focusable="false">
      <title id={title}>Xe đưa vỏ vừa dỡ hàng đến kho xuất. Xe nâng xếp hàng mới vào cùng vỏ, rồi kho niêm phong container.</title>
      <path fill="#e5ede1" d="M0 0h328v82H0z" />
      <path fill="#ccd9c8" d="M0 40h13v-6h17v5h15v-9h10v10h17v-5h10v5h32v-5h18v5h14v-3h19v5h34v23H0z" />
      <path d="M0 36 17 24h38l11 9v32H0z" fill="#b2c4af" />
      <path d="M0 36 17 24h38l11 9H0z" fill="#789993" />
      <path d="M12 38h26v23H12z" fill="#687e77" />
      <path d="M14 41h22m-22 4h22m-22 4h22" stroke="#a9b6a1" strokeWidth="2" />
      <path d={is3D ? 'M0 64 22 57h306v25H0z' : 'M0 63h328v19H0z'} fill="#c6cebb" />
      <path d="M0 77h328m-325-3h10m13 0h10m15 0h10m14 0h11" stroke="#f1ebd2" fill="none" strokeWidth="1.4" />
      <Exporter tilted={is3D} />
      <Forklift tilted={is3D} />
      <ExportTruck tilted={is3D} />
    </svg>
    <figcaption><span>Xe chuyển vỏ nhập</span><span aria-hidden="true">→</span><strong>Kho đóng hàng xuất</strong></figcaption>
  </figure>;
}
