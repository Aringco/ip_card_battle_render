'use client';

/**
 * 세로로 든 폰에 띄우는 "가로로 돌려 주세요" 안내.
 *
 * 왜 필요한가 — 플레이 화면은 **가로 한 장짜리 나무 액자**(1965×1000) 위에 칸 열 개를
 * 얹은 구조다(`client/public/play/play_frame.webp`). 세로 화면에서는 그 액자가 화면 폭에
 * 묶여 높이의 4분의 1만 쓰고, 그 안의 글자는 1~2px가 된다. 같은 액자를 유지하는 한
 * 세로에서 성립할 방법이 없다 — 세로 전용 배치는 별개의 작업이다(MOBILE_ROADMAP.md M6).
 * 그때까지는 깨진 화면을 보여주느니 돌려 달라고 하는 편이 낫다.
 *
 * ⚠️ **보이는 조건은 CSS가 정한다**(globals.css의 `.rotate-hint`). 여기서
 *    `matchMedia`를 읽어 조건부로 렌더하지 않는 이유 둘 —
 *    ① 렌더 도중에 읽으면 서버 렌더와 첫 클라이언트 렌더가 달라 hydration 경고가 뜬다.
 *    ② 회전할 때마다 리렌더가 돌아야 한다. CSS에 맡기면 둘 다 없다.
 *
 * ⚠️ **게임은 멈추지 않는다.** 여러 사람이 하는 판이라 한 사람이 폰을 세로로 들었다고
 *    판을 세울 수는 없다 — 턴 제한시간은 그대로 흐른다. 그래서 안내에 그 사실을 적는다.
 */
export function RotateHint() {
  return (
    <div className="rotate-hint" role="alert">
      <div className="rotate-hint-card">
        {/* 그림은 새로 만들지 않고 이미 있는 조각을 쓴다(MOBILE_ROADMAP.md 제약 C3).
            `rotate_hint_icon`은 CSS가 나무 화살표(arrow_wood)를 90° 돌려 그린다. */}
        <span className="rotate-hint-icon" aria-hidden />
        <p className="rotate-hint-title">화면을 가로로 돌려 주세요</p>
        <p className="rotate-hint-sub">
          카드판이 가로로 펼쳐지는 게임이라, 세로로는 글씨가 너무 작아집니다.
          <br />
          지금이 내 차례라면 시간은 그대로 흐르고 있어요.
        </p>
      </div>
    </div>
  );
}
