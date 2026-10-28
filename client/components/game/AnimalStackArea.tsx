'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Animal, StackedCard } from 'shared';
import { ANIMALS } from 'shared';
import { StackCardView } from './StackCardView';
import type { ShakingPile } from '@/hooks/useAnimationQueue';

// .stack-card의 기준 너비(5.5rem, 16px 기준)와 겹침 간격(46px) — 카드가 쌓여 영역보다
// 넓어지면 전체를 축소하는데, 그 계산에 쓰는 값이다.
//
// ⚠️ **이제 카드는 화면에 따라 작아진다**(globals.css의 `--stack-card-w`). 그래서 이 두
//    상수는 "쟀을 때 쓰는 폴백"일 뿐이고, 실제 계산은 아래에서 **렌더된 카드의 폭을 직접
//    재서** 쓴다. 고정값 88을 그대로 쓰면 폰에서 실제 카드(약 45px)보다 두 배로 잡아,
//    넘치지도 않는데 절반으로 줄여 버린다.
//    겹침 비율(46/88)은 CSS와 같은 값이다 — 한쪽만 고치면 낱장 간격이 어긋난다.
const CARD_WIDTH_PX = 88;
const DEFAULT_OVERLAP_PX = 46;
const OVERLAP_RATIO = DEFAULT_OVERLAP_PX / CARD_WIDTH_PX;
const MIN_STACK_SCALE = 0.35;
// 묶음 카드 뒤의 카드는 조금만 겹친다 — 반쯤 덮으면 "x100"이 "x1"로 잘린다. globals.css의 .stack-card-bundle + .stack-card와 같은 비율이다.
const BUNDLE_OVERLAP_RATIO = 8 / 88;

/** 화면의 카드 한 장 — 낱장(size 1)이거나 10장·100장 묶음 */
interface StackItem {
  cards: StackedCard[];
  size: 1 | 10 | 100;
}

/**
 * 카드가 많으면 **오래된 카드부터** 묶는다(2026-10-29 — 예약 뽑기 수십·수백 장이 줄을 넘쳤다). **카드 강화 판에서만** 묶는다(같은 날 요청 —
 * 일반 판은 카드마다 숫자가 달라 묶으면 숫자가 가려진다. 부르는 쪽이 `bundle`로 정한다).
 * 100장을 넘으면 100장씩(금색 x100), 남은 것이 10장을 넘으면 10장씩(은색 x10), 나머지는 낱장 — 11장이면 x10 + 1장, 100장이면 x10 아홉 + 10장,
 * 101장이면 x100 + 1장. 새로 들어온 카드는 언제나 맨 뒤의 낱장이라 등장 연출·짝 캡션(마지막 카드 위)이 그대로 맞는다.
 * 합계 배지는 묶음과 무관하게 모든 카드의 합이다.
 */
function bundleCards(cards: StackedCard[]): StackItem[] {
  const items: StackItem[] = [];
  let i = 0;
  let rest = cards.length;
  const take = (size: 10 | 100) => {
    items.push({ cards: cards.slice(i, i + size), size });
    i += size;
    rest -= size;
  };
  while (rest > 100) take(100);
  while (rest > 10) take(10);
  for (; i < cards.length; i++) items.push({ cards: [cards[i]], size: 1 });
  return items;
}

