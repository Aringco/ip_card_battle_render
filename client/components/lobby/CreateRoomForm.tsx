'use client';

import type { GameSettings, Seat } from 'shared';
import { GameRulesFields } from './GameRulesFields';
import { FormCard } from './Field';
import { NicknameField, TeamNameField } from './NameFields';
import { TeamSelect } from './TeamSelect';
import { UiIcon } from '@/components/ui/UiIcon';

export function CreateRoomForm({
  firstFieldRef,
  nickname,
  onNickname,
  nicknameHint,
  team,
  onTeam,
  spectatorSeat,
  teamName,
  onTeamName,
  otherTeamName,
  onOtherTeamName,
  teamNamesClash,
  settings,
  onSettings,
  canSubmit,
  onSubmit,
}: {
  firstFieldRef?: React.Ref<HTMLInputElement>;
  nickname: string;
  onNickname: (v: string) => void;
  nicknameHint: string;
  team: Seat;
  onTeam: (t: Seat) => void;
  /** 방장이 관전석에 앉았는지 — "우리/상대 팀"이라는 말이 성립하지 않게 된다 */
  spectatorSeat: boolean;
  teamName: string;
  onTeamName: (v: string) => void;
  otherTeamName: string;
  onOtherTeamName: (v: string) => void;
  teamNamesClash: boolean;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    // 충돌 경고를 새 줄로 덧붙이지 않고 설명 줄을 갈아끼운다 — 폼이 절대배치라 한 줄만
    // 늘어도 좁은 화면(390×844)에서 스크롤바가 생긴다(LOBBY_REDESIGN.md §12 실측 참고).
    <FormCard
      title={<><UiIcon name="iconCreate" /> 방 만들기</>}
      description={
        teamNamesClash ? (
          <span className="text-red-600 font-semibold">두 팀 이름이 같아요. 한쪽을 바꿔주세요.</span>
        ) : spectatorSeat ? (
          // 충돌 경고가 우선한다 — 그쪽은 제출을 막는 오류이고 이건 안내다
          '관전자는 지켜보기만 해요.'
        ) : (
          '방장이 되어 규칙을 정해요.'
        )
      }
      // 규칙을 펼치면 오른쪽 열이 되는 자리 — "고르는 것"(자리·규칙)을 모아 둔다.
      // 접혀 있을 때는 DOM 순서 그대로 입력칸 아래로 흘러 예전과 같은 차례가 된다.
      side={
        <>
          <TeamSelect team={team} onChange={onTeam} />
          <GameRulesFields settings={settings} onChange={onSettings} />
        </>
      }
      footer={
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full bg-jungle-600 hover:bg-jungle-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition"
        >
          방 만들기
        </button>
      }
    >
      <NicknameField
        inputRef={firstFieldRef}
        nickname={nickname}
        onChange={onNickname}
        hint={nicknameHint}
      />

      {/* 두 팀 이름은 한 줄에 나란히 둔다 — 같은 이름을 넣으면 안 된다는 규칙이 있어서,
          서로 떨어져 있으면 무엇과 겹쳤는지 눈으로 확인하기 어렵다. 주사위는 상대 칸에
          적힌 이름을 피해서 뽑으므로 주사위만 눌러서는 충돌이 나지 않는다. */}
      {/* 방장이 관전석에 앉으면 "우리 팀"이 없으므로, 두 입력칸이 그대로 팀 1·팀 2의
          이름이 된다(서버 Room.addPlayer도 같은 순서로 받는다). */}
      <div className="lobby-team-pair grid grid-cols-2 gap-3">
        <TeamNameField
          label={spectatorSeat ? '팀 1 이름 (선택)' : '우리 팀 이름 (선택)'}
          value={teamName}
          onChange={onTeamName}
          avoid={otherTeamName}
          invalid={teamNamesClash}
        />
        <TeamNameField
          label={spectatorSeat ? '팀 2 이름 (선택)' : '상대 팀 이름 (선택)'}
          value={otherTeamName}
          onChange={onOtherTeamName}
          avoid={teamName}
          invalid={teamNamesClash}
        />
      </div>
    </FormCard>
  );
}
