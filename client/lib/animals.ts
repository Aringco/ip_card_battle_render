import type { Animal } from 'shared';

export const ANIMAL_INFO: Record<Animal, { name: string; short: string; emoji: string }> = {
  sheep:   { name: '실용신양', short: '양',   emoji: '🐑' },
  rabbit:  { name: '상표토끼', short: '토끼', emoji: '🐰' },
  mermaid: { name: '디자인어', short: '인어', emoji: '🧜‍♀️' },
  tiger:   { name: '특허랑이', short: '호랑이', emoji: '🐯' },
};
