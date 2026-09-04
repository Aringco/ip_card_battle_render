'use client';

import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-board-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

/**
 * 폼 카드 — 확장된 패널 배경 위에 얹히는 나무 액자 백보드.
 *
 * 예전에는 반투명 흰 카드였다. 배경이 카드테이블 일러스트가 되면서 흰 사각형이 겉돌아,
 * 같은 세계관의 액자 그림으로 바꿨다. 액자는 `border-image`로 9분할해 그리므로
 * 폼이 어떤 비율로 늘어나도 모서리 잎 덩어리가 찌그러지지 않는다(globals.css 참조).
 * 이미지 경로는 CSS가 아니라 여기서 --form-board로 흘려보내 lobbyAssets.ts에 모아둔다.
 *
 * 뒤로가기는 스테이지 아래 전용 버튼(BackButton)이 담당하므로 카드 안에는 두지 않는다.
 * 스테이지 높이가 고정이라 내용이 길어지면 감싸는 .stage-form이 안에서 스크롤한다.
 *
 * description이 문자열이 아니라 ReactNode인 이유 — 폼은 세로로 늘어날 수 없어서
 * (position:absolute), 경고를 새 줄로 덧붙이는 대신 **이 한 줄을 갈아끼워** 쓴다.
 * 방 만들기의 팀 이름 충돌 경고가 그 예다.
 */
export function FormCard({
  title,
  description,
  children,
  side,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /**
   * 게임 규칙처럼 펼치면 길어지는 덩어리. 접혀 있을 때는 children 아래에 그대로 이어
   * 붙고, 펼치면 **오른쪽 열**로 옮겨간다(넓은 화면에 한해). 세로로만 자라면 스테이지
   * 박스를 넘겨 스크롤바가 생기는데, 가로는 380~527px이 늘 놀고 있어서 그쪽으로 편다.
   */
  side?: React.ReactNode;
  /** 제출 버튼 — 2열이 되면 왼쪽 열 맨 아래에 남아야 해서 children과 분리한다. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="lobby-form-wrap min-h-full flex items-center justify-center">
      <div
        className="lobby-form-board w-full"
        style={{
          ['--form-board' as string]: `url(${LOBBY_ASSETS.formBoard})`,
          ['--orn-tl' as string]: `url(${LOBBY_ASSETS.cornerTL})`,
          ['--orn-tr' as string]: `url(${LOBBY_ASSETS.cornerTR})`,
          ['--orn-bl' as string]: `url(${LOBBY_ASSETS.cornerBL})`,
          ['--orn-br' as string]: `url(${LOBBY_ASSETS.cornerBR})`,
        }}
      >
        <div className="lobby-form-head">
          <h3 className="font-bold text-board-ink">{title}</h3>
          {description && <p className="text-xs text-board-muted mt-0.5">{description}</p>}
        </div>
        <div className="lobby-form-fields">{children}</div>
        {side && <div className="lobby-form-side">{side}</div>}
        {footer && <div className="lobby-form-foot">{footer}</div>}
      </div>
    </div>
  );
}
