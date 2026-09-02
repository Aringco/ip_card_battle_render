'use client';

import { useRef } from 'react';
import type { Animal, ClientGameState, Team } from 'shared';
import { previewSkill } from '@/lib/skills';
import { SKILL_TITLE, SKILL_COLOR, describeSkill } from '@/lib/skillInfo';

const ANIMAL_ORDER: Animal[] = ['sheep', 'rabbit', 'mermaid', 'tiger'];

// 턴을 마친 뒤 행동을 고르는 영역 — 화면을 덮는 모달이 아니라 항상 보드 아래
// (양 팀 합계 사이)에 자리한다. 로직은 기존과 동일하게 "내 팀의 행동 선택
// 차례"일 때만 클릭이 가능하고, 그 외에는 마우스를 올려 설명만 미리 볼 수 있다.
// 지금 누를 수 있는 패널(레벨이 있어 고를 수 있는 행동, 그리고 항상 고를 수
// 있는 "아무것도 하지 않음")은 은은하게 빛나 무엇을 눌러야 할지 강조해준다.
export function SkillChoiceBar({
  gameState,
  team,
  interactive,
  onChoose,
  onPass,
}: {
  gameState: ClientGameState;
  team: Team;
  interactive: boolean; // 지금이 실제로 이 팀(=나)이 행동을 고를 차례인지
  onChoose: (animal: Animal) => void;
  onPass: () => void;
}) {
  const previews = ANIMAL_ORDER.map(animal => previewSkill(gameState, team, animal));
  const anyEligible = previews.some(p => p.level > 0);

  // 팀당 "첫 스킬(행동) 해금" 온보딩 가이드 — 동물 종류와 무관하게 이 팀에게 딱 한 번만
  // 보여준다. everShownRef는 한 번 true가 되면 이 컴포넌트가 살아있는 동안(=게임이
  // 끝날 때까지) 절대 되돌리지 않는 "평생 1회" 래치이고, activeRef는 그 1회가 시작된
  // 이번 행동 선택 구간 동안만 손가락을 계속 띄워두기 위한 별도 플래그다(구간이 끝나면,
  // 즉 interactive가 꺼지면 내린다 — 다음에 또 켜져도 everShownRef 때문에 다시는 안 뜬다).
  const everShownRef = useRef(false);
  const activeRef = useRef(false);
  if (!interactive) {
    activeRef.current = false;
  } else if (!everShownRef.current && anyEligible) {
    everShownRef.current = true;
    activeRef.current = true;
  }
  const showSkillGuide = interactive && activeRef.current;

  return (
    // 마우스를 올리면 그 칸이 살짝 떠오르며 커지는 연출을 넣으려면 각 버튼이 이 컨테이너
    // 밖으로 튀어나갈 수 있어야 한다 — 그래서 여기서는 overflow-hidden을 쓰지 않는다
    // (전체 띠의 둥근 모서리는 대신 양 끝 버튼 각각에 rounded-l/r-2xl + overflow-hidden으로 준다).
    <div className="h-full min-h-0 bg-jungle-950 rounded-2xl grid grid-cols-5 divide-x-2 divide-jungle-700">
      {ANIMAL_ORDER.map((animal, i) => {
        const preview = previews[i];
        const eligible = preview.level > 0;
        const clickable = interactive && eligible;
        const desc = describeSkill(animal, preview.level);

        // 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
        // 다듬으려고, 특히 맨 왼쪽 sheep은) overflow-hidden이라 그 안에 두면 잘려 보인다
        // — 그래서 가이드는 이 바깥의, 잘리지 않는 래퍼에 그린다(패스 버튼과 동일한 처리).
        return (
          <div key={animal} className="relative h-full">
            <button
              onClick={() => clickable && onChoose(animal)}
              disabled={!clickable}
              className={`skill-choice-panel group relative flex flex-col items-stretch justify-end text-left w-full h-full ${
                i === 0 ? 'rounded-l-2xl overflow-hidden' : ''
              } ${clickable ? 'skill-choice-glow' : ''}`}
            >
              {/* 컷신 이미지 어둡게 하는 filter는 이 배경 레이어에만 걸어야 한다 — 예전처럼
                  버튼 전체에 filter를 걸면 그 위에 z-index로 얹은 자막(제목·설명·레벨
                  표시)까지 함께 어두워져 "레벨 부족"일 때 글자가 거의 안 보였다. */}
              <div
                className={`skill-choice-bg absolute inset-0 ${eligible ? '' : 'skill-choice-bg-disabled'}`}
                style={{ backgroundImage: `url(/skills/${animal}_skill.png)` }}
              />
              <div className="skill-choice-dim absolute inset-0" />
              {/* 레벨이 있을 때는(활성) 이 자리에 "레벨 N 소모" 대신 실제 효과(카드 추가
                  뽑기·체력 강탈 등, 노란색)를 보여준다 — 레벨이 없으면(비활성) 흰색
                  "레벨 부족"으로 돌아간다. 예전엔 효과 문구를 좌상단에 따로 뒀는데, 우상단
                  한 곳으로 합쳐 중복 표시를 없앴다. */}
              <span
                className={`skill-outline-text absolute top-2 right-3 z-10 text-lg font-bold ${
                  eligible ? 'text-amber-300' : 'text-white'
                }`}
              >
                {eligible ? (
                  <>
                    {preview.extraDraws > 0 && `다음 턴 카드 +${preview.extraDraws}회`}
                    {preview.myHpDelta > 0 && `체력 +${preview.myHpDelta}`}
                    {preview.oppHpDelta < 0 && `상대 체력 ${preview.oppHpDelta}`}
                    {animal === 'mermaid' && `다음 행동 ×${preview.multiplierAfter}`}
                  </>
                ) : (
                  '레벨 부족'
                )}
              </span>
              <div className="relative z-10 flex flex-col gap-2 p-3 min-h-[9rem]">
                <h3
                  className="skill-outline-text text-xl font-extrabold"
                  style={{ color: SKILL_COLOR[animal] }}
                >
                  [{SKILL_TITLE[animal]}]
                </h3>
                <p className="skill-outline-text text-base text-white leading-snug whitespace-pre-line">
                  {desc.effect}
                </p>
                <p
                  className="skill-outline-text text-sm font-bold leading-snug"
                  style={{ color: SKILL_COLOR[animal] }}
                >
                  &quot;{desc.catchphrase}&quot;
                </p>
              </div>
            </button>

            {/* 팀당 평생 1회 — 이 팀의 첫 스킬(행동)이 해금된 바로 그 스킬(들)에만 뜬다. */}
            {showSkillGuide && eligible && (
              <span className="place-guide-finger" aria-hidden>
                👇
              </span>
            )}
          </div>
        );
      })}

      {/* 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
          다듬으려고) overflow-hidden이라 그 안에 두면 잘려 보인다 — 그래서 가이드는
          이 바깥의, 잘리지 않는 래퍼에 그린다(장소 타일에서 겪었던 것과 같은 문제). */}
      <div className="relative">
        <button
          onClick={() => interactive && onPass()}
          disabled={!interactive}
          className={`skill-choice-panel group relative flex flex-col items-stretch justify-end text-left rounded-r-2xl overflow-hidden w-full h-full ${
            interactive ? 'skill-choice-glow' : ''
          }`}
        >
          <div className="skill-choice-bg pass-panel-bg absolute inset-0" />
          <div className="skill-choice-dim absolute inset-0" />
          <div className="relative z-10 flex flex-col gap-1.5 p-3 min-h-[9rem]">
            <h3 className="skill-outline-text text-xl font-extrabold text-jungle-200">[턴 마치기]</h3>
            <p className="skill-outline-text text-base text-white leading-snug whitespace-pre-line">
              {'지금은 할 수 있는게 없네요.\n레벨을 높이고,\n한 번에 몰아치는 방법도 좋답니다.'}
            </p>
          </div>
        </button>

        {/* 첫 턴 온보딩 — 행동 선택 차례가 되면, 언제나 누를 수 있는 이 버튼을 손가락으로 짚어준다. */}
        {gameState.turn === 1 && interactive && (
          <span className="place-guide-finger" aria-hidden>
            👇
          </span>
        )}
      </div>
    </div>
  );
}
