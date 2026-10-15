import type { Seat } from 'shared';
import { PLAYER_SEAT, SPECTATOR } from 'shared';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

/**
 * 로비에서 "자리"(팀 1 / 팀 2 / 관전석)를 부르는 이름과 배지.
 * 참가 화면(app/page.tsx)과 대기실(components/lobby/WaitingRoom.tsx)이 같은 값을 써야
 * "방 만들 때 고른 자리"와 "대기실에 앉아 있는 자리"가 같은 말로 보인다.
 */
export const SEAT_META: Record<Seat, { badge: string; label: string; border: string }> = {
  A: { badge: '🟢', label: '팀 1', border: 'border-green-200' },
  B: { badge: '🔵', label: '팀 2', border: 'border-blue-200' },
  // 개인전 방의 플레이어석 — 팀전의 팀에 해당한다(INDIVIDUAL_MODE_ROADMAP.md).
  [PLAYER_SEAT]: { badge: '🎮', label: '플레이어', border: 'border-amber-200' },
  [SPECTATOR]: { badge: '👀', label: '관전자', border: 'border-purple-200' },
};

/** 버튼·안내문에 쓰는 "🟢 팀 1" 형태의 한 덩어리 이름. */
export function seatLabel(seat: Seat): string {
  return `${SEAT_META[seat].badge} ${SEAT_META[seat].label}`;
}

/**
 * 자리마다의 **그림 버튼** 경로. 글씨("팀 1"·"관전자")가 그림 안에 이미 들어 있으므로,
 * 이 그림을 쓰는 곳은 HTML 라벨을 겹쳐 쓰지 않고 `seatLabel()`을 aria-label로만 싣는다.
 *
 * 자리 선택(TeamSelect)·선 플레이어(GameRulesFields)·대기실 자리 이동이 같은 그림을 쓴다 —
 * "방 만들 때 고른 자리"와 "대기실에서 옮기는 자리"가 같은 그림이어야 같은 것으로 읽힌다.
 */
export const SEAT_IMAGE: Record<Seat, string> = {
  A: LOBBY_ASSETS.btnTeamA,
  B: LOBBY_ASSETS.btnTeamB,
  // 개인전의 플레이어석은 전용 그림이 없다 — 개인전 대기실은 이 그림 대신 글자 버튼을 쓰므로 자리만 채운다.
  [PLAYER_SEAT]: LOBBY_ASSETS.btnTeamA,
  [SPECTATOR]: LOBBY_ASSETS.btnSpectator,
};
