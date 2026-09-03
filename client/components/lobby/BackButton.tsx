'use client';

/**
 * 스테이지 아래 왼쪽의 뒤로가기 버튼.
 *
 * home에서는 자리를 지킨 채 투명해진다(레이아웃이 위아래로 튀지 않도록).
 * 한 단계씩 되돌리므로 라벨은 항상 "뒤로가기" — 어디로 가는지는 적지 않는다.
 */
export function BackButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      inert={hidden}
      className={`lobby-back self-start flex items-center gap-2 text-sm font-semibold text-white ${
        hidden ? 'lobby-back-hidden' : ''
      }`}
    >
      <span className="w-9 h-9 rounded-full bg-jungle-600 text-white flex items-center justify-center text-lg shadow-lg ring-1 ring-white/30">
        ←
      </span>
      {/* 어두운 펠트 배경 위에서도 읽히도록 그림자를 준다 */}
      <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">뒤로가기</span>
    </button>
  );
}
