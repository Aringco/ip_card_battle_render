'use client';

import type { GameSettings } from 'shared';
import { FormCard } from './Field';
import { BarButton } from '@/components/ui/UiIcon';
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
        // 나무 팻말 그림 한 장이 시작 버튼이다 — 초록 막대를 걷어냈다.
        // **"컴퓨터와 대전하기"라는 글씨는 그림 안에 있어** 여기에 따로 쓰지 않는다.
        // 최대 폭을 CSS 변수로 넘기는 이유는 globals.css의 --form-bar-btn 주석을 볼 것
        // (폼에는 zoom이 걸려 있어 px를 그대로 쓰면 화면 크기가 뷰포트마다 달라진다).
        <BarButton
          name="barSolo"
          label="컴퓨터와 대전 시작"
          maxWidth="var(--form-bar-btn)"
          onClick={onSubmit}
          disabled={!canSubmit}
        />
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
