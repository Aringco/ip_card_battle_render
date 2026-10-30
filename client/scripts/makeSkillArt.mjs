// 기술 카드 그림 — 등급마다 한 벌(2026-10-31): v1(Lv.1~5 · 일반 판) · v2(Lv.6~10, 금 등급) · vmax(Lv.Max, 무지개 등급).
// 받은 원본 PNG(장당 2~3MB)는 assets-src/skills/<벌>/<동물>_skill.png에 두고, 화면에는 높이 900px webp로 줄여 public/skills/<벌>/에 낸다
// ([턴 마치기]의 pass_skill.webp와 같은 방식 — public에 원본을 두면 로딩 화면이 12장 × 3MB를 미리 받는다). 다시 만들려면:
//   cd client && node scripts/makeSkillArt.mjs
// 카드는 background-size: cover라 그림 비율(정사각 · 가로로 긴 것)이 섞여 있어도 카드를 채운다. 경로는 lib/playAssets.ts의 skillArtSrc.
import sharp from 'sharp';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETS = ['v1', 'v2', 'vmax'];
const HEIGHT = 900;

for (const set of SETS) {
  const srcDir = join(root, 'assets-src', 'skills', set);
  const outDir = join(root, 'public', 'skills', set);
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(srcDir).filter(f => f.endsWith('_skill.png')).sort()) {
    const out = join(outDir, file.replace(/\.png$/, '.webp'));
    const info = await sharp(join(srcDir, file)).resize({ height: HEIGHT, withoutEnlargement: true }).webp({ quality: 82 }).toFile(out);
    console.log(`[skill-art] ${set}/${file} → ${info.width}x${info.height} ${(statSync(out).size / 1024).toFixed(0)}KB`);
  }
}
