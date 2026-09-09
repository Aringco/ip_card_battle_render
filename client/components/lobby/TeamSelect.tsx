'use client';

import type { Seat } from 'shared';
import { SEATS, SPECTATOR } from 'shared';
import { seatLabel } from '@/lib/seatInfo';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';
import { Field } from './Field';

/** 자리마다의 그림 버튼. 글씨("팀 1"·"관전자")가 그림 안에 이미 들어 있다. */
const SEAT_IMAGE: Record<Seat, string> = {
  A: LOBBY_ASSETS.btnTeamA,
  B: LOBBY_ASSETS.btnTeamB,
  [SPECTATOR]: LOBBY_ASSETS.btnSpectator,
};

/**
 * 자리 선택 — 팀 1 / 팀 2 / 관전자.
 *
 * 이름과 배지는 `@/lib/seatInfo`가 한 곳에서 정한다. 대기실도 같은 값을 쓰므로,
 * "방 만들 때 고른 자리"와 "대기실에 앉아 있는 자리"가 같은 말로 보인다.
 *
 * 관전자를 고르면 무슨 뜻인지 알려야 하지만, 그 안내를 **여기 아래에 붙이지 않는다.**
 * 폼은 절대배치라 한 줄만 늘어도 좁은 화면에서 스크롤바가 생긴다(실측: 붙였더니
 * 1280×900에서 534→560px). 안내는 폼 카드의 설명 줄을 갈아끼워 보여준다 —
 * CreateRoomForm·JoinRoomForm의 `description` 참고.
 *
 * 2026-09-09에 글자 버튼에서 **그림 버튼**으로 바뀌었다. 글씨가 그림 안에 있어
 * 줄바꿈 걱정이 사라졌고(예전에는 "관전자"가 "관전 / 자"로 접혀 줄 높이가 늘었다),
 * 대신 그림이 가로로 넓어 세로를 조금 더 쓴다 — 폼 높이는 measureLobby로 확인할 것.
 */
export function TeamSelect({ team, onChange }: { team: Seat; onChange: (t: Seat) => void }) {
  return (
    <Field label="자리 선택">
      <div className="flex gap-1.5">
        {SEATS.map(t => (
          // 그림 안에 글씨가 있으므로 라벨을 겹쳐 쓰지 않는다 — 이름은 aria-label로만.
          // 고른 것/안 고른 것은 .pick-image-button이 색으로 가른다(aria-pressed).
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-pressed={team === t}
            aria-label={seatLabel(t)}
            title={seatLabel(t)}
            className="pick-image-button"
          >
            <img src={SEAT_IMAGE[t]} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </Field>
  );
}