export function AnimalStackArea({
  stackCards,
  bundle = false,
  collectingIds,
  shakingPile,
  newCardId,
  isMyTurn,
}: {
  stackCards: Record<Animal, StackedCard[]>;
  /** 10장·100장 묶음으로 그릴지 — 카드 강화 판만(bundleCards) */
  bundle?: boolean;
  collectingIds: ReadonlySet<number>;
  shakingPile: ShakingPile | null;
  newCardId: number | null;
  isMyTurn: boolean;
}) {
  return (
    // `.stack-area` — 줄 사이 간격이 무대를 따라간다(globals.css). 고정 8px이면 폰에서
    // 세 칸의 간격(24px)이 스택 영역의 16%를 먹어, 그만큼 줄이 낮아지고 카드가 작아진다.
    <div className="stack-area flex flex-col w-full h-full">
      {ANIMALS.map(animal => (
        <AnimalStackRow
          key={animal}
          animal={animal}
          cards={stackCards[animal]}
          bundle={bundle}
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
  bundle,
  collectingIds,
  isShaking,
  newCardId,
  isMyTurn,
}: {
  animal: Animal;
  cards: StackedCard[];
  bundle: boolean;
  collectingIds: ReadonlySet<number>;
  isShaking: boolean;
  newCardId: number | null;
  isMyTurn: boolean;
}) {
  // cards는 이미 "지금 화면에 그려야 하는" 카드만 들어있다(useAnimationQueue의 stackCards) —
  // 짝이 맞아 collectedBy가 찍힌 카드도 팀 칸에 실제로 도착하는 순간에야 여기서 빠진다.
  // 그래서 총합은 미획득 카드만이 아니라 화면에 남아 있는 카드를 전부 센다. 예전에는
  // 미획득 카드만 세는 바람에, 짝이 맞는 순간 카드는 아직 그대로 쌓여 있는데 옆 숫자만
  // 통째로 사라져 "얘는 왜 숫자가 없지?" 싶은 화면이 됐다.
  // (이 숫자는 경험치로 들어갈 값이다 — 점수가 아니다.)
  //
  // 획득 주체에 따라 글자색을 바꾸는(내 팀 연두 / 상대 적색) 안은 한 번 넣었다가 되돌렸다.
  // collectedBy는 카드가 아직 스택으로 날아오는 중에 이미 확정돼 있어서, 색이 도착 연출보다
  // 앞서 바뀌며 오히려 어긋나 보인다. 색은 항상 기본색 하나로 둔다.
  const total = cards.reduce((s, c) => s + c.num, 0);
  const items: StackItem[] = bundle ? bundleCards(cards) : cards.map(c => ({ cards: [c], size: 1 }));

  // 카드가 너무 많이 쌓여 실제 컨테이너 너비를 넘어서면(예: 실용신양/도토리 축제로
  // 한 번에 여러 장이 쌓였을 때), 넘치는 대신 전체를 좁혀서 영역 안에 다 겹쳐 보이게
  // 한다 — 옆에 이미 총합 배지가 있으니 낱장을 다 읽을 필요는 없다는 판단. 카드 폭과
  // 겹침 간격을 같은 비율로 함께 줄이면(스케일) 기존 겹침 비례가 그대로 유지된다.
  const cardsWrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [cardWidth, setCardWidth] = useState(CARD_WIDTH_PX);

  // ⚠️ `cards.length`가 의존성에 있는 이유: 카드가 한 장도 없으면 잴 카드가 없어
  //    폴백(88)이 남는데, 그 뒤 첫 카드가 들어와도 ResizeObserver는 **칸 폭이 그대로라**
  //    울리지 않는다. 그러면 폰에서 실제 45px짜리 카드를 88px로 잡은 채 굳는다.
  useLayoutEffect(() => {
    const el = cardsWrapRef.current;
    if (!el) return;
    const update = () => {
      setContainerWidth(el.clientWidth);
      const card = el.querySelector('.stack-card');
      const w = card?.getBoundingClientRect().width ?? 0;
      if (w > 0) setCardWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cards.length]);

  // 폭은 화면에 그리는 장수(묶음은 한 장)로 잰다 — 묶음 다음 카드는 조금만 겹치므로 그만큼 더 넓다
  const naturalWidth = items.reduce(
    (w, item, i) => w + (i === 0 ? cardWidth : cardWidth * (1 - (items[i - 1].size > 1 ? BUNDLE_OVERLAP_RATIO : OVERLAP_RATIO))),
    0,
  );
  const stackScale =
    containerWidth > 0 && naturalWidth > containerWidth
      ? Math.max(MIN_STACK_SCALE, containerWidth / naturalWidth)
      : 1;

  return (
    <div
      data-stack-area={animal}
      className="parchment-row relative flex-1 min-h-0 flex items-center gap-3 px-2 overflow-visible"
    >
      <div
        className="absolute inset-0 bg-no-repeat bg-center opacity-15 pointer-events-none"
        style={{
          backgroundImage: `url(/emoticon/default/${animal}_${isMyTurn ? 'happy' : 'focus'}.png)`,
          backgroundSize: '33%',
        }}
      />
      {/* 칸 폭·글자 크기는 `.stack-total-*`(globals.css)가 무대에 맞춰 정한다 */}
      <div className="stack-total-slot relative flex flex-col items-center justify-center shrink-0">
        {total > 0 && (
          <span className="stack-total-badge font-black text-jungle-900 tabular-nums">{total}</span>
        )}
      </div>
      {/* `.stack-cards-wrap` — 작은 화면에서 이 상자가 **크기 컨테이너**가 된다
          (globals.css의 T2 블록). 그래야 카드가 "줄 높이를 넘지 않는" 크기로 잡힌다. */}
      <div ref={cardsWrapRef} className="stack-cards-wrap relative flex items-center flex-1 min-w-0 h-full overflow-visible">
        {cards.length > 0 && (
          <div
            className="flex items-center"
            style={stackScale < 1 ? { transform: `scale(${stackScale})`, transformOrigin: 'left center' } : undefined}
          >
            {/* 묶음의 key는 첫 카드 id — 낱장이 묶음의 머리가 될 때 같은 자리의 카드가 모양만 바꾼다 */}
            {items.map((item, i) => {
              const c = item.cards[0];
              return (
                <StackCardView
                  key={c.id}
                  card={c}
                  bundle={item.size === 1 ? null : item.size}
                  index={i}
                  isNew={item.size === 1 && c.id === newCardId}
                  flingDirection={
                    item.cards.some(x => collectingIds.has(x.id)) ? (c.collectedBy === 'A' ? 'left' : 'right') : null
                  }
                  shakeVariant={isShaking ? (i % 2 === 0 ? 'a' : 'b') : null}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
