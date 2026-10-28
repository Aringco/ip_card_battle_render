'use client';

import type { GameSettings } from 'shared';
import { ENHANCE_SETTINGS_LIMITS } from 'shared';
import { FormCard } from './Field';
import { PlankButton } from '@/components/ui/PlankButton';
import { GameRulesFields } from './GameRulesFields';
import { NicknameField } from './NameFields';

/**
 * 혼자 놀기 → **강화 모드**(카드 강화 — shared/enhance.ts · ENHANCE_MODE.md)의 방 설정. 닉네임과 게임 규칙만 받는다.
 * 규칙의 기본값은 일반 모드와 다르다(ENHANCE_SETTINGS) — page.tsx가 일반 모드와 따로 기억해 넘긴다.
 * 일시정지 항목은 일반 모드와 같은 이유로 감춘다(기다리게 할 상대가 없다).
 */
export function EnhanceForm({
  firstFieldRef,
  nickname,
  onNickname,
  nicknameHint,
  settings,
  onSettings,
  canSubmit,
  onSubmit,
}: {
  firstFieldRef?: React.Ref<HTMLInputElement>;
  nickname: string;
  onNickname: (v: string) => void;
  nicknameHint: string;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <FormCard
      title="⚒️ 강화 모드"
      description="모든 카드가 Lv.1부터 열려 있어요. 짝을 맞춰 카드를 Lv.Max까지 강화하세요!"
      side={<GameRulesFields settings={settings} onChange={onSettings} hidePause limits={ENHANCE_SETTINGS_LIMITS} />}
      footer={
        <PlankButton onClick={onSubmit} disabled={!canSubmit} block>
          강화 대전 시작
        </PlankButton>
      }
    >
      <NicknameField inputRef={firstFieldRef} nickname={nickname} onChange={onNickname} hint={nicknameHint} />
    </FormCard>
  );
}
