'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Animal, StackedCard } from 'shared';
import { ANIMALS } from 'shared';
import { StackCardView } from './StackCardView';
import type { ShakingPile } from '@/hooks/useAnimationQueue';

// .stack-card의 고정 너비(5.5rem, 16px 기준)와 StackCardView의 기본 marginLeft(-46px)에
// 맞춘 값 — 카드가 쌓여 이 폭보다 넓어지면 영역을 벗어나므로, 아래에서 실측한 컨테이너
// 너비에 맞춰 전체를 축소한다.
const CARD_WIDTH_PX = 88;
const DEFAULT_OVERLAP_PX = 46;
const MIN_STACK_SCALE = 0.35;

export function AnimalStackArea({
  stackCards,
  collectingIds,
  shakingPile,
  newCardId,
  isMyTurn,
}: {
  stackCards: Record<Animal, StackedCard[]>;
  collectingIds: ReadonlySet<number>;
  shakingPile: ShakingPile | null;
  newCardId: number | null;
  isMyTurn: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 w-full h-full">
      {ANIMALS.map(animal => (
        <AnimalStackRow
          key={animal}
          animal={animal}
          cards={stackCards[animal]}
          collectingIds={collectingIds}
          isShaking={shakingPile?.animal === animal}
          newCardId={newCardId}
          isMyTurn={isMyTurn}
        />
      ))}
    </div>
  );
}

function AnimalStackRow({
  animal,
  cards,
  collectingIds,
  isShaking,
  newCardId,
  isMyTurn,
}: {
  animal: Animal;
  cards: StackedCard[];
  collectingIds: ReadonlySet<number>;
  isShaking: boolean;
  newCardId: number | null;
  isMyTurn: boolean;
}) {
  // cards는 이미 "지금 화면에 그려야 하는" 카드만 들어있다(useAnimationQueue의 stackCards).
  // 총합 배지는 실제로 아직 미획득인 카드만 센다 — 이 숫자는 경험치로 들어갈 값이다(점수 아님).
  const total = cards
    .filter(c => c.collectedBy === null)
    .reduce((s, c) => s + c.num, 0);

  // 카드가 너무 많이 쌓여 실제 컨테이너 너비를 넘어서면(예: 실용신양/도토리 축제로
  // 한 번에 여러 장이 쌓였을 때), 넘치는 대신 전체를 좁혀서 영역 안에 다 겹쳐 보이게
  // 한다 — 옆에 이미 총합 배지가 있으니 낱장을 다 읽을 필요는 없다는 판단. 카드 폭과
  // 겹침 간격을 같은 비율로 함께 줄이면(스케일) 기존 겹침 비례가 그대로 유지된다.
  const cardsWrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = cardsWrapRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const naturalWidth =
    cards.length > 0 ? CARD_WIDTH_PX + (cards.length - 1) * (CARD_WIDTH_PX - DEFAULT_OVERLAP_PX) : 0;
  const stackScale =
    containerWidth > 0 && naturalWidth > containerWidth
      ? Math.max(MIN_STACK_SCALE, containerWidth / naturalWidth)
      : 1;

  return (
    <div
      data-stack-area={animal}
      className="relative flex-1 min-h-0 bg-white/70 rounded-xl border border-jungle-200 flex items-center gap-3 px-4 overflow-visible"
    >
      <div
        className="absolute inset-0 bg-no-repeat bg-center opacity-15 pointer-events-none"
        style={{
          backgroundImage: `url(/emoticon/${animal}_${isMyTurn ? 'happy' : 'focus'}.png)`,
          backgroundSize: '33%',
        }}
      />
      <div className="relative flex flex-col items-center justify-center shrink-0 w-16">
        {total > 0 && (
          <span className="stack-total-badge text-4xl font-black text-jungle-900 tabular-nums">{total}</span>
        )}
      </div>
      <div ref={cardsWrapRef} className="relative flex items-center flex-1 min-w-0 h-full overflow-visible">
        {cards.length > 0 && (
          <div
            className="flex items-center"
            style={stackScale < 1 ? { transform: `scale(${stackScale})`, transformOrigin: 'left center' } : undefined}
          >
            {cards.map((c, i) => (
              <StackCardView
                key={c.id}
                card={c}
                index={i}
                isNew={c.id === newCardId}
                flingDirection={
                  collectingIds.has(c.id) ? (c.collectedBy === 'A' ? 'left' : 'right') : null
                }
                shakeVariant={isShaking ? (i % 2 === 0 ? 'a' : 'b') : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
