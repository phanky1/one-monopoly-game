export function TenderWithdrawalReceipt({ port, is3D }: { port: string; is3D: boolean }) {
  return <div className="tender-withdrawal" data-tender-withdrawn role="status">
    <strong>Đã rút báo giá tại {port}</strong>
    <span>Bạn có thể báo giá lại trước khi kết thúc lượt.</span>
    <svg className="tender-withdrawal-scene" viewBox="0 0 246 58" data-view={is3D ? 'tilted' : 'flat'} aria-hidden="true">
      <path d="M0 46h246v12H0z" fill="#d7dac6" />
      <path d="M0 46h246" stroke="#a9b8a9" />
      <path d="M81 35h65m-6-4 6 4-6 4" fill="none" stroke="#718b82" strokeDasharray="3 3" />
      <g stroke="#35585e" strokeLinejoin="round">
        {is3D && <path d="m19 25 9-7h51l-9 7z" fill="#91aaa4" />}
        <path d="M19 25h51v24H19z" fill="#416769" />
        {is3D && <path d="m70 25 9-7v24l-9 7z" fill="#2e5057" />}
        <path d="M26 29h35" stroke="#1a3941" strokeWidth="3.5" />
        <path d="M34 36h20v8H34z" fill="#f5efd9" />
        <path d="M38 40h11" stroke="#779088" />
      </g>
      <path d="M164 46V24h18l4 4h39v18z" fill="#d4af68" stroke="#816d4f" />
      <g data-tender-withdraw-motion="" strokeLinejoin="round">
        {is3D && <path d="m170 19 4-3h37v20l-4 3z" fill="#c6bca6" stroke="#9d9381" />}
        <path d="M170 19h37v21h-37z" fill="#fff8e5" stroke="#776e68" />
        <path d="m170 19 18.5 13L207 19" fill="#f1e8d1" stroke="#9e9383" />
        <circle cx="188.5" cy="31" r="3.6" fill="#9f3262" />
      </g>
      <path d="m161 33 18 2 4-4h46l-5 17h-59z" fill="#d8bb7d" stroke="#816d4f" strokeLinejoin="round" />
      <path d="M183 36h25v8h-25z" fill="#fff5d9" />
      <path d="m192 39 2.5 2.5 5-5" fill="none" stroke="#416d5e" strokeWidth="1.7" />
    </svg>
  </div>;
}
