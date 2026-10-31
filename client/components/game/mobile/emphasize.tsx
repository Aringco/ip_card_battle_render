import type { ReactNode } from 'react';

/**
 * 기술 설명의 핵심 낱말 · 숫자를 굵게 — 카드 상세 창(StatusSheet) · 아이콘 펼침 창(AnimalRail)이 쓴다(2026-10-31 요청).
 * 굵게 하는 것: 효과 이름(체력 · 회복 · 지속 회복 · 출혈 · 쿨타임 · 배율 · 경험치 …)과 숫자 덩어리("+2턴" · "50만큼" · "−12" · "×3" · "8턴").
 * 설명 문구는 lib/skillInfo.ts의 describe*SkillShort가 만든다 — 문구를 고쳐도 이 목록에 있는 낱말은 그대로 굵어진다.
 */
const KEY = /(지속 회복|회복 중첩|회복 효율|출혈 계수|출혈|체력|회복|쿨타임|배율|경험치|회피|[+\-−×÷]?\d+(?:\.\d+)?(?:만큼|턴|장|%|배|회)?)/g;

export function emphasize(text: string): ReactNode[] {
  return text.split(KEY).map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}
