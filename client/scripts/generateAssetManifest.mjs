// public/ 폴더를 훑어 클라이언트가 미리 받아야 할 에셋 목록을 정적 TS 파일로 생성한다.
//
// 왜 런타임 API가 아니라 빌드 타임 생성인가:
//   예전에는 /api/sounds 라우트가 process.cwd()/public/sounds 를 readdir 했는데,
//   배포(루트 server.ts로 Next를 dir:'./client' 로 띄우는 구성)에서는 cwd가
//   프로젝트 루트라 경로가 어긋나 항상 빈 목록이 돌아왔고 → 효과음이 전혀
//   나지 않았다. 목록은 빌드 시 확정되는 정보이므로 파일로 굳혀둔다.
//
// 실행: npm run gen:assets (client의 predev/prebuild에서 자동 실행)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outFile = path.join(root, 'lib', 'assetManifest.ts');

const SFX_PREFIXES = ['sheep', 'mermaid', 'tiger', 'rabbit', 'card', 'bomb'];
// lobby는 로비 화면(배경 일러스트·로고)이 쓴다 — 첫 화면에 바로 보이므로
// 프리로드 대상에 넣지 않으면 로딩 화면이 끝난 뒤에야 받아와 배경이 늦게 뜬다.
// (모드 선택 패널 배경은 이미지가 아니라 CSS 그라디언트라 받을 것이 없다.)
const IMAGE_DIRS = ['places', 'skills', 'emoticon', 'howto', 'lobby', 'ui'];
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function listDir(dir) {
  try {
    return fs.readdirSync(path.join(publicDir, dir)).sort();
  } catch {
    return [];
  }
}

// 효과음 — 접두사별로 묶는다 ("sheep_1.mp3" 같은 접두사+언더스코어, "bomb.wav" 같은 단일 파일 모두 허용)
const soundFiles = listDir('sounds');
const sfx = Object.fromEntries(SFX_PREFIXES.map(p => [p, []]));
for (const file of soundFiles) {
  const prefix = SFX_PREFIXES.find(p => file.startsWith(`${p}_`) || file.startsWith(`${p}.`));
  if (prefix) sfx[prefix].push(`/sounds/${file}`);
}

// BGM — 수 MB짜리라 프리로드 대상에서는 빼고 목록만 남겨둔다.
const bgm = soundFiles.filter(f => f.startsWith('bgm')).map(f => `/sounds/${f}`);

// 이미지 — 게임 중 쓰이는 폴더만
const images = IMAGE_DIRS.flatMap(dir =>
  listDir(dir)
    .filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map(f => `/${dir}/${f}`)
);

const body = `// ⚠️ 자동 생성 파일 — 직접 수정하지 말 것.
// scripts/generateAssetManifest.mjs 가 public/ 을 훑어 만든다 (npm run gen:assets).
// public/ 에 사운드나 이미지를 추가/삭제한 뒤 dev/build를 다시 돌리면 갱신된다.

export type SfxName = ${SFX_PREFIXES.map(p => `'${p}'`).join(' | ')};

/** 효과음 — 접두사별 파일 목록(같은 접두사 안에서 무작위로 하나 재생) */
export const SFX_MANIFEST: Record<SfxName, string[]> = ${JSON.stringify(sfx, null, 2)};

/** 배경음악 — 용량이 커서 프리로드하지 않고 재생 시 스트리밍한다. */
export const BGM_FILES: string[] = ${JSON.stringify(bgm, null, 2)};

/** 게임 시작 전에 미리 받아둘 이미지 */
export const IMAGE_FILES: string[] = ${JSON.stringify(images, null, 2)};

/** 프리로드 대상 전체(효과음 + 이미지) */
export const PRELOAD_FILES: string[] = [
  ...Object.values(SFX_MANIFEST).flat(),
  ...IMAGE_FILES,
];
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, body, 'utf8');

const sfxCount = Object.values(sfx).flat().length;
console.log(`[assets] 효과음 ${sfxCount}개, BGM ${bgm.length}개, 이미지 ${images.length}개 → lib/assetManifest.ts`);
