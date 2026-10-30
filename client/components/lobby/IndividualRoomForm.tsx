'use client';

import type { GameSettings } from 'shared';
import { ENHANCE_SETTINGS_LIMITS } from 'shared';
import { GameRulesFields } from './GameRulesFields';
import { FormCard } from './Field';
import { NicknameField } from './NameFields';
import { ModeToggle } from './ModeToggle';
import { UiIcon } from '@/components/ui/UiIcon';
import { PlankButton } from '@/components/ui/PlankButton';

/** 개인전 방의 규칙 — 일반(지금까지의 개인전) / 강화(혼자 놀기 카드 강화의 규칙을 개인전에 얹는다) */
export type IndividualKind = 'normal' | 'enhance';

const KINDS = [
  { value: 'normal', label: '일반' },
  { value: 'enhance', label: '강화' },
] as const;

/**
 * 방 만들기 → **개인전** 폼(2026-10-30). 팀이 없으므로 자리 선택과 팀 이름이 없고, 제목 줄 오른쪽에서 **일반 / 강화**를 고른다.
 * - 일반: 지금까지의 개인전 방 설정 그대로(규칙 기본값 DEFAULT_SETTINGS · 일반 범위).
 * - 강화: 혼자 놀기 → 강화 모드의 방 설정을 따른다 — 규칙 값은 그 폼과 같은 묶음(page.tsx의 enhanceSettings)이고 범위는
 *   ENHANCE_SETTINGS_LIMITS(목표 점수 상한 2500)다. 일시정지는 사람끼리라 그대로 보인다(혼자 놀기에서만 감춘다).
 * 일반 · 강화의 규칙 값은 따로 기억한다 — 토글을 오가도 각자 고친 값이 남는다.
 */
export function IndividualRoomForm({
  firstFieldRef,
  kind,
  onKind,
  nickname,
  onNickname,
  nicknameHint,
  settings,
  onSettings,
  enhanceSettings,
  onEnhanceSettings,
  canSubmit,
  onSubmit,
}: {
  firstFieldRef?: React.Ref<HTMLInputElement>;
  kind: IndividualKind;
  onKind: (k: IndividualKind) => void;
  nickname: string;
  onNickname: (v: string) => void;
  nicknameHint: string;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  enhanceSettings: GameSettings;
  onEnhanceSettings: (next: GameSettings) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const enhance = kind === 'enhance';
  return (
    <FormCard
      title={<><UiIcon name="iconCreate" /> 개인전 방 만들기</>}
      headerAside={<ModeToggle options={KINDS} value={kind} onChange={onKind} label="개인전 규칙" />}
      description={enhance ? '모든 카드가 Lv.1부터! 카드를 강화하며 순위를 겨뤄요.' : '각자 겨뤄 1위부터 순위를 매겨요.'}
      side={
        enhance ? (
          // 같은 자리 같은 컴포넌트라 바꿔도 펼침 상태가 그대로 남는다(규칙을 펼친 채 일반 · 강화를 오가며 비교할 수 있다)
          <GameRulesFields settings={enhanceSettings} onChange={onEnhanceSettings} mode="individual" limits={ENHANCE_SETTINGS_LIMITS} showSkillGrowth />
        ) : (
          <GameRulesFields settings={settings} onChange={onSettings} mode="individual" />
        )
      }
      footer={
        <PlankButton onClick={onSubmit} disabled={!canSubmit} block>
          방 만들기
        </PlankButton>
      }
    >
      <NicknameField inputRef={firstFieldRef} nickname={nickname} onChange={onNickname} hint={nicknameHint} />
    </FormCard>
  );
}
