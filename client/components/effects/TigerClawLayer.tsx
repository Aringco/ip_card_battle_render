'use client';

// 특허랑이 타격 — 화면 전체에 아주 길게 늘어진 마름모(진한 노랑 채우기 + 두꺼운 짙은
// 주황 테두리) 발톱자국 세 개가 슉! 하고 그어졌다 사라진다. 얇은 선(clip-path)이
// 아니라 SVG 폴리곤으로 그려야 두꺼운 테두리를 정확히 얹을 수 있다.
const CLAW_POINTS = '0,26 320,4 760,26 320,48';

function ClawShape() {
  return (
    <svg viewBox="0 0 760 52" preserveAspectRatio="none" className="tiger-claw-svg">
      <polygon points={CLAW_POINTS} className="tiger-claw-polygon" />
    </svg>
  );
}

export function TigerClawLayer({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="tiger-claw-layer" aria-hidden>
      <span className="tiger-claw tiger-claw-1">
        <ClawShape />
      </span>
      <span className="tiger-claw tiger-claw-2">
        <ClawShape />
      </span>
      <span className="tiger-claw tiger-claw-3">
        <ClawShape />
      </span>
    </div>
  );
}
