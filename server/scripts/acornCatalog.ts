/**
 * 도토리 카드 목록을 마크다운 표로 찍는다 — ACORN_CARDS.md §4의 표는 이 출력이다(카드를 고치면 다시 돌려 붙인다).
 *   cd server && npx ts-node scripts/acornCatalog.ts
 */
import { ACORN_CARDS, ACORN_FAMILY_NAME, ACORN_SCOPE_NAME, ACORN_TIER_NAME, acornCardLines } from 'shared';
import type { AcornTier } from 'shared';

for (const fam of ['sheep', 'rabbit', 'mermaid', 'tiger'] as const) {
  console.log(`\n### ${ACORN_FAMILY_NAME[fam]}\n`);
  console.log('| 단계 | id | 이름 | 범위 | 효과 |');
  console.log('|---|---|---|---|---|');
  for (const c of ACORN_CARDS.filter(x => x.family === fam)) {
    const t = c.tier as AcornTier;
    console.log(`| ${ACORN_TIER_NAME[t]} | ${c.id} | ${c.name} | ${ACORN_SCOPE_NAME[c.scope]} | ${acornCardLines(c.id).join(' · ')} |`);
  }
}
console.log('\n### 다이아 도토리(공통 — 황금과 무지개빛 사이의 고정 수치)\n');
console.log('| id | 이름 | 범위 | 효과 |');
console.log('|---|---|---|---|');
for (const c of ACORN_CARDS.filter(x => x.family === 'diamond')) {
  console.log(`| ${c.id} | ${c.name} | ${ACORN_SCOPE_NAME[c.scope]} | ${acornCardLines(c.id).join(' · ')} |`);
}
