// ⚠️ 자동 생성 파일 — 직접 수정하지 말 것.
// scripts/generateAssetManifest.mjs 가 public/ 을 훑어 만든다 (npm run gen:assets).
// public/ 에 사운드나 이미지를 추가/삭제한 뒤 dev/build를 다시 돌리면 갱신된다.

export type SfxName = 'sheep' | 'mermaid' | 'tiger' | 'rabbit' | 'card' | 'bomb';

/** 효과음 — 접두사별 파일 목록(같은 접두사 안에서 무작위로 하나 재생) */
export const SFX_MANIFEST: Record<SfxName, string[]> = {
  "sheep": [
    "/sounds/sheep_1.mp3",
    "/sounds/sheep_2.mp3",
    "/sounds/sheep_3.mp3",
    "/sounds/sheep_4.mp3",
    "/sounds/sheep_5.mp3",
    "/sounds/sheep_6.mp3"
  ],
  "mermaid": [
    "/sounds/mermaid_1.mp3",
    "/sounds/mermaid_2.mp3",
    "/sounds/mermaid_3.mp3"
  ],
  "tiger": [
    "/sounds/tiger_1.mp3",
    "/sounds/tiger_2.mp3",
    "/sounds/tiger_3.mp3"
  ],
  "rabbit": [
    "/sounds/rabbit_1.mp3",
    "/sounds/rabbit_2.mp3",
    "/sounds/rabbit_3.mp3",
    "/sounds/rabbit_4.mp3",
    "/sounds/rabbit_5.mp3"
  ],
  "card": [
    "/sounds/card_1.mp3",
    "/sounds/card_2.mp3"
  ],
  "bomb": [
    "/sounds/bomb.wav"
  ]
};

/** 배경음악 — 용량이 커서 프리로드하지 않고 재생 시 스트리밍한다. */
export const BGM_FILES: string[] = [
  "/sounds/bgm_game1.mp3",
  "/sounds/bgm_game2.mp3",
  "/sounds/bgm_main.mp3",
  "/sounds/bgm_opening.mp3"
];

/** 게임 시작 전에 미리 받아둘 이미지 */
export const IMAGE_FILES: string[] = [
  "/places/dock.png",
  "/places/dock_text.png",
  "/places/forest_road.png",
  "/places/forest_road_text.png",
  "/places/house.png",
  "/places/house_text.png",
  "/places/river_road.png",
  "/places/river_road_text.png",
  "/skills/mermaid_skill.png",
  "/skills/rabbit_skill.png",
  "/skills/sheep_skill.png",
  "/skills/tiger_skill.png",
  "/emoticon/mermaid_burn.png",
  "/emoticon/mermaid_cry.png",
  "/emoticon/mermaid_focus.png",
  "/emoticon/mermaid_happy.png",
  "/emoticon/mermaid_stone.png",
  "/emoticon/rabbit_burn.png",
  "/emoticon/rabbit_cry.png",
  "/emoticon/rabbit_focus.png",
  "/emoticon/rabbit_happy.png",
  "/emoticon/rabbit_stone.png",
  "/emoticon/sheep_burn.png",
  "/emoticon/sheep_cry.png",
  "/emoticon/sheep_focus.png",
  "/emoticon/sheep_happy.png",
  "/emoticon/sheep_stone.png",
  "/emoticon/tiger_burn.png",
  "/emoticon/tiger_cry.png",
  "/emoticon/tiger_focus.png",
  "/emoticon/tiger_happy.png",
  "/emoticon/tiger_stone.png",
  "/howto/how_IPs.png",
  "/howto/how_places.png",
  "/howto/how_skills.png",
  "/lobby/logo.png",
  "/lobby/panel_create.webp",
  "/lobby/panel_join.webp",
  "/lobby/panel_multi.webp",
  "/lobby/panel_solo.webp",
  "/lobby/table_bg.webp",
  "/ui/back_board.webp",
  "/ui/corner_bl.webp",
  "/ui/corner_br.webp",
  "/ui/corner_tl.webp",
  "/ui/corner_tr.webp",
  "/ui/score_board.webp"
];

/** 프리로드 대상 전체(효과음 + 이미지) */
export const PRELOAD_FILES: string[] = [
  ...Object.values(SFX_MANIFEST).flat(),
  ...IMAGE_FILES,
];
