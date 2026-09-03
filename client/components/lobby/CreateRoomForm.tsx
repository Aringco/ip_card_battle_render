'use client';

import type { GameSettings, Team } from 'shared';
import { GameRulesFields } from './GameRulesFields';
import { FormCard } from './Field';
import { NicknameField, TeamNameField } from './NameFields';
import { TeamSelect } from './TeamSelect';

export function CreateRoomForm({
  firstFieldRef,
  nickname,
  onNickname,
  nicknameHint,
  team,
  onTeam,
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
  team: Team;
  onTeam: (t: Team) => void;
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
      title="🏠 방 만들기"
      description={
        teamNamesClash ? (
          <span className="text-red-600 font-semibold">두 팀 이름이 같아요. 한쪽을 바꿔주세요.</span>
        ) : (
          '방장이 되어 규칙을 정해요.'
        )
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
      <div className="grid grid-cols-2 gap-3">
        <TeamNameField
          label="우리 팀 이름 (선택)"
          value={teamName}
          onChange={onTeamName}
          avoid={otherTeamName}
          invalid={teamNamesClash}
        />
        <TeamNameField
          label="상대 팀 이름 (선택)"
          value={otherTeamName}
          onChange={onOtherTeamName}
          avoid={teamName}
          invalid={teamNamesClash}
        />
      </div>

      <TeamSelect team={team} onChange={onTeam} />

      <GameRulesFields settings={settings} onChange={onSettings} />

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="bg-jungle-600 hover:bg-jungle-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition"
      >
        방 만들기
      </button>
    </FormCard>
  );
}
