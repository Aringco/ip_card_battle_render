// 뽑기 슬롯머신·울 볼 연출의 타이밍 상수. useAnimationQueue(스케줄러)와
// DrawSlotLayer/WoolBallLayer(실제 렌더링)가 동일한 값을 참조해야 어긋나지 않는다.
export const SLOT_SPIN_DUR = 650;   // 동물/숫자가 빠르게 순환하는 시간
export const SLOT_REVEAL_HOLD = 320; // 확정된 값을 잠깐 보여주는 시간
export const SLOT_FLY_DUR = 380;     // 스택으로 날아가는 시간
export const SLOT_TOTAL_DUR = SLOT_SPIN_DUR + SLOT_REVEAL_HOLD + SLOT_FLY_DUR;

export const WOOL_BALL_DUR = 500;     // 울 볼이 장소까지 굴러가는 시간
export const SHEEP_DRAW_STEP = 300;   // 실용신양 연쇄 중 다음 뽑기 시작까지의 간격
// 카드 강화 — 장소 한 번에 여러 장(1~3 / 3~5)이 나올 때 다음 장이 튀어나오기까지의 간격. 한 장씩 끝까지(1.35초) 기다리면
// 5장에 7초가 걸려서, 겹쳐서 빠르게 띄운다(서버의 연출 유예는 뽑기 한 장당 300ms로 넉넉히 잡혀 있다 — room.ts settleGraceMs).
export const PLACE_DRAW_STEP = 220;
