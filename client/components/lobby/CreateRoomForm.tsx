'use client';

import type { GameSettings, Team } from 'shared';
import { Field, FormCard } from './Field';
import { GameRulesFields } from './GameRulesFields';
import { TeamSelect } from './TeamSelect';

export function CreateRoomForm({
  firstFieldRef,
  nickname,
  onNickname,
  team,
  onTeam,
  teamName,
  onTeamName,
  otherTeamName,
  onOtherTeamName,
  settings,
  onSettings,
  canSubmit,
  onSubmit,
}: {
  firstFieldRef?: React.Ref<HTMLInputElement>;
  nickname: string;
  onNickname: (v: string) => void;
  team: Team;
  onTeam: (t: Team) => void;
  teamName: string;
  onTeamName: (v: string) => void;
  otherTeamName: string;
  onOtherTeamName: (v: string) => void;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <FormCard title="🏠 방 만들기" description="방장이 되어 규칙을 정해요.">
      {/* 방 만들기는 입력이 가장 많은 폼이라, 짧은 두 필드를 한 줄에 묶어 세로 길이를 줄인다 */}
      <div className="grid grid-cols-2 gap-3">
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

        <Field label="우리 팀 이름 (선택)">
          <input
            type="text"
            value={teamName}
            onChange={e => onTeamName(e.target.value)}
            placeholder="비우면 무작위"
            maxLength={12}
            className="input-base"
          />
        </Field>
      </div>

      <TeamSelect team={team} onChange={onTeam} />

      {/* 아직 아무도 들어오지 않은 반대편 팀 이름도 방장이 미리 정할 수 있다 */}
      <Field label="상대 팀 이름 (선택)">
        <input
          type="text"
          value={otherTeamName}
          onChange={e => onOtherTeamName(e.target.value)}
          placeholder="비우면 무작위 · 참가자가 직접 정함"
          maxLength={12}
          className="input-base"
        />
      </Field>

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
