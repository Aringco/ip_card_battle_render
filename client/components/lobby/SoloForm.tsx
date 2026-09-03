'use client';

import type { GameSettings } from 'shared';
import { Field, FormCard } from './Field';
import { GameRulesFields } from './GameRulesFields';

export function SoloForm({
  firstFieldRef,
  nickname,
  onNickname,
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
  teamName: string;
  onTeamName: (v: string) => void;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <FormCard
      title="🤖 싱글플레이"
      description="상대는 컴퓨터예요. 컴퓨터는 자기 차례마다 무작위 장소를 클릭합니다."
    >
      <Field label="닉네임">
        <input
          ref={firstFieldRef}
          type="text"
          value={nickname}
          onChange={e => onNickname(e.target.value)}
          placeholder="닉네임 입력"
          maxLength={12}
          className="input-base"
        />
      </Field>

      <Field label="우리 팀 이름 (선택, 비워두면 무작위 배정)">
        <input
          type="text"
          value={teamName}
          onChange={e => onTeamName(e.target.value)}
          placeholder="예: 특허"
          maxLength={12}
          className="input-base"
        />
      </Field>

      <GameRulesFields settings={settings} onChange={onSettings} />

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="bg-jungle-500 hover:bg-jungle-600 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition"
      >
        컴퓨터와 대전 시작
      </button>
    </FormCard>
  );
}
