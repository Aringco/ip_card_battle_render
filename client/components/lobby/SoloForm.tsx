'use client';

import type { GameSettings } from 'shared';
import { FormCard } from './Field';
import { GameRulesFields } from './GameRulesFields';
import { NicknameField, TeamNameField } from './NameFields';

export function SoloForm({
  firstFieldRef,
  nickname,
  onNickname,
  nicknameHint,
  teamName,
  onTeamName,
  settings,
  onSettings,
  canSubmit,
  onSubmit,
}: {
  firstFieldRef?: React.Ref<HTMLInputElement>;
  nickname: string;
  onNickname: (v: string) => void;
  nicknameHint: string;
  teamName: string;
  onTeamName: (v: string) => void;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <FormCard
      title="🤖 혼자 놀기"
      description="상대는 컴퓨터예요. 컴퓨터는 자기 차례마다 무작위 장소를 클릭합니다."
      side={<GameRulesFields settings={settings} onChange={onSettings} />}
      footer={
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full bg-jungle-500 hover:bg-jungle-600 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition"
        >
          컴퓨터와 대전 시작
        </button>
      }
    >
      <NicknameField
        inputRef={firstFieldRef}
        nickname={nickname}
        onChange={onNickname}
        hint={nicknameHint}
      />

      {/* 싱글은 상대가 컴퓨터라 피해야 할 이름이 없다 — avoid는 빈 문자열 */}
      <TeamNameField
        label="우리 팀 이름 (선택)"
        value={teamName}
        onChange={onTeamName}
        avoid=""
      />

    </FormCard>
  );
}
