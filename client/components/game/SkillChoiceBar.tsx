'use client';

import type { Animal, ClientGameState, Team } from 'shared';
import { previewSkill } from '@/lib/skills';
import { SKILL_TITLE, SKILL_COLOR, describeSkill } from '@/lib/skillInfo';
import { useGuideEnabled } from '@/lib/guideSettings';
import { spectatorTeamVars } from '@/lib/teamColors';
import { emVar } from '@/lib/textFit';
import { GuideFinger } from './GuideFinger';

const ANIMAL_ORDER: Animal[] = ['sheep', 'rabbit', 'mermaid', 'tiger'];

// 줄바꿈은 여기서 정해진 그대로 그려진다(CSS가 `white-space: pre`) — 길면 접히는 게
// 아니라 글자가 작아진다. 그래서 문구와 함께 상수로 꺼내 두고 폭을 재어 넘긴다.
const PASS_TEXT = '지금은 할 수 있는게 없네요.\n레벨을 높이고,\n한 번에 몰아치는 방법도 좋답니다.';

// 턴을 마친 뒤 행동을 고르는 영역 — 화면을 덮는 모달이 아니라 항상 보드 아래
// (양 팀 합계 사이)에 자리한다. 로직은 기존과 동일하게 "내 팀의 행동 선택
// 차례"일 때만 클릭이 가능하고, 그 외에는 마우스를 올려 설명만 미리 볼 수 있다.
// 지금 누를 수 있는 패널(레벨이 있어 고를 수 있는 행동, 그리고 항상 고를 수
// 있는 "아무것도 하지 않음")은 은은하게 빛나 무엇을 눌러야 할지 강조해준다.
export function SkillChoiceBar({
  gameState,
  team,
  interactive,
  spectatorGuideTeam = null,
  myTeamChoosing = false,
  demoAllowed = null,
  onChoose,
  onPass,
}: {
  gameState: ClientGameState;
  team: Team;
  interactive: boolean; // 지금이 실제로 이 팀(=나)이 행동을 고를 차례인지
  // 관전 시점일 때만 채워진다 — 지금 행동을 고르고 있는 팀. 관전자는 누를 수 없으므로
  // 그 팀 색 손가락으로 "이 중에서 고르는 중"이라는 진행만 중계한다.
  spectatorGuideTeam?: Team | null;
  // 우리 팀이 행동을 고르는 단계인지(팀 안의 다른 사람 차례여도 참) — 이 띠 전체가
  // 은은하게 빛나 "이번엔 여기를 봐야 한다"고 알린다. 장소 선택 단계에는 대신 카드판이
  // 빛나고 이 값은 false다(GameLayout이 두 곳을 번갈아 켠다).
  myTeamChoosing?: boolean;
  /**
   * 시연 모드에서 지금 누를 수 있는 기술 — 대본이 열어 준 한 칸만 담겨 온다.
   * null이면 평범한 게임이라 아무것도 달라지지 않는다.
   *
   * ⚠️ **빈 배열은 "전부 잠금"이다**(null과 다르다). 시연 중 장소를 누를 차례에는
   *    기술 칸이 하나도 열리지 않아야 하므로, `?? true` 같은 기본값으로 뭉개지 말 것.
   * ⚠️ 시연에는 [턴 마치기]도 없다 — 누르면 턴이 넘어가 대본이 끊긴다(서버도 무시한다).
   */
  demoAllowed?: Animal[] | null;
  onChoose: (animal: Animal) => void;
  onPass: () => void;
}) {
  const previews = ANIMAL_ORDER.map(animal => previewSkill(gameState, team, animal));

  // 예전엔 이 팀의 첫 행동이 해금된 그 순간에만(평생 1회) 손가락 가이드를 보여줬는데,
  // 그 순간을 놓치면 다시 볼 방법이 없었다. 이제는 행동을 고를 수 있는 턴마다 매번
  // 보여주고, 설정 패널(⚙️)에서 원하는 사람만 끌 수 있게 했다.
  const guideEnabled = useGuideEnabled();
  const showSkillGuide = guideEnabled && (interactive || spectatorGuideTeam !== null);
  // 시연은 대본이 열어 준 칸만 누를 수 있고, 손가락도 그 한 칸만 짚는다(빈 배열=전부 잠금).
  const demoOpen = (animal: Animal) => (demoAllowed ? demoAllowed.includes(animal) : true);
  // [턴 마치기]는 평소 언제나 누를 수 있지만, 시연에서는 턴이 넘어가는 순간 대본이
  // 끊기므로(상대 차례가 온다) 아예 잠근다 — 서버도 같은 이유로 무시한다.
  const passable = interactive && demoAllowed === null;

  // 행동 선택 단계에만 이 띠가 빛난다. 관전자는 지금 고르는 팀의 색으로(그 팀 색 변수를
  // 함께 심어준다), 플레이어는 우리 팀 차례일 때 연두색으로.
  const glowClass = spectatorGuideTeam
    ? 'skill-bar-spectator-turn'
    : myTeamChoosing
      ? 'skill-bar-my-turn'
      : '';

  return (
    // 마우스를 올리면 그 칸이 살짝 떠오르며 커지는 연출을 넣으려면 각 버튼이 이 컨테이너
    // 밖으로 튀어나갈 수 있어야 한다 — 그래서 여기서는 overflow-hidden을 쓰지 않는다
    // (전체 띠의 둥근 모서리는 대신 양 끝 버튼 각각에 rounded-l/r-2xl + overflow-hidden으로 준다).
    <div
      // 칸 사이를 가르던 divide-x를 걷고 **여백(gap+padding)** 으로 바꿨다 — 다섯 칸이
      // 맞붙은 한 덩어리가 아니라, 낱장으로 떨어진 카드 다섯 장처럼 보이게 하려는 것이다.
      // ⚠️ 바탕도 안여백도 없다. 칸 다섯 개의 자리와 폭은 액자 그림이 정하므로
      // (globals.css의 .play-cards-grid — 칸마다 폭이 248~267px로 다르다) 여기서
      // grid-cols-5로 균등 분할하면 가운데 칸이 나무 구멍과 어긋난다.
      className={`play-cards-grid min-h-0 ${glowClass}`}
      style={spectatorGuideTeam ? spectatorTeamVars(spectatorGuideTeam) : undefined}
    >
      {ANIMAL_ORDER.map((animal, i) => {
        const preview = previews[i];
        const eligible = preview.level > 0;
        const clickable = interactive && eligible && demoOpen(animal);
        const desc = describeSkill(animal, preview.level);
        // 특허랑이처럼 효과가 둘 이상인 행동은 문구가 그냥 이어 붙어 "체력 +4상대 체력 -4"처럼
        // 읽히므로, 각 효과를 조각으로 모아 **쉼표 뒤에서 줄을 바꿔** 한 줄에 하나씩 둔다
        // (요청). 한 줄로 이으면 "내 체력 +1, 상대 체력 -1"이 카드 폭을 넘겨 제멋대로
        // 접혔다 — 어디서 접힐지는 글자 수에 달려 있어 그때그때 달랐다.
        const effectParts: string[] = [];
        if (preview.extraDraws > 0) effectParts.push(`다음 턴 카드 +${preview.extraDraws}회`);
        if (preview.myHpDelta > 0) effectParts.push(`내 체력 +${preview.myHpDelta}`);
        if (preview.oppHpDelta < 0) effectParts.push(`상대 체력 ${preview.oppHpDelta}`);
        if (animal === 'mermaid') effectParts.push(`다음 행동 ×${preview.multiplierAfter}`);
        const effectLabel = eligible ? effectParts.join(',\n') : '레벨 부족';

        // 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
        // 다듬으려고, 특히 맨 왼쪽 sheep은) overflow-hidden이라 그 안에 두면 잘려 보인다
        // — 그래서 가이드는 이 바깥의, 잘리지 않는 래퍼에 그린다(패스 버튼과 동일한 처리).
        return (
          <div key={animal} className="relative h-full">
            <button
              onClick={() => clickable && onChoose(animal)}
              disabled={!clickable}
              // play-card-frame이 ::after로 금색 액자를, ::before로 네 모서리 장식과
              // 잎 데칼을 얹는다 — 컷신 이미지 위에 덧그릴 뿐 그림은 그대로다.
              // 다섯 장이 각자 제 나무 구멍에 앉으므로 **모두** 같은 둥글기를 쓴다
              // (예전에는 한 덩어리 띠라 양 끝만 둥글렸다).
              className={`play-card-frame skill-choice-panel play-card-cell group relative flex flex-col items-stretch justify-end text-left w-full h-full ${
                clickable ? 'skill-choice-glow' : ''
              }`}
            >
              {/* 컷신 이미지 어둡게 하는 filter는 이 배경 레이어에만 걸어야 한다 — 예전처럼
                  버튼 전체에 filter를 걸면 그 위에 z-index로 얹은 자막(제목·설명·레벨
                  표시)까지 함께 어두워져 "레벨 부족"일 때 글자가 거의 안 보였다. */}
              {/* ⚠️ 어둡게 하는 기준은 `eligible`이 아니라 **지금 누를 수 있는가**다.
                  시연에서 대본이 잠가 둔 칸을 밝은 채로 두면 눌러도 되는 것처럼 보여
                  관람객이 계속 누르는데 아무 일도 일어나지 않는다(장소 타일은 이미
                  잠기면 어두워진다 — 그쪽과 같은 신호를 준다). 글씨는 그대로 둔다:
                  레벨이 모자란 것이 아니라 "지금은 아닌" 것이라 "레벨 부족"이 아니다. */}
              <div
                className={`skill-choice-bg play-frame-inset absolute ${eligible && demoOpen(animal) ? '' : 'skill-choice-bg-disabled'}`}
                style={{ backgroundImage: `url(/skills/${animal}_skill.png)` }}
              />
              <div className="skill-choice-dim play-frame-inset absolute" />
              {/* 레벨이 있을 때는(활성) 이 자리에 "레벨 N 소모" 대신 실제 효과(카드 추가
                  뽑기·체력 강탈 등, 노란색)를 보여준다 — 레벨이 없으면(비활성) 흰색
                  "레벨 부족"으로 돌아간다. 예전엔 효과 문구를 좌상단에 따로 뒀는데, 우상단
                  한 곳으로 합쳐 중복 표시를 없앴다. */}
              {/* ⚠️ 모서리 장식 **아래로** 내려 앉힌다. top-2에 두면 우상단 장식이
                  "레벨 부족"의 끝글자를, 긴 효과 문구는 좌상단 장식이 첫글자를 덮는다.
                  거리는 --deco에서 뽑으므로 카드가 짧아지면 함께 올라온다. */}
              {/* 줄바꿈은 문구가 정하고(쉼표 뒤), 카드 폭이 모자라면 CSS가 글자를 줄인다 —
                  그 판단에 필요한 "가장 긴 줄의 폭(em)"을 여기서 재어 넘긴다. */}
              <span
                className={`skill-effect-label skill-outline-text absolute z-10 text-lg font-bold ${
                  eligible ? 'text-amber-300' : 'text-white'
                }`}
                style={emVar('label-em', effectLabel)}
              >
                {effectLabel}
              </span>
              {/* 아래 안여백은 **아래쪽 모서리 장식**만큼이다(.skill-text-block) —
                  p-3으로만 두면 대사 마지막 줄이 잎 뒤로 숨는다(실제로 숨었다). */}
              <div className="skill-text-block relative z-10 flex flex-col gap-1.5 p-3 min-h-0">
                <h3
                  className="skill-text-title skill-outline-text font-extrabold"
                  style={{ color: SKILL_COLOR[animal] }}
                >
                  [{SKILL_TITLE[animal]}]
                </h3>
                {/* ⚠️ `whitespace-pre-line`이 아니라 `pre`다(CSS의 .skill-text-desc) —
                    줄바꿈은 살리되 **그 밖의 줄바꿈은 일어나지 않아야** 한다. 대신 줄이
                    길면 글자가 작아진다(--desc-em). */}
                <p className="skill-text-desc skill-outline-text text-white leading-snug" style={emVar('desc-em', desc.effect)}>
                  {desc.effect}
                </p>
                <p
                  className="skill-text-quote skill-outline-text font-bold leading-snug"
                  style={{ color: SKILL_COLOR[animal], ...emVar('quote-em', `"${desc.catchphrase}"`) }}
                >
                  &quot;{desc.catchphrase}&quot;
                </p>
              </div>
            </button>

            {/* 지금 고를 수 있는(레벨이 있는) 행동마다, 내가 행동을 고를 수 있는 턴이면 매번 뜬다.
                손은 그 칸의 주인 캐릭터 것이라, 어느 칸을 짚고 있는지 손만 봐도 안다. */}
            {showSkillGuide && eligible && demoOpen(animal) && (
              <GuideFinger team={spectatorGuideTeam} animal={animal} />
            )}
          </div>
        );
      })}

      {/* 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
          다듬으려고) overflow-hidden이라 그 안에 두면 잘려 보인다 — 그래서 가이드는
          이 바깥의, 잘리지 않는 래퍼에 그린다(장소 타일에서 겪었던 것과 같은 문제). */}
      <div className="relative">
        <button
          onClick={() => passable && onPass()}
          disabled={!passable}
          className={`play-card-frame skill-choice-panel play-card-cell group relative flex flex-col items-stretch justify-end text-left w-full h-full ${
            passable ? 'skill-choice-glow' : ''
          }`}
        >
          {/* 시연에서는 이 칸이 내내 잠겨 있으므로 함께 어둡게 둔다(위 주석과 같은 이유). */}
          <div className={`skill-choice-bg pass-panel-bg play-frame-inset absolute ${demoAllowed === null ? '' : 'skill-choice-bg-disabled'}`} />
          <div className="skill-choice-dim play-frame-inset absolute" />
          <div className="skill-text-block relative z-10 flex flex-col gap-1.5 p-3 min-h-0">
            <h3 className="skill-text-title skill-outline-text font-extrabold text-jungle-200">[턴 마치기]</h3>
            <p className="skill-text-desc skill-outline-text text-white leading-snug" style={emVar('desc-em', PASS_TEXT)}>
              {PASS_TEXT}
            </p>
          </div>
        </button>

        {/* 언제나 누를 수 있는 이 버튼도, 행동 선택 차례마다 손가락으로 짚어준다
            (시연에서는 잠겨 있으므로 짚지 않는다 — 누를 수 없는 곳을 가리키면 안 된다). */}
        {showSkillGuide && demoAllowed === null && <GuideFinger team={spectatorGuideTeam} />}
      </div>
    </div>
  );
}
