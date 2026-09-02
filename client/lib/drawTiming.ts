// 뽑기 슬롯머신·울 볼 연출의 타이밍 상수. useAnimationQueue(스케줄러)와
// DrawSlotLayer/WoolBallLayer(실제 렌더링)가 동일한 값을 참조해야 어긋나지 않는다.
export const SLOT_SPIN_DUR = 650;   // 동물/숫자가 빠르게 순환하는 시간
export const SLOT_REVEAL_HOLD = 320; // 확정된 값을 잠깐 보여주는 시간
export const SLOT_FLY_DUR = 380;     // 스택으로 날아가는 시간
export const SLOT_TOTAL_DUR = SLOT_SPIN_DUR + SLOT_REVEAL_HOLD + SLOT_FLY_DUR;

export const WOOL_BALL_DUR = 500;     // 울 볼이 장소까지 굴러가는 시간
export const SHEEP_DRAW_STEP = 300;   // 실용신양 연쇄 중 다음 뽑기 시작까지의 간격
