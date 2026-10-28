// 뽑기 슬롯머신·울 볼 연출의 타이밍 상수. useAnimationQueue(스케줄러)와
// DrawSlotLayer/WoolBallLayer(실제 렌더링)가 동일한 값을 참조해야 어긋나지 않는다.
export const SLOT_SPIN_DUR = 650;   // 동물/숫자가 빠르게 순환하는 시간
export const SLOT_REVEAL_HOLD = 320; // 확정된 값을 잠깐 보여주는 시간
export const SLOT_FLY_DUR = 380;     // 스택으로 날아가는 시간
export const SLOT_TOTAL_DUR = SLOT_SPIN_DUR + SLOT_REVEAL_HOLD + SLOT_FLY_DUR;

export const WOOL_BALL_DUR = 500;     // 울 볼이 장소까지 굴러가는 시간
// 예약 뽑기 연쇄의 간격(rollDrawStep — 많으면 좁아진다)과 장소 여러 장의 간격은 서버의 연출 유예 계산도 쓰므로 shared에 있다.
export { ROLL_DRAW_STEP_MS as SHEEP_DRAW_STEP, PLACE_DRAW_STEP_MS as PLACE_DRAW_STEP, rollDrawStep } from 'shared';
// (PLACE_DRAW_STEP — 카드 강화의 장소 여러 장은 겹쳐서 220ms 간격으로 띄운다. 한 장씩 끝까지(1.35초) 기다리면 5장에 7초가 걸린다.)
