import { PLACES, PLACE_ANIMALS } from 'shared';
import type { Animal, CardNum, Place, StackedCard } from 'shared';

export type RNG = () => number;

let cardIdCounter = 0;

export function initStacks(): Record<Animal, StackedCard[]> {
  return { sheep: [], rabbit: [], mermaid: [], tiger: [] };
}

export function randomPlace(rng: RNG = Math.random): Place {
  return PLACES[Math.floor(rng() * PLACES.length)];
}

/**
 * 장소에서 카드 한 장을 뽑는다. 동물은 그 장소가 다루는 동물 중 균등 랜덤(재고 개념 없음),
 * 숫자는 그 장소에 동물이 3종이면 10~15, 2종이면 5~10 범위에서 랜덤으로 나온다.
 */
export function drawCardAt(place: Place, rng: RNG = Math.random): StackedCard {
  const options = PLACE_ANIMALS[place];
  const animal = options[Math.floor(rng() * options.length)];

  const placeAnimalCount = options.length;
  const num = (placeAnimalCount >= 3 ? Math.floor(rng() * 6) + 10 : Math.floor(rng() * 6) + 5) as CardNum;

  return { id: ++cardIdCounter, animal, num, collectedBy: null };
}
