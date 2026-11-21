import { useId, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import type { GameMode } from '@one-monopoly/shared';
import { BoardDialog } from './BoardDialog.js';
import './beginner-guide.css';

const names = { harbor: 'Monopoly', logistics: 'Empty Reposition', classic: 'Monopoly cổ điển' } as const;
const modes: GameMode[] = ['harbor', 'logistics', 'classic'];

interface Choice { label: string; feedback: string; correct: boolean }
interface Step {
  title: string;
  copy: string[];
  figures?: [string, string][];
  practice?: { question: string; choices: Choice[] };
}

function harborGuide(supportsBooking: boolean, supportsPurchase: boolean, supportsTurnaround: boolean, supportsCharterPickup: boolean): Step[] {
  return [
    {
      title: 'Xếp hàng trước khi lắc xúc xắc',
      copy: [
        'Ở Singapore, mở “Bến ở lần gieo tới” trong mục “Vận tải cảng” để xem cơ hội cập từng bến. Chọn tên bến để xem số dư thay đổi thế nào nếu chở hàng hoặc đi tàu rỗng. Muốn nhận lô miễn phí, chọn “Xếp 1 container”.',
        'Bạn xếp miễn phí cả ở cảng đang hoạt động của mình. Khi tàu đã có hàng, bấm một cảng khác trên bàn cờ hoặc mở “Sổ cảng” trên hải đồ để xem số dư dự kiến khi dỡ, sau phí bến và tiền thuê.',
        supportsPurchase
          ? 'Lắc xúc xắc để ghé cảng. Ở Cái Mép chưa có chủ, chọn “Mua cảng và dỡ hàng” để dùng $12M cước từ Singapore cùng $48M tiền mặt mua cảng giá $60M. Muốn giữ hàng, bạn có thể mua bằng tiền mặt hoặc mở đấu giá.'
          : 'Chọn “Lắc xúc xắc!” để di chuyển. Ở cảng chưa có chủ, xem tiền thuê, phần cước và số cảng cùng màu bạn sẽ có trước khi mua hoặc trả giá. Sau đó bạn mới chọn dỡ hàng.',
      ],
      figures: [['Cảng xuất phát', 'Singapore'], ['Khoang tàu', '1 container'], ['Tiền ban đầu', '$1.500M']],
    },
    {
      title: 'Thử trả giá Cái Mép',
      copy: [
        'Bạn cập Cái Mép với $52M và một container từ Singapore. Bạn mở đấu giá. Linh đang dẫn với $40M. Đến lượt mình, nhập 50 vào ô “Giá trả của bạn” để xem trước số dư.',
        'Nếu bạn thắng, dỡ hàng sẽ mang về $12M. Nếu Linh thắng và đây là cảng duy nhất của cô trong nhóm màu, bạn có thể dỡ để nhận $9M. Bạn quyết định dỡ hay giữ hàng sau khi phiên kết thúc.',
      ],
      practice: { question: 'Bạn thắng với giá $50M. Khi vừa nhận cảng và hàng vẫn trên tàu, bạn còn bao nhiêu tiền mặt?', choices: [
        { label: '$2M', correct: true, feedback: 'Đúng. Trả $50M từ số dư $52M thì còn $2M. Nếu dỡ hàng sau đó, số dư mới lên $14M.' },
        { label: '$14M', correct: false, feedback: 'Đó là số dư sau khi dỡ hàng. Khi vừa chốt phiên, bạn chỉ thanh toán giá mua cảng.' },
      ] },
    },
    {
      title: 'Phân biệt tiền thuê và cước hàng',
      copy: [
        'Cái Mép có giá mua $60M. Giả sử Minh sở hữu cảng, chưa nâng cấp và chưa đủ bộ màu. Nếu có đủ tiền khi cập bến, bạn trả Minh $4M tiền thuê.',
        'Nếu chọn “Dỡ hàng”, chuyến từ Singapore có cước $12M. Minh giữ 25% cước, tức $3M phí khai thác.',
        'Nếu thiếu tiền thuê ở cảng của đối thủ, mở “Xử lý công nợ”. Bạn có thể dùng phần cước của tàu để trả thuê, hoặc thế chấp tài sản và giữ hàng cho chuyến sau.',
      ],
      practice: { question: 'Chỉ tính lần dỡ hàng này, tàu của bạn nhận bao nhiêu?', choices: [
        { label: '$5M', correct: false, feedback: 'Tiền thuê $4M đã được xử lý khi cập bến. Khi dỡ, lấy $12M trừ $3M phí khai thác.' },
        { label: '$9M', correct: true, feedback: 'Đúng. Biên lai ghi $9M cho tàu và $3M cho Minh. Khoản thuê $4M đã được tính riêng.' },
      ] },
    },
    {
      title: supportsBooking ? 'Đổi cảng, xây bãi và kết thúc lượt' : 'Đổi cảng và kết thúc lượt',
      copy: [
        'Mở “Giao dịch” và chọn cảng muốn mua. Bạn có thể trả tiền hoặc chọn “Cảng của bạn muốn đem đổi”. Nhập 0 để đổi ngang, hoặc thêm tiền bù. Bấm tên tuyến để so sánh tiền thuê và phần cước. Chủ cảng có thể ra giá khác một lần.',
        supportsTurnaround
          ? 'Xây cấp 1 để mở bãi xuất hàng. Khi đến với một container, bạn có thể chọn “Dỡ và xếp lô mới” ngay trong lần ghé. Xếp lô mới miễn phí ở cảng của mình. Ở cảng đối thủ, bạn trả chủ cảng $3M, hoặc $6M nếu họ có trọn nhóm màu.'
          : supportsBooking
          ? 'Xây cấp 1 để mở bãi xuất hàng. Khi tàu đối thủ tới với khoang trống, họ có thể trả bạn $3M để xếp một container hoặc rời bến với khoang trống. Nếu bạn sở hữu trọn nhóm màu, phí xếp là $6M. Tiền thuê tính riêng khi tàu cập bến.'
          : 'Sở hữu cả Cát Lái và Cái Mép giúp bạn nhận 50% cước khi đối thủ dỡ hàng ở hai bến này.',
        'Nếu tàu có hàng ở cảng đang thế chấp của mình, bạn có thể dùng tiền cước để chuộc cảng và dỡ hàng, rồi trả phần còn lại bằng tiền mặt. Xử lý xong, chọn “Kết thúc lượt”. Người cuối cùng chưa phá sản sẽ thắng.',
      ],
      figures: supportsBooking
        ? [['Cái Mép cấp 1', '$20M tiền thuê'], ['Phí xếp một lô', '$3M'], ['Có trọn nhóm màu', '$6M phí xếp']]
        : [['Cước ví dụ', '$12M'], ['Chủ trọn tuyến', '$6M'], ['Hãng vận chuyển', '$6M']],
      practice: supportsTurnaround ? {
        question: 'Tại Cái Mép của Linh, bạn sẽ nhận $9M khi dỡ và mất $3M nếu xếp lô mới. Muốn rời cảng với một container thì số dư tăng bao nhiêu?',
        choices: [
          { label: '$6M', correct: true, feedback: 'Đúng. Bạn giữ $6M và chở lô mới từ Cái Mép. Bạn sẽ nhận cước của lô này khi dỡ ở một cảng khác.' },
          { label: '$9M', correct: false, feedback: 'Nếu chỉ dỡ hàng, bạn giữ $9M và rời cảng với khoang trống. Xếp lô mới tốn thêm $3M.' },
        ],
      } : undefined,
    },
    ...(supportsCharterPickup ? [{
      title: 'Dùng quyền chia chỗ',
      copy: [
        'Bạn có một tuyến dịch vụ và cập Cái Mép cấp 1 của Linh. Nếu Linh đồng ý chia chỗ, bạn trả $10M tiền thuê thay vì $20M. Sau khi trả xong, bạn có một quyền chia chỗ ở Cái Mép.',
        'Nếu giữ quyền và một hãng thứ ba cập bến, bạn nhận một nửa tiền thuê của lần đó, làm tròn xuống. Bạn cũng có thể chọn “Dùng quyền chia chỗ để xếp hàng”. Ở cảng này, nếu Linh chưa đủ bộ màu, quyền giúp bạn tiết kiệm $3M phí xếp. Khi dùng quyền, bạn vẫn nhận cước của lô vừa dỡ.',
      ],
      practice: { question: 'Chỉ còn hai người chơi. Bạn muốn chở một lô mới từ Cái Mép. Quyền chia chỗ giúp bạn làm gì ngay bây giờ?', choices: [
        { label: 'Xếp lô mới miễn phí', correct: true, feedback: 'Đúng. Bạn dùng quyền để miễn phí xếp và nhận một container từ Cái Mép. Cước của lô mới được trả khi dỡ ở bến khác.' },
        { label: 'Chờ chia tiền thuê', correct: false, feedback: 'Phải có một hãng thứ ba ghé bến thì hai bên mới chia tiền thuê. Ván này chỉ còn bạn và Linh.' },
      ] },
    }] : []),
  ];
}

const guides = {
  logistics: [
    {
      title: 'Tìm vỏ dư ở cảng xuất phát',
      copy: [
        'Trong bàn điều vận ở Singapore, chọn “Container rỗng”. So sánh số vỏ đang có với mục tiêu của bãi. Bạn có thể xếp một vỏ khi số đang có cao hơn mục tiêu.',
        'Chọn Cái Mép làm cảng dỡ rồi bấm “Xếp container rỗng”. Vận đơn trên tàu sẽ ghi cảng nhận.',
      ],
      figures: [['Vỏ tại Singapore', '4'], ['Mục tiêu bãi', '1'], ['Vỏ dư', '3']],
    },
    {
      title: 'Chọn bến đang thiếu vỏ',
      copy: [
        'Cái Mép đang có 1 vỏ, cần 2. Laem Chabang đang có 3 vỏ, cần 2. Một bến thiếu vỏ có thể nhận vỏ của bạn.',
      ],
      practice: { question: 'Bạn nên ghi cảng nào trên vận đơn cho chuyến này?', choices: [
        { label: 'Cái Mép', correct: true, feedback: 'Đúng. Thêm một vỏ sẽ đưa Cái Mép từ 1 lên 2, vừa đủ mục tiêu. Cước cơ bản từ Singapore là $6M.' },
        { label: 'Laem Chabang', correct: false, feedback: 'Bãi này đang dư 1 vỏ. Cái Mép còn thiếu 1 vỏ so với mục tiêu 2.' },
      ] },
    },
    {
      title: 'Khởi hành, dỡ vỏ rồi kết thúc lượt',
      copy: [
        'Chọn “Khởi hành đến Cái Mép”. Khi cập đúng bến và bãi còn chỗ nhận, chọn “Dỡ container rỗng” để nhận $6M cước cơ bản. Bấm “Kết thúc lượt” để chuyển quyền cho thuyền trưởng kế tiếp.',
        'Khi có người giao đủ 3 chuyến, cả bàn chơi hết vòng hiện tại. Nếu chưa ai đạt mốc này, ván kết thúc sau vòng 8. Ai giao nhiều chuyến nhất thắng. Nếu bằng số chuyến, so tiền cước đã kiếm.',
      ],
      figures: [['Singapore → Cái Mép', '$6M'], ['Mốc vòng cuối', '3 chuyến'], ['Giới hạn', '8 vòng']],
    },
  ],
  classic: [
    {
      title: 'Lắc xúc xắc để ghé cảng',
      copy: [
        'Bạn bắt đầu tại Singapore với $1.500M. Đến lượt mình, chọn “Lắc xúc xắc!”. Tàu sẽ đi theo tổng số chấm trên hai mặt xúc xắc.',
        'Bấm vào một ô cảng để xem giấy sở hữu, giá mua và biểu cước. Nếu ghé một cảng đang hoạt động của đối thủ, tàu trả tiền thuê theo mức hiện tại.',
      ],
      figures: [['Cảng xuất phát', 'Singapore'], ['Giá Cái Mép', '$60M'], ['Tiền thuê cơ bản', '$4M']],
    },
    {
      title: 'Mua cảng hoặc mở đấu giá',
      copy: [
        'Khi đến Cái Mép lúc chưa có chủ, bạn được quyền mua theo giá niêm yết. Nếu mở đấu giá, người thắng phiên trả mức họ đã đặt.',
      ],
      practice: { question: 'Bạn có đủ tiền và muốn sở hữu ngay Cái Mép với $60M. Chọn nút nào?', choices: [
        { label: 'Mở đấu giá', correct: false, feedback: 'Lựa chọn này mở phiên cho các hãng đặt giá. Chọn “Mua ngay” để trả đúng $60M và nhận cảng ngay.' },
        { label: 'Mua ngay', correct: true, feedback: 'Đúng. Bạn trả $60M để nhận giấy sở hữu. Sau đó bạn có thể thu tiền thuê khi đối thủ ghé cảng.' },
      ] },
    },
    {
      title: 'Thu tiền thuê và hoàn tất lượt',
      copy: [
        'Thu thập các cảng cùng màu để tăng tiền thuê. Có thể xem chủ sở hữu và từng mức tiền thuê bằng cách mở giấy sở hữu của cảng.',
        'Sau khi xử lý ô vừa đến và quyết định mua hoặc đấu giá, bấm “Kết thúc lượt”. Giữ tiền dự phòng cho các khoản phải trả. Người cuối cùng chưa phá sản là người thắng.',
      ],
    },
  ],
} satisfies Record<Exclude<GameMode, 'harbor'>, Step[]>;

interface Props { mode: GameMode; onClose: () => void; live?: boolean; supportsBooking?: boolean; supportsPurchase?: boolean; supportsTurnaround?: boolean; supportsCharterPickup?: boolean }

export function BeginnerGuide({ mode, onClose, live = false, supportsBooking = true, supportsPurchase = true, supportsTurnaround = true, supportsCharterPickup = true }: Props) {
  const [selected, setSelected] = useState(mode);
  const [page, setPage] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const id = useId(), heading = useRef<HTMLHeadingElement>(null), moveFocus = useRef(false);
  const steps: Step[] = selected === 'harbor' ? harborGuide(supportsBooking, supportsPurchase, supportsTurnaround, supportsCharterPickup) : guides[selected];
  const step = steps[page];
  const response = answer !== null ? step.practice?.choices[answer] : null;

  useLayoutEffect(() => {
    if (moveFocus.current) {
      heading.current?.focus();
      moveFocus.current = false;
    }
  }, [page]);

  function changePage(next: number) {
    moveFocus.current = true;
    setPage(next);
    setAnswer(null);
  }

  return <BoardDialog labelledBy={id + '-title'} onClose={onClose}>
    <section className="beginner-guide" data-beginner-guide={selected}>
      <header className="beginner-guide-heading">
        <BookOpen aria-hidden="true" size={23} /><h2 id={id + '-title'}>Hướng dẫn cho người mới</h2>
        <button type="button" data-guide-close aria-label="Đóng hướng dẫn" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="beginner-guide-body">
        {live && <p className="beginner-guide-clock"><Clock3 size={14} aria-hidden="true" />Đồng hồ lượt vẫn chạy khi xem hướng dẫn.</p>}
        <div className="beginner-guide-modes" role="group" aria-label="Chọn chế độ muốn tìm hiểu">
          {modes.map(key => <button key={key} type="button" data-guide-mode={key} aria-pressed={selected === key}
            onClick={() => { if (selected !== key) { setSelected(key); setPage(0); setAnswer(null); } }}>{names[key]}</button>)}
        </div>
        <article className="beginner-guide-step" data-guide-step={page + 1} aria-labelledby={id + '-step'}>
          <p className="beginner-guide-progress" id={id + '-progress'} aria-live="polite" aria-atomic="true">
            {names[selected]} <span aria-hidden="true">·</span> Bước {page + 1} / {steps.length}
          </p>
          <h3 id={id + '-step'} ref={heading} tabIndex={-1} aria-describedby={id + '-progress'}>{step.title}</h3>
          {step.copy.map(line => <p key={line}>{line}</p>)}
          {step.figures && <dl className="beginner-guide-figures">{step.figures.map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
          {step.practice && <fieldset className="beginner-guide-practice">
            <legend>Thử chọn</legend>
            <p>{step.practice.question}</p>
            <div>{step.practice.choices.map((choice, i) => <button key={choice.label} type="button"
              data-guide-choice={i} aria-pressed={answer === i} onClick={() => setAnswer(i)}>
              {answer === i && choice.correct && <Check size={14} aria-hidden="true" />}{choice.label}
            </button>)}</div>
            <p role="status" aria-atomic="true" data-guide-feedback={response ? (response.correct ? 'correct' : 'retry') : undefined}>
              {response?.feedback}
            </p>
          </fieldset>}
        </article>
      </div>
      <footer className="beginner-guide-navigation">
        <button type="button" data-guide-back disabled={page === 0} onClick={() => changePage(page - 1)}>
          <ChevronLeft size={16} aria-hidden="true" />Quay lại
        </button>
        <button type="button" data-guide-next onClick={() => page === steps.length - 1 ? onClose() : changePage(page + 1)}>
          {page === steps.length - 1 ? 'Hoàn tất' : 'Tiếp theo'}<ChevronRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </section>
  </BoardDialog>;
}

export default BeginnerGuide;
