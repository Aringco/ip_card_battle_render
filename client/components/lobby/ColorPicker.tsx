'use client';

import type { LobbyPlayer, PlayerColorId } from 'shared';
import { PLAYER_COLORS } from 'shared';

/**
 * 개인전 대기실의 색 고르기 — 사각형 12칸, 중복 불가.
 *
 * - 내 색은 굵은 테두리와 ✓로 드러낸다(색만으로 구분하지 않는다).
 * - 남이 쓰는 색은 비활성으로 흐리게 두고 `title`로 그 사람 닉네임을 알려 준다.
 * - 같은 색을 동시에 누른 경우 서버가 늦게 온 쪽에 COLOR_TAKEN 에러를 주고 색은 그대로 둔다
 *   (화면은 서버가 lobbyState로 보낸 값만 그린다 — 낙관적 갱신을 하지 않는다).
 */
export function ColorPicker({
  players,
  myMemberId,
  myColor,
  onSelect,
}: {
  players: LobbyPlayer[];
  myMemberId: string | null;
  myColor: PlayerColorId | undefined;
  onSelect: (color: PlayerColorId) => void;
}) {
  return (
    <div className="mt-3 pt-3 border-t border-board-line/60">
      <p className="text-base text-board-muted mb-1.5">내 색깔 (다른 사람과 겹칠 수 없어요)</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="내 색깔 고르기">
        {PLAYER_COLORS.map(c => {
          const owner = players.find(p => p.color === c.id && p.memberId !== myMemberId);
          const mine = c.id === myColor;
          return (
            <button
              key={c.id}
              type="button"
              disabled={owner !== undefined}
              onClick={() => onSelect(c.id)}
              aria-pressed={mine}
              aria-label={owner ? `${c.id} — ${owner.nickname} 님이 사용 중` : mine ? `${c.id} (내 색)` : c.id}
              title={owner ? `${owner.nickname} 님이 쓰고 있어요` : mine ? '내 색' : '이 색으로 바꾸기'}
              className="color-swatch"
              style={{ backgroundColor: c.hex }}
            >
              {mine && <span aria-hidden>✓</span>}
              {owner && <span aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
