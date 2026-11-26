import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

/** 그림 버튼(.pick-image-button)이 그리는 것 — 자리 셋 + 선 플레이어의 무작위 */
export type SeatFaceKind = 'A' | 'B' | 'spectator' | 'random';

/**
 * 자리 · 선 플레이어 그림 버튼의 안쪽.
 *
 * 두 모양을 **함께** 그려 둔다 — 평소에는 완성된 그림(`img`), 강화전 겉모양(`html[data-skin="enhance"]`)에서는
 * CSS로 그린 나무(관전자는 쇠) 판에 캐릭터 그림만 얹은 것(`.skin-seat`). 어느 쪽을 보일지는 CSS가 정한다
 * (styles/19-enhance-skin.css) — 컴포넌트가 겉모양을 알 필요가 없다.
 *
 * CSS 판은 네 종류가 **같은 가로세로 비율**(300 : 191)이라, 한 줄에 같은 폭으로 놓이면 크기가 같다.
 * 캐릭터는 판 안쪽 밝은 선 안에 갇혀 크게 키운 만큼 잘린다. 팀 1의 양 · 팀 2의 토끼는 좌우를 뒤집어 글씨를 보게 한다.
 */
export function SeatFace({ kind, img }: { kind: SeatFaceKind; img: string }) {
  return (
    <>
      <img className="seat-img" src={img} alt="" draggable={false} />
      <span className="skin-seat" data-kind={kind} aria-hidden="true">
        <span className="skin-seat-frame" />
        <span className="skin-seat-face">
          <span className="skin-seat-clip">
            {kind === 'A' && (
              <>
                <img className="skin-ch l flip" src={LOBBY_ASSETS.skinSheep} alt="" draggable={false} />
                <img className="skin-ch r" src={LOBBY_ASSETS.skinMermaid} alt="" draggable={false} />
              </>
            )}
            {kind === 'B' && (
              <>
                <img className="skin-ch l flip" src={LOBBY_ASSETS.skinRabbit} alt="" draggable={false} />
                <img className="skin-ch r" src={LOBBY_ASSETS.skinTiger} alt="" draggable={false} />
              </>
            )}
            {kind === 'spectator' && <img className="skin-ch l robot" src={LOBBY_ASSETS.skinRobot} alt="" draggable={false} />}
            {kind === 'random' && <img className="skin-ch l dice" src={LOBBY_ASSETS.skinDice} alt="" draggable={false} />}
          </span>
          <span className="skin-seat-label">
            {kind === 'A' ? '팀 1' : kind === 'B' ? '팀 2' : kind === 'spectator' ? '관전자' : '무작위'}
            {kind === 'spectator' && (
              <svg className="skin-seat-eye" viewBox="0 0 24 16" aria-hidden="true">
                <path d="M1.5 8Q12-3 22.5 8Q12 19 1.5 8Z" fill="none" stroke="#2b2e31" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="8" r="3.6" fill="#2b2e31" />
                <circle cx="13.2" cy="6.8" r="1.1" fill="#fff" />
              </svg>
            )}
          </span>
        </span>
      </span>
    </>
  );
}
