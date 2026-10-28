import { ANIMALS } from './constants';

// ─── 개인전 감정표현 ─────────────────────────────────────────────────────────
// 게임 중 내 정보창의 [감정표현] 버튼으로 고르는 그림 목록. 서버는 이 목록에 있는 id만 받아 방 전체에 전하고
// (아무 문자열이나 중계하지 않는다), 화면은 같은 id로 그림을 찾는다 — 그래서 shared에 둔다.
//
// 그림 파일: public/emoticon/{default|spticon|hands}/…  — SP·손동작은 client/scripts/cutEmoticons.mjs가
// 원본(client/assets-src/emoticons)에서 만든다. 여기 slug와 그 스크립트의 slug가 짝이다.

export interface EmoteItem {
  id: string;    // '묶음/slug' — 프로토콜로 오가는 값
  src: string;   // 그림 경로(public 기준)
  label: string; // 고르는 칸의 툴팁·대체 텍스트
}

export interface EmoteCategory {
  id: 'default' | 'sp' | 'hands';
  label: string; // 고르는 칸의 탭 이름
  items: EmoteItem[];
}

const MOODS = [
  { mood: 'happy', label: '기뻐요' },
  { mood: 'focus', label: '집중' },
  { mood: 'burn', label: '불타요' },
  { mood: 'cry', label: '울어요' },
  { mood: 'stone', label: '굳었어요' },
] as const;

const ANIMAL_LABEL = { sheep: '실용신양', rabbit: '상표토끼', mermaid: '디자인어', tiger: '특허랑이' } as const;

const SP_ITEMS: Array<[slug: string, label: string]> = [
  ['thumbs_up', '따봉성표'],
  ['thumbs_down', '역따봉성표'],
  ['pleased', '흐뭇성표'],
  ['sexy', '색시성표'],
  ['pray', '합장표'],
  ['awkward', '머쓱표'],
  ['scold', '꾸짖성표'],
  ['trembling', '부들성표'],
  ['argh', '크아악성표'],
  ['tears', '티어스엉표'],
  ['hungry', '헝그리성표'],
  ['bump', '혹성표'],
  ['rich', '리치성표'],
  ['deleted', '삭제된대화입니표'],
  ['face26', '표이스26'],
];

const HAND_ITEMS: Array<[slug: string, label: string]> = [
  ['thumbs_up', '최고'],
  ['thumbs_down', '별로'],
  ['point', '너!'],
  ['wave', '안녕'],
  ['fist', '화났어'],
];

export const EMOTE_CATEGORIES: readonly EmoteCategory[] = [
  {
    id: 'default',
    label: '기본',
    // 기존 연출용 표정 그림(동물 4 × 표정 5) — 동물별로 묶어 나열한다
    items: ANIMALS.flatMap(animal =>
      MOODS.map(({ mood, label }) => ({
        id: `default/${animal}_${mood}`,
        src: `/emoticon/default/${animal}_${mood}.png`,
        label: `${ANIMAL_LABEL[animal]} ${label}`,
      })),
    ),
  },
  {
    id: 'sp',
    label: 'SP',
    items: SP_ITEMS.map(([slug, label]) => ({ id: `sp/${slug}`, src: `/emoticon/spticon/${slug}.webp`, label })),
  },
  {
    id: 'hands',
    label: '손동작',
    items: HAND_ITEMS.map(([slug, label]) => ({ id: `hands/${slug}`, src: `/emoticon/hands/${slug}.webp`, label })),
  },
];

const EMOTE_BY_ID = new Map(EMOTE_CATEGORIES.flatMap(c => c.items.map(i => [i.id, i] as const)));

/** id → 그림. 목록에 없는 id면 undefined(서버는 그 메시지를 버리고, 화면은 그리지 않는다). */
export function emoteById(id: string): EmoteItem | undefined {
  return EMOTE_BY_ID.get(id);
}

/**
 * 한 사람이 감정표현을 연달아 보낼 수 있는 최소 간격 — 서버가 지키고, 화면은 그동안 버튼을 잠근다.
 * 떠 있는 시간(EMOTE_SHOW_MS)보다 훨씬 짧아야 한 사람이 여러 개를 한꺼번에 띄울 수 있다(EMOTE_QUEUE_MAX). 여기서는 연타 방지만 한다.
 */
export const EMOTE_MIN_INTERVAL_MS = 500;
/** 한 사람에게 한꺼번에 떠 있을 수 있는 감정표현 수 — 넘치면 가장 오래된 것이 밀려나고 나머지가 한 칸씩 올라온다. */
export const EMOTE_QUEUE_MAX = 4;
/** 풍선이 떠 있는 시간(globals.css의 .emoticon-bubble.is-emote 애니메이션 길이와 같아야 한다). */
export const EMOTE_SHOW_MS = 3000;
