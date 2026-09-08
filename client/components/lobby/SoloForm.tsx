'use client';

import type { GameSettings } from 'shared';
import { FormCard } from './Field';
import { PlankButton } from '@/components/ui/PlankButton';
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
        // 빈 나무판 위에 글씨를 얹은 팻말 버튼. 폼은 세로 여유가 없으므로 판이
        // 글자 높이만큼만 자라는 이 방식이 그림 팻말보다 유리하다.
        <PlankButton onClick={onSubmit} disabled={!canSubmit} block>
          컴퓨터와 대전 시작
        </PlankButton>
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
