'use client';

import { useEffect } from 'react';
import type { DemoView } from 'shared';

/**
 * 시연 4장 — 볼 결말을 고르는 판.
 *
 * ⚠️ **화면 위에 덮는 오버레이다**(`position: fixed`). 자막 띠처럼 액자 칸 안에 넣으면
 *    그 아래 카드 다섯 장의 자리가 밀린다 — 4장은 "가죽만 갈아입히는" 작업이 아니라
 *    판 위에 잠깐 떠 있는 창이므로, 배치에 아예 끼어들지 않는 편이 맞다.
 *
 * 한 장면이 끝나면 결과 화면의 [4장으로 복귀]가 다시 이 판을 띄운다 — 그래야 관람객이
 * 세 결말을 모두 볼 수 있다.
 */
export function DemoSceneMenu({ demo, onChoose }: { demo: DemoView; onChoose: (key: string) => void }) {
  const scenes = demo.waiting === 'scene' ? demo.scenes : undefined;

  // 1·2·3 — 진행자가 마우스를 찾지 않고 고를 수 있게. [계속 ▶]의 스페이스·엔터를 여기서
  // 받지 않는 것은 일부러다: 무엇을 고를지는 진행자가 **정해서** 눌러야 하는 자리라,
  // 습관적으로 누른 스페이스가 임의의 장면을 시작해 버리면 안 된다.
  useEffect(() => {
    if (!scenes) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const i = Number(e.key) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= scenes.length) return;
      e.preventDefault();
      onChoose(scenes[i].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scenes, onChoose]);

  if (!scenes) return null;

  return (
    <div className="demo-scene-menu" role="dialog" aria-label="시연 결말 고르기">
      <p className="demo-scene-title">{demo.caption}</p>
      <div className="demo-scene-list">
        {scenes.map((scene, i) => (
          <button
            key={scene.key}
            type="button"
            className="demo-scene-card"
            onClick={() => onChoose(scene.key)}
            aria-keyshortcuts={String(i + 1)}
          >
            {/* ⚠️ 번호와 이름뿐이다. 한때 한 줄 설명을 달았는데, 진행자가 말로 할 설명을
                화면이 먼저 해버려 버튼이 글 덩어리처럼 읽혔다(protocol.ts 참고). */}
            <span className="demo-scene-index tabular-nums">{i + 1}</span>
            <span className="demo-scene-label font-bold">{scene.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
