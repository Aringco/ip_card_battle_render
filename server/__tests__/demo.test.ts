import { ANIMALS, THRESHOLDS, PLACES, PLACE_ANIMALS } from 'shared';
import type { Animal } from 'shared';
import { isDemoRequest } from '../demo/trigger';
import { CHAPTER_1 } from '../demo/script';

/**
 * 시연 모드 — 암호 판정과 **대본 검산**.
 *
 * 대본 검산이 이 파일의 핵심이다. 시연 대본은 눈으로 봐서는 알 수 없는 조건 넷을
 * 동시에 만족해야 하는데(demo/script.ts의 CHAPTER1_RULES), 하나라도 어기면 화면에서
 * 조용히 이상해진다 — 예를 들어 같은 장소가 연달아 나오면 그 클릭이 통째로 먹통이
 * 되지만 화면에는 아무 일도 일어나지 않는다.
 *
 * ⚠️ 여기서는 **게임을 켜지 않는다.** 대본은 순수한 데이터라 방(Room)도 타이머도
 *    필요 없다. 그래서 숫자를 고칠 때 가장 먼저, 가장 빠르게 걸리는 그물이다.
 */

describe('시연 암호', () => {
  it('팀명과 닉네임이 둘 다 맞아야 켜진다', () => {
    expect(isDemoRequest('시연자', '키피전자오락센타')).toBe(true);
  });

  it('앞뒤 공백은 걷어내고 본다 — 복사·붙여넣기로 섞여 들어온다', () => {
    expect(isDemoRequest('  시연자 ', ' 키피전자오락센타  ')).toBe(true);
  });

  it('둘 중 하나만 맞으면 켜지지 않는다', () => {
    // 우연히 "시연자"라는 닉네임을 쓴 사람이 영문 모를 판을 하게 되면 안 된다.
    expect(isDemoRequest('시연자', '우리팀')).toBe(false);
    expect(isDemoRequest('홍길동', '키피전자오락센타')).toBe(false);
  });

  it('팀명을 아예 안 보냈으면 켜지지 않는다', () => {
    expect(isDemoRequest('시연자')).toBe(false);
  });

  it('글자가 다르면 켜지지 않는다 — 가운데 공백도 다른 글자다', () => {
    expect(isDemoRequest('시연 자', '키피전자오락센타')).toBe(false);
    expect(isDemoRequest('시연자', '키피 전자오락센타')).toBe(false);
    expect(isDemoRequest('시연자2', '키피전자오락센타')).toBe(false);
  });
});

describe('1장 대본 검산', () => {
  it('조건 1 — 네 장소의 가능한 동물이 빠짐없이 나온다', () => {
    // 요구 1-1·1-5의 핵심. 하나라도 빠지면 "이 장소에서는 이것들이 나옵니다"라는
    // 설명 자체가 거짓이 된다.
    for (const place of PLACES) {
      const shown = new Set(CHAPTER_1.filter(s => s.place === place).map(s => s.animal));
      expect([...shown].sort()).toEqual([...PLACE_ANIMALS[place]].sort());
    }
  });

  it('조건 1 — 그 장소에 없는 동물을 내보내지 않는다', () => {
    for (const step of CHAPTER_1) {
      expect(PLACE_ANIMALS[step.place]).toContain(step.animal);
    }
  });

  it('조건 2 — 같은 장소를 연달아 누르지 않는다', () => {
    // 직전에 클릭한 장소는 규칙상 막혀 있다(state.lastPlace). 연속으로 두면 그
    // 클릭이 먹통이 되는데 화면에는 아무 일도 일어나지 않아 원인을 찾기 어렵다.
    for (let i = 1; i < CHAPTER_1.length; i++) {
      expect(CHAPTER_1[i].place).not.toBe(CHAPTER_1[i - 1].place);
    }
  });

  it('조건 3 — 숫자가 그 장소에서 실제로 나올 수 있는 범위 안이다', () => {
    // 동물 3종 장소는 10~15, 2종 장소는 5~10. 벗어나면 "시연에서 본 카드가 실제
    // 게임에는 없다"가 된다.
    for (const step of CHAPTER_1) {
      const [min, max] = PLACE_ANIMALS[step.place].length >= 3 ? [10, 15] : [5, 10];
      expect(step.num).toBeGreaterThanOrEqual(min);
      expect(step.num).toBeLessThanOrEqual(max);
    }
  });

  it('조건 4 — 1장이 끝나면 네 동물의 기술이 모두 열린다', () => {
    // 요구 2-1이자 2장의 전제. 엔진을 쓰지 않고 짝수 정산 규칙을 **따로 계산해**
    // 견준다 — 대본과 엔진 양쪽이 동시에 틀릴 가능성을 줄이려는 것이다.
    const { exp } = simulateChapter1();

    for (const animal of ANIMALS) {
      const level = Math.floor(exp[animal] / THRESHOLDS[animal]);
      expect({ animal, level }).toEqual({ animal, level: expect.any(Number) });
      expect(level).toBeGreaterThanOrEqual(1);
    }
  });

  it('정산은 네 번 일어나고, 그 자리에 안내 문구가 준비돼 있다', () => {
    // 멈추는 자리는 대본이 선언하는 게 아니라 짝수 계산이 정한다. 그래서 문구가
    // 붙어 있는 자리와 실제로 멈추는 자리가 어긋날 수 있어 여기서 맞춰 본다.
    const { settledAt } = simulateChapter1();
    expect(settledAt).toEqual([4, 5, 6, 9]); // 0부터 센 인덱스 = 표의 #5·#6·#7·#10

    for (const i of settledAt) {
      expect(CHAPTER_1[i].settleCaption).toBeTruthy();
    }
    // 반대로, 짝이 안 맞는 자리에 문구를 달아 두면 영영 안 보인다
    CHAPTER_1.forEach((step, i) => {
      if (!settledAt.includes(i)) expect(step.settleCaption).toBeUndefined();
    });
  });

  it('마지막에 짝이 안 맞은 카드가 남는다 — "짝이 맞아야 가져간다"의 대비', () => {
    const { leftover } = simulateChapter1();
    expect(leftover.sort()).toEqual(['rabbit', 'sheep']);
  });
});

/**
 * 1장 대본을 짝수 정산 규칙만으로 따라가 본다(엔진을 쓰지 않는 독립 계산).
 * 카드를 한 장씩 쌓고, 그 동물의 미획득 장수가 짝수가 되면 전부 걷어 경험치로 옮긴다.
 */
function simulateChapter1() {
  const open: Record<Animal, number[]> = { sheep: [], rabbit: [], mermaid: [], tiger: [] };
  const exp: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
  const settledAt: number[] = [];

  CHAPTER_1.forEach((step, i) => {
    open[step.animal].push(step.num);
    if (open[step.animal].length % 2 === 0) {
      exp[step.animal] += open[step.animal].reduce((a, b) => a + b, 0);
      open[step.animal] = [];
      settledAt.push(i);
    }
  });

  const leftover = ANIMALS.filter(a => open[a].length > 0);
  return { exp, settledAt, leftover };
}
